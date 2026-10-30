// `nurselog emit`, `nurselog status` and `nurselog link` (design sections 2.4 and 9) in plain ESM on top of
// `lib.mjs`, so all three work in a fresh worktree before the package is built: `bin/nurselog` runs them directly
// and `src/cli.ts` re-uses them. `markers.d.mts` types this file for TypeScript.
import { randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { appendSpoolLine, checkBoard, localDay, loopbackJson, newLineId, notSetUpMessage, readHookConfig, readServerState, redactValue, repoHash, repositoryRoot, RUNNING_CHECK_MS, serverStatePath, spoolDirFor, startCommand, stripControl, tildeHome, TOKEN_CHANGED } from './lib.mjs';
import { FIELD_NAMES, STREAM_ID, validateMarkerInput } from './marker-input.mjs';

export const USAGE = `Usage: nurselog <command> [--repo <path>]
  start [--replay <fixture>] [--speed <n>] [--port <n>]  start the one board for every repository, or print the repository's tab while it runs (the default command; builds the package once when dist/ is missing)
  emit plan --run <worktree> --stream <id>[:after=<id>,...][:model=<model>] ... [--note '...']
  emit gate --run <worktree> --gate plan|merge|promote|docs --state waiting|done|skipped [--note '...']
  emit question --run <worktree> --text '...' [--blocking] [--option '...'] ... [--context '...'] [--node <id>] [--relays <question id>]
  emit question --run <worktree> --answer <question id>
  emit <kind> ... --stdin                                  free text from stdin: a JSON object ({"text", "note", "context", "options"}) or plain text
  status                                                 the board, the spool directory, lines today and the repository's tab
  link [--session <id>] [--osc8]                         print the repository's tab URL on the running board, with &session=<id> for a session; --osc8 prints a terminal hyperlink for a statusLine command
  open [--app]                                           open the board in the browser, or with --app in a Chromium app window; starts the board first when it is not running
  init [--repo-file] [--write] [--from -]                propose a config from what the repository shows; --write saves it (never replaces a file)
  purge [--all] [--before <YYYY-MM-DD>] [--yes]          delete the repository's spool day files (of every repository and orphaned spool directory with --all, only the days before a date with --before); asks first unless --yes
  fixture <session id or prefix> [--out <file>]          print one session's spool lines as a replay fixture (a prefix of 8+ characters names it), or write them to a new file with --out
  insights [--json | --prompt]                           workflow health: the last 5 work sessions against the 20 before them, per area, flagged lines first; --json prints the data, --prompt the report as a prompt for an AI assistant
  install-cli [--remove]                                 write the terminal command ~/.local/bin/nurselog, which runs the newest installed plugin copy (from a clone, the clone); --remove deletes it; a file Nurselog did not write is never touched
  uninstall [--yes] [--keep-data]                        remove Nurselog from this machine: stop the board, delete the terminal command and every repository's recorded data (kept with --keep-data), remove the plugin from Claude Code; lists what you added by hand; asks first unless --yes
--repo <path> names the repository; the default is the git worktree of the current directory.
Quote free text in single quotes; a value that starts with - needs the = form: --text='-5 files'.`;

export { STREAM_ID };

/** The CLI words the shared validation messages with its flags (`hooks/marker-input.mjs`). */
const FLAG_NAMES = {
  ...FIELD_NAMES,
  run: '--run',
  streams: '--stream',
  stream: '--stream',
  after: 'after=',
  gate: '--gate',
  state: '--state',
  text: '--text (or --stdin)',
  answer: '--answer',
  note: '--note',
  context: '--context',
  options: '--option',
  node: '--node',
  relays: '--relays',
};

/** `q-` and six base36 characters (design section 2.4). */
export const newQuestionId = () => `q-${randomBytes(4).readUInt32BE(0).toString(36).padStart(6, '0').slice(-6)}`;

/** `<id>[:after=<id>,<id>][:model=<model>][:package=<package>]`; the package defaults to the id. */
export const parseStream = (spec) => {
  const [id, ...options] = spec.split(':');
  if (!STREAM_ID.test(id)) {
    return `stream "${spec}" needs an id such as api or web`;
  }
  const stream = { id, package: id, after: [] };
  for (const option of options) {
    const [key, value = ''] = option.split('=');
    if (key === 'after') {
      stream.after = value.split(',').filter(Boolean);
    } else if (key === 'model' && value) {
      stream.model = value;
    } else if (key === 'package' && value) {
      stream.package = value;
    } else {
      return `stream "${spec}": unknown option "${option}" (after=, model=, package=)`;
    }
  }
  return stream;
};

/**
 * Free text from stdin (`--stdin`): a JSON object fills `text`, `note`, `context` and `options`; any other
 * input becomes the main text of the marker (`text` of a question, `note` of a plan or gate).
 */
export const parseStdinText = (input, mainField) => {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    parsed = undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { [mainField]: input.trim() };
  }
  const fields = {};
  for (const name of ['text', 'note', 'context']) {
    if (typeof parsed[name] === 'string') {
      fields[name] = parsed[name];
    }
  }
  const options = parsed.options ?? parsed.option;
  if (Array.isArray(options) && options.every((option) => typeof option === 'string')) {
    fields.option = options;
  }
  return fields;
};

const withStdin = (values, readStdin, mainField) => (values.stdin ? { ...values, ...parseStdinText(readStdin(), mainField) } : values);

const planMarker = (args, readStdin) => {
  const options = {
    run: { type: 'string' },
    stream: { type: 'string', multiple: true },
    note: { type: 'string' },
    stdin: { type: 'boolean' },
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, 'note');
  const streams = [];
  for (const spec of values.stream ?? []) {
    const stream = parseStream(spec);
    if (typeof stream === 'string') {
      return { error: stream };
    }
    streams.push(stream);
  }
  return validateMarkerInput('plan', { run: values.run, streams, note: values.note }, FLAG_NAMES);
};

const gateMarker = (args, readStdin) => {
  const options = {
    run: { type: 'string' },
    gate: { type: 'string' },
    state: { type: 'string' },
    note: { type: 'string' },
    stdin: { type: 'boolean' },
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, 'note');
  return validateMarkerInput('gate', { run: values.run, gate: values.gate, state: values.state, note: values.note }, FLAG_NAMES);
};

const questionMarker = (args, readStdin) => {
  const options = {
    run: { type: 'string' },
    text: { type: 'string' },
    blocking: { type: 'boolean' },
    option: { type: 'string', multiple: true },
    context: { type: 'string' },
    node: { type: 'string' },
    answer: { type: 'string' },
    relays: { type: 'string' },
    stdin: { type: 'boolean' },
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, 'text');
  const input = { run: values.run, text: values.text, blocking: values.blocking, options: values.option, context: values.context, node: values.node, answer: values.answer, relays: values.relays };
  const result = validateMarkerInput('question', input, FLAG_NAMES);
  if ('error' in result || 'answers' in result.data) {
    return result;
  }
  const id = newQuestionId();
  return { ...result, data: { ...result.data, id }, output: id };
};

const MARKERS = { plan: planMarker, gate: gateMarker, question: questionMarker };

const readStandardInput = () => readFileSync(0, 'utf8');

/**
 * Validates `emit plan|gate|question` arguments (design section 2.4) and returns the redacted marker data or an
 * error message. A new question prints its id.
 */
export const parseMarker = (kind, args, readStdin = readStandardInput) => {
  const marker = Object.hasOwn(MARKERS, kind) ? MARKERS[kind] : undefined;
  if (!marker) {
    return { error: 'emit needs plan, gate or question' };
  }
  let result;
  try {
    result = marker(args, readStdin);
  } catch (error) {
    return { error: error.message };
  }
  if ('error' in result) {
    return result;
  }
  if (!result.data.run) {
    return { error: `${kind} needs --run <run id or worktree name>` };
  }
  // A plan's data is the input of a plan marker, so its stream ids stay out of the pair rule (design section 2.3).
  const data = JSON.parse(JSON.stringify(result.data));
  return { ...result, data: redactValue(data, '', kind === 'plan' ? 'input' : 'none') };
};

/** Takes `--repo <path>` or `--repo=<path>` out of the arguments, wherever it stands; an empty path means it had none. */
export const takeRepo = (args) => {
  const rest = [];
  let repo;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--repo') {
      repo = args[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--repo=')) {
      repo = arg.slice('--repo='.length);
    } else {
      rest.push(arg);
    }
  }
  return { repo, rest };
};

/**
 * The repository a command acts on (design section 9): the worktree top level of `--repo <path>`, else of the
 * current directory, found without running git. Throws outside a git repository.
 */
export const resolveRepository = (repo, cwd = process.cwd()) => {
  if (repo === '') {
    throw new Error('--repo needs a path');
  }
  const start = resolve(cwd, repo ?? '.');
  if (!existsSync(start)) {
    throw new Error(`${stripControl(start)} does not exist`);
  }
  const root = repositoryRoot(start);
  if (!root) {
    throw new Error('not inside a git repository; use --repo <path>');
  }
  return root;
};

const configOf = (io, root) => {
  const config = readHookConfig(root);
  const path = stripControl(tildeHome(config.found?.path ?? ''));
  if (config.problems?.length) {
    io.err(`nurselog: ${path}: ${stripControl(config.problems.join('; '))}; using the default spool settings`);
  }
  for (const warning of config.warnings) {
    io.err(`nurselog: ${path}: ${warning}`);
  }
  return config;
};

/** `nurselog emit <kind> ...`: appends the marker line to the repository's spool. Resolves with the exit code. */
export const runEmit = (args, io) => {
  const { repo, rest } = takeRepo(args);
  const root = resolveRepository(repo, io.cwd);
  const config = configOf(io, root);
  if (!config.found) {
    io.err(notSetUpMessage());
    return 1;
  }
  const [kind, ...markerArgs] = rest;
  const result = parseMarker(kind, markerArgs, io.stdin);
  if ('error' in result) {
    io.err(`nurselog emit: ${result.error}\n${USAGE}`);
    return 2;
  }
  const line = { v: 1, id: newLineId(), at: new Date().toISOString(), src: 'cli', event: result.event, sessionId: '', cwd: tildeHome(process.cwd()), data: result.data };
  appendSpoolLine(spoolDirFor(config, root), line, 'data', config.spool.maxLineBytes);
  if (result.output) {
    io.out(result.output);
  }
  return 0;
};

const BOARD_TIMEOUT_MS = 1000;

const MAX_TAB_NAME = 1024;

/** The entry of `hash` in a `GET /api/repositories` body when the body is an array and the entry has a usable name. */
const tabOf = (list, hash) => {
  if (!Array.isArray(list)) {
    return undefined;
  }
  const tab = list.find((repository) => typeof repository === 'object' && repository !== null && repository.id === hash);
  const named = typeof tab?.name === 'string' && tab.name !== '' && tab.name.length <= MAX_TAB_NAME;
  return named ? tab : undefined;
};

/**
 * The tab of the repository at `root` on the proven board `board` (design section 9): its name from
 * `GET /api/repositories` by the repo hash, and its URL `http://127.0.0.1:<port>/?repo=<tab name>`. Undefined without
 * a root, when the board does not list the repository (not served), does not answer within `timeoutMs` (a second by
 * default), redirects, or
 * answers with anything but a JSON array whose entry for the repository has a string name, and for a `board` that
 * did not prove itself with the token file (`checkBoard`): only a proven board gets the token, as a Bearer header,
 * through `loopbackJson`, on an agent of its own, so a proxy from the environment never receives it.
 */
export const boardTab = async (board, root, timeoutMs = BOARD_TIMEOUT_MS) => {
  if (root === undefined || board.status !== 'proven') {
    return undefined;
  }
  const { port } = board;
  // A board that does not answer has no tab to name (undefined); the caller falls back to the board's URL.
  const list = await loopbackJson(port, '/api/repositories', timeoutMs, board.token);
  const tab = tabOf(list, repoHash(root));
  if (tab === undefined) {
    return undefined;
  }
  return { name: stripControl(tab.name), url: `http://127.0.0.1:${port}/?repo=${encodeURIComponent(tab.name)}` };
};

/**
 * The non-empty lines of today's day file. The open follows no symlink and never blocks on a FIFO, and only a regular
 * file of this user is read; anything else, a missing file included, counts as no lines today.
 */
const linesToday = (path) => {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return 0;
  }
  try {
    const stat = fstatSync(fd);
    const otherUser = typeof process.getuid === 'function' && stat.uid !== process.getuid();
    if (!stat.isFile() || otherUser) {
      return 0;
    }
    const buffer = Buffer.alloc(stat.size);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) {
        break;
      }
      length += read;
    }
    return buffer.toString('utf8', 0, length).split('\n').filter(Boolean).length;
  } finally {
    closeSync(fd);
  }
};

/** `nurselog status`: the one board from the global `server.json`, the repository's spool directory and today's line count. */
export const runStatus = async (args, io) => {
  const { repo, rest } = takeRepo(args);
  if (rest.length > 0) {
    io.err(`nurselog status: unknown argument ${stripControl(rest[0])}\n${USAGE}`);
    return 2;
  }
  const root = resolveRepository(repo, io.cwd);
  const config = configOf(io, root);
  if (!config.found) {
    io.out(notSetUpMessage());
    return 0;
  }
  const stateFile = serverStatePath();
  const state = readServerState(stateFile);
  const dir = spoolDirFor(config, root);
  const today = join(dir, `events-${localDay(new Date())}.ndjson`);
  const lines = linesToday(today);
  // The board of server.json must answer /api/health with its pid: a process that holds its port is no board.
  const board = await checkBoard(stateFile, RUNNING_CHECK_MS);
  const running = state !== undefined && board.status !== 'none';
  if (running) {
    io.out(`Server: running on http://127.0.0.1:${state.port} (pid ${state.pid}, since ${state.startedAt})`);
  } else {
    io.out(`Server: not running; start it with: ${startCommand()}`);
  }
  io.out(`Spool: ${stripControl(tildeHome(dir))}`);
  io.out(`Lines today: ${lines}`);
  if (board.status === 'unproven') {
    io.out(`Tab: unknown; ${TOKEN_CHANGED}`);
  } else if (running) {
    const tab = await boardTab(board, root);
    io.out(tab ? `Tab: ${tab.name} on ${tab.url}` : 'Tab: none; the board serves this repository once its spool has lines within spool.readDays');
  }
  return 0;
};

/** How long `link` waits for the board to name the tab: a statusline calls it on every update. */
const LINK_TIMEOUT_MS = 400;

/** The URL with `session=<id>` appended to its query, the rest of the URL left as it is (design section 9). */
const withSession = (url, session) => {
  const parsed = new URL(url);
  const query = `session=${encodeURIComponent(session)}`;
  parsed.search = parsed.search === '' ? query : `${parsed.search.slice(1)}&${query}`;
  return parsed.href;
};

/**
 * `--session <id>` or `--session=<id>` and `--osc8` of `link`; the message of the first argument that is none of
 * them or has no value instead.
 */
const parseLinkArgs = (args) => {
  const options = { osc8: false, session: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--osc8') {
      options.osc8 = true;
    } else if (arg === '--session') {
      // A value that starts with - needs the = form, as for every other flag.
      const value = args[index + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        return '--session needs a session id';
      }
      options.session = value;
      index += 1;
    } else if (arg.startsWith('--session=')) {
      options.session = arg.slice('--session='.length);
      if (options.session === '') {
        return '--session needs a session id';
      }
    } else {
      return `unknown argument ${stripControl(arg)}`;
    }
  }
  return options;
};

/** The URL as an OSC 8 terminal hyperlink whose text is "Nurselog". */
const hyperlink = (url) => `\x1b]8;;${url}\x1b\\Nurselog\x1b]8;;\x1b\\`;

/**
 * `nurselog link [--session <id>] [--osc8] [--repo <path>]` (design section 9, decision 106): prints the URL of the
 * repository's tab on the running board, with `&session=<id>` for a session, or with `--osc8` as a terminal hyperlink,
 * for a Claude Code `statusLine` command. While no board runs, or the board names no tab for the repository (it does
 * not serve it, or does not answer within 400 ms), it prints nothing on stdout, one line on stderr and exits 1; it
 * never prints the not-set-up line. Runs without a build.
 */
export const runLink = async (args, io) => {
  const { repo, rest } = takeRepo(args);
  const options = parseLinkArgs(rest);
  if (typeof options === 'string') {
    io.err(`nurselog link: ${options}\n${USAGE}`);
    return 2;
  }
  const root = resolveRepository(repo, io.cwd);
  const board = await checkBoard(serverStatePath(), LINK_TIMEOUT_MS);
  if (board.status === 'none') {
    io.err('nurselog link: the board is not running');
    return 1;
  }
  if (board.status === 'unproven') {
    io.err(`nurselog link: ${TOKEN_CHANGED}`);
    return 1;
  }
  const tab = await boardTab(board, root, LINK_TIMEOUT_MS);
  if (tab === undefined) {
    io.err('nurselog link: the board named no tab for this repository');
    return 1;
  }
  const url = options.session === undefined ? tab.url : withSession(tab.url, options.session);
  io.out(options.osc8 ? hyperlink(url) : url);
  return 0;
};
