// The verification defaults and the rule of what a Bash `tool.post` keeps of its stdout and a `tool.fail` of its error
// (design sections 2.2, 2.3 and 7), shared by the hook (`hooks/lib.mjs`, which keeps it), the mapping (`src/model/hook-payload.ts`, which cuts it
// from a raw payload) and the config defaults (`src/config-core.ts`, `DEFAULT_CONFIG.verification`). Plain ESM that
// imports only the text helpers of `hooks/browser-safe.mjs`, so it runs anywhere without a build and stays safe in the
// board's browser bundle (`src/model/paths.ts` re-exports `stripPrefix`); `verification.d.mts` types it for TypeScript.

import { INVISIBLE, stripControl } from './browser-safe.mjs';

/** The default runners: the first word of a verification command once `stripPrefix` removed its prefixes. */
export const VERIFICATION_RUNNERS = Object.freeze(['pnpm', 'npm', 'npx', 'yarn', 'bun', 'node', 'turbo', 'make', 'tsc', 'eslint', 'vitest']);
/** The default command pattern of each verification kind, tried on the stripped command. */
export const VERIFICATION_KINDS = Object.freeze({ typecheck: '\\b(typecheck|tsc)\\b', lint: '\\b(lint|eslint)\\b', test: '\\b(vitest|test:run)\\b|\\b(pnpm|npm|yarn|bun|make)\\b[^&|;]*\\btest\\b' });
/**
 * The default fail pattern of each kind, tried on a verification command's stdout tail: tsc's `error TS2322` lines and
 * its `Found 2 errors` summary, ESLint's `(2 errors, 1 warning)` summary, vitest's and Jest's failed counts, bun's
 * `1 fail` and vitest's unhandled `Errors  1 error`.
 */
export const VERIFICATION_FAIL_PATTERNS = Object.freeze({
  typecheck: 'error TS\\d+|Found [1-9]\\d* errors?\\b',
  lint: '\\([1-9]\\d* errors?, \\d+ warnings?\\)',
  test: '\\b[1-9]\\d* fail(?:ed)?\\b|\\bErrors +[1-9]\\d* errors?\\b',
});
/** The characters of stdout a verification command's `tool.post` keeps, from its end. */
export const STDOUT_TAIL = 300;
/** The characters of a failed call's `error` a `tool.fail` keeps, from its start: the hook cuts to it after redaction and the mapping caps to it. */
export const FAILURE_ERROR_CHARS = 500;
/**
 * The characters of a verification command's runner and tool word the hook's kind patterns run on, as
 * `FALLBACK_INPUT_CHARS` of `src/linear-regexp.ts`: the hook compiles the patterns as plain `RegExp`, which may
 * backtrack, so a short input bounds the cost (ADR-0005).
 */
export const COMMAND_INPUT_CHARS = 400;
/** The longest command whose stdout is parsed for a tail or a PR URL; a longer one keeps none. */
export const MAX_COMMAND_CHARS = 4000;

/** The runners of a package script or binary: their tool word is their next word, or the word after `run` or `exec`. */
const SCRIPT_RUNNERS = new Set(['pnpm', 'npm', 'yarn', 'bun', 'turbo']);
const SCRIPT_VERBS = new Set(['run', 'exec']);
/** The runners of a package binary: their tool word is their next word. */
const BINARY_RUNNERS = new Set(['npx', 'bunx']);
/** The runners of a target: their tool word is their first target, when every word after them is a `KIND_TARGET`. */
const TARGET_RUNNERS = new Set(['make']);
/** A target that runs a kind: a kind word itself or one followed by `:`, `.`, `-` or `_` (`test:unit`, `lint.ci`; not `deploy-test`). */
const KIND_TARGET = /^(?:typecheck|tsc|lint|eslint|vitest|test)(?:[:._-]|$)/;
/** The tool words a script runner may run after `exec` or `dlx`: the kind words of a binary, so `npm exec test` is none. */
const EXEC_TOOLS = new Set(['tsc', 'eslint', 'vitest', 'typecheck', 'lint']);
/** The script runner options that run other code or read another config; npm takes a long option by a prefix. */
const UNSAFE_OPTIONS = ['script-shell', 'userconfig', 'preload'];
/** bun's short `-r` (`--preload`), alone or in a group of short options. */
const BUN_PRELOAD = /^-[A-Za-z]*r/;
/** pnpm's `--config.<key>` options, which set any config key (older versions apply them after the tool word too). */
const PNPM_CONFIG = /^--config\./;
/** The option table entry of a runner: `flags` take no value, `values` map an option to the form of its value (`name` or `directory`). */
const whereOptions = (flags, values) => ({ flags: new Set(flags), values: new Map(Object.entries(values)) });
const pnpmFlags = ['-r', '--recursive', '-w', '--workspace-root', '-s', '--silent'];
const pnpmValues = { '--filter': 'name', '-F': 'name', '--dir': 'directory', '-C': 'directory' };
const npmFlags = ['--workspaces', '-ws', '--silent', '-s'];
const npmValues = { '--workspace': 'name', '-w': 'name', '--prefix': 'directory' };
/**
 * The options a script runner may carry before its verb and before its tool word: the ones that only select where or
 * in which package the script runs, or only quiet its logging (`-s`, `--silent`). A value is a package `name`
 * (`PLAIN_WORD`) or a `directory` (`PLAIN_DIRECTORY`), given as the next word or, for a long option, after `=`
 * (`--filter=web`). Any other option, a group of short options (`-rs`) and `--` fail closed, `UNSAFE_OPTIONS` stay
 * refused in every position, and `turbo` and the other runners have none.
 */
const WHERE_OPTIONS = new Map([
  ['pnpm', whereOptions(pnpmFlags, pnpmValues)],
  ['npm', whereOptions(npmFlags, npmValues)],
  ['yarn', whereOptions([], { '--cwd': 'directory' })],
  ['bun', whereOptions([], { '--filter': 'name', '--cwd': 'directory' })],
]);
/**
 * A tool word: a bare name or one `@scope/name`, so no path (a `/` elsewhere, a leading `.` or `..` would reach any
 * binary through a directory named like a kind, `node_modules/vitest/../../bin/cat`; `owner/repo` is a GitHub
 * package), option, quote, space, `#`, `,`, `(`, `=` or glob.
 */
const PLAIN_WORD = /^(?:@[A-Za-z0-9][\w.-]*\/)?[A-Za-z0-9][\w.:+-]*$/;
/** A word that names a URL or a package source (`data:`, `file:`, `http:`, `github:`), which a package runner would fetch. */
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
/** The script of `node`: a relative plain path without a `..` segment and with a `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` or `.cts` extension. */
const NODE_SCRIPT = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9@._+][A-Za-z0-9@/._+-]*\.[cm]?[jt]s$/;
/** A directory an option of `WHERE_OPTIONS` selects: a relative plain path without a `..` segment (`.`, `packages/api`, `./packages/api`), by its text only. */
const PLAIN_DIRECTORY = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9@._+][A-Za-z0-9@/._+-]*$/;
/** The names of the environment assignments a verification command may carry; redaction (`hooks/lib.mjs`) also leaves their empty value (`CI= pnpm lint`) as it is. */
export const SAFE_ASSIGNMENT_NAMES = Object.freeze(['CI', 'NODE_ENV', 'FORCE_COLOR', 'NO_COLOR', 'TZ', 'DEBUG', 'LANG', 'LC_ALL']);
/** The names as the alternatives of a pattern, each escaped (`escapeRegExp` of `hooks/lib.mjs` is not at hand here). */
const SAFE_NAME_ALTERNATIVES = SAFE_ASSIGNMENT_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
/**
 * The environment assignments a verification command may carry: an allowlisted name and a plain value, or the
 * redaction placeholder `[redacted]`, as the hook stores `CI=1` (the mapping decides on the stored command).
 */
const SAFE_ASSIGNMENT = new RegExp(`^(?:${SAFE_NAME_ALTERNATIVES})=(?:[A-Za-z0-9_.:,/-]*|\\[redacted\\])$`);
/** The redirections a verification command may carry: stderr into stdout, stdout into stderr. */
const REDIRECTIONS = new Set(['2>&1', '>&2', '1>&2']);
/** The unquoted characters of shell syntax the split does not model: escapes, expansions, substitutions, input redirections, groups and comments. */
const UNSAFE = new Set(['\\', '$', '`', '<', '(', ')', '{', '}', '#']);
/** The unquoted characters that make a word a glob, which the shell may expand into file names. */
const GLOB = new Set(['*', '?', '[']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** A count option of `tail` or `head` with its number in the same word: `-n20`, `-20`, `-c300`. */
const COUNT_OPTION = /^-(?:[nc]\d+|\d+)$/;
/** A grep option group of letters that read no file and take no argument; no long option, which grep takes by any prefix. */
const GREP_OPTION = /^-[ivEFcnwxoqshHa]+$/;
/** `gh pr create` at a segment start of a command with unsafe syntax, followed by a word end. */
const GH_PR_CREATE = /[ \t]*gh[ \t]+pr[ \t]+create(?=[ \t\n;&|]|$)/y;
/** A pull request URL, as `gh pr create` prints it. */
const PR_URL = /https:\/\/[A-Za-z0-9.-]{1,253}(?::\d{1,5})?\/[\w.-]{1,100}\/[\w.-]{1,100}\/pull\/\d{1,10}/g;
/** The long options of `gh pr checks` whose output is no table of checks: JSON, a jq filter, a template, the web browser. */
const OTHER_OUTPUT = /^--(?:json|jq|template|web)(?:=|$)/;
/** Their short forms (`-q`, `-t`, `-w`), alone or in a group of short options. */
const OTHER_OUTPUT_SHORT = /^-[A-Za-z]*[qtw]/;
/** The state words of a check in `gh pr checks`'s table without a TTY (its `bucket`). */
const CHECK_STATES = new Set(['pass', 'fail', 'pending', 'skipping', 'cancel']);
/** A check's elapsed time as `gh pr checks` prints it: a Go duration (`1m12s`, `850ms`) or `0` for none. */
const ELAPSED = /^[0-9][0-9hmsuµn.]*$/;
/** The prefixes `stripPrefix` removes, one per match at the sticky position. */
const PREFIX = /cd\s+\S+\s*(?:&&|;)\s*|command\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+/y;

/** The default runners and kind patterns, compiled on first use rather than at import, so the browser bundle compiles none. */
let defaults;
const compiledDefaults = () => {
  defaults ??= { runners: new Set(VERIFICATION_RUNNERS), kinds: Object.values(VERIFICATION_KINDS).map((pattern) => new RegExp(pattern)) };
  return defaults;
};

/** Strips leading `cd <dir> &&`, `command ` and `NAME=value` prefixes, in one pass over the command. */
export const stripPrefix = (command) => {
  const text = command.trim();
  let start = 0;
  PREFIX.lastIndex = 0;
  while (PREFIX.exec(text) !== null) {
    start = PREFIX.lastIndex;
  }
  return text.slice(start);
};

/**
 * Splits a command into its chain segments (on `&&`, `||`, `;`, a newline and a lone `&`), each a list of pipe stages,
 * each a list of words `{ text, glob }` without their quotes, as the shell does for plain commands. `unsafe` marks the
 * syntax it does not model, on which no verification tail is kept: an unquoted `UNSAFE` character, `$`, a backtick
 * or a backslash inside double quotes, `|&`, a `>` redirection other than `REDIRECTIONS` (those are dropped from the
 * words), a redirection without a command (zsh runs `cat` for it) and a quote left open.
 */
const parseChain = (command) => {
  const segments = [];
  let stages = [];
  let words = [];
  let word = { text: '', glob: false, redirect: false };
  let inWord = false;
  let quote = '';
  let unsafe = false;
  let redirected = false;
  const endWord = () => {
    if (inWord && word.redirect) {
      unsafe ||= !REDIRECTIONS.has(word.text);
      redirected = true;
    } else if (inWord) {
      words.push({ text: word.text, glob: word.glob });
    }
    word = { text: '', glob: false, redirect: false };
    inWord = false;
  };
  const endStage = () => {
    endWord();
    unsafe ||= redirected && words.length === 0;
    stages.push(words);
    words = [];
    redirected = false;
  };
  const endSegment = () => {
    endStage();
    segments.push(stages);
    stages = [];
  };
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    const next = command[i + 1];
    if (quote === "'") {
      if (char === "'") {
        quote = '';
      } else {
        word.text += char;
      }
    } else if (quote === '"') {
      unsafe ||= char === '$' || char === '`' || char === '\\';
      if (char === '"') {
        quote = '';
      } else {
        word.text += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
    } else if (char === ' ' || char === '\t') {
      endWord();
    } else if (char === ';' || char === '\n' || (char === '&' && next === '&') || (char === '|' && next === '|')) {
      endSegment();
      i += char === '&' || char === '|' ? 1 : 0;
    } else if (char === '|') {
      unsafe ||= next === '&';
      endStage();
    } else if (char === '&' && command[i - 1] !== '>' && next !== '>') {
      endSegment();
    } else {
      unsafe ||= UNSAFE.has(char);
      word.glob ||= GLOB.has(char);
      word.redirect ||= char === '>';
      word.text += char;
      inWord = true;
    }
  }
  unsafe ||= quote !== '';
  endSegment();
  return { segments: segments.filter((segment) => segment.some((stage) => stage.length > 0)), unsafe };
};

/** A stage's words after its `command` and `NAME=value` prefixes, each assignment one that `assignment` matches. */
const withoutPrefix = (words, assignment = ASSIGNMENT) => {
  let start = 0;
  while (start < words.length && (words[start].text === 'command' || assignment.test(words[start].text))) {
    start += 1;
  }
  return words.slice(start);
};

/** A segment that prints nothing: `cd <dir>`, allowlisted `NAME=value` assignments or `export NAME=value` (`SAFE_ASSIGNMENT`). */
const isSilentPrefix = (stages) => {
  if (stages.length !== 1) {
    return false;
  }
  const texts = stages[0].map((word) => word.text);
  if (texts[0] === 'cd') {
    // A glob could make the error of `cd *.txt 2>&1` print a file name the command does not hold.
    return texts.length === 2 && !texts[1].startsWith('-') && !stages[0][1].glob;
  }
  const assignments = texts[0] === 'export' ? texts.slice(1) : texts;
  return assignments.length > 0 && assignments.every((text) => SAFE_ASSIGNMENT.test(text));
};

/** A word that names an `UNSAFE_OPTIONS` entry, whole or by a prefix of at least three letters, bun's `-r` or a `--config.<key>` of pnpm. */
const isUnsafeOption = (runner, text) => {
  const name = /^--([^=]{3,})/.exec(text)?.[1];
  if (name !== undefined && UNSAFE_OPTIONS.some((option) => option.startsWith(name))) {
    return true;
  }
  return (runner === 'bun' && BUN_PRELOAD.test(text)) || (runner === 'pnpm' && PNPM_CONFIG.test(text));
};

/**
 * The index of the first word of `args` from `from` on that is no option, skipping the options of `WHERE_OPTIONS` of the
 * runner with their values; -1 when an option is none of those, its value is no `PLAIN_WORD` or `PLAIN_DIRECTORY` (so
 * never a glob, `$` or a redirection) or it has none. A word that starts with `-` is an option.
 */
const skipWhereOptions = (runner, args, from) => {
  const allowed = WHERE_OPTIONS.get(runner);
  let index = from;
  while (index < args.length && args[index].text.startsWith('-')) {
    const { text, glob } = args[index];
    const split = text.startsWith('--') ? text.indexOf('=') : -1;
    const name = split === -1 ? text : text.slice(0, split);
    if (allowed === undefined || glob) {
      return -1;
    }
    if (split === -1 && allowed.flags.has(name)) {
      index += 1;
      continue;
    }
    const form = allowed.values.get(name);
    const value = split === -1 ? args[index + 1] : { text: text.slice(split + 1), glob };
    const pattern = form === 'directory' ? PLAIN_DIRECTORY : PLAIN_WORD;
    if (form === undefined || value === undefined || value.glob || !pattern.test(value.text)) {
      return -1;
    }
    index += split === -1 ? 2 : 1;
  }
  return index;
};

/**
 * The tool word of a command, by an allowlist grammar with no option before it but the `WHERE_OPTIONS` of a script
 * runner (`skipWhereOptions`, before its verb and between its verb and the tool word): for `pnpm`, `npm`, `yarn`, `bun`
 * and `turbo` their next word or the word after `run` or `exec` (for `pnpm` also `dlx`; none for `bun exec`, which runs
 * its argument as a shell script), for `npx` and `bunx` their next word, for `make` its next word when every word after
 * it is a `KIND_TARGET` (no option, no `NAME=value`, which may override the recipes' `SHELL`, and no other target), for
 * `node` its next word when that is a `NODE_SCRIPT`, else the runner itself. A tool word is a `PLAIN_WORD`; one a
 * runner may fetch as a package (after `exec`, `dlx`, `npx` or `bunx`) has no `URL_SCHEME`, one after `exec` or `dlx`
 * is an `EXEC_TOOLS` word and one of `bun` has no `.` (a file `bun` would run); a script runner's command has no
 * `isUnsafeOption` word; else there is none.
 */
const toolWord = (runner, args) => {
  if (runner.text === 'node') {
    return NODE_SCRIPT.test(args[0]?.text ?? '') ? args[0] : undefined;
  }
  if (TARGET_RUNNERS.has(runner.text)) {
    const kindTargets = args.length > 0 && args.every((arg) => PLAIN_WORD.test(arg.text) && KIND_TARGET.test(arg.text));
    return kindTargets ? args[0] : undefined;
  }
  const script = SCRIPT_RUNNERS.has(runner.text);
  if (!script && !BINARY_RUNNERS.has(runner.text)) {
    return runner;
  }
  const first = skipWhereOptions(runner.text, args, 0);
  const verb = script ? args[first]?.text : undefined;
  const shellExec = runner.text === 'bun' && verb === 'exec';
  if (first === -1 || shellExec || (script && args.some((arg) => isUnsafeOption(runner.text, arg.text)))) {
    return undefined;
  }
  const hasVerb = SCRIPT_VERBS.has(verb) || (runner.text === 'pnpm' && verb === 'dlx');
  const toolIndex = hasVerb ? skipWhereOptions(runner.text, args, first + 1) : first;
  const tool = toolIndex === -1 ? undefined : args[toolIndex];
  if (!tool || !PLAIN_WORD.test(tool.text)) {
    return undefined;
  }
  const exec = hasVerb && verb !== 'run';
  if ((exec && !EXEC_TOOLS.has(tool.text)) || (runner.text === 'bun' && tool.text.includes('.'))) {
    return undefined;
  }
  const fetches = !script || exec;
  return fetches && URL_SCHEME.test(tool.text) ? undefined : tool;
};

/** A default verification command: allowlisted prefixes, a default runner, and a default kind pattern matches `<runner> <tool word>`. */
const isVerification = (words) => {
  const [runner, ...args] = withoutPrefix(words, SAFE_ASSIGNMENT);
  const { runners, kinds } = compiledDefaults();
  if (!runner || runner.glob || !runners.has(runner.text)) {
    return false;
  }
  const tool = toolWord(runner, args);
  if (!tool || tool.glob) {
    return false;
  }
  const input = (tool === runner ? runner.text : `${runner.text} ${tool.text}`).slice(0, COMMAND_INPUT_CHARS);
  return kinds.some((pattern) => pattern.test(input));
};

/** The arguments of `tail` or `head` that only count: `-n N`, `-nN`, `-N`, `-c N`, `-cN`. */
const onlyCounts = (args) => {
  for (let i = 0; i < args.length; i += 1) {
    if ((args[i] === '-n' || args[i] === '-c') && /^\d+$/.test(args[i + 1] ?? '')) {
      i += 1;
    } else if (!COUNT_OPTION.test(args[i])) {
      return false;
    }
  }
  return true;
};

/**
 * A pipe stage that only cuts the output before it and reads no file: `tail` or `head` with counts only, or `grep`
 * with `GREP_OPTION` groups only and exactly one pattern word.
 */
const isFilter = (words) => {
  if (words.some((word) => word.glob)) {
    return false;
  }
  const [name, ...args] = words.map((word) => word.text);
  if (name === 'tail' || name === 'head') {
    return onlyCounts(args);
  }
  if (name !== 'grep') {
    return false;
  }
  const options = args.filter((arg) => arg.startsWith('-'));
  return args.length - options.length === 1 && options.every((option) => GREP_OPTION.test(option));
};

/**
 * A command whose whole stdout is a default verification command's (design section 7): at most `MAX_COMMAND_CHARS`,
 * no `unsafe` syntax, every chain segment a silent prefix or a default verification command and at least one the
 * latter, and only the last segment piped, into filters only.
 */
export const isDefaultVerification = (command) => {
  if (command.length > MAX_COMMAND_CHARS) {
    return false;
  }
  const { segments, unsafe } = parseChain(command);
  if (unsafe) {
    return false;
  }
  let verifies = false;
  for (const [index, stages] of segments.entries()) {
    if (isSilentPrefix(stages)) {
      continue;
    }
    const piped = stages.length > 1;
    if ((piped && index !== segments.length - 1) || stages.some((stage) => stage.length === 0)) {
      return false;
    }
    if (!isVerification(stages[0]) || !stages.slice(1).every(isFilter)) {
      return false;
    }
    verifies = true;
  }
  return verifies;
};

/**
 * The modelled head of a command with `unsafe` syntax, for `createsPr`: it ends at the first `<<` or `#` anywhere and
 * at the first character `parseChain` marks unsafe, and its segments start at the command's start and after `&&` or
 * `;` outside quotes.
 */
const modelledHead = (command) => {
  const marks = [command.indexOf('<<'), command.indexOf('#')].filter((index) => index !== -1);
  const end = Math.min(command.length, ...marks);
  const starts = [0];
  let quote = '';
  for (let i = 0; i < end; i += 1) {
    const char = command[i];
    if (quote === "'") {
      quote = char === "'" ? '' : quote;
    } else if (quote === '"' && (char === '$' || char === '`' || char === '\\')) {
      return { starts, end: i };
    } else if (quote === '"') {
      quote = char === '"' ? '' : quote;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (UNSAFE.has(char)) {
      return { starts, end: i };
    } else if (char === ';' || (char === '&' && command[i + 1] === '&')) {
      i += char === '&' ? 1 : 0;
      starts.push(i + 1);
    }
  }
  return { starts, end };
};

/**
 * A command with a chain segment that starts with `gh pr create`, in its first `MAX_COMMAND_CHARS`: any parsed segment
 * (after its prefixes) when the command has no `unsafe` syntax, else only one in its `modelledHead`, so a `gh pr create`
 * in a comment, a heredoc or an escaped text is none. A PR body is often a quoted heredoc after `gh pr create`.
 */
const createsPr = (command) => {
  const text = command.slice(0, MAX_COMMAND_CHARS);
  const { segments, unsafe } = parseChain(text);
  if (!unsafe) {
    return segments.some((stages) => {
      const [gh, pr, create] = withoutPrefix(stages[0]).map((word) => word.text);
      return gh === 'gh' && pr === 'pr' && create === 'create';
    });
  }
  const { starts, end } = modelledHead(text);
  return starts.some((start) => {
    GH_PR_CREATE.lastIndex = start;
    return GH_PR_CREATE.test(text) && GH_PR_CREATE.lastIndex <= end;
  });
};

/**
 * The arguments of the one `gh pr checks` a command runs whose stdout is that table (decision 257), by the grammar of
 * `isDefaultVerification`: at most `MAX_COMMAND_CHARS`, no `unsafe` syntax, every chain segment a silent prefix but one
 * `gh pr checks` (after `command` and allowlisted `NAME=value` prefixes) with no `OTHER_OUTPUT` option, and only that
 * segment piped, as the last one, into filters only; none for another command.
 */
const prChecksArgs = (command) => {
  if (command.length > MAX_COMMAND_CHARS) {
    return undefined;
  }
  const { segments, unsafe } = parseChain(command);
  let args;
  for (const [index, stages] of unsafe ? [] : segments.entries()) {
    if (isSilentPrefix(stages)) {
      continue;
    }
    const piped = stages.length > 1;
    if (args !== undefined || (piped && index !== segments.length - 1) || stages.some((stage) => stage.length === 0)) {
      return undefined;
    }
    const [gh, pr, checks, ...rest] = withoutPrefix(stages[0], SAFE_ASSIGNMENT).map((word) => word.text);
    const other = rest.some((arg) => OTHER_OUTPUT.test(arg) || OTHER_OUTPUT_SHORT.test(arg));
    if (gh !== 'gh' || pr !== 'pr' || checks !== 'checks' || other || !stages.slice(1).every(isFilter)) {
      return undefined;
    }
    args = rest;
  }
  return args;
};

/** A command whose stdout is `gh pr checks`'s table (`prChecksArgs`, decision 257); the reducer keeps such a call's check list as its tail. */
export const isPrChecks = (command) => prChecksArgs(command) !== undefined;

/** A line of the table as its name, state and elapsed time: tab-separated, at least those three columns; none for another line. */
const checkRow = (line) => {
  const [field, state, elapsed] = line.split('\t').map((text) => text.trim());
  // A name keeps no control, bidi or zero-width character, which could reorder or hide the text of its chip.
  const name = field === undefined ? '' : stripControl(field).replace(INVISIBLE, '').trim();
  if (elapsed === undefined || name === '' || !CHECK_STATES.has(state) || !ELAPSED.test(elapsed)) {
    return undefined;
  }
  return `${name}\t${state}\t${elapsed}`;
};

/** The check name of a check line. */
const nameOf = (row) => row.slice(0, row.indexOf('\t'));

/**
 * The last table of a `--watch` output's last run of rows. `gh` prints a header line before each refresh while a check
 * is pending, then the finished table without one, and the same table once more at its end, so the last run is the
 * finished table twice, after the last pending table when there was one. A run that is two equal halves keeps one;
 * a run of a table and the same later table twice keeps that later table, when every name of the first is one of it
 * and the first is no longer (so a table whose own last rows repeat, `a b c D D`, stays whole); any other run (an
 * interrupted watch) stays whole.
 */
const lastTable = (run) => {
  const rows = run.rows;
  for (let size = Math.floor(rows.length / 2); size > 0; size -= 1) {
    const table = rows.slice(-size);
    const before = rows.slice(0, -2 * size);
    const twice = rows.slice(-2 * size, -size).every((row, index) => row === table[index]);
    if (!twice || before.length > size) {
      continue;
    }
    const names = new Set(table.map(nameOf));
    if (before.every((row) => names.has(nameOf(row)))) {
      return { rows: table, more: run.more };
    }
  }
  return run;
};

/** The line of a check list that counts the checks the cap dropped: `+3`. */
const MORE_LINE = /^\+([1-9]\d{0,5})$/;

/**
 * The first rows of a table that fit in `STDOUT_TAIL` characters, whole lines only, with a last line `+N` of the
 * checks dropped (`more` of them dropped before) when there are any, counted into the characters; none when no row fits.
 */
const firstRows = (rows, more) => {
  let count = 0;
  let chars = -1;
  while (count < rows.length && chars + rows[count].length + 1 <= STDOUT_TAIL) {
    chars += rows[count].length + 1;
    count += 1;
  }
  const dropped = () => more + rows.length - count;
  while (count > 0 && dropped() > 0 && chars + 2 + String(dropped()).length > STDOUT_TAIL) {
    count -= 1;
    chars -= rows[count].length + 1;
  }
  if (count === 0) {
    return undefined;
  }
  const kept = rows.slice(0, count);
  return dropped() > 0 ? [...kept, `+${dropped()}`] : kept;
};

/**
 * The check list of a `gh pr checks` output (decision 257): one `name<TAB>state<TAB>elapsed` line per check of its
 * table, the link and description columns dropped and every other line skipped, of `--watch` only the last table, the
 * first lines that fit in `STDOUT_TAIL` characters, whole lines only, and a last line `+N` with the count of the checks
 * the cap dropped; none without a check line that fits. `gh` sorts the failing checks first, then the pending ones,
 * then the rest by name, so a list over the cap keeps its failures. A `+N` line after a table adds to that table's
 * count, so the mapping reading a kept list again keeps the same list.
 */
const checkList = (text, watch) => {
  const runs = [{ rows: [], more: 0 }];
  for (const line of text.split('\n')) {
    const row = checkRow(line);
    const more = MORE_LINE.exec(line.trim());
    const run = runs.at(-1);
    if (row !== undefined) {
      run.rows.push(row);
    } else if (more !== null && run.rows.length > 0) {
      run.more += Number(more[1]);
      runs.push({ rows: [], more: 0 });
    } else if (run.rows.length > 0) {
      runs.push({ rows: [], more: 0 });
    }
  }
  const tables = runs.filter((run) => run.rows.length > 0);
  const flat = { rows: tables.flatMap((run) => run.rows), more: tables.reduce((sum, run) => sum + run.more, 0) };
  const table = watch ? lastTable(tables.at(-1) ?? flat) : flat;
  return firstRows(table.rows, table.more)?.join('\n');
};

/** The check list of a `gh pr checks` command's output (`prChecksArgs`, `checkList`), `prepare` run on the output first; none for another command. */
const keptChecks = (command, output, prepare) => {
  const args = prChecksArgs(command);
  return args === undefined ? undefined : checkList(prepare(output), args.includes('--watch'));
};

/**
 * What a Bash `tool.post` keeps of its stdout (design sections 2.2, 2.3 and 7), the one rule of the hook and the
 * mapping: the last `STDOUT_TAIL` characters for a default verification command (`isDefaultVerification`), the check
 * list of a `gh pr checks` command (`keptChecks`, decision 257), the last pull request URL for a command that runs
 * `gh pr create` (nothing without one), else nothing. `prepare` runs on the stdout first and only when something may
 * be kept: the hook's redaction.
 */
export const keptStdout = (command, stdout, prepare = (text) => text) => {
  if (isDefaultVerification(command)) {
    return prepare(stdout).slice(-STDOUT_TAIL);
  }
  if (prChecksArgs(command) !== undefined) {
    return keptChecks(command, stdout, prepare);
  }
  if (!createsPr(command)) {
    return undefined;
  }
  return prepare(stdout).match(PR_URL)?.at(-1);
};

/**
 * What a Bash `tool.fail` keeps of its error beside the error's start (decision 257), the one rule of the hook and the
 * mapping: the check list of a `gh pr checks` command, whose failed or pending check exits non-zero so its table
 * arrives in the error ("Exit code 1" and the output), else nothing. `prepare` runs on the error first: the hook's
 * redaction.
 */
export const keptErrorTail = (command, error, prepare = (text) => text) => keptChecks(command, error, prepare);
