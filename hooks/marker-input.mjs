// The input rules of the three markers (design section 2.4), shared by every path that adds one: the CLI
// (`hooks/markers.mjs`, from its arguments), the marker tools (`hooks/marker-tools.mjs`, from a tool call) and the
// server, which derives a marker from the PostToolUse of a marker tool (`src/model/hook-payload.ts`). Plain ESM
// without imports, so it runs anywhere without a build; `marker-input.d.mts` types it for TypeScript.

/** A stream id, also the rule for a package id that `nurselog init` proposes. */
export const STREAM_ID = /^[A-Za-z0-9][\w.-]*$/;
export const GATES = ['plan', 'merge', 'promote', 'docs'];
/** Old gate names, still accepted and normalised: `brief` is the first stage before it was renamed Plan. */
export const GATE_ALIASES = { brief: 'plan' };
export const GATE_STATES = ['waiting', 'done', 'skipped'];
/** The id a question's `relays` names: a report-block question's `q-<agent id>-<n>`, or the id of any other question. */
export const QUESTION_REF = /^q-[\w.-]+$/;
/** The longest id `relays` takes. */
export const MAX_QUESTION_REF = 128;

/** How a message names an input: the marker tools use the field names; the CLI passes its flags instead. */
export const FIELD_NAMES = {
  run: 'run',
  streams: 'streams',
  stream: 'stream',
  after: 'after',
  gate: 'gate',
  state: 'state',
  text: 'text',
  answer: 'answer',
  note: 'note',
  context: 'context',
  options: 'options',
  node: 'node',
  relays: 'relays',
};

/**
 * The longest text a marker field takes, in characters; a longer one is rejected, never cut (design section 2.4). The
 * server's mapping skips every cap (`caps: false`), because the tool checked them before redaction could lengthen a text.
 */
export const TEXT_CAPS = { note: 280, text: 500, context: 1000, answer: 500, run: 120, node: 120 };
/**
 * The longest `id`, `package` and `model` of a plan stream, and at most this many streams in a plan, so a stream's
 * `after` names at most `MAX_STREAMS - 1` other streams, each once.
 */
export const STREAM_CAPS = { id: 64, package: 120, model: 120 };
export const MAX_STREAMS = 20;
/** At most this many `options` of a question, each at most `OPTION_CHARS` long. */
export const MAX_OPTIONS = 10;
export const OPTION_CHARS = 120;

const FIELDS = {
  plan: ['run', 'streams', 'note'],
  gate: ['run', 'gate', 'state', 'note'],
  question: ['run', 'text', 'blocking', 'options', 'context', 'node', 'answer', 'relays'],
};
const STRINGS = ['run', 'note', 'gate', 'state', 'text', 'context', 'node', 'answer', 'relays'];
const STREAM_FIELDS = ['id', 'package', 'after', 'model'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isSet = (value) => value !== undefined && value !== null;
const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The fields that are set, so the marker data holds no `undefined` or `null`. */
const defined = (fields) => Object.fromEntries(Object.entries(fields).filter(([, value]) => isSet(value)));

/** The first field of `input` that is not in `known`, or that is set to something other than a string when `strings` names it. */
const fieldProblem = (input, known, strings, prefix = '') => {
  const unknown = Object.keys(input).find((key) => !known.includes(key));
  if (unknown !== undefined) {
    return `unknown field ${prefix}${unknown}`;
  }
  const wrong = known.find((key) => strings.includes(key) && isSet(input[key]) && typeof input[key] !== 'string');
  return wrong === undefined ? undefined : `${prefix}${wrong} must be a string`;
};

/** The first string field of `input` longer than its cap in `caps`, named by `nameOf`. */
const lengthProblem = (input, caps, nameOf) => {
  const long = Object.keys(caps).find((key) => typeof input[key] === 'string' && input[key].length > caps[key]);
  return long === undefined ? undefined : `${nameOf(long)} is longer than ${caps[long]} characters`;
};

/** One item of `streams`: `package` defaults to the id, `after` to `[]`; an empty `package` or `model` counts as absent. */
const streamInput = (item, index, caps) => {
  const prefix = `streams[${index}]`;
  if (!isObject(item)) {
    return `${prefix} must be an object`;
  }
  const problem = fieldProblem(item, STREAM_FIELDS, ['id', 'package', 'model'], `${prefix}.`);
  const long = caps ? lengthProblem(item, STREAM_CAPS, (key) => `${prefix}.${key}`) : undefined;
  if (problem || long) {
    return problem ?? long;
  }
  if (!STREAM_ID.test(item.id ?? '')) {
    return `${prefix}.id must be an id such as api or web`;
  }
  if (isSet(item.after) && !isStringList(item.after)) {
    return `${prefix}.after must be a list of stream ids`;
  }
  const after = item.after ?? [];
  if (caps && after.length > MAX_STREAMS - 1) {
    return `${prefix}.after has more than ${MAX_STREAMS - 1} items`;
  }
  if (caps && new Set(after).size !== after.length) {
    return `${prefix}.after names the same stream twice`;
  }
  return defined({ id: item.id, package: item.package || item.id, after: [...(item.after ?? [])], model: item.model || undefined });
};

const planInput = (input, names, run, caps) => {
  if (isSet(input.streams) && !Array.isArray(input.streams)) {
    return { error: 'streams must be a list' };
  }
  const items = input.streams ?? [];
  if (items.length === 0) {
    return { error: `plan needs at least one ${names.stream}` };
  }
  if (caps && items.length > MAX_STREAMS) {
    return { error: `${names.streams} has more than ${MAX_STREAMS} items` };
  }
  const streams = [];
  for (const [index, item] of items.entries()) {
    const stream = streamInput(item, index, caps);
    if (typeof stream === 'string') {
      return { error: stream };
    }
    streams.push(stream);
  }
  const ids = new Set(streams.map((stream) => stream.id));
  if (ids.size !== streams.length) {
    return { error: 'plan has the same stream twice' };
  }
  const unknown = streams.flatMap((stream) => stream.after.filter((after) => !ids.has(after) || after === stream.id));
  if (unknown.length > 0) {
    return { error: `${names.after} names no other stream of the plan: ${unknown.join(', ')}` };
  }
  return { event: 'plan', data: defined({ run, streams, note: input.note }) };
};

const gateInput = (input, names, run) => {
  const gate = Object.hasOwn(GATE_ALIASES, input.gate) ? GATE_ALIASES[input.gate] : input.gate;
  if (!GATES.includes(gate)) {
    return { error: `${names.gate} must be one of ${GATES.join(', ')}` };
  }
  if (!GATE_STATES.includes(input.state)) {
    return { error: `${names.state} must be one of ${GATE_STATES.join(', ')}` };
  }
  return { event: 'gate', data: defined({ run, gate, state: input.state, note: input.note }) };
};

/**
 * `answer` closes a question and wins over the other fields; a new question gets its id from the caller. `relays` names
 * the subagent question it passes on (an empty one counts as absent).
 */
const questionInput = (input, names, run, caps) => {
  if (input.answer) {
    return { event: 'question', data: defined({ run, answers: input.answer, via: 'terminal' }) };
  }
  if (!input.text) {
    return { error: `question needs ${names.text}, or ${names.answer} <question id>` };
  }
  if (isSet(input.blocking) && typeof input.blocking !== 'boolean') {
    return { error: 'blocking must be true or false' };
  }
  if (isSet(input.options) && !isStringList(input.options)) {
    return { error: 'options must be a list of strings' };
  }
  if (caps && isSet(input.options) && input.options.length > MAX_OPTIONS) {
    return { error: `${names.options} has more than ${MAX_OPTIONS} items` };
  }
  const longOption = caps ? (input.options ?? []).findIndex((option) => option.length > OPTION_CHARS) : -1;
  if (longOption >= 0) {
    return { error: `${names.options} item ${longOption + 1} is longer than ${OPTION_CHARS} characters` };
  }
  const relays = input.relays || undefined;
  if (relays !== undefined && (!QUESTION_REF.test(relays) || relays.length > MAX_QUESTION_REF)) {
    return { error: `${names.relays} must be a question id such as q-a1b2c3-1, at most ${MAX_QUESTION_REF} characters` };
  }
  const data = { run, text: input.text, blocking: input.blocking === true, options: input.options, context: input.context, node: input.node, relays };
  return { event: 'question', data: defined(data) };
};

const CHECKS = { plan: planInput, gate: gateInput, question: questionInput };

/**
 * Checks the structured input of a `plan`, `gate` or `question` marker and returns `{ event, data }` with the marker
 * data of design section 2.4, or `{ error }`. `run` is optional (an empty one counts as absent); a new question has no
 * id yet. `names` words the messages for the caller's own input names. `caps: false` skips the length and count caps,
 * for the server's mapping of a call the tool already accepted.
 */
export const validateMarkerInput = (kind, input, names = FIELD_NAMES, { caps = true } = {}) => {
  const check = Object.hasOwn(CHECKS, kind) ? CHECKS[kind] : undefined;
  if (!check) {
    return { error: 'a marker is plan, gate or question' };
  }
  if (!isObject(input)) {
    return { error: `${kind} needs an object with its fields` };
  }
  const long = caps ? lengthProblem(input, TEXT_CAPS, (key) => names[key]) : undefined;
  const problem = fieldProblem(input, FIELDS[kind], STRINGS) ?? long;
  return problem ? { error: problem } : check(input, names, input.run || undefined, caps);
};
