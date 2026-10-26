// The marker tools (design section 2.4): a stdio MCP server that the plugin manifest starts, in plain ESM with a
// hand-written JSON-RPC 2.0 loop (the MCP SDK would be a new dependency, ADR-0002). One JSON message per line on
// stdin and stdout; stdout carries nothing but JSON-RPC, diagnostics go to stderr. The tools only validate their
// input (`marker-input.mjs`) and answer with a short text: the server writes nothing, and the marker itself is
// derived from the PostToolUse of the call in the hook stream (`src/model/hook-payload.ts`). In a repository that is
// not set up the hook records nothing, so the tools answer with the not-set-up text of `nurselog emit` instead.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { notSetUpMessage, readHookConfig, repositoryRoot, stripControl } from './lib.mjs';
import { GATE_STATES, GATES, MAX_OPTIONS, MAX_QUESTION_REF, MAX_STREAMS, OPTION_CHARS, QUESTION_REF, STREAM_CAPS, STREAM_ID, TEXT_CAPS, validateMarkerInput } from './marker-input.mjs';
import { newQuestionId } from './markers.mjs';

const MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_PROTOCOL = '2025-06-18';
const PROTOCOL_VERSION = /^\d{4}-\d{2}-\d{2}$/;

const packageVersion = () => {
  try {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return typeof version === 'string' ? version : '0.0.0';
  } catch {
    return '0.0.0';
  }
};

const RUN = { type: 'string', maxLength: TEXT_CAPS.run, description: 'Run id or a unique part of it, such as the worktree name; default: the run the session started in. Pass it for a worktree you created or work in' };
const NOTE = { type: 'string', maxLength: TEXT_CAPS.note, description: 'Short note shown on the board' };

const STREAM = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: STREAM_ID.source, maxLength: STREAM_CAPS.id, description: 'Stream id, such as api or web' },
    package: { type: 'string', maxLength: STREAM_CAPS.package, description: 'Package the stream builds; default: the id' },
    after: { type: 'array', items: { type: 'string' }, maxItems: MAX_STREAMS - 1, uniqueItems: true, description: 'Ids of streams of this plan that must finish first' },
    model: { type: 'string', maxLength: STREAM_CAPS.model },
  },
  required: ['id'],
  additionalProperties: false,
};
const STREAMS = { type: 'array', items: STREAM, minItems: 1, maxItems: MAX_STREAMS };

const TOOLS = [
  {
    name: 'plan',
    description: 'Show the plan of the current run on the Nurselog board: its streams, their order and a note. Again to replace it.',
    inputSchema: { type: 'object', properties: { streams: STREAMS, note: NOTE, run: RUN }, required: ['streams'], additionalProperties: false },
  },
  {
    name: 'gate',
    description: 'Mark a hand-over to the user on the Nurselog board: a gate that is waiting, done or skipped.',
    inputSchema: { type: 'object', properties: { gate: { type: 'string', enum: GATES }, state: { type: 'string', enum: GATE_STATES }, note: NOTE, run: RUN }, required: ['gate', 'state'], additionalProperties: false },
  },
  {
    name: 'question',
    description: 'Show a question you ask the user in prose on the Nurselog board; returns its id. With answer, closes that question.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', maxLength: TEXT_CAPS.text, description: 'The question' },
        blocking: { type: 'boolean', description: 'True when the work waits for the answer' },
        options: { type: 'array', items: { type: 'string', maxLength: OPTION_CHARS }, maxItems: MAX_OPTIONS },
        context: { type: 'string', maxLength: TEXT_CAPS.context },
        node: { type: 'string', maxLength: TEXT_CAPS.node, description: 'Stream, reviewer, fix, gate or stage id it belongs to' },
        answer: { type: 'string', maxLength: TEXT_CAPS.answer, description: 'Id of a question that is answered; give no text then' },
        relays: { type: 'string', pattern: QUESTION_REF.source, maxLength: MAX_QUESTION_REF, description: "Id of a subagent's question you pass on to the user" },
        run: RUN,
      },
      additionalProperties: false,
    },
  },
];

const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));

/** A JSON-RPC error that the loop sends as the answer to the request. */
class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A tool result with one text block; a bad input is an error result, not a JSON-RPC error. */
const text = (value, isError = false) => ({ content: [{ type: 'text', text: value }], ...(isError ? { isError: true } : {}) });

/**
 * True when the hook records this project: the config lookup of `nurselog-hook.mjs`, from `CLAUDE_PROJECT_DIR` or the
 * working directory. A user config that fails the path checks leaves the repository inactive, as for the hook; a
 * look-up that throws (an unreadable user config) writes its reason to stderr first, its control characters stripped.
 */
const isSetUp = () => {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    return readHookConfig(repositoryRoot(projectDir) ?? resolve(projectDir)).found !== undefined;
  } catch (error) {
    process.stderr.write(`nurselog marker tools: the config look-up failed, answering not set up: ${stripControl(String(error?.message ?? error))}\n`);
    return false;
  }
};

const describePlan = (streams) => streams.map((stream) => (stream.after.length > 0 ? `${stream.id} after ${stream.after.join(', ')}` : stream.id)).join('; ');

const callTool = (params) => {
  const name = isObject(params) ? params.name : undefined;
  if (typeof name !== 'string' || !TOOL_NAMES.has(name)) {
    throw new RpcError(-32602, `unknown tool: ${String(name)}`);
  }
  if (!isSetUp()) {
    // `nurselog emit` prints this and exits 1, so the tool answers with an error result.
    return text(notSetUpMessage(), true);
  }
  const result = validateMarkerInput(name, params.arguments ?? {});
  if ('error' in result) {
    return text(`${name}: ${result.error}`, true);
  }
  const { data } = result;
  if (result.event === 'plan') {
    return text(`Plan noted: ${describePlan(data.streams)}`);
  }
  if (result.event === 'gate') {
    return text(`Gate ${data.gate}: ${data.state}`);
  }
  return 'answers' in data ? text(`Question ${data.answers} closed`) : text(`question id: ${newQuestionId()}`);
};

const initialize = (params) => {
  const requested = isObject(params) ? params.protocolVersion : undefined;
  const protocolVersion = typeof requested === 'string' && PROTOCOL_VERSION.test(requested) ? requested : DEFAULT_PROTOCOL;
  return { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'nurselog', version: packageVersion() } };
};

const METHODS = {
  initialize,
  ping: () => ({}),
  'tools/list': () => ({ tools: TOOLS }),
  'tools/call': callTool,
};

const send = (message) => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
};

const sendError = (id, code, message) => send({ id, error: { code, message } });

const isRequestId = (id) => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));

/** Answers one message; a notification (no `id`) and a response from the client get no answer. */
const handle = (message) => {
  if (!isObject(message) || message.jsonrpc !== '2.0') {
    sendError(null, -32600, 'not a JSON-RPC 2.0 message');
    return;
  }
  if (typeof message.method !== 'string') {
    if (!('result' in message) && !('error' in message)) {
      sendError(isRequestId(message.id) ? message.id : null, -32600, 'a request needs a method');
    }
    return;
  }
  const isNotification = !('id' in message);
  if (isNotification) {
    return;
  }
  if (!isRequestId(message.id)) {
    sendError(null, -32600, 'a request id is a string or a number');
    return;
  }
  const method = Object.hasOwn(METHODS, message.method) ? METHODS[message.method] : undefined;
  if (!method) {
    sendError(message.id, -32601, `method not found: ${message.method}`);
    return;
  }
  try {
    send({ id: message.id, result: method(message.params) });
  } catch (error) {
    if (error instanceof RpcError) {
      sendError(message.id, error.code, error.message);
      return;
    }
    process.stderr.write(`nurselog marker tools: ${message.method} failed: ${error?.stack ?? error}\n`);
    sendError(message.id, -32603, 'internal error');
  }
};

const handleLine = (line) => {
  if (line.trim() === '') {
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    sendError(null, -32700, `parse error: ${error.message}`);
    return;
  }
  handle(message);
};

/** Splits stdin into lines without holding more than `MAX_LINE_BYTES` of one: a longer line is dropped with -32700. */
const readLines = (onLine, onEnd) => {
  let parts = [];
  let size = 0;
  let tooLong = false;
  const take = (bytes) => {
    size += bytes.length;
    if (size > MAX_LINE_BYTES) {
      tooLong = true;
      parts = [];
    } else if (bytes.length > 0) {
      parts.push(bytes);
    }
  };
  const finish = () => {
    if (tooLong) {
      sendError(null, -32700, `line over ${MAX_LINE_BYTES} bytes dropped`);
    } else if (size > 0) {
      onLine(Buffer.concat(parts).toString('utf8'));
    }
    parts = [];
    size = 0;
    tooLong = false;
  };
  process.stdin.on('data', (chunk) => {
    let start = 0;
    for (let end = chunk.indexOf(10); end !== -1; end = chunk.indexOf(10, start)) {
      take(chunk.subarray(start, end));
      finish();
      start = end + 1;
    }
    take(chunk.subarray(start));
  });
  process.stdin.on('end', () => {
    finish();
    onEnd();
  });
  process.stdin.on('error', (error) => {
    process.stderr.write(`nurselog marker tools: stdin failed: ${error.message}\n`);
    onEnd();
  });
};

process.stdout.on('error', (error) => {
  process.stderr.write(`nurselog marker tools: stdout closed: ${error.message}\n`);
  process.exit(0);
});

readLines(
  (line) => {
    try {
      handleLine(line);
    } catch (error) {
      process.stderr.write(`nurselog marker tools: ${error?.stack ?? error}\n`);
    }
  },
  () => {
    process.exitCode = 0;
  },
);
