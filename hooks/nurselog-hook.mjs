#!/usr/bin/env node
// Nurselog hook (design sections 2, 3 and 9): appends every Claude Code hook payload, redacted, as one
// line to today's spool file. The server maps the payload to an event; this script does no git, no network
// and no transcript reading. It must never slow down or fail a session, so every error is swallowed and the
// exit code is always 0. It keeps the repository record (design section 3) so the board finds the repository. With
// `--check-server` a SessionStart also checks that the board is running and starts it when it is not. SessionStart and
// SubagentStart inject context (design section 13): the hook prints at most one JSON object on one line. A repository
// without a config is inactive: the hook reads stdin and exits without writing or printing anything.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKERS_PARAGRAPH, REPORT_BLOCK_PARAGRAPH } from './context.mjs';
import { appendSpoolLine, autoOpenLine, autoOpenStartingLine, boardLogPath, buildHookLine, buildStubLine, ensurePrivateDir, newLineId, pruneOncePerDay, readHookConfig, recordRepository, redactString, repositoryRoot, roleStage, serverRunning, serverStatePath, spoolDirFor, startBoardDetached, startCommand, tildeHome, waitForBoard, writePrivate } from './lib.mjs';

const STDIN_TIMEOUT_MS = 1000;
/** Buffered stdin is capped here (design section 2.3); the rest is dropped and the line marked truncated. */
const MAX_STDIN_BYTES = 16 * 1024 * 1024;
/** The plugin root is the parent of this file's directory: the cache copy of a marketplace install, or the clone in the three ways of loading from a clone. */
const CLI = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'bin', 'nurselog');
const QUIET_SOURCES = new Set(['compact', 'clear']);
/** How long a SessionStart that started the board waits for it to answer (design section 9). */
const AUTO_START_WAIT_MS = 1500;
/** The role stages whose agents end their report with the report block (design section 10). */
const REPORTING_STAGES = new Set(['build', 'review', 'pr']);

const text = (value) => (typeof value === 'string' ? value : '');

/** The text of a payload that is not a JSON object: redacted whole, then cut, so a cut never leaves part of a token. */
const unparsed = (raw) => ({ unparsed: redactString(raw).slice(0, 2000) });

/** The head of a payload cut at the stdin cap that is searched for its identity: Claude Code writes those fields first. */
const IDENTITY_HEAD_CHARS = 64 * 1024;
/** One bounded match per identity field: its JSON string value, escapes included, up to 4096 characters. */
const IDENTITY_FIELDS = {
  hook_event_name: /"hook_event_name"\s{0,16}:\s{0,16}"((?:[^"\\]|\\.){0,4096})"/,
  session_id: /"session_id"\s{0,16}:\s{0,16}"((?:[^"\\]|\\.){0,4096})"/,
  cwd: /"cwd"\s{0,16}:\s{0,16}"((?:[^"\\]|\\.){0,4096})"/,
};
/** Marks the payload of stdin cut at the cap: its line is the stub line (design section 2.3). */
const CUT_AT_CAP = Symbol('cut at the stdin cap');

/** `hook_event_name`, `session_id` and `cwd` of a payload that no longer parses, from the first 64 KiB of its text. */
const identityOf = (raw) => {
  const head = raw.slice(0, IDENTITY_HEAD_CHARS);
  const identity = {};
  for (const [field, pattern] of Object.entries(IDENTITY_FIELDS)) {
    const match = pattern.exec(head);
    try {
      if (match) {
        identity[field] = JSON.parse(`"${match[1]}"`);
      }
    } catch {
      // A value with a broken escape is left out.
    }
  }
  return identity;
};

/** The payload object; a text that is no JSON object becomes `unparsed`, and stdin cut at the cap keeps only its identity. */
const parsePayload = (raw, truncated) => {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  } catch {
    // Not JSON: an unparsed text, or the identity of a payload cut at the cap.
  }
  return truncated ? { ...identityOf(raw), [CUT_AT_CAP]: true } : unparsed(raw);
};

/** The hooks whose line records `injectedChars`, the length of the context they return (design section 3, "Hook lines"). */
const INJECTING_HOOKS = new Set(['SessionStart', 'SubagentStart']);

/**
 * Appends the hook line of `payload`, or its stub line when building the line throws (design section 2.3); a
 * SessionStart or SubagentStart line also gets `injectedChars` when the caller knows it.
 */
const appendLine = (dir, payload, truncated, maxLineBytes, injectedChars) => {
  const at = new Date().toISOString();
  const id = newLineId();
  const withChars = (line) => (injectedChars === undefined ? line : { ...line, injectedChars });
  if (payload[CUT_AT_CAP]) {
    appendSpoolLine(dir, withChars(buildStubLine(payload, at, id)), 'payload', maxLineBytes);
    return;
  }
  try {
    const line = buildHookLine(payload, at, id);
    if (truncated) {
      line.truncated = true;
    }
    appendSpoolLine(dir, withChars(line), 'payload', maxLineBytes);
  } catch {
    appendSpoolLine(dir, withChars(buildStubLine(payload, at, id)), 'payload', maxLineBytes);
  }
};

/**
 * Starts the board in the background unless `NURSELOG_AUTO_START` is `0` or the plugin has no build, waits up to
 * 1.5 s for it to answer as the board of `server.json` and returns the line that says where it runs, that it is still
 * starting, or that it ended without starting; undefined when it started nothing. With `NURSELOG_AUTO_OPEN=app` the
 * board that answered is also opened in an app window, and a launch that fails, or a board that has not answered yet,
 * adds a line with the command that opens it by hand (design section 9).
 */
const autoStartMessage = async () => {
  if (process.env.NURSELOG_AUTO_START === '0') {
    return undefined;
  }
  const start = startBoardDetached(CLI);
  if (start.status !== 'started') {
    return undefined;
  }
  const wait = await waitForBoard(AUTO_START_WAIT_MS, { exited: start.exited });
  const log = tildeHome(boardLogPath());
  if (wait.outcome === 'running') {
    const appWindow = await autoOpenLine(wait.url, { cli: CLI });
    return appWindow ? `Nurselog board started: ${wait.url}\n${appWindow}` : `Nurselog board started: ${wait.url}`;
  }
  if (wait.outcome === 'exited') {
    return `Nurselog board did not start; see ${log}, or start it with: ${startCommand(CLI)}`;
  }
  const starting = `Nurselog board is starting; log: ${log}`;
  const byHand = autoOpenStartingLine({ cli: CLI });
  return byHand ? `${starting}\n${byHand}` : starting;
};

/**
 * The one-time message of a SessionStart while the board is down, or undefined; once per session id (the marker file
 * is written first, so a session that cannot be marked is not told and starts nothing), never after a compact or
 * clear. The board is started (`autoStartMessage`); when it is not, or the start fails, the not-running message says
 * how to start it.
 */
const serverMessage = async (payload, dir) => {
  const sessionId = text(payload.session_id).replace(/[^\w-]/g, '_');
  if (payload.hook_event_name !== 'SessionStart' || !sessionId || QUIET_SOURCES.has(text(payload.source))) {
    return undefined;
  }
  const marker = join(dir, 'notified', sessionId);
  if (existsSync(marker) || (await serverRunning(serverStatePath()))) {
    return undefined;
  }
  ensurePrivateDir(dirname(marker));
  writePrivate(marker, new Date().toISOString());
  try {
    const started = await autoStartMessage();
    if (started) {
      return started;
    }
  } catch {
    // A start that fails leaves the session with the command that starts the board.
  }
  return `Nurselog is not running. This session is still recorded; start the board with: ${startCommand(CLI)}`;
};

/**
 * The context an event injects (design section 13): the markers paragraph at every SessionStart, the report-block
 * paragraph at the SubagentStart of an agent whose role stage is build, review or pr, else undefined.
 */
const injectedContext = (payload, config) => {
  if (payload.hook_event_name === 'SessionStart') {
    return MARKERS_PARAGRAPH;
  }
  if (payload.hook_event_name === 'SubagentStart' && REPORTING_STAGES.has(roleStage(config, text(payload.agent_type)))) {
    return REPORT_BLOCK_PARAGRAPH;
  }
  return undefined;
};

/** The one JSON object the hook prints, or undefined when it has nothing to say. */
const hookOutput = (payload, systemMessage, context) => {
  const output = {};
  if (systemMessage) {
    output.systemMessage = systemMessage;
  }
  if (context) {
    output.hookSpecificOutput = { hookEventName: payload.hook_event_name, additionalContext: context };
  }
  return Object.keys(output).length > 0 ? output : undefined;
};

const run = async (raw, truncated) => {
  const payload = parsePayload(raw, truncated);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || text(payload.cwd) || process.cwd();
  let root;
  let config;
  try {
    root = repositoryRoot(projectDir) ?? resolve(projectDir);
    config = readHookConfig(root);
  } catch {
    // A user config that fails the path checks leaves the repository inactive.
  }
  if (!config?.found) {
    process.exit(0);
  }
  let context;
  let injectedChars;
  try {
    context = injectedContext(payload, config);
    injectedChars = INJECTING_HOOKS.has(payload.hook_event_name) ? (context?.length ?? 0) : undefined;
  } catch {
    // Without a context the session goes on as before, and its line records no length.
  }
  let dir;
  try {
    dir = spoolDirFor(config, root);
    appendLine(dir, payload, truncated, config.spool.maxLineBytes, injectedChars);
  } catch {
    // An unwritable spool loses this line; the session goes on.
  }
  try {
    if (dir) {
      pruneOncePerDay(dir, config.spool.keepDays);
    }
  } catch {
    // Pruning is retried on the next run.
  }
  try {
    recordRepository(root);
  } catch {
    // The record is written on a later run; until then the board does not list the repository.
  }
  let systemMessage;
  try {
    if (dir && process.argv.includes('--check-server')) {
      systemMessage = await serverMessage(payload, dir);
    }
  } catch {
    // The check is a courtesy; it never fails the hook or suppresses the context.
  }
  let output;
  try {
    output = hookOutput(payload, systemMessage, context);
  } catch {
    // Without an output the session goes on as before.
  }
  if (output) {
    // Exit once the line is flushed: a pipe write may still be pending when `write` returns.
    process.stdout.write(`${JSON.stringify(output)}\n`, () => process.exit(0));
    return;
  }
  process.exit(0);
};

process.on('uncaughtException', () => process.exit(0));
const chunks = [];
let size = 0;
let stdinTruncated = false;
let started = false;
/** Runs once: when stdin ends after the timer already fired (a slow --check-server), the line is not appended twice. */
const runOnce = () => {
  if (!started) {
    started = true;
    run(Buffer.concat(chunks).toString('utf8'), stdinTruncated);
  }
};
// Claude Code closes stdin after the payload; the timer only guards against a stdin that never ends.
const timer = setTimeout(runOnce, STDIN_TIMEOUT_MS);
process.stdin.on('data', (chunk) => {
  const room = MAX_STDIN_BYTES - size;
  if (chunk.length > room) {
    stdinTruncated = true;
  }
  if (room > 0) {
    chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
    size += Math.min(chunk.length, room);
  }
});
process.stdin.on('end', () => {
  clearTimeout(timer);
  runOnce();
});
process.stdin.on('error', () => process.exit(0));
