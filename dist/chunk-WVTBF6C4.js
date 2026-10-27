// hooks/verification.mjs
var VERIFICATION_RUNNERS = Object.freeze(["pnpm", "npm", "npx", "yarn", "node", "turbo", "tsc", "eslint", "vitest"]);
var VERIFICATION_KINDS = Object.freeze({ typecheck: "\\b(typecheck|tsc)\\b", lint: "\\b(lint|eslint)\\b", test: "\\b(vitest|test:run)\\b|\\bpnpm\\b.*\\btest\\b" });
var VERIFICATION_FAIL_PATTERNS = Object.freeze({
  typecheck: "error TS\\d+|Found [1-9]\\d* errors?\\b",
  lint: "\\([1-9]\\d* errors?, \\d+ warnings?\\)",
  test: "\\b[1-9]\\d* failed\\b|\\bErrors +[1-9]\\d* errors?\\b"
});
var STDOUT_TAIL = 300;
var FAILURE_ERROR_CHARS = 500;
var COMMAND_INPUT_CHARS = 400;
var MAX_COMMAND_CHARS = 4e3;
var SCRIPT_RUNNERS = /* @__PURE__ */ new Set(["pnpm", "npm", "yarn", "bun", "turbo"]);
var SCRIPT_VERBS = /* @__PURE__ */ new Set(["run", "exec"]);
var BINARY_RUNNERS = /* @__PURE__ */ new Set(["npx", "bunx"]);
var PLAIN_WORD = /^(?:@[A-Za-z0-9][\w.-]*\/)?[A-Za-z0-9][\w.:+-]*$/;
var URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
var NODE_SCRIPT = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9@._+][A-Za-z0-9@/._+-]*\.[cm]?[jt]s$/;
var SAFE_ASSIGNMENT = /^(?:CI|NODE_ENV|FORCE_COLOR|NO_COLOR|TZ|DEBUG|LANG|LC_ALL)=[A-Za-z0-9_.:,/-]*$/;
var REDIRECTIONS = /* @__PURE__ */ new Set(["2>&1", ">&2", "1>&2"]);
var UNSAFE = /* @__PURE__ */ new Set(["\\", "$", "`", "<", "(", ")", "{", "}", "#"]);
var GLOB = /* @__PURE__ */ new Set(["*", "?", "["]);
var ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
var COUNT_OPTION = /^-(?:[nc]\d+|\d+)$/;
var GREP_OPTION = /^-[ivEFcnwxoqshHa]+$/;
var GH_PR_CREATE = /[ \t]*gh[ \t]+pr[ \t]+create(?=[ \t\n;&|]|$)/y;
var PR_URL = /https:\/\/[A-Za-z0-9.-]{1,253}(?::\d{1,5})?\/[\w.-]{1,100}\/[\w.-]{1,100}\/pull\/\d{1,10}/g;
var PREFIX = /cd\s+\S+\s*(?:&&|;)\s*|command\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+/y;
var defaults;
var compiledDefaults = () => {
  defaults ??= { runners: new Set(VERIFICATION_RUNNERS), kinds: Object.values(VERIFICATION_KINDS).map((pattern) => new RegExp(pattern)) };
  return defaults;
};
var stripPrefix = (command) => {
  const text = command.trim();
  let start = 0;
  PREFIX.lastIndex = 0;
  while (PREFIX.exec(text) !== null) {
    start = PREFIX.lastIndex;
  }
  return text.slice(start);
};
var parseChain = (command) => {
  const segments = [];
  let stages = [];
  let words = [];
  let word = { text: "", glob: false, redirect: false };
  let inWord = false;
  let quote = "";
  let unsafe = false;
  let redirected = false;
  const endWord = () => {
    if (inWord && word.redirect) {
      unsafe ||= !REDIRECTIONS.has(word.text);
      redirected = true;
    } else if (inWord) {
      words.push({ text: word.text, glob: word.glob });
    }
    word = { text: "", glob: false, redirect: false };
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
        quote = "";
      } else {
        word.text += char;
      }
    } else if (quote === '"') {
      unsafe ||= char === "$" || char === "`" || char === "\\";
      if (char === '"') {
        quote = "";
      } else {
        word.text += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      inWord = true;
    } else if (char === " " || char === "	") {
      endWord();
    } else if (char === ";" || char === "\n" || char === "&" && next === "&" || char === "|" && next === "|") {
      endSegment();
      i += char === "&" || char === "|" ? 1 : 0;
    } else if (char === "|") {
      unsafe ||= next === "&";
      endStage();
    } else if (char === "&" && command[i - 1] !== ">" && next !== ">") {
      endSegment();
    } else {
      unsafe ||= UNSAFE.has(char);
      word.glob ||= GLOB.has(char);
      word.redirect ||= char === ">";
      word.text += char;
      inWord = true;
    }
  }
  unsafe ||= quote !== "";
  endSegment();
  return { segments: segments.filter((segment) => segment.some((stage) => stage.length > 0)), unsafe };
};
var withoutPrefix = (words, assignment = ASSIGNMENT) => {
  let start = 0;
  while (start < words.length && (words[start].text === "command" || assignment.test(words[start].text))) {
    start += 1;
  }
  return words.slice(start);
};
var isSilentPrefix = (stages) => {
  if (stages.length !== 1) {
    return false;
  }
  const texts = stages[0].map((word) => word.text);
  if (texts[0] === "cd") {
    return texts.length === 2 && !texts[1].startsWith("-") && !stages[0][1].glob;
  }
  const assignments = texts[0] === "export" ? texts.slice(1) : texts;
  return assignments.length > 0 && assignments.every((text) => SAFE_ASSIGNMENT.test(text));
};
var toolWord = (runner, args) => {
  if (runner.text === "node") {
    return NODE_SCRIPT.test(args[0]?.text ?? "") ? args[0] : void 0;
  }
  const script = SCRIPT_RUNNERS.has(runner.text);
  if (!script && !BINARY_RUNNERS.has(runner.text)) {
    return runner;
  }
  const verb = script ? args[0]?.text : void 0;
  const hasVerb = SCRIPT_VERBS.has(verb) || runner.text === "pnpm" && verb === "dlx";
  const tool = hasVerb ? args[1] : args[0];
  if (!tool || !PLAIN_WORD.test(tool.text)) {
    return void 0;
  }
  const fetches = !script || hasVerb && verb !== "run";
  return fetches && URL_SCHEME.test(tool.text) ? void 0 : tool;
};
var isVerification = (words) => {
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
var onlyCounts = (args) => {
  for (let i = 0; i < args.length; i += 1) {
    if ((args[i] === "-n" || args[i] === "-c") && /^\d+$/.test(args[i + 1] ?? "")) {
      i += 1;
    } else if (!COUNT_OPTION.test(args[i])) {
      return false;
    }
  }
  return true;
};
var isFilter = (words) => {
  if (words.some((word) => word.glob)) {
    return false;
  }
  const [name, ...args] = words.map((word) => word.text);
  if (name === "tail" || name === "head") {
    return onlyCounts(args);
  }
  if (name !== "grep") {
    return false;
  }
  const options = args.filter((arg) => arg.startsWith("-"));
  return args.length - options.length === 1 && options.every((option) => GREP_OPTION.test(option));
};
var isDefaultVerification = (command) => {
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
    if (piped && index !== segments.length - 1 || stages.some((stage) => stage.length === 0)) {
      return false;
    }
    if (!isVerification(stages[0]) || !stages.slice(1).every(isFilter)) {
      return false;
    }
    verifies = true;
  }
  return verifies;
};
var modelledHead = (command) => {
  const marks = [command.indexOf("<<"), command.indexOf("#")].filter((index) => index !== -1);
  const end = Math.min(command.length, ...marks);
  const starts = [0];
  let quote = "";
  for (let i = 0; i < end; i += 1) {
    const char = command[i];
    if (quote === "'") {
      quote = char === "'" ? "" : quote;
    } else if (quote === '"' && (char === "$" || char === "`" || char === "\\")) {
      return { starts, end: i };
    } else if (quote === '"') {
      quote = char === '"' ? "" : quote;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (UNSAFE.has(char)) {
      return { starts, end: i };
    } else if (char === ";" || char === "&" && command[i + 1] === "&") {
      i += char === "&" ? 1 : 0;
      starts.push(i + 1);
    }
  }
  return { starts, end };
};
var createsPr = (command) => {
  const text = command.slice(0, MAX_COMMAND_CHARS);
  const { segments, unsafe } = parseChain(text);
  if (!unsafe) {
    return segments.some((stages) => {
      const [gh, pr, create] = withoutPrefix(stages[0]).map((word) => word.text);
      return gh === "gh" && pr === "pr" && create === "create";
    });
  }
  const { starts, end } = modelledHead(text);
  return starts.some((start) => {
    GH_PR_CREATE.lastIndex = start;
    return GH_PR_CREATE.test(text) && GH_PR_CREATE.lastIndex <= end;
  });
};
var keptStdout = (command, stdout, prepare = (text) => text) => {
  if (isDefaultVerification(command)) {
    return prepare(stdout).slice(-STDOUT_TAIL);
  }
  if (!createsPr(command)) {
    return void 0;
  }
  return prepare(stdout).match(PR_URL)?.at(-1);
};

// hooks/lib.mjs
import { spawn } from "child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { accessSync, chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, ftruncateSync, linkSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from "fs";
import { Agent, request as httpRequest } from "http";
import { connect } from "net";
import { homedir } from "os";
import { basename, delimiter, dirname, isAbsolute, join, parse, resolve, sep } from "path";
import { fileURLToPath } from "url";
var HOOK_DEFAULTS = { spool: { dir: "~/.local/share/nurselog", maxLineBytes: 65536, keepDays: 14 } };
var DEFAULT_ROLES = {
  implementer: { stage: "build" },
  "conventions-checker": { stage: "review", short: "conv" },
  "code-reviewer": { stage: "review", short: "code" },
  "spec-reviewer": { stage: "review", short: "spec" },
  "typescript-reviewer": { stage: "review", short: "ts" },
  "silent-failure-hunter": { stage: "review", short: "silent" },
  "security-reviewer": { stage: "review", short: "security" },
  "design-reviewer": { stage: "review", short: "design" },
  "database-reviewer": { stage: "review", short: "db" },
  "pr-test-analyzer": { stage: "review", short: "tests" },
  "pr-shepherd": { stage: "pr" },
  "*": { stage: "other" }
};
var CLI_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "bin", "nurselog");
var UNSAFE_PATH = /[\u0000-\u001f\u007f-\u009f\\]/;
var HIDDEN_PATH = "path hidden: it holds a control character or a backslash";
var shellWord = (text) => /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
var cliCommand = (root, subcommand, cli = CLI_PATH) => {
  const where = root === void 0 ? "" : " in the repository directory";
  if (UNSAFE_PATH.test(cli)) {
    return `run node with bin/nurselog of the Nurselog plugin: ${subcommand}${where} (${HIDDEN_PATH})`;
  }
  if (root === void 0) {
    return `node ${shellWord(cli)} ${subcommand}`;
  }
  if (UNSAFE_PATH.test(root)) {
    return `run node ${shellWord(cli)} ${subcommand}${where} (${HIDDEN_PATH})`;
  }
  return `node ${shellWord(cli)} ${subcommand} --repo ${shellWord(root)}`;
};
var startCommand = (cli = CLI_PATH) => cliCommand(void 0, "start", cli);
var notSetUpMessage = (cli = CLI_PATH) => {
  if (UNSAFE_PATH.test(cli)) {
    return `Nurselog is not set up for this repository; run init of bin/nurselog in the Nurselog plugin with node (${HIDDEN_PATH})`;
  }
  return `Nurselog is not set up for this repository; run: node ${shellWord(cli)} init`;
};
var stripControl = (text) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
var stripControlLines = (text) => text.split("\n").map(stripControl).join("\n  ");
var STATE_FILE_WARNING = "server.stateFile is no longer used and is ignored; the board writes ~/.local/share/nurselog/server.json";
var SERVER_PORT_WARNING = "server.port is ignored: one board serves every repository, on 6767 or --port";
var escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var expandHome = (path) => path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
var tildeHome = (text) => {
  const home = homedir();
  if (!home || home === "/" || !text.includes(home)) {
    return text;
  }
  return text.replace(new RegExp(`${escapeRegExp(home)}(?![\\w.-])`, "g"), "~");
};
var findDotGit = (start) => {
  let dir = resolve(start);
  for (; ; ) {
    const candidate = join(dir, ".git");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return void 0;
    }
    dir = parent;
  }
};
var repositoryRoot = (start) => {
  const dotGit = findDotGit(start);
  return dotGit ? dirname(dotGit) : void 0;
};
var MAX_CONFIG_BYTES = 256 * 1024;
var MAX_GIT_FILE_BYTES = 4096;
var readSmallFile = (path, maxBytes, { head = false } = {}) => {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`${path} is not a regular file`);
    }
    if (stat.size > maxBytes && !head) {
      throw new Error(`${path} is larger than ${maxBytes} bytes`);
    }
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) {
        break;
      }
      length += read;
    }
    return buffer.toString("utf8", 0, length);
  } finally {
    closeSync(fd);
  }
};
var readGitFile = (path) => {
  try {
    return readSmallFile(path, MAX_GIT_FILE_BYTES);
  } catch {
    return void 0;
  }
};
var gitCommonDir = (start) => {
  const dotGit = findDotGit(start);
  if (!dotGit) {
    return void 0;
  }
  if (statSync(dotGit).isDirectory()) {
    return realpathSync(dotGit);
  }
  const match = /^gitdir:\s*(.+)$/m.exec(readGitFile(dotGit) ?? "");
  if (!match) {
    return void 0;
  }
  const gitDir = resolve(dirname(dotGit), match[1].trim());
  const commonDir = readGitFile(join(gitDir, "commondir"))?.trim();
  const common = commonDir ? resolve(gitDir, commonDir) : gitDir;
  return existsSync(common) ? realpathSync(common) : common;
};
var repoHash = (start) => createHash("sha256").update(gitCommonDir(start) ?? resolve(start)).digest("hex").slice(0, 12);
var DEFAULT_SPOOL_ROOT = HOOK_DEFAULTS.spool.dir;
var defaultRoot = () => expandHome(DEFAULT_SPOOL_ROOT);
var userDirFor = (root) => join(defaultRoot(), repoHash(root));
var userConfigPath = (root) => join(userDirFor(root), "nurselog.config.json");
var serverStatePath = () => join(defaultRoot(), "server.json");
var lstatOrUndefined = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return void 0;
  }
};
var lstatIfPresent = (path) => lstatSync(path, { throwIfNoEntry: false });
var checkOwnedFile = (path) => {
  const dir = dirname(path);
  const dirStat = lstatSync(dir);
  if (!dirStat.isDirectory()) {
    throw new Error(`${dir} is not a directory (a symlink is refused)`);
  }
  checkOwner(dir, dirStat);
  const stat = lstatSync(path);
  if (!stat.isFile()) {
    throw new Error(`${path} is not a regular file (a symlink is refused)`);
  }
  checkOwner(path, stat);
};
var repositoryRoots = (start) => {
  const dotGit = findDotGit(start);
  if (!dotGit) {
    return [];
  }
  const common = gitCommonDir(start);
  const main = common && basename(common) === ".git" ? [dirname(common)] : [];
  return [dirname(dotGit), ...main];
};
var findConfig = (root) => {
  const user = userConfigPath(root);
  if (lstatIfPresent(user)) {
    checkOwnedFile(user);
    return { path: user, kind: "user" };
  }
  const roots = repositoryRoots(root);
  const candidates = (roots.length > 0 ? roots : [resolve(root)]).map((dir) => join(dir, "nurselog.config.json"));
  for (const path of candidates) {
    const stat = lstatOrUndefined(path);
    if (stat) {
      return stat.isFile() && stat.size <= MAX_CONFIG_BYTES ? { path, kind: "repository" } : void 0;
    }
  }
  return void 0;
};
var userOnlyWarning = (key) => `${stripControl(key)} is honoured only in the user config and is ignored here; the default is used`;
var dropUserOnlyKeys = (file) => {
  const dropped = [];
  if ("spool" in file) {
    const keys = isObject(file.spool) ? Object.keys(file.spool).map((key) => `spool.${key}`) : ["spool"];
    dropped.push(...keys);
    delete file.spool;
  }
  if ("pricesFrom" in file) {
    delete file.pricesFrom;
    dropped.push("pricesFrom");
  }
  if (isObject(file.insights) && "keepDays" in file.insights) {
    delete file.insights.keepDays;
    dropped.push("insights.keepDays");
  }
  return dropped;
};
var isInside = (path, dir) => path === dir || path.startsWith(`${dir}${sep}`);
var MAX_READ_DAYS = 365;
var SPOOL_RANGES = [
  ["keepDays", 1, 3650],
  ["readDays", 1, MAX_READ_DAYS],
  ["maxLineBytes", 1024, 1048576]
];
var spoolDirProblems = (dir, projectDir) => {
  if (typeof dir !== "string" || !(isAbsolute(dir) || dir === "~" || dir.startsWith("~/"))) {
    return ["spool.dir must be an absolute or ~/ path"];
  }
  const problems = [];
  const root = resolve(expandHome(dir));
  if (root === resolve(homedir()) || root === parse(root).root) {
    problems.push("spool.dir must not be the home or root directory");
  }
  if (projectDir && repositoryRoots(projectDir).some((repo) => isInside(root, resolve(repo)))) {
    problems.push("spool.dir must not be inside the repository");
  }
  return problems;
};
var hookConfigProblems = (config, projectDir) => {
  const problems = spoolDirProblems(config.spool?.dir, projectDir);
  for (const [key, min, max] of SPOOL_RANGES) {
    const value = config.spool?.[key];
    if (value !== void 0 && !(Number.isInteger(value) && value >= min && value <= max)) {
      problems.push(`spool.${key} must be an integer from ${min} to ${max}`);
    }
  }
  return problems;
};
var readConfigText = (found) => {
  try {
    return readSmallFile(found.path, MAX_CONFIG_BYTES);
  } catch (error) {
    if (found.kind === "user") {
      throw error;
    }
    return void 0;
  }
};
var parseObject = (text) => {
  try {
    const value = JSON.parse(text);
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
};
var mergeRoles = (roles) => {
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), DEFAULT_ROLES);
  for (const [type, role] of Object.entries(isObject(roles) ? roles : {})) {
    merged[type] = isObject(role) && isObject(merged[type]) ? { ...merged[type], ...role } : role;
  }
  return merged;
};
var readHookConfig = (root) => {
  const located = findConfig(root);
  const text = located ? readConfigText(located) : void 0;
  const found = text === void 0 ? void 0 : located;
  const file = text === void 0 ? {} : parseObject(text);
  const dropped = found?.kind === "repository" ? dropUserOnlyKeys(file) : [];
  const stateFile = isObject(file.server) && file.server.stateFile !== void 0 ? [STATE_FILE_WARNING] : [];
  const port = isObject(file.server) && file.server.port !== void 0 ? [SERVER_PORT_WARNING] : [];
  const warnings = [...stateFile, ...port, ...dropped.map(userOnlyWarning)];
  const spool = { ...HOOK_DEFAULTS.spool, ...isObject(file.spool) ? file.spool : {} };
  const roles = mergeRoles(file.roles);
  const problems = hookConfigProblems({ spool }, root);
  if (problems.length === 0) {
    return { spool, roles, found, warnings };
  }
  return { spool: { ...HOOK_DEFAULTS.spool }, roles, found, warnings, problems };
};
var configKeepDays = (path, section = "spool") => {
  if (lstatIfPresent(path) === void 0) {
    return void 0;
  }
  checkOwnedFile(path);
  let file;
  try {
    file = JSON.parse(readSmallFile(path, MAX_CONFIG_BYTES));
  } catch (error) {
    throw error instanceof SyntaxError ? new Error(`${path} is not a JSON object`) : error;
  }
  if (!isObject(file)) {
    throw new Error(`${path} is not a JSON object`);
  }
  const keepDays = Object.hasOwn(file, section) && isObject(file[section]) ? file[section].keepDays : void 0;
  if (keepDays === void 0) {
    return void 0;
  }
  const [, min, max] = SPOOL_RANGES.find(([key]) => key === "keepDays");
  if (!(Number.isInteger(keepDays) && keepDays >= min && keepDays <= max)) {
    throw new Error(`${path}: ${section}.keepDays must be an integer from ${min} to ${max}`);
  }
  return keepDays;
};
var spoolDirFor = (config, projectDir) => join(resolve(projectDir, expandHome(config.spool.dir)), repoHash(projectDir));
var pad = (value) => String(value).padStart(2, "0");
var localDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
var spoolFileFor = (dir, at) => join(dir, `events-${localDay(new Date(at))}.ndjson`);
var newLineId = () => `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
var REDACTED = "[redacted]";
var SECRET_KEY = /(token|secret|passw|passphrase|api[_-]?key|private[_-]?key|access[_-]?key|authorization|cookie|credential|signature|bearer|(^|[_-])(pass|pwd|auth|session|salt|jwt|dsn|pat)$|^x-auth|(database|redis|smtp|mongo(db)?|amqp)[_-]?ur[il]$)/i;
var SAFE_KEY = /(_id|tokens|chars)$/i;
var SECRET_NAME = /(TOKEN|SECRET|KEY|PASS|PWD|AUTH|COOKIE|CREDENTIAL|PRIVATE|DSN|SALT|SESSION|SIGNATURE|SIGNING|JWT|BEARER|[_-]UR[LI]$)/i;
var ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
var SECRET_WORDS = /* @__PURE__ */ new Set(["password", "passwd", "passphrase", "pwd", "secret", "token", "apikey", "credential", "credentials", "cookie", "authorization", "bearer", "dsn", "jwt"]);
var SECRET_WORD_PAIRS = /* @__PURE__ */ new Set(["api key", "private key", "access key", "secret key", "signing key", "encryption key"]);
var PASSWORD_WORDS = /* @__PURE__ */ new Set(["password", "passwd", "passphrase", "pwd"]);
var ENV_LABEL = /^[A-Z][A-Z0-9_]+$/;
var PAIR_TOKEN = /^[A-Za-z0-9_-]+$/;
var PAIR_PARENT = /^(?:headers|env)$/i;
var GIT_SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
var TOKEN_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g,
  /---- BEGIN SSH2 [A-Z0-9 ]+ ----[\s\S]*?(?:---- END SSH2 [A-Z0-9 ]+ ----|$)/g,
  /\bAGE-SECRET-KEY-1[A-Z0-9]{58}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g,
  /\bnpm_[A-Za-z0-9]{30,}/g,
  /\b(?:xox[abprse]|xapp)-[A-Za-z0-9-]{10,}/g,
  /\bA[KS]IA[0-9A-Z]{16}\b/g,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bya29\.[0-9A-Za-z_-]{20,}/g,
  /\b1\/\/0[0-9A-Za-z_-]{20,}/g,
  /\bAT[AC]TT[A-Za-z0-9_=-]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
  /\bfigd_[A-Za-z0-9_-]{20,}/g,
  /\bhf_[A-Za-z0-9]{30,}/g,
  /\blin_api_[A-Za-z0-9]{30,}/g,
  /\bdop_v1_[A-Za-z0-9]{30,}/g,
  /\bshp(?:at|ca|pa|ss)_[A-Za-z0-9]{20,}/g,
  /\bpypi-[A-Za-z0-9_-]{40,}/g,
  /\bGOCSPX-[A-Za-z0-9_-]{20,}/g,
  /\bhooks\.slack\.com\/(?:services|triggers|workflows)\/[A-Za-z0-9\/_-]{8,}/g,
  /\bdiscord(?:app)?\.com\/api\/(?:v\d{1,2}\/)?webhooks\/\d{6,}\/[A-Za-z0-9_-]{20,}/g
];
var URL_USERINFO = /\b([a-z][a-z0-9+.-]{0,31}:\/\/)([^\s/@:"'<>]*):([^\s/@"'<>]+)@/gi;
var URL_TOKEN_USERINFO = /\b([a-z][a-z0-9+.-]{0,31}:\/\/)([A-Za-z0-9_-]{20,})(?=@)/gi;
var BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
var HEADER = /\b((?:proxy-)?authorization|set-cookie|cookie|(?<![\w-])x-[\w-]{0,256}?(?:key|token|auth|secret|session)[\w-]{0,256})(\s*:\s*)(?!\s*(?:Bearer|Basic)\s|\s*\[redacted\])[^\r\n"']+/gi;
var SAFE_FLAG = /-(?:stdin|file|path|env|prompt|type|mode|method|provider|scheme|flow|strategy|url|uri|id|name|arn)$/i;
var CLI_CREDENTIALS = [
  [/(\bcurl\b[^\n;&|]{0,256}?\s(?:-u|--user)[\s=]*["']?)([^\s:"']*):([^\s"']+)/g, `$1$2:${REDACTED}`],
  [/(\bcurl\b[^\n;&|]{0,256}?\s(?:-b|--cookie)[\s=]+)("[^"]*"|'[^']*'|\S+)/g, `$1${REDACTED}`],
  [/(\bmysql(?:dump|admin)?\b[^\n;&|]{0,256}?\s-p)[^\s-]\S*/g, `$1${REDACTED}`],
  [/(--[\w-]{0,40}(?:password|passwd|passphrase|pwd|secret|token(?!s|iz)|api-?key|access-?key|auth(?!or)|credential)[\w-]{0,40}|--pass)([ \t]+)(?![-|;&<>=:])("[^"]*"|'[^']*'|\S+)/gi, (match, flag, space) => SAFE_FLAG.test(flag) ? match : `${flag}${space}${REDACTED}`],
  [/(\b(?:docker|az)\s+login\b[^\n;&|]{0,256}?\s-p[ \t]+|\bsshpass\b[^\n;&|]{0,256}?\s-p[ \t]*|\bredis-cli\b[^\n;&|]{0,256}?\s-a[ \t]+|\bsecurity\b[^\n;&|]{0,256}?\s-w[ \t]+|\bsecurity\s+unlock-keychain\b[^\n;&|]{0,256}?\s-p[ \t]+)(?![-|;&<>])("[^"]*"|'[^']*'|\S+)/g, `$1${REDACTED}`],
  [/(\baws\s+configure\s+set\s+)([\w.-]{1,256})([ \t]+)(?![-|;&<>])("[^"]*"|'[^']*'|\S+)/gi, (match, lead, name, space) => /secret|token|passw/i.test(name) ? `${lead}${name}${space}${REDACTED}` : match],
  [/(\b(?:npm|pnpm|yarn)\s+config\s+set\s+(?:-\S+\s+){0,8})(\S{1,256})([ \t]+)(?![-|;&<>])("[^"]*"|'[^']*'|\S+)/gi, (match, lead, name, space) => /auth|token|passw|secret/i.test(name) ? `${lead}${name}${space}${REDACTED}` : match]
];
var LONG_RUN = /(?<![\w+/.~-])[A-Za-z0-9+/]{40,}={0,2}(?![\w+/=.~-])/g;
var ASSIGNMENT2 = /(?<![\w.-])(-{0,2})([A-Za-z_][\w.-]{0,256})(["']?[ \t]*[:=][ \t]*)(?!\[redacted\]|(?:Bearer|Basic)\s)("[^"]*"|'[^']*'|[^\s;&|)`,"'}?]{1,256})/g;
var VALUE_REST = /[^\s;&|)`,"'}?]*/y;
var SECRET_KEY_RUN = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])/g;
var YAML_BLOCK_LABEL = /^([ \t]*)((?:-[ \t]+)?)(["']?)([A-Za-z_][\w.-]{0,256})(["']?[ \t]*:)[ \t]*(?:[|>][-+0-9]{0,2}[ \t]*)?(?:#[^\r\n]*)?(\r?)$/;
var BLANK_LINE = /^[ \t]*\r?$/;
var SHELL_LEAD = /[\s;&|(`:"'?,{=]/;
var VENDOR_RUN = /\b[a-z]{2,10}(?:_[a-z0-9]{1,8})?[_-]([A-Za-z0-9]{30,})\b/g;
var BASE64_LINE = /^[A-Za-z0-9+/]{60,76}={0,2}[ \t]*\r?$/;
var HEX_RUN = /^[0-9a-f]+$/;
var MAX_REDACT_CHARS = 256 * 1024;
var MAX_PAYLOAD_CHARS = 1024 * 1024;
var MAX_DEPTH = 32;
var TRUNCATED = "[truncated]";
var isTokenRun = (run) => /[A-Za-z]/.test(run) && /\d/.test(run) && (run.match(/\//g) ?? []).length < 2;
var isSecretKeyRun = (run) => {
  const mixed = /[A-Z]/.test(run) && /[a-z]/.test(run) && /\d/.test(run);
  return mixed && !run.split("/").every((part) => /^[A-Za-z]*\d*$/.test(part));
};
var boundText = (text) => {
  if (text.length <= MAX_REDACT_CHARS) {
    return text;
  }
  const floor = MAX_REDACT_CHARS - 1024;
  let cut = MAX_REDACT_CHARS;
  while (cut > floor && !/\s/.test(text[cut])) {
    cut -= 1;
  }
  return text.slice(0, cut > floor ? cut : MAX_REDACT_CHARS);
};
var redactBase64Lines = (text) => {
  if (!text.includes("\n")) {
    return text;
  }
  const lines = text.split("\n");
  const kept = [];
  let index = 0;
  while (index < lines.length) {
    let end = index;
    while (end < lines.length && BASE64_LINE.test(lines[end])) {
      end += 1;
    }
    if (end - index >= 2) {
      kept.push(REDACTED);
      index = end;
    } else {
      kept.push(lines[index]);
      index += 1;
    }
  }
  return kept.join("\n");
};
var indentOf = (line) => /^[ \t]*/.exec(line)[0].length;
var redactYamlBlocks = (text) => {
  if (!text.includes("\n")) {
    return text;
  }
  const lines = text.split("\n");
  const kept = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const label = YAML_BLOCK_LABEL.exec(line);
    index += 1;
    if (!label || !isSecretLabel(label[4])) {
      kept.push(line);
      continue;
    }
    const [, indent, dash, quote, name, colon, eol] = label;
    const column = indent.length + dash.length;
    let end = index;
    for (let next = index; next < lines.length; next += 1) {
      if (BLANK_LINE.test(lines[next])) {
        continue;
      }
      if (indentOf(lines[next]) <= column) {
        break;
      }
      end = next + 1;
    }
    kept.push(end > index ? `${indent}${dash}${quote}${name}${colon} ${REDACTED}${eol}` : line);
    index = end;
  }
  return kept.join("\n");
};
var labelWords = (name) => name.replace(/([a-z\d])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_.-]+/).filter(Boolean);
var isSecretLabel = (name) => {
  if (ENV_LABEL.test(name)) {
    return SECRET_NAME.test(name);
  }
  const words = labelWords(name);
  return SECRET_WORDS.has(words.at(-1)) || SECRET_WORD_PAIRS.has(words.slice(-2).join(" "));
};
var isSecretAssignment = (name, separator, value, command) => {
  if (separator.includes("=")) {
    return command && ENV_NAME.test(name) || SECRET_NAME.test(name) || separator === "=" && /^sig$/i.test(name);
  }
  const shaped = /^["']/.test(value) || value.length >= 8 || PASSWORD_WORDS.has(labelWords(name).at(-1));
  return shaped && isSecretLabel(name);
};
var isSecretPairName = (name, parent) => {
  if (PAIR_PARENT.test(parent)) {
    return SECRET_NAME.test(name);
  }
  return PAIR_TOKEN.test(name) && isSecretLabel(name);
};
var redactAssignments = (text, command) => {
  let result = "";
  let copied = 0;
  let inside = 0;
  ASSIGNMENT2.lastIndex = 0;
  for (let match = ASSIGNMENT2.exec(text); match !== null; match = ASSIGNMENT2.exec(text)) {
    const [whole, lead, name, separator, value] = match;
    let end = match.index + whole.length;
    const shellName = lead !== "" || match.index === 0 || SHELL_LEAD.test(text[match.index - 1]);
    if (!isSecretAssignment(name, separator, value, command && shellName && match.index >= inside)) {
      if (/[:=]/.test(value)) {
        ASSIGNMENT2.lastIndex = end - value.length - 1;
        inside = Math.max(inside, end);
      }
      continue;
    }
    if (value.length === 256 && !/^["']/.test(value)) {
      VALUE_REST.lastIndex = end;
      end += VALUE_REST.exec(text)[0].length;
    }
    result += `${text.slice(copied, match.index)}${lead}${name}${separator}${REDACTED}`;
    copied = end;
    ASSIGNMENT2.lastIndex = end;
  }
  return result + text.slice(copied);
};
var redactString = (text, command = false) => {
  let result = tildeHome(boundText(text));
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  result = redactBase64Lines(result);
  result = redactYamlBlocks(result);
  result = result.replace(URL_USERINFO, `$1$2:${REDACTED}@`);
  result = result.replace(URL_TOKEN_USERINFO, (match, scheme, token) => isTokenRun(token) ? `${scheme}${REDACTED}` : match);
  result = result.replace(BEARER, `$1 ${REDACTED}`);
  result = result.replace(HEADER, `$1$2${REDACTED}`);
  for (const [pattern, replacement] of CLI_CREDENTIALS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(VENDOR_RUN, (match, run) => isTokenRun(run) && !HEX_RUN.test(run) ? REDACTED : match);
  result = result.replace(LONG_RUN, (run) => isTokenRun(run) ? REDACTED : run);
  result = result.replace(SECRET_KEY_RUN, (run) => isSecretKeyRun(run) ? REDACTED : run);
  return redactAssignments(result, command);
};
var NAME_FIELDS = ["name", "key", "Name", "Key", "header"];
var VALUE_FIELDS = /* @__PURE__ */ new Set(["value", "Value", "val"]);
var isSecretKey = (key) => SECRET_KEY.test(key) && !SAFE_KEY.test(key);
var MARKER_TOOL = /^mcp__plugin_nurselog_nurselog__(plan|gate|question)$/;
var isPlanTool = (name) => typeof name === "string" && MARKER_TOOL.exec(name)?.[1] === "plan";
var fieldScope = (value, field, scope) => {
  if (scope === "root" && field === "data") {
    return value.src === "cli" && value.event === "plan" ? "input" : "none";
  }
  if (scope === "root" && field === "payload") {
    return value.src === "hook" ? "payload" : "none";
  }
  if ((scope === "root" || scope === "payload") && field === "tool_input") {
    return isPlanTool(value.tool_name) ? "input" : "none";
  }
  if (scope === "input" && field === "streams") {
    return "streams";
  }
  return scope === "stream" && field === "after" ? "after" : "none";
};
var redactValue = (value, key = "", scope = "root", depth = 0) => {
  if (key && isSecretKey(key) && value !== null && value !== void 0 && typeof value !== "boolean") {
    return REDACTED;
  }
  if (typeof value === "string") {
    return key === "sha" && GIT_SHA.test(value) ? value : redactString(value, key === "command");
  }
  if (value && typeof value === "object" && depth >= MAX_DEPTH) {
    return TRUNCATED;
  }
  if (Array.isArray(value)) {
    const pair = value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string";
    if (pair && scope !== "after" && isSecretPairName(value[0], key)) {
      return [redactString(value[0]), REDACTED];
    }
    const itemScope = scope === "streams" ? "stream" : "none";
    return value.map((item) => redactValue(item, key, itemScope, depth + 1));
  }
  if (value && typeof value === "object") {
    const name = NAME_FIELDS.map((field) => value[field]).find((item) => typeof item === "string");
    const secretPair = name !== void 0 && isSecretPairName(name, key);
    const redactField = (field, item) => {
      if (secretPair && VALUE_FIELDS.has(field)) {
        return REDACTED;
      }
      return redactValue(item, field, fieldScope(value, field, scope), depth + 1);
    };
    const entries = Object.entries(value).map(([field, item]) => [field, redactField(field, item)]);
    return Object.fromEntries(entries);
  }
  return value;
};
var SECRET_COMMANDS = /\bprintenv\b|(?:^|[;&|(]\s*)env\b|\bsecrets versions access\b|\bauth (?:print-access-)?token\b|\bfind-generic-password\b/;
var SECRET_PATH = /(?:^|[\s/'"=:])(?:\.env(?:\.[\w.-]{0,256})?|\.npmrc|\.netrc|[\w.-]{0,256}\.pem|[\w.-]{0,256}\.key|id_[\w.-]{1,256}|credentials[\w.-]{0,256}|hosts\.yml|[\w.-]{0,256}secret[\w.-]{0,256})(?=$|[\s/'";|&)])/i;
var PATH_FIELDS = ["file_path", "notebook_path", "path", "pattern", "glob"];
var COMMAND_WORD_SEPARATOR = /[\s'"=;|&()<>`,]+/;
var SECRET_FILE_NAME = /^(?:\.env(?:\.[\w.-]+)?|\.npmrc|\.netrc|hosts\.yml|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$|.\.env$|\.(?:pem|key)$/;
var SECRET_DIRECTORY = /^\.?secrets?$/;
var BODY_FIELDS = ["content", "new_string", "old_string", "new_source"];
var RESPONSE_SCALARS = ["is_error", "exitCode", "exit_code", "interrupted", "isAsync", "agentId", "status", "resolvedModel"];
var ERROR_LINE = 300;
var MARKER_TEXT = 300;
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isSecretFileWord = (word) => {
  const directories = word.toLowerCase().split("/");
  const file = directories.pop();
  const extension = /\.\w+$/.test(file);
  if (SECRET_FILE_NAME.test(file) || directories.some((directory) => SECRET_DIRECTORY.test(directory))) {
    return true;
  }
  if (file.includes("secret")) {
    return extension || file.startsWith(".");
  }
  return file.startsWith("credentials") && (extension || directories.length > 0);
};
var touchesSecret = (input) => {
  const secretPath = PATH_FIELDS.some((field) => typeof input[field] === "string" && SECRET_PATH.test(input[field]));
  if (secretPath || typeof input.command !== "string") {
    return secretPath;
  }
  return SECRET_COMMANDS.test(input.command) || input.command.split(COMMAND_WORD_SEPARATOR).some(isSecretFileWord);
};
var withoutBodies = (input) => {
  const slim = {};
  for (const [field, value] of Object.entries(input)) {
    if (BODY_FIELDS.includes(field)) {
      slim[`${field}Chars`] = typeof value === "string" ? value.length : JSON.stringify(value ?? null).length;
    } else if (field === "edits" && Array.isArray(value)) {
      slim.edits = value.map((edit) => isObject(edit) ? withoutBodies(edit) : edit);
    } else if (field !== "__proto__") {
      slim[field] = value;
    }
  }
  return slim;
};
var slimInput = (input, sensitive) => {
  if (!sensitive) {
    return withoutBodies(input);
  }
  const kept = { sensitive: true };
  for (const field of ["file_path", "notebook_path", "path", "command"]) {
    if (typeof input[field] === "string") {
      kept[field] = input[field];
    }
  }
  return kept;
};
var textOf = (value) => {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value.map((item) => isObject(item) && typeof item.text === "string" ? item.text : "").join("\n");
};
var firstLine = (value) => redactString(textOf(value)).split("\n").find((line) => line.trim())?.trim().slice(0, ERROR_LINE);
var slimResponse = (response, tool, command, sensitive) => {
  const slim = { responseChars: JSON.stringify(response ?? null).length };
  if (MARKER_TOOL.test(tool)) {
    slim.text = redactString(textOf(isObject(response) ? response.content : response)).slice(0, MARKER_TEXT);
    if (isObject(response) && typeof response.isError === "boolean") {
      slim.isError = response.isError;
    }
  }
  if (!isObject(response)) {
    return slim;
  }
  for (const field of RESPONSE_SCALARS) {
    const value = response[field];
    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string" && value.length <= 200) {
      slim[field] = value;
    }
  }
  if (sensitive) {
    slim.sensitive = true;
    return slim;
  }
  const failed = response.is_error === true || typeof response.error === "string" && response.error !== "";
  const error = failed ? firstLine(response.error || response.stderr || response.content) : void 0;
  if (error) {
    slim.error = error;
  }
  if (tool === "Bash" && typeof response.stdout === "string") {
    const stdout = keptStdout(command, response.stdout.slice(-MAX_REDACT_CHARS), redactString);
    if (stdout !== void 0) {
      slim.stdout = stdout;
    }
  }
  return slim;
};
var slimFailureError = (error, sensitive) => {
  if (sensitive || typeof error !== "string") {
    return void 0;
  }
  return redactString(error).slice(0, FAILURE_ERROR_CHARS);
};
var minimizePayload = (payload) => {
  if (payload.tool_input === void 0 && payload.tool_response === void 0 && payload.error === void 0) {
    return payload;
  }
  const input = isObject(payload.tool_input) ? payload.tool_input : {};
  const command = typeof input.command === "string" ? input.command : "";
  const sensitive = touchesSecret(input);
  const slim = { ...payload };
  if (payload.error !== void 0) {
    const error = slimFailureError(payload.error, sensitive);
    if (error === void 0) {
      delete slim.error;
    } else {
      slim.error = error;
    }
  }
  if (payload.tool_input !== void 0) {
    slim.tool_input = slimInput(input, sensitive);
  }
  if (payload.tool_response !== void 0) {
    slim.tool_response = slimResponse(payload.tool_response, typeof payload.tool_name === "string" ? payload.tool_name : "", command, sensitive);
  }
  return slim;
};
var PRIVATE_DIR = 448;
var PRIVATE_FILE = 384;
var OPEN_BITS = 63;
var checkOwner = (path, stat) => {
  const uid = typeof process.getuid === "function" ? process.getuid() : void 0;
  if (uid !== void 0 && stat.uid !== uid) {
    throw new Error(`${path} belongs to another user`);
  }
};
var ensurePrivateDir = (dir) => {
  mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR });
  const stat = lstatSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`${dir} is not a directory (a symlink is refused)`);
  }
  checkOwner(dir, stat);
  if ((stat.mode & OPEN_BITS) !== 0) {
    chmodSync(dir, PRIVATE_DIR);
  }
};
var NOT_A_FILE = /* @__PURE__ */ new Set(["ELOOP", "EMLINK", "ENXIO", "EISDIR"]);
var openPrivate = (path, flags) => {
  let fd;
  try {
    fd = openSync(path, flags | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, PRIVATE_FILE);
  } catch (error) {
    throw NOT_A_FILE.has(error.code) ? new Error(`${path} is not a regular file (a symlink is refused)`) : error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`${path} is not a regular file (a symlink is refused)`);
    }
    checkOwner(path, stat);
    if ((stat.mode & OPEN_BITS) !== 0) {
      fchmodSync(fd, PRIVATE_FILE);
    }
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
};
var writeAndClose = (fd, text) => {
  try {
    const buffer = Buffer.from(text, "utf8");
    let written = 0;
    while (written < buffer.length) {
      written += writeSync(fd, buffer, written, buffer.length - written);
    }
  } finally {
    closeSync(fd);
  }
};
var appendPrivate = (path, text) => {
  writeAndClose(openPrivate(path, constants.O_WRONLY | constants.O_APPEND), text);
};
var writePrivate = (path, text) => {
  ensurePrivateDir(dirname(path));
  const fd = openPrivate(path, constants.O_WRONLY);
  try {
    ftruncateSync(fd, 0);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  writeAndClose(fd, text);
};
var DAY_FILE = /^events-(\d{4}-\d{2}-\d{2})\.ndjson$/;
var NOTIFIED_DIR = "notified";
var NOTIFIED_NAME = /^[\w-]+$/;
var pruneNotified = (dir, oldest) => {
  const folder = join(dir, NOTIFIED_DIR);
  if (!ownedEntry(folder, "dir")) {
    return [];
  }
  let names;
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  const expired = [];
  for (const name of names) {
    const path = join(folder, name);
    try {
      const stat = lstatSync(path);
      if (NOTIFIED_NAME.test(name) && stat.isFile() && localDay(stat.mtime) < oldest) {
        unlinkSync(path);
        expired.push(path);
      }
    } catch {
    }
  }
  return expired;
};
var AFTER_EVERY_DAY = "\uFFFF";
var dayFilesBefore = (dir, oldest) => {
  if (lstatIfPresent(dir) === void 0) {
    return [];
  }
  const files = [];
  for (const name of readdirSync(dir)) {
    const day = DAY_FILE.exec(name)?.[1];
    const path = join(dir, name);
    const stat = day !== void 0 && day < oldest ? lstatIfPresent(path) : void 0;
    if (stat?.isFile() || stat?.isSymbolicLink()) {
      files.push({ day, path });
    }
  }
  return files.sort((a, b) => a.day.localeCompare(b.day));
};
var deleteDaysBefore = (dir, oldest, onFailure = () => {
}) => {
  const deleted = [];
  for (const { path } of dayFilesBefore(dir, oldest)) {
    try {
      unlinkSync(path);
      deleted.push(path);
    } catch (error) {
      onFailure(path, error);
    }
  }
  return [...deleted, ...pruneNotified(dir, oldest)];
};
var pruneSpool = (dir, keepDays, now = /* @__PURE__ */ new Date()) => {
  if (lstatIfPresent(dir) === void 0) {
    return [];
  }
  return deleteDaysBefore(dir, localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - keepDays)));
};
var spoolDirExists = (dir) => {
  const stat = lstatIfPresent(dir);
  if (stat === void 0) {
    return false;
  }
  if (!stat.isDirectory()) {
    throw new Error(`${dir} is not a directory (a symlink is refused)`);
  }
  checkOwner(dir, stat);
  return true;
};
var purgeableDayFiles = (dir, before) => spoolDirExists(dir) ? dayFilesBefore(dir, before ?? AFTER_EVERY_DAY) : [];
var purgeSpool = (dir, before, onFailure) => spoolDirExists(dir) ? deleteDaysBefore(dir, before ?? AFTER_EVERY_DAY, onFailure) : [];
var TMUTIL = "/usr/bin/tmutil";
var BACKUP_MARKER = ".backup-excluded";
var spawnDetached = (command, args) => {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => void 0);
  child.unref();
};
var excludeFromBackup = (dir, { platform = process.platform, spawner = spawnDetached } = {}) => {
  if (platform !== "darwin") {
    return false;
  }
  try {
    const marker = join(dir, BACKUP_MARKER);
    if (!ownedEntry(dir, "dir") || lstatOrUndefined(marker) !== void 0) {
      return false;
    }
    spawner(TMUTIL, ["addexclusion", dir]);
    writeFileSync(marker, `Nurselog excluded this directory from Time Machine backups with: ${TMUTIL} addexclusion
`, { mode: PRIVATE_FILE, flag: "wx" });
    return true;
  } catch {
    return false;
  }
};
var excludedFromBackup = (dir) => ownedEntry(dir, "dir") && lstatOrUndefined(join(dir, BACKUP_MARKER)) !== void 0;
var TAIL_KEYS = /* @__PURE__ */ new Set(["stdout", "stderr"]);
var headWithin = (text, room) => {
  const floor = Math.max(0, room - 1024);
  let cut = room;
  while (cut > floor && !/\s/.test(text[cut])) {
    cut -= 1;
  }
  return cut > floor ? text.slice(0, cut) : "";
};
var budgetStrings = (value) => {
  let room = MAX_PAYLOAD_CHARS;
  let cut = false;
  const take = (text) => {
    if (text.length <= room) {
      room -= text.length;
      return text;
    }
    cut = true;
    const head = headWithin(text, room);
    room = 0;
    return head;
  };
  const walk = (item, depth) => {
    if (typeof item === "string") {
      return take(item);
    }
    if (!item || typeof item !== "object" || depth >= MAX_DEPTH) {
      return item;
    }
    if (Array.isArray(item)) {
      return item.map((entry) => walk(entry, depth + 1));
    }
    const entries = Object.entries(item);
    const strings = entries.map(([, entry]) => typeof entry === "string" ? take(entry) : void 0);
    const valueOf = (entry, index) => typeof entry === "string" ? strings[index] : walk(entry, depth + 1);
    return Object.fromEntries(entries.map(([field, entry], index) => [field, valueOf(entry, index)]));
  };
  return { value: walk(value, 0), cut };
};
var capStrings = (value, limit, key = "", depth = 0) => {
  if (typeof value === "string" && value.length > limit) {
    return TAIL_KEYS.has(key) ? value.slice(-limit) : value.slice(0, limit);
  }
  if (value && typeof value === "object" && depth >= MAX_DEPTH) {
    return TRUNCATED;
  }
  if (Array.isArray(value)) {
    return value.slice(0, limit).map((item) => capStrings(item, limit, "", depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, capStrings(item, limit, name, depth + 1)]));
  }
  return value;
};
var stringifyShallow = (value) => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    if (error instanceof RangeError) {
      return void 0;
    }
    throw error;
  }
};
var serializeLine = (envelope, field, maxBytes) => {
  const line = stringifyShallow(envelope);
  if (line !== void 0 && Buffer.byteLength(line) < maxBytes) {
    return line;
  }
  for (const limit of [16e3, 4e3, 1e3, 200, 40]) {
    const shorter = JSON.stringify({ ...envelope, [field]: capStrings(envelope[field], limit), truncated: true });
    if (Buffer.byteLength(shorter) < maxBytes) {
      return shorter;
    }
  }
  return JSON.stringify({ ...envelope, [field]: {}, truncated: true });
};
var appendSpoolLine = (dir, envelope, field, maxBytes) => {
  ensurePrivateDir(dir);
  const { value, cut } = budgetStrings(envelope);
  const line = redactValue(cut ? { ...value, truncated: true } : value);
  appendPrivate(spoolFileFor(dir, envelope.at), `${serializeLine(line, field, maxBytes)}
`);
};
var buildHookLine = (payload, at, id) => {
  const bounded = budgetStrings(minimizePayload(payload));
  const clean = redactValue(bounded.value);
  const text = (value) => typeof value === "string" ? value : "";
  const line = { v: 1, id, at, src: "hook", hook: text(payload.hook_event_name) || "unknown", sessionId: text(clean.session_id), cwd: text(clean.cwd) };
  if (text(clean.agent_id)) {
    line.agentId = clean.agent_id;
    if (text(clean.agent_type)) {
      line.agentType = clean.agent_type;
    }
  }
  line.payload = clean;
  if (bounded.cut) {
    line.truncated = true;
  }
  return line;
};
var MAX_RECORD_BYTES = 16 * 1024;
var readRepositoryRecord = (path) => {
  let record;
  try {
    checkOwnedFile(path);
    record = JSON.parse(readSmallFile(path, MAX_RECORD_BYTES));
  } catch {
    return void 0;
  }
  const valid = isObject(record) && typeof record.root === "string" && isAbsolute(record.root);
  return valid ? { root: record.root } : void 0;
};
var recordedRootValid = (root, hash) => {
  try {
    return statSync(root).isDirectory() && repositoryRoot(root) === root && repoHash(root) === hash;
  } catch {
    return false;
  }
};
var CONNECT_TIMEOUT_MS = 300;
var MAX_STATE_BYTES = 4096;
var readServerState = (stateFile) => {
  let state;
  try {
    state = JSON.parse(readSmallFile(stateFile, MAX_STATE_BYTES));
  } catch {
    return void 0;
  }
  const validPid = Number.isInteger(state?.pid) && state.pid > 0;
  const validPort = Number.isInteger(state?.port) && state.port >= 1 && state.port <= 65535;
  return validPid && validPort ? state : void 0;
};
var serverRunning = (stateFile) => {
  const state = readServerState(stateFile);
  if (!state) {
    return Promise.resolve(false);
  }
  try {
    process.kill(state.pid, 0);
  } catch (error) {
    if (error?.code !== "EPERM") {
      return Promise.resolve(false);
    }
  }
  return new Promise((done) => {
    const socket = connect({ host: "127.0.0.1", port: state.port });
    const finish = (running) => {
      socket.destroy();
      done(running);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
};
var BOARD_TOKEN = /^[A-Za-z0-9_-]{43}$/;
var MAX_TOKEN_BYTES = 256;
var boardTokenPath = () => join(defaultRoot(), "token");
var readTokenFile = (path) => {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === "ENOENT") {
      return void 0;
    }
    throw NOT_A_FILE.has(error.code) ? new Error(`${path} is not a regular file (a symlink is refused)`) : error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`${path} is not a regular file (a symlink is refused)`);
    }
    checkOwner(path, stat);
    if ((stat.mode & OPEN_BITS) !== 0) {
      fchmodSync(fd, PRIVATE_FILE);
    }
    const buffer = Buffer.alloc(MAX_TOKEN_BYTES);
    const text = buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0)).trim();
    if (!BOARD_TOKEN.test(text)) {
      throw new Error(`${path} holds no board token; delete it and start the board again`);
    }
    return text;
  } finally {
    closeSync(fd);
  }
};
var ensureBoardToken = (path = boardTokenPath()) => {
  ensurePrivateDir(dirname(path));
  const found = readTokenFile(path);
  if (found !== void 0) {
    return found;
  }
  const token = randomBytes(32).toString("base64url");
  const temp = `${path}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, `${token}
`, { mode: PRIVATE_FILE, flag: "wx" });
    linkSync(temp, path);
    return token;
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
    const made = readTokenFile(path);
    if (made === void 0) {
      throw new Error(`${path} was removed while the board started; start the board again`);
    }
    return made;
  } finally {
    rmSync(temp, { force: true });
  }
};
var readBoardToken = (path = boardTokenPath()) => {
  try {
    return ownedEntry(dirname(path), "dir") ? readTokenFile(path) : void 0;
  } catch {
    return void 0;
  }
};
var NONCE = /^[A-Za-z0-9_-]{16,64}$/;
var TICKET = /^[A-Za-z0-9_-]{43}$/;
var tokenHmac = (token, text) => createHmac("sha256", token).update(text).digest("base64url");
var boardProof = (token, port, pid, nonce) => tokenHmac(token, `proof:${port}:${pid}:${nonce}`);
var sameText = (a, b) => {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
};
var BOARD_POLL_MS = 100;
var HEALTH_TIMEOUT_MS = 300;
var RUNNING_CHECK_MS = 1e3;
var SESSION_ENV = /^(?:GIT_|CLAUDE|ANTHROPIC_)|^(?:GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN)$/;
var boardEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([name]) => !SESSION_ENV.test(name)));
var boardUrl = (port) => `http://127.0.0.1:${port}/`;
var boardLogPath = () => join(defaultRoot(), "board.log");
var openBoardLog = () => {
  const path = boardLogPath();
  ensurePrivateDir(dirname(path));
  const fd = openPrivate(path, constants.O_WRONLY | constants.O_APPEND);
  try {
    ftruncateSync(fd, 0);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  return fd;
};
var startBoardDetached = (cli = CLI_PATH, { node = process.execPath, env = process.env } = {}) => {
  const pluginRoot = resolve(dirname(cli), "..");
  if (!existsSync(join(pluginRoot, "dist", "cli.js"))) {
    return { status: "not-built" };
  }
  const fd = openBoardLog();
  const ended = new AbortController();
  try {
    const child = spawn(node, [cli, "start"], { cwd: defaultRoot(), env: boardEnv(env), detached: true, stdio: ["ignore", fd, fd] });
    child.once("error", (error) => {
      ended.abort();
      try {
        appendPrivate(boardLogPath(), `nurselog: the board did not start: ${error.message}
`);
      } catch {
      }
    });
    child.once("exit", () => ended.abort());
    child.unref();
  } finally {
    closeSync(fd);
  }
  return { status: "started", exited: ended.signal };
};
var ownedEntry = (path, kind) => {
  try {
    const stat = lstatSync(path);
    checkOwner(path, stat);
    return kind === "dir" ? stat.isDirectory() : stat.isFile();
  } catch {
    return false;
  }
};
var MAX_LOOPBACK_BYTES = 1024 * 1024;
var loopbackJson = (port, path, timeoutMs, token, method = "GET") => new Promise((done) => {
  const headers = token === void 0 ? {} : { Authorization: `Bearer ${token}` };
  const request = httpRequest({ host: "127.0.0.1", port, path, method, headers, agent: new Agent() }, (response) => {
    const chunks = [];
    let length = 0;
    const json = /^application\/json\b/i.test(response.headers["content-type"] ?? "");
    response.on("data", (chunk) => {
      length += chunk.length;
      chunks.push(chunk);
      if (length > MAX_LOOPBACK_BYTES) {
        clearTimeout(timer);
        request.destroy();
        done(void 0);
      }
    });
    response.on("error", () => done(void 0));
    response.on("end", () => {
      clearTimeout(timer);
      try {
        done(response.statusCode === 200 && json ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : void 0);
      } catch {
        done(void 0);
      }
    });
  });
  const timer = setTimeout(() => request.destroy(), timeoutMs);
  request.on("error", () => {
    clearTimeout(timer);
    done(void 0);
  });
  request.end();
});
var checkBoard = async (stateFile = serverStatePath(), timeoutMs = HEALTH_TIMEOUT_MS) => {
  if (!ownedEntry(dirname(stateFile), "dir") || !ownedEntry(stateFile, "file")) {
    return { status: "none" };
  }
  const state = readServerState(stateFile);
  if (!state || !pidAlive(state.pid)) {
    return { status: "none" };
  }
  const nonce = randomBytes(24).toString("base64url");
  const health = await loopbackJson(state.port, `/api/health?nonce=${nonce}`, timeoutMs);
  if (health?.ok !== true || health.pid !== state.pid) {
    return { status: "none" };
  }
  const found = { url: boardUrl(state.port), port: state.port, pid: state.pid };
  const token = readBoardToken(join(dirname(stateFile), "token"));
  const proven = token !== void 0 && typeof health.proof === "string" && sameText(health.proof, boardProof(token, state.port, state.pid, nonce));
  return proven ? { status: "proven", ...found, token } : { status: "unproven", ...found };
};
var pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
};
var notProvenMessage = (port) => `the board on port ${port} does not prove the token file (board token missing or changed, or another process holds the port); stop the process on port ${port} or delete ${tildeHome(serverStatePath())}, then start the board`;
var verifiedBoardUrl = async (stateFile = serverStatePath(), timeoutMs = HEALTH_TIMEOUT_MS) => {
  const board = await checkBoard(stateFile, timeoutMs);
  return board.status === "proven" ? board.url : void 0;
};
var TOKEN_CHANGED = "board token missing or changed; restart the board";
var signInBoard = async (stateFile = serverStatePath(), timeoutMs = HEALTH_TIMEOUT_MS) => {
  const board = await checkBoard(stateFile, timeoutMs);
  if (board.status !== "proven") {
    return board;
  }
  const answer = await loopbackJson(board.port, "/api/signin", timeoutMs, board.token, "POST");
  const ticket = typeof answer?.ticket === "string" && TICKET.test(answer.ticket) ? answer.ticket : void 0;
  return { ...board, signIn: ticket === void 0 ? void 0 : `${board.url}?ticket=${ticket}` };
};
var pause = (ms, signal) => new Promise((done) => {
  if (signal?.aborted) {
    done();
    return;
  }
  const timer = setTimeout(done, ms);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    done();
  }, { once: true });
});
var waitForBoard = async (timeoutMs, { stateFile = serverStatePath(), exited } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    const settled = exited?.aborted === true;
    const url = await verifiedBoardUrl(stateFile, Math.min(HEALTH_TIMEOUT_MS, Math.max(deadline - Date.now(), 50)));
    if (url) {
      return { outcome: "running", url };
    }
    if (settled) {
      return { outcome: "exited" };
    }
    const left = deadline - Date.now();
    if (left <= 0) {
      return { outcome: "timeout" };
    }
    await pause(Math.min(BOARD_POLL_MS, left), exited);
  }
};
var MAC_APP_BROWSERS = ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"];
var LINUX_APP_BROWSERS = ["google-chrome", "chromium", "microsoft-edge"];
var MAC_OPEN = "/usr/bin/open";
var UNTIL_EXIT = Number.POSITIVE_INFINITY;
var LINUX_LAUNCH_GRACE_MS = 300;
var launch = (command, args, waitMs, { env, cwd } = {}) => new Promise((done) => {
  const child = spawn(command, args, { detached: true, stdio: "ignore", env, cwd });
  let timer;
  const finish = (opened) => {
    clearTimeout(timer);
    child.unref();
    done(opened);
  };
  child.once("error", () => finish(false));
  child.once("exit", (code) => finish(code === 0));
  if (Number.isFinite(waitMs)) {
    child.once("spawn", () => {
      timer = setTimeout(() => finish(true), waitMs);
    });
  }
});
var resolveCommand = (command, path = process.env.PATH ?? "") => {
  for (const dir of path.split(delimiter).filter((entry) => isAbsolute(entry))) {
    const candidate = join(dir, command);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
    }
  }
  return void 0;
};
var macAppPaths = (browser) => [`/Applications/${browser}.app`, join(homedir(), "Applications", `${browser}.app`)];
var openAppWindow = async (url, { platform = process.platform, launch: run = launch, resolve: find = resolveCommand, exists = existsSync, launchOptions } = {}) => {
  if (platform === "darwin") {
    for (const browser of MAC_APP_BROWSERS.filter((name) => macAppPaths(name).some((path) => exists(path)))) {
      if (await run(MAC_OPEN, ["-na", browser, "--args", `--app=${url}`], UNTIL_EXIT, launchOptions)) {
        return browser;
      }
    }
    return void 0;
  }
  for (const browser of LINUX_APP_BROWSERS) {
    const command = find(browser);
    if (command !== void 0 && await run(command, [`--app=${url}`], LINUX_LAUNCH_GRACE_MS, launchOptions)) {
      return browser;
    }
  }
  return void 0;
};

// src/config.ts
import { existsSync as existsSync2 } from "fs";
import { basename as basename2, dirname as dirname2, join as join2, resolve as resolve2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/linear-regexp.ts
import { setFlagsFromString } from "v8";
var flagsFrozen = (execArgv, nodeOptions = "") => {
  const args = [...execArgv, ...nodeOptions.split(/\s+/)];
  return args.some((arg) => arg.replaceAll("_", "-") === "--freeze-flags-after-init");
};
if (!flagsFrozen(process.execArgv, process.env.NODE_OPTIONS)) {
  setFlagsFromString("--enable-experimental-regexp-engine");
}
var probeLinearEngine = () => {
  try {
    new RegExp("a", "l");
    return true;
  } catch {
    return false;
  }
};
var LINEAR_ENGINE = probeLinearEngine();
var PATTERN_INPUT_CHARS = 16384;
var FALLBACK_INPUT_CHARS = 400;
var patternInput = (text, linear = LINEAR_ENGINE) => text.slice(0, linear ? PATTERN_INPUT_CHARS : FALLBACK_INPUT_CHARS);
var linearRegExp = (source, flags = "", linear = LINEAR_ENGINE) => new RegExp(source, linear ? `${flags}l` : flags);

// src/model/keys.ts
var BRANCH_KEY_PATTERN = "[A-Z][A-Z0-9]+-\\d+";
var MAX_KEY_MATCHES = 5;
var KEY_BEFORE = String.raw`(?:^|[^\w\\./-])`;
var KEY_AFTER = String.raw`(?:$|[^\w/.]|\.(?:$|[^A-Za-z0-9]))`;
var BRANCH_KEY_BEFORE = String.raw`(?:^|[^A-Za-z0-9\\./])`;
var BRANCH_KEY_AFTER = String.raw`(?:$|[^A-Za-z0-9/.]|\.(?:$|[^A-Za-z0-9]))`;
var KEY_FOLLOWER = new RegExp(`^${KEY_AFTER}`);
var keyRegExp = (pattern, flags = "", linear) => {
  const source = flags === "g" ? `${KEY_BEFORE}(${pattern})` : `${KEY_BEFORE}(${pattern})${KEY_AFTER}`;
  return linearRegExp(source, flags, linear);
};
var branchKeyRegExp = (pattern, linear) => linearRegExp(`${BRANCH_KEY_BEFORE}(${pattern})${BRANCH_KEY_AFTER}`, "", linear);
var keyRegExps = (pattern, linear) => {
  return [linearRegExp(pattern, "g", linear), keyRegExp(pattern, "g", linear), keyRegExp(pattern, "", linear), branchKeyRegExp(pattern, linear)];
};
var asciiUpperCase = (text) => text.replace(/[a-z]+/g, (letters) => letters.toUpperCase());
var keyInput = (text, ignoreCase) => {
  const input = patternInput(text);
  return ignoreCase ? asciiUpperCase(input) : input;
};
var keyMatches = (text, pattern, ignoreCase) => {
  const input = keyInput(text, ignoreCase);
  const keys = [];
  let count = 0;
  for (const match of input.matchAll(pattern)) {
    const end = match.index + match[0].length;
    if (KEY_FOLLOWER.test(input.slice(end, end + 2))) {
      keys.push(match[1]);
    }
    count += 1;
    if (count >= MAX_KEY_MATCHES) {
      break;
    }
  }
  return keys;
};
var firstKey = (text, pattern, ignoreCase) => pattern.exec(keyInput(text, ignoreCase))?.[1];
var globalKeyPatterns = /* @__PURE__ */ new Map();
var globalKeyPattern = (source) => {
  let pattern = globalKeyPatterns.get(source);
  if (!pattern) {
    pattern = keyRegExp(source, "g");
    globalKeyPatterns.set(source, pattern);
  }
  return pattern;
};
var promptKeys = (text, { keyPattern, keyIgnoreCase }) => {
  return keyPattern === "" ? [] : [...new Set(keyMatches(text, globalKeyPattern(keyPattern), keyIgnoreCase))];
};
var branchKey = (branch, key, ignoreCase) => {
  for (const part of branch.split("/")) {
    const found = firstKey(part, key, ignoreCase);
    if (found !== void 0) {
      return found;
    }
  }
  return void 0;
};

// src/config.ts
var PACKAGE_ROOT = resolve2(dirname2(fileURLToPath2(import.meta.url)), "..");
var defaultJoinPattern = (trunk) => `git diff (?:origin/)?${escapeRegExp(trunk)}\\.\\.\\.[^\\s>]+\\s*>`;
var trunkJoinPattern = (config) => {
  const branches2 = config.branches;
  const trunk = isPlainObject(branches2) ? branches2.trunk : void 0;
  return typeof trunk === "string" ? defaultJoinPattern(trunk) : DEFAULT_CONFIG.join.pattern;
};
var DEFAULT_CONFIG = {
  keyPattern: "",
  keyIgnoreCase: false,
  keyUrl: "",
  branches: { trunk: "main", promote: [] },
  github: { repo: "", accountPattern: "", pollSeconds: 60, mergeBy: "developer", promoteTitlePrefix: {} },
  packages: [],
  stageColors: { plan: "#aeb4bf", build: "#8fa6cc", review: "#7dd8d0", fix: "#ff9a7a", pr: "#e8eaef", docs: "#e9d28c", wait: "#ffffff" },
  roles: structuredClone(DEFAULT_ROLES),
  docs: { roles: ["doc-updater"], tools: [] },
  modelLetters: { "claude-haiku": "H", "claude-sonnet": "S", "claude-opus": "O", "claude-fable": "F" },
  budgets: {
    warnAt: 0.8,
    default: { toolCalls: null, verifyRounds: null },
    roles: { implementer: { toolCalls: 80, verifyRounds: 3 } },
    /** The current Opus, Sonnet, Fable and Haiku 5 models have a 1M context window; older models fall back to 200k. */
    contextLimits: { default: 2e5, "claude-opus": 1e6, "claude-sonnet": 1e6, "claude-fable": 1e6, "claude-haiku-5": 1e6 }
  },
  verification: { runners: [...VERIFICATION_RUNNERS], kinds: { ...VERIFICATION_KINDS }, failPatterns: { ...VERIFICATION_FAIL_PATTERNS }, fullRunOnly: true },
  join: { pattern: defaultJoinPattern("main") },
  pricesFrom: join2(PACKAGE_ROOT, "prices.json"),
  spool: { dir: "~/.local/share/nurselog", readDays: 7, keepDays: 14, maxLineBytes: 65536 },
  insights: { window: 5, baseline: 20, minBaseline: 10, keepDays: 365 },
  retention: { indexHours: 6 },
  server: { host: "127.0.0.1" },
  features: { answerFromUi: false }
};
var isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var mergeConfig = (base, override) => {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === void 0 ? base : override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = Object.hasOwn(merged, key) ? merged[key] : void 0;
    Object.defineProperty(merged, key, { value: mergeConfig(current, value), enumerable: true, writable: true, configurable: true });
  }
  return merged;
};
var readLegacyStageColor = (parsed) => {
  const colors = parsed.stageColors;
  if (!isPlainObject(colors) || !Object.hasOwn(colors, "brief")) {
    return;
  }
  if (!Object.hasOwn(colors, "plan")) {
    colors.plan = colors.brief;
  }
  delete colors.brief;
};
var REPO_PART = /^(?!-)(?!\.{1,2}$)[\w.-]+$/;
var MAX_PATTERN = 200;
var MAX_TRUNK = 200;
var KIND_NAMES = Object.keys(VERIFICATION_KINDS);
var MAX_PACKAGES = 50;
var MAX_PACKAGE_PATHS = 20;
var MAX_PACKAGE_PATH = 200;
var BRANCH_NAME = /^[\w][\w./-]*$/;
var isBranchName = (name) => typeof name === "string" && BRANCH_NAME.test(name) && !name.includes("..") && !name.endsWith(".lock") && !name.endsWith("/");
var BRANCH_RULE = 'a branch name: word characters, dots, slashes and dashes, no leading dash, no ".." and no ".lock" or "/" at the end';
var branchProblems = ({ trunk, promote }) => {
  const problems = isBranchName(trunk) ? [] : [`branches.trunk must be ${BRANCH_RULE}`];
  if (typeof trunk === "string" && trunk.length > MAX_TRUNK) {
    problems.push(`branches.trunk is longer than ${MAX_TRUNK} characters`);
  }
  if (!Array.isArray(promote)) {
    return [...problems, "branches.promote must be a list of branch names"];
  }
  for (const [index, target] of promote.entries()) {
    if (!isBranchName(target)) {
      problems.push(`branches.promote[${index}] must be ${BRANCH_RULE}`);
    }
  }
  return problems;
};
var isGithubRepo = (repo) => {
  const parts = repo.split("/");
  return parts.length === 2 && parts.every((part) => REPO_PART.test(part));
};
var REMOTE_URL = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i;
var REMOTE_SCP = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/;
var githubRepoOfRemote = (url, host) => {
  const match = REMOTE_URL.exec(url) ?? REMOTE_SCP.exec(url);
  if (!match || host !== void 0 && match[1].toLowerCase() !== host) {
    return void 0;
  }
  const repo = match[2].replace(/\/+$/, "").replace(/\.git$/, "");
  return isGithubRepo(repo) ? repo : void 0;
};
var plain = (pattern, linear) => linearRegExp(pattern, "", linear);
var kindPatterns = (key, config) => {
  const defaults2 = DEFAULT_CONFIG.verification[key];
  const configured = Object.entries(config.verification[key]);
  const unknown = configured.filter(([kind]) => !KIND_NAMES.includes(kind));
  const problems = unknown.map(([kind]) => `verification.${key}.${kind} is not a verification kind; the kinds are typecheck, lint and test`);
  const known = configured.filter(([kind]) => KIND_NAMES.includes(kind));
  const empty = known.filter(([, pattern]) => pattern === "");
  problems.push(...empty.map(([kind]) => `verification.${key}.${kind} must not be empty; an empty pattern matches everything`));
  const filled = known.filter(([, pattern]) => pattern !== "");
  return [problems, filled.map(([kind, pattern]) => [`verification.${key}.${kind}`, pattern, defaults2[kind], plain])];
};
var patternProblem = ([name, pattern, standard, compileAs], linear) => {
  if (typeof pattern !== "string") {
    return `${name} must be a string`;
  }
  if (pattern.length > MAX_PATTERN && pattern !== standard) {
    return `${name} is longer than ${MAX_PATTERN} characters`;
  }
  try {
    new RegExp(pattern);
  } catch (error) {
    return `${name} is not a valid regular expression: ${error.message}`;
  }
  if (!linear) {
    return pattern === standard ? void 0 : `${name} differs from its default, and this Node has no linear-time regexp engine (the l flag) to run another pattern safely`;
  }
  try {
    compileAs(pattern, linear);
  } catch {
    return `${name} cannot run in linear time: it uses a backreference, a lookahead or lookbehind, a repeat count above 16 such as .{20}, an inline flag such as (?i:) or another feature the linear regexp engine lacks`;
  }
  return void 0;
};
var packagePathProblems = (packages) => {
  const list = Array.isArray(packages) ? packages : [];
  const problems = list.length > MAX_PACKAGES ? [`packages has more than ${MAX_PACKAGES} items`] : [];
  for (const [index, pkg] of list.entries()) {
    const paths = isPlainObject(pkg) ? pkg.paths : void 0;
    const items = Array.isArray(paths) ? paths : [];
    if (items.length > MAX_PACKAGE_PATHS) {
      problems.push(`packages[${index}].paths has more than ${MAX_PACKAGE_PATHS} items`);
    }
    for (const [item, path] of items.entries()) {
      if (typeof path !== "string") {
        problems.push(`packages[${index}].paths[${item}] must be a string`);
      } else if (path.length > MAX_PACKAGE_PATH) {
        problems.push(`packages[${index}].paths[${item}] is longer than ${MAX_PACKAGE_PATH} characters`);
      }
    }
  }
  return problems;
};
var MIN_POLL_SECONDS = 10;
var MAX_POLL_SECONDS = 3600;
var ROLE_STAGES = ["build", "review", "pr", "other"];
var OBJECT = "an object";
var STRING_LIST = "a list of strings";
var LIMIT = "null or an integer of 0 or more";
var isBoolean = (value) => typeof value === "boolean";
var isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
var isPositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
var isPollSeconds = (value) => Number.isInteger(value) && value >= MIN_POLL_SECONDS && value <= MAX_POLL_SECONDS;
var isMergeBy = (value) => value === "developer" || value === "agent";
var isFraction = (value) => typeof value === "number" && value >= 0 && value <= 1;
var isLimit = (value) => value === null || Number.isInteger(value) && value >= 0;
var isRole = (value) => isPlainObject(value) && ROLE_STAGES.includes(value.stage) && (value.short === void 0 || typeof value.short === "string");
var isRoleBudget = (value) => isPlainObject(value) && [value.toolCalls, value.verifyRounds].every((limit) => limit === void 0 || isLimit(limit));
var isKeyUrl = (value) => {
  if (value === "") {
    return true;
  }
  if (typeof value !== "string" || !value.includes("{key}") || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "https:" && !url.host.includes("{");
};
var isIntegerIn = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
var DEFAULTED_KEYS = [
  ["keyIgnoreCase", "true or false", isBoolean],
  ["keyUrl", "empty or an https: URL that contains {key} outside its host", isKeyUrl],
  ["github", OBJECT, isPlainObject],
  ["github.pollSeconds", `an integer from ${MIN_POLL_SECONDS} to ${MAX_POLL_SECONDS}`, isPollSeconds],
  ["github.mergeBy", "developer or agent", isMergeBy],
  ["roles", OBJECT, isPlainObject],
  ["roles.*", "an object with a stage of build, review, pr or other and an optional string short", isRole],
  ["docs", OBJECT, isPlainObject],
  ["docs.roles", STRING_LIST, isStringList],
  ["docs.tools", STRING_LIST, isStringList],
  ["budgets", OBJECT, isPlainObject],
  ["budgets.warnAt", "a number from 0 to 1", isFraction],
  ["budgets.default", OBJECT, isPlainObject],
  ["budgets.default.toolCalls", LIMIT, isLimit],
  ["budgets.default.verifyRounds", LIMIT, isLimit],
  ["budgets.roles", OBJECT, isPlainObject],
  ["budgets.roles.*", `an object whose toolCalls and verifyRounds are each ${LIMIT}`, isRoleBudget],
  ["budgets.contextLimits", OBJECT, isPlainObject],
  ["budgets.contextLimits.*", "a positive number", isPositive],
  ["verification", OBJECT, isPlainObject],
  ["verification.runners", STRING_LIST, isStringList],
  ["verification.kinds", OBJECT, isPlainObject],
  ["verification.failPatterns", OBJECT, isPlainObject],
  ["retention", OBJECT, isPlainObject],
  ["retention.indexHours", "a positive number", isPositive],
  ["insights", OBJECT, isPlainObject],
  ["insights.window", "an integer from 1 to 100", isIntegerIn(1, 100)],
  ["insights.baseline", "an integer from 1 to 1000", isIntegerIn(1, 1e3)],
  ["insights.minBaseline", "an integer from 1 to 1000", isIntegerIn(1, 1e3)],
  ["insights.keepDays", "an integer from 1 to 3650", isIntegerIn(1, 3650)]
];
var valueAt = (root, path) => {
  let value = root;
  for (const key of path) {
    if (!isPlainObject(value) || !Object.hasOwn(value, key)) {
      return void 0;
    }
    value = value[key];
  }
  return value;
};
var pathsOf = (config, key) => {
  let paths = [[]];
  for (const step of key.split(".")) {
    paths = paths.flatMap((path) => {
      if (step !== "*") {
        return [[...path, step]];
      }
      const value = valueAt(config, path);
      return isPlainObject(value) ? Object.keys(value).map((own) => [...path, own]) : [];
    });
  }
  return paths;
};
var restoreDefault = (config, path) => {
  const parent = valueAt(config, path.slice(0, -1));
  const key = path[path.length - 1];
  const standard = valueAt(DEFAULT_CONFIG, path);
  if (!isPlainObject(parent)) {
    return;
  }
  if (standard === void 0) {
    delete parent[key];
  } else {
    Object.defineProperty(parent, key, { value: structuredClone(standard), enumerable: true, writable: true, configurable: true });
  }
};
var restoreBadKeys = (config) => {
  const warnings = [];
  for (const [key, rule, valid] of DEFAULTED_KEYS) {
    for (const path of pathsOf(config, key)) {
      if (!valid(valueAt(config, path))) {
        restoreDefault(config, path);
        warnings.push(stripControl(`${path.join(".")} must be ${rule}; the default is used`));
      }
    }
  }
  return warnings;
};
var KEY_IGNORE_CASE_WARNING = "keyIgnoreCase is ignored without keyPattern: the built-in branch key pattern matches upper case only";
var NON_LITERAL_ESCAPES = /* @__PURE__ */ new Set([..."dDwWsSbBnrtvf"]);
var UPPER_CLASS_ESCAPES = /* @__PURE__ */ new Set(["w", "D", "S"]);
var HEX_DIGITS = /* @__PURE__ */ new Map([["x", 2], ["u", 4]]);
var HEX = /^[0-9A-Fa-f]+$/;
var CONTROL_LETTER = /^[A-Za-z]$/;
var LOOKBEHIND_MARKS = /* @__PURE__ */ new Set(["=", "!"]);
var LOWER_A = 97;
var LOWER_Z = 122;
var UPPER_A = 65;
var UPPER_Z = 90;
var atomAt = (pattern, at) => {
  if (pattern.charAt(at) !== "\\") {
    return { end: at + 1, code: pattern.charCodeAt(at) };
  }
  const letter = pattern.charAt(at + 1);
  if (NON_LITERAL_ESCAPES.has(letter)) {
    return { end: at + 2, upper: UPPER_CLASS_ESCAPES.has(letter) };
  }
  if (letter === "c" && CONTROL_LETTER.test(pattern.charAt(at + 2))) {
    return { end: at + 3 };
  }
  const digits = HEX_DIGITS.get(letter);
  const hex = digits === void 0 ? "" : pattern.slice(at + 2, at + 2 + digits);
  if (digits !== void 0 && hex.length === digits && HEX.test(hex)) {
    return { end: at + 2 + digits, code: Number.parseInt(hex, 16) };
  }
  return { end: at + 2, code: pattern.charCodeAt(at + 1) };
};
var noteRange = (scan, low, high) => {
  scan.upper ||= low <= UPPER_Z && high >= UPPER_A;
  if (scan.lower === void 0 && low <= LOWER_Z && high >= LOWER_A) {
    scan.lower = Math.max(low, LOWER_A);
  }
};
var noteAtom = (scan, atom) => {
  if (atom.code === void 0) {
    scan.upper ||= atom.upper === true;
  } else {
    noteRange(scan, atom.code, atom.code);
  }
};
var classLetter = (pattern, at) => {
  const negated = pattern.charAt(at + 1) === "^";
  const scan = { upper: false };
  let index = negated ? at + 2 : at + 1;
  while (index < pattern.length && pattern.charAt(index) !== "]") {
    const first = atomAt(pattern, index);
    const ranged = pattern.charAt(first.end) === "-" && first.end + 1 < pattern.length && pattern.charAt(first.end + 1) !== "]";
    const last = ranged ? atomAt(pattern, first.end + 1) : void 0;
    if (last?.code !== void 0 && first.code !== void 0) {
      noteRange(scan, first.code, last.code);
    } else {
      noteAtom(scan, first);
      if (last) {
        noteAtom(scan, last);
      }
    }
    index = last ? last.end : first.end;
  }
  const letter = negated || scan.upper || scan.lower === void 0 ? void 0 : String.fromCharCode(scan.lower);
  return { end: index + 1, letter };
};
var lowerCaseLetter = (pattern) => {
  let at = 0;
  while (at < pattern.length) {
    const named = pattern.startsWith("(?<", at) && !LOOKBEHIND_MARKS.has(pattern.charAt(at + 3));
    let letter;
    if (named) {
      const close = pattern.indexOf(">", at + 3);
      at = close < 0 ? pattern.length : close + 1;
    } else if (pattern.charAt(at) === "[") {
      const scanned = classLetter(pattern, at);
      letter = scanned.letter;
      at = scanned.end;
    } else {
      const { code, end } = atomAt(pattern, at);
      letter = code !== void 0 && code >= LOWER_A && code <= LOWER_Z ? String.fromCharCode(code) : void 0;
      at = end;
    }
    if (letter !== void 0) {
      return letter;
    }
  }
  return void 0;
};
var keyCaseWarnings = (config) => {
  if (config.keyIgnoreCase !== true) {
    return [];
  }
  if (config.keyPattern === "") {
    return [KEY_IGNORE_CASE_WARNING];
  }
  const letter = typeof config.keyPattern === "string" ? lowerCaseLetter(config.keyPattern) : void 0;
  if (letter === void 0) {
    return [];
  }
  return [`keyPattern holds the lower-case letter ${letter}, which matches nothing with keyIgnoreCase (the text is upper-cased first); write the pattern in upper case`];
};
var validateConfig = (config, root, linear = LINEAR_ENGINE) => {
  const problems = hookConfigProblems(config, root);
  if (config.github.repo !== "" && !isGithubRepo(config.github.repo)) {
    problems.push("github.repo must be empty or owner/name");
  }
  const [kindProblems, kinds] = kindPatterns("kinds", config);
  const [failProblems, failPatterns] = kindPatterns("failPatterns", config);
  problems.push(...kindProblems, ...failProblems);
  const patterns = [
    ["keyPattern", config.keyPattern, DEFAULT_CONFIG.keyPattern, keyRegExps],
    ["github.accountPattern", config.github.accountPattern, DEFAULT_CONFIG.github.accountPattern, plain],
    ["join.pattern", config.join.pattern, trunkJoinPattern(config), plain],
    ...kinds,
    ...failPatterns
  ];
  for (const entry of patterns) {
    const problem = patternProblem(entry, linear);
    if (problem) {
      problems.push(problem);
    }
  }
  problems.push(...packagePathProblems(config.packages));
  if (config.server.host !== "127.0.0.1") {
    problems.push("server.host must be 127.0.0.1");
  }
  if (!(config.retention.indexHours > 0)) {
    problems.push("retention.indexHours must be a positive number");
  }
  if (!config.roles["*"]) {
    problems.push("roles must have a '*' fallback");
  }
  if (!config.budgets.contextLimits.default) {
    problems.push("budgets.contextLimits.default is required");
  }
  problems.push(...branchProblems(config.branches));
  for (const target of Array.isArray(config.branches.promote) ? config.branches.promote : []) {
    if (!Object.hasOwn(config.github.promoteTitlePrefix, target) || !config.github.promoteTitlePrefix[target]) {
      problems.push(`github.promoteTitlePrefix has no title for promote target ${target}`);
    }
  }
  return problems.map(stripControl);
};
var mergeOverDefaults = (parsed) => {
  const config = mergeConfig(structuredClone(DEFAULT_CONFIG), parsed);
  const join4 = config.join;
  const configured = isPlainObject(parsed.join) && parsed.join.pattern !== void 0;
  if (isPlainObject(join4) && !configured) {
    join4.pattern = trunkJoinPattern(config);
  }
  return config;
};
var loadConfig = (found, root, warn2 = () => {
}) => {
  if (found === void 0 || !existsSync2(found.path)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const { path } = found;
  const shown = stripControl(path);
  let parsed;
  try {
    parsed = JSON.parse(readSmallFile(path, MAX_CONFIG_BYTES));
  } catch (error) {
    throw new Error(`${shown}: ${stripControl(error.message)}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${shown}: the config must be a JSON object`);
  }
  if (isPlainObject(parsed.server) && "stateFile" in parsed.server) {
    warn2(`${shown}: ${STATE_FILE_WARNING}`);
    delete parsed.server.stateFile;
  }
  if (isPlainObject(parsed.server) && "port" in parsed.server) {
    warn2(`${shown}: ${SERVER_PORT_WARNING}`);
    delete parsed.server.port;
  }
  if (found.kind !== "user") {
    for (const key of dropUserOnlyKeys(parsed)) {
      warn2(`${shown}: ${userOnlyWarning(key)}`);
    }
  }
  readLegacyStageColor(parsed);
  const config = mergeOverDefaults(parsed);
  const warnings = [...restoreBadKeys(config), ...keyCaseWarnings(config)];
  for (const warning of warnings) {
    warn2(`${shown}: ${warning}`);
  }
  const problems = validateConfig(config, root);
  if (problems.length > 0) {
    throw new Error(`${shown}: ${problems.join("; ")}`);
  }
  return config;
};
var uiConfig = (config, root) => {
  const packages = config.packages.map((pkg) => ({ id: pkg.id, label: pkg.label ?? pkg.id, color: pkg.color }));
  const roleShorts = Object.fromEntries(Object.entries(config.roles).flatMap(([type, role]) => role.short ? [[type, role.short]] : []));
  const docs = config.docs.roles.length > 0 || config.docs.tools.length > 0;
  return {
    repo: root ? basename2(root) : "",
    packages,
    stageColors: { ...config.stageColors },
    modelLetters: { ...config.modelLetters },
    roleShorts,
    warnAt: config.budgets.warnAt,
    promote: [...config.branches.promote],
    docs,
    features: { answerFromUi: config.features.answerFromUi },
    keyUrl: config.keyUrl,
    sessionFixtures: false
  };
};

// src/model/counts.ts
var isCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
var isAmount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

// src/model/events.ts
var SPOOL_EVENT_NAMES = [
  "session.start",
  "session.end",
  "prompt",
  "turn.stop",
  "turn.failure",
  "tool.pre",
  "tool.post",
  "tool.fail",
  "permission",
  "agent.start",
  "agent.stop",
  "task.created",
  "task.completed",
  "compact.pre",
  "compact.post",
  "notification",
  "cwd",
  "model.switch",
  "elicitation",
  "plan",
  "gate",
  "question",
  "git.fact",
  "gh.fact",
  "usage.fact",
  "tick"
];
var isReservedKey = (key) => key === "prototype" || key in Object.prototype;
var isString = (value) => typeof value === "string";
var isFields = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isTime = (value) => isString(value) && Number.isFinite(Date.parse(value));
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
var isBoolean2 = (value) => typeof value === "boolean";
var isStringList2 = (value) => Array.isArray(value) && value.every(isString);
var isOptional = (value, test) => value === void 0 || test(value);
var stringFields = (data, required, optional = [], prefix = "data") => {
  const missing = required.find((key) => !isString(data[key]));
  if (missing) {
    return `${prefix}.${missing} must be a string`;
  }
  const wrong = optional.find((key) => !isOptional(data[key], isString));
  return wrong ? `${prefix}.${wrong} must be a string` : void 0;
};
var INPUT_STRINGS = ["command", "description", "filePath", "pattern", "path", "glob", "subagentType", "model", "prompt", "message", "name", "pageId", "issueIdOrKey"];
var isQuestionList = (value) => Array.isArray(value) && value.every((item) => isFields(item) && isString(item.question) && isOptional(item.options, isStringList2));
var toolInputProblem = (input) => {
  if (!isFields(input)) {
    return "data.input must be an object";
  }
  const problem = stringFields(input, [], INPUT_STRINGS, "data.input");
  if (problem) {
    return problem;
  }
  if (!isOptional(input.paths, isStringList2)) {
    return "data.input.paths must be a list of strings";
  }
  return isOptional(input.questions, isQuestionList) ? void 0 : "data.input.questions must be a list of { question, options }";
};
var promptProblem = (data) => {
  if (data.kind === "user") {
    return stringFields(data, ["text"]) ?? (isStringList2(data.keys) ? void 0 : "data.keys must be a list of strings");
  }
  if (data.kind === "task-notification") {
    return stringFields(data, ["taskId", "status"], ["toolUseId", "result"]);
  }
  if (data.kind === "handback") {
    return stringFields(data, [], ["from"]);
  }
  return `unknown prompt kind ${String(data.kind)}`;
};
var GIT_FIELDS = {
  worktree: ["worktree", "branch"],
  fork: ["branch", "base", "sha"],
  subject: ["branch", "subject"],
  "worktree-removed": ["worktree", "branch"]
};
var gitProblem = (data) => {
  const kind = String(data.kind);
  const fields = Object.hasOwn(GIT_FIELDS, kind) ? GIT_FIELDS[kind] : void 0;
  return fields ? stringFields(data, fields) : `unknown git fact kind ${kind}`;
};
var isRepoMismatch = (value) => isFields(value) && isString(value.repo) && isStringList2(value.remotes);
var ghProblem = (data) => {
  if (data.kind === "status") {
    const flags = typeof data.polling === "boolean" && typeof data.accountOk === "boolean";
    if (!flags) {
      return "data.polling and data.accountOk must be booleans";
    }
    return isOptional(data.repoMismatch, isRepoMismatch) ? stringFields(data, [], ["activeAccount", "error"]) : "data.repoMismatch must be { repo, remotes }";
  }
  if (data.kind !== "pr") {
    return `unknown gh fact kind ${String(data.kind)}`;
  }
  if (!isFields(data.pr) || !isNumber(data.pr.number)) {
    return "data.pr must be a pull request with a number";
  }
  const pr = data.pr;
  const problem = stringFields(pr, ["title", "url", "state", "headRefName", "baseRefName", "createdAt"], ["body"], "data.pr");
  if (problem) {
    return problem;
  }
  const timeProblem = ["mergedAt", "closedAt"].find((field) => pr[field] !== null && !isOptional(pr[field], isTime));
  return timeProblem ? `data.pr.${timeProblem} must be an ISO time` : void 0;
};
var USAGE_NUMBERS = ["input", "cacheWrite", "cacheWrite1h", "cacheRead", "output", "usd"];
var usageProblem = (data) => {
  const problem = stringFields(data, ["requestId", "model"]);
  if (problem) {
    return problem;
  }
  if (!isTime(data.at)) {
    return "data.at must be an ISO time";
  }
  const wrong = USAGE_NUMBERS.find((key) => !isNumber(data[key]));
  return wrong ? `data.${wrong} must be a number` : void 0;
};
var planStreamProblem = (stream, index) => {
  const prefix = `data.streams[${index}]`;
  if (!isFields(stream)) {
    return `${prefix} must be an object`;
  }
  const problem = stringFields(stream, ["id"], ["package", "model"], prefix);
  return problem ?? (isOptional(stream.after, isStringList2) ? void 0 : `${prefix}.after must be a list of strings`);
};
var planProblem = (data) => {
  const problem = stringFields(data, [], ["run", "note"]);
  if (problem) {
    return problem;
  }
  if (!Array.isArray(data.streams)) {
    return "data.streams must be a list";
  }
  return data.streams.map(planStreamProblem).find((streamProblem) => streamProblem !== void 0);
};
var questionProblem = (data) => {
  const problem = stringFields(data, [], ["run", "answers", "id", "text", "node", "context", "relays"]);
  return problem ?? (isOptional(data.options, isStringList2) ? void 0 : "data.options must be a list of strings");
};
var RESUME_NUMBERS = ["contextTokens", "estimatedCacheWriteUsd", "secondsSinceLastResponse"];
var resumeProblem = (data) => {
  const wrong = RESUME_NUMBERS.find((key) => !isOptional(data[key], isAmount));
  if (wrong) {
    return `data.${wrong} must be a number >= 0`;
  }
  return isOptional(data.promptCacheLikelyExpired, isBoolean2) ? void 0 : "data.promptCacheLikelyExpired must be a boolean";
};
var DATA_CHECKS = {
  "session.start": (data) => stringFields(data, [], ["source", "transcriptPath", "model"]) ?? resumeProblem(data),
  prompt: promptProblem,
  "tool.pre": (data) => stringFields(data, ["toolUseId", "tool"]) ?? toolInputProblem(data.input),
  "tool.post": (data) => stringFields(data, ["toolUseId", "tool"], ["stdoutTail", "agentId", "resolvedModel"]),
  "tool.fail": (data) => stringFields(data, ["toolUseId", "tool"], ["error"]),
  permission: (data) => stringFields(data, ["tool"]) ?? toolInputProblem(data.input),
  "agent.stop": (data) => stringFields(data, ["lastMessage"], ["transcriptPath"]),
  "turn.stop": (data) => stringFields(data, ["lastMessage"]) ?? (isOptional(data.lastMessageTruncated, isBoolean2) ? void 0 : "data.lastMessageTruncated must be a boolean"),
  cwd: (data) => stringFields(data, ["to"]),
  "model.switch": (data) => stringFields(data, [], ["model"]),
  plan: planProblem,
  gate: (data) => stringFields(data, ["gate", "state"], ["run", "note"]),
  question: questionProblem,
  "git.fact": gitProblem,
  "gh.fact": ghProblem,
  "usage.fact": usageProblem,
  tick: (data) => isTime(data.now) ? void 0 : "data.now must be an ISO time"
};
var DATA_IDS = {
  prompt: ["taskId", "toolUseId", "from"],
  "tool.pre": ["toolUseId"],
  "tool.post": ["toolUseId", "agentId"],
  "tool.fail": ["toolUseId"],
  "usage.fact": ["requestId"]
};
var isReservedId = (value) => isString(value) && isReservedKey(value);
var reservedIdProblem = (record, data) => {
  const envelope = ["sessionId", "agentId"].find((key) => isReservedId(record[key]));
  if (envelope) {
    return `${envelope} is a reserved key: ${String(record[envelope])}`;
  }
  const field = DATA_IDS[record.event]?.find((key) => isReservedId(data[key]));
  return field ? `${String(record.event)}: data.${field} is a reserved key: ${String(data[field])}` : void 0;
};
var checkEvent = (record) => {
  if (record.v !== 1) {
    return `unknown version ${String(record.v)}`;
  }
  if (typeof record.id !== "string" || typeof record.at !== "string" || typeof record.sessionId !== "string") {
    return "missing id, at or sessionId";
  }
  if (!isTime(record.at)) {
    return `at is not an ISO time: ${record.at.slice(0, 40)}`;
  }
  if (!isString(record.cwd)) {
    return "cwd must be a string";
  }
  if (!isOptional(record.agentId, isString) || !isOptional(record.agentType, isString)) {
    return "agentId and agentType must be strings";
  }
  if (!SPOOL_EVENT_NAMES.includes(record.event)) {
    return `unknown event ${String(record.event)}`;
  }
  if (!isFields(record.data)) {
    return "missing data";
  }
  const problem = DATA_CHECKS[record.event]?.(record.data);
  return problem ? `${String(record.event)}: ${problem}` : reservedIdProblem(record, record.data);
};
var parseSpoolLine = (line) => {
  let value;
  try {
    value = JSON.parse(line);
  } catch (error) {
    return { error: `not JSON: ${error.message}` };
  }
  if (!isFields(value)) {
    return { error: "not an object" };
  }
  const problem = checkEvent(value);
  return problem ? { error: problem } : value;
};

// hooks/marker-input.mjs
var STREAM_ID = /^[A-Za-z0-9][\w.-]*$/;
var GATES = ["plan", "merge", "promote", "docs"];
var GATE_ALIASES = { brief: "plan" };
var GATE_STATES = ["waiting", "done", "skipped"];
var QUESTION_REF = /^q-[\w.-]+$/;
var MAX_QUESTION_REF = 128;
var FIELD_NAMES = {
  run: "run",
  streams: "streams",
  stream: "stream",
  after: "after",
  gate: "gate",
  state: "state",
  text: "text",
  answer: "answer",
  note: "note",
  context: "context",
  options: "options",
  node: "node",
  relays: "relays"
};
var TEXT_CAPS = { note: 280, text: 500, context: 1e3, answer: 500, run: 120, node: 120 };
var STREAM_CAPS = { id: 64, package: 120, model: 120 };
var MAX_STREAMS = 20;
var MAX_OPTIONS = 10;
var OPTION_CHARS = 120;
var FIELDS = {
  plan: ["run", "streams", "note"],
  gate: ["run", "gate", "state", "note"],
  question: ["run", "text", "blocking", "options", "context", "node", "answer", "relays"]
};
var STRINGS = ["run", "note", "gate", "state", "text", "context", "node", "answer", "relays"];
var STREAM_FIELDS = ["id", "package", "after", "model"];
var isObject2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isSet = (value) => value !== void 0 && value !== null;
var isStringList3 = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
var defined = (fields) => Object.fromEntries(Object.entries(fields).filter(([, value]) => isSet(value)));
var fieldProblem = (input, known, strings, prefix = "") => {
  const unknown = Object.keys(input).find((key) => !known.includes(key));
  if (unknown !== void 0) {
    return `unknown field ${prefix}${unknown}`;
  }
  const wrong = known.find((key) => strings.includes(key) && isSet(input[key]) && typeof input[key] !== "string");
  return wrong === void 0 ? void 0 : `${prefix}${wrong} must be a string`;
};
var lengthProblem = (input, caps, nameOf) => {
  const long = Object.keys(caps).find((key) => typeof input[key] === "string" && input[key].length > caps[key]);
  return long === void 0 ? void 0 : `${nameOf(long)} is longer than ${caps[long]} characters`;
};
var streamInput = (item, index, caps) => {
  const prefix = `streams[${index}]`;
  if (!isObject2(item)) {
    return `${prefix} must be an object`;
  }
  const problem = fieldProblem(item, STREAM_FIELDS, ["id", "package", "model"], `${prefix}.`);
  const long = caps ? lengthProblem(item, STREAM_CAPS, (key) => `${prefix}.${key}`) : void 0;
  if (problem || long) {
    return problem ?? long;
  }
  if (!STREAM_ID.test(item.id ?? "")) {
    return `${prefix}.id must be an id such as api or web`;
  }
  if (isSet(item.after) && !isStringList3(item.after)) {
    return `${prefix}.after must be a list of stream ids`;
  }
  const after = item.after ?? [];
  if (caps && after.length > MAX_STREAMS - 1) {
    return `${prefix}.after has more than ${MAX_STREAMS - 1} items`;
  }
  if (caps && new Set(after).size !== after.length) {
    return `${prefix}.after names the same stream twice`;
  }
  return defined({ id: item.id, package: item.package || item.id, after: [...item.after ?? []], model: item.model || void 0 });
};
var planInput = (input, names, run, caps) => {
  if (isSet(input.streams) && !Array.isArray(input.streams)) {
    return { error: "streams must be a list" };
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
    if (typeof stream === "string") {
      return { error: stream };
    }
    streams.push(stream);
  }
  const ids = new Set(streams.map((stream) => stream.id));
  if (ids.size !== streams.length) {
    return { error: "plan has the same stream twice" };
  }
  const unknown = streams.flatMap((stream) => stream.after.filter((after) => !ids.has(after) || after === stream.id));
  if (unknown.length > 0) {
    return { error: `${names.after} names no other stream of the plan: ${unknown.join(", ")}` };
  }
  return { event: "plan", data: defined({ run, streams, note: input.note }) };
};
var gateInput = (input, names, run) => {
  const gate = Object.hasOwn(GATE_ALIASES, input.gate) ? GATE_ALIASES[input.gate] : input.gate;
  if (!GATES.includes(gate)) {
    return { error: `${names.gate} must be one of ${GATES.join(", ")}` };
  }
  if (!GATE_STATES.includes(input.state)) {
    return { error: `${names.state} must be one of ${GATE_STATES.join(", ")}` };
  }
  return { event: "gate", data: defined({ run, gate, state: input.state, note: input.note }) };
};
var questionInput = (input, names, run, caps) => {
  if (input.answer) {
    return { event: "question", data: defined({ run, answers: input.answer, via: "terminal" }) };
  }
  if (!input.text) {
    return { error: `question needs ${names.text}, or ${names.answer} <question id>` };
  }
  if (isSet(input.blocking) && typeof input.blocking !== "boolean") {
    return { error: "blocking must be true or false" };
  }
  if (isSet(input.options) && !isStringList3(input.options)) {
    return { error: "options must be a list of strings" };
  }
  if (caps && isSet(input.options) && input.options.length > MAX_OPTIONS) {
    return { error: `${names.options} has more than ${MAX_OPTIONS} items` };
  }
  const longOption = caps ? (input.options ?? []).findIndex((option) => option.length > OPTION_CHARS) : -1;
  if (longOption >= 0) {
    return { error: `${names.options} item ${longOption + 1} is longer than ${OPTION_CHARS} characters` };
  }
  const relays = input.relays || void 0;
  if (relays !== void 0 && (!QUESTION_REF.test(relays) || relays.length > MAX_QUESTION_REF)) {
    return { error: `${names.relays} must be a question id such as q-a1b2c3-1, at most ${MAX_QUESTION_REF} characters` };
  }
  const data = { run, text: input.text, blocking: input.blocking === true, options: input.options, context: input.context, node: input.node, relays };
  return { event: "question", data: defined(data) };
};
var CHECKS = { plan: planInput, gate: gateInput, question: questionInput };
var validateMarkerInput = (kind, input, names = FIELD_NAMES, { caps = true } = {}) => {
  const check = Object.hasOwn(CHECKS, kind) ? CHECKS[kind] : void 0;
  if (!check) {
    return { error: "a marker is plan, gate or question" };
  }
  if (!isObject2(input)) {
    return { error: `${kind} needs an object with its fields` };
  }
  const long = caps ? lengthProblem(input, TEXT_CAPS, (key) => names[key]) : void 0;
  const problem = fieldProblem(input, FIELDS[kind], STRINGS) ?? long;
  return problem ? { error: problem } : check(input, names, input.run || void 0, caps);
};

// src/model/hook-payload.ts
var str = (value) => typeof value === "string" ? value : void 0;
var num = (value) => typeof value === "number" ? value : void 0;
var amount = (value) => isAmount(value) ? value : void 0;
var bool = (value) => typeof value === "boolean" ? value : void 0;
var cap = (value, max) => (str(value) ?? "").slice(0, max);
var isObject3 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var objects = (value) => Array.isArray(value) ? value.filter(isObject3) : [];
var STOP_MESSAGE_CAP = 8e3;
var REPORT_HEAD = 4e3;
var CUT = "\n[...]\n";
var capReport = (value, max) => {
  const text = str(value) ?? "";
  if (text.length <= max) {
    return text;
  }
  const blockAt = text.lastIndexOf("```nurselog");
  const block = blockAt >= 0 ? text.length - blockAt : 0;
  const tail = block > 0 && block <= max - CUT.length ? block : max - REPORT_HEAD - CUT.length;
  return `${text.slice(0, max - CUT.length - tail)}${CUT}${text.slice(-tail)}`;
};
var agentPrompt = (prompt) => {
  const tags = prompt.slice(600).match(/\bStream:\s*[\w.-]+/gi) ?? [];
  return [prompt.slice(0, 600), ...tags].join("\n");
};
var ABSOLUTE_PATH = /(?<![\w.~/-])(?:~\/|\/)(?:[\w.@-]+\/)+[\w.@-]*/g;
var findAbsolutePaths = (text) => [...new Set(text.match(ABSOLUTE_PATH) ?? [])];
var summarizeToolInput = (tool, input) => {
  if (tool === "Bash") {
    return { command: cap(input.command, 2e3), description: str(input.description), runInBackground: input.run_in_background === true || void 0 };
  }
  if (tool === "Read" || tool === "Write" || tool === "Edit" || tool === "NotebookEdit") {
    const filePath = str(input.file_path) ?? str(input.notebook_path);
    return tool === "Read" ? { filePath, offset: num(input.offset), limit: num(input.limit) } : { filePath };
  }
  if (tool === "Grep" || tool === "Glob") {
    return { pattern: str(input.pattern), path: str(input.path), glob: str(input.glob) };
  }
  if (tool === "Agent" || tool === "Task") {
    const prompt = str(input.prompt) ?? "";
    return {
      subagentType: str(input.subagent_type),
      description: str(input.description),
      model: str(input.model),
      runInBackground: typeof input.run_in_background === "boolean" ? input.run_in_background : void 0,
      prompt: agentPrompt(prompt),
      promptLength: prompt.length,
      paths: findAbsolutePaths(prompt)
    };
  }
  if (tool === "SubagentHandback") {
    return { message: capReport(input.message, 16e3) };
  }
  if (tool === "AskUserQuestion") {
    const questions = objects(input.questions);
    return {
      questions: questions.map((question) => {
        const options = Array.isArray(question.options) ? question.options : [];
        return { question: cap(question.question, 500), options: options.map((option) => str(option) ?? str(option?.label) ?? "") };
      })
    };
  }
  if (tool === "Skill" || tool === "SlashCommand") {
    return { name: str(input.skill) ?? str(input.command) ?? str(input.name) };
  }
  if (tool.startsWith("mcp__")) {
    return { pageId: str(input.pageId), issueIdOrKey: str(input.issueIdOrKey) };
  }
  return { keys: Object.keys(input) };
};
var tag = (text, name) => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return match ? match[1].trim() : void 0;
};
var tagNumber = (text, name) => {
  const value = tag(text, name);
  return value === void 0 ? void 0 : Number(value);
};
var promptData = (prompt, keyConfig) => {
  const handback = /^<agent-message\b(?:[^>]*?\bfrom="([^"]*)")?/.exec(prompt.trimStart());
  if (handback) {
    return handback[1] ? { kind: "handback", from: handback[1], length: prompt.length } : { kind: "handback", length: prompt.length };
  }
  if (prompt.trimStart().startsWith("<task-notification>")) {
    return {
      kind: "task-notification",
      taskId: tag(prompt, "task-id") ?? "",
      toolUseId: tag(prompt, "tool-use-id"),
      status: tag(prompt, "status") ?? "unknown",
      subagentTokens: tagNumber(prompt, "subagent_tokens"),
      toolUses: tagNumber(prompt, "tool_uses"),
      durationMs: tagNumber(prompt, "duration_ms"),
      result: capReport(tag(prompt, "result"), 16e3) || void 0
    };
  }
  return { kind: "user", text: prompt.slice(0, 300), keys: promptKeys(prompt, keyConfig), length: prompt.length };
};
var backgroundTasks = (value) => {
  const tasks = objects(value);
  return tasks.map((task) => ({ id: str(task.id) ?? "", type: str(task.type) ?? "", status: str(task.status) ?? "", agent_type: str(task.agent_type) }));
};
var isScalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value);
var scalars = (payload, skip) => {
  const kept = Object.entries(payload).filter((entry) => !skip.includes(entry[0]) && isScalar(entry[1]));
  return Object.fromEntries(kept.map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 500) : value]));
};
var COMMON = ["session_id", "transcript_path", "cwd", "hook_event_name", "prompt_id", "permission_mode", "effort", "agent_id", "agent_type"];
var envelopeOf = (payload, options) => {
  const envelope = { v: 1, id: options.id, at: options.at, src: "hook", sessionId: str(payload.session_id) ?? "", cwd: str(payload.cwd) ?? "" };
  if (str(payload.agent_id)) {
    envelope.agentId = str(payload.agent_id);
    envelope.agentType = str(payload.agent_type);
  }
  return envelope;
};
var isInternalHelper = (payload) => Boolean(str(payload.agent_id)) && !str(payload.agent_type);
var hookPayloadToEvent = (payload, options) => {
  if (isInternalHelper(payload)) {
    return void 0;
  }
  const envelope = envelopeOf(payload, options);
  const base = { promptId: str(payload.prompt_id), permissionMode: str(payload.permission_mode) };
  const tool = str(payload.tool_name) ?? "";
  const input = payload.tool_input ?? {};
  const response = payload.tool_response;
  switch (payload.hook_event_name) {
    case "SessionStart": {
      const data = {
        source: str(payload.source) ?? "startup",
        transcriptPath: str(payload.transcript_path),
        model: str(payload.model),
        // A resume or a fork (design section 1.6); a field of another type is dropped, so the line passes `checkEvent`.
        contextTokens: amount(payload.context_tokens),
        promptCacheLikelyExpired: bool(payload.prompt_cache_likely_expired),
        estimatedCacheWriteUsd: amount(payload.estimated_cache_write_usd),
        secondsSinceLastResponse: amount(payload.seconds_since_last_response),
        injectedChars: options.injectedChars
      };
      return { ...envelope, src: "hook", event: "session.start", data };
    }
    case "SessionEnd":
      return { ...envelope, src: "hook", event: "session.end", data: { ...base, reason: str(payload.reason) ?? "" } };
    case "UserPromptSubmit":
      return { ...envelope, src: "hook", event: "prompt", data: { ...base, ...promptData(str(payload.prompt) ?? "", options) } };
    case "Stop": {
      const tasks = backgroundTasks(payload.background_tasks);
      const cronCount = Array.isArray(payload.session_crons) ? payload.session_crons.length : 0;
      const text = str(payload.last_assistant_message) ?? "";
      const lastMessageTruncated = text.length > STOP_MESSAGE_CAP || options.truncated === true;
      const data = { ...base, lastMessage: text.slice(0, STOP_MESSAGE_CAP), lastMessageTruncated, backgroundTasks: tasks, cronCount };
      return { ...envelope, src: "hook", event: "turn.stop", data };
    }
    case "StopFailure":
      return { ...envelope, src: "hook", event: "turn.failure", data: { ...scalars(payload, COMMON), ...base } };
    case "PreToolUse": {
      const inputChars = tool.startsWith(MARKER_TOOL_PREFIX) ? JSON.stringify(payload.tool_input ?? null).length : void 0;
      const data = { ...base, toolUseId: str(payload.tool_use_id) ?? "", tool, input: summarizeToolInput(tool, input), inputChars };
      return { ...envelope, src: "hook", event: "tool.pre", data };
    }
    case "PostToolUse": {
      const result = typeof response === "object" && response !== null ? response : {};
      const command = str(input.command) ?? "";
      const agentTool = tool === "Agent" || tool === "Task";
      const data = {
        ...base,
        toolUseId: str(payload.tool_use_id) ?? "",
        tool,
        durationMs: num(payload.duration_ms),
        responseChars: num(result.responseChars) ?? JSON.stringify(response ?? null).length,
        exitCode: tool === "Bash" ? num(result.exitCode ?? result.exit_code) : void 0,
        interrupted: tool === "Bash" ? result.interrupted === true : void 0,
        stdoutTail: tool === "Bash" ? keptStdout(command, str(result.stdout) ?? "") : void 0,
        agentId: agentTool ? str(result.agentId) : void 0,
        isAsync: agentTool ? result.isAsync === true : void 0,
        status: agentTool ? str(result.status) : void 0,
        resolvedModel: agentTool ? str(result.resolvedModel) : void 0
      };
      return { ...envelope, src: "hook", event: "tool.post", data };
    }
    case "PostToolUseFailure": {
      const data = { ...base, toolUseId: str(payload.tool_use_id) ?? "", tool, durationMs: num(payload.duration_ms), isInterrupt: payload.is_interrupt === true, error: cap(payload.error, FAILURE_ERROR_CHARS) };
      return { ...envelope, src: "hook", event: "tool.fail", data };
    }
    case "PermissionRequest":
      return { ...envelope, src: "hook", event: "permission", data: { ...base, tool, input: summarizeToolInput(tool, input) } };
    case "SubagentStart":
      return { ...envelope, src: "hook", event: "agent.start", data: { ...base, injectedChars: options.injectedChars } };
    case "SubagentStop": {
      const lastMessage = capReport(payload.last_assistant_message, 16e3);
      const tasks = backgroundTasks(payload.background_tasks);
      const data = { ...base, transcriptPath: str(payload.agent_transcript_path), lastMessage, backgroundTasks: tasks };
      return { ...envelope, src: "hook", event: "agent.stop", data };
    }
    case "TaskCreated":
    case "TaskCompleted": {
      const data = { ...base, taskId: str(payload.task_id) ?? "", subject: str(payload.task_subject) ?? str(payload.subject) };
      return { ...envelope, src: "hook", event: payload.hook_event_name === "TaskCreated" ? "task.created" : "task.completed", data };
    }
    case "PreCompact":
      return { ...envelope, src: "hook", event: "compact.pre", data: { ...base, trigger: str(payload.trigger) } };
    case "PostCompact":
      return { ...envelope, src: "hook", event: "compact.post", data: { ...base, trigger: str(payload.trigger), summaryChars: str(payload.compact_summary)?.length } };
    case "Notification":
      return { ...envelope, src: "hook", event: "notification", data: { ...base, message: cap(payload.message, 300), notificationType: str(payload.notification_type) } };
    case "CwdChanged":
      return { ...envelope, src: "hook", event: "cwd", data: { ...base, from: str(payload.old_cwd) ?? "", to: str(payload.new_cwd) ?? "" } };
    case "PostModelSwitch":
      return { ...envelope, src: "hook", event: "model.switch", data: { ...scalars(payload, COMMON), ...base } };
    case "Elicitation":
      return { ...envelope, src: "hook", event: "elicitation", data: { ...scalars(payload, COMMON), ...base, server: str(payload.mcp_server_name), message: str(payload.message)?.slice(0, 300) } };
    default:
      return void 0;
  }
};
var MARKER_TOOL_PREFIX = "mcp__plugin_nurselog_nurselog__";
var MARKER_TOOL2 = /^mcp__plugin_nurselog_nurselog__(plan|gate|question)$/;
var QUESTION_ID = /\bq-[0-9a-z]{6}\b/;
var hookPayloadToMarker = (payload, options) => {
  const kind = payload.hook_event_name === "PostToolUse" ? MARKER_TOOL2.exec(str(payload.tool_name) ?? "")?.[1] : void 0;
  const response = payload.tool_response;
  const failed = isObject3(response) && (response.isError === true || response.is_error === true);
  if (!kind || failed || isInternalHelper(payload)) {
    return void 0;
  }
  const result = validateMarkerInput(kind, payload.tool_input, FIELD_NAMES, { caps: false });
  if ("error" in result) {
    return void 0;
  }
  const envelope = { ...envelopeOf(payload, options), id: `${options.id}-marker`, src: "hook" };
  if (result.event === "plan") {
    return { ...envelope, event: "plan", data: result.data };
  }
  if (result.event === "gate") {
    return { ...envelope, event: "gate", data: result.data };
  }
  if ("answers" in result.data) {
    return { ...envelope, event: "question", data: result.data };
  }
  const id = QUESTION_ID.exec(JSON.stringify(response ?? null))?.[0];
  return id ? { ...envelope, event: "question", data: { ...result.data, id } } : void 0;
};

// src/model/report-block.ts
var BlockError = class extends Error {
};
var FENCE = /```nurselog[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
var KEY_LINE = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/;
var FOLLOWUP_TYPES = ["issue", "improve", "fix"];
var BLOCK_KEYS = ["decisions", "followups", "questions", "files"];
var findReportBlock = (text) => {
  let last;
  for (const match of text.matchAll(FENCE)) {
    last = match[1];
  }
  return last;
};
var reportText = (text) => text.replace(FENCE, "").trim();
var REPORT_LINE_MAX = 300;
var reportLine = (text) => {
  const first = reportText(text).split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "";
  return first.length > REPORT_LINE_MAX ? `${first.slice(0, REPORT_LINE_MAX - 1).trimEnd()}\u2026` : first;
};
var reportSummary = (text, limit = 120) => {
  const lines = text.replace(FENCE, "").split("\n").map((line) => line.trim().replace(/^[-*+]\s+/, ""));
  const first = lines.find((line) => line !== "" && !line.startsWith("#")) ?? "";
  return first.length > limit ? `${first.slice(0, limit - 1).trimEnd()}\u2026` : first;
};
var splitFlowItems = (inner) => {
  const items = [];
  let current = "";
  let quote;
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (quote) {
      current += char;
      if (char === "\\" && quote === '"') {
        current += inner[i + 1] ?? "";
        i += 1;
      } else if (char === quote) {
        quote = void 0;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (quote) {
    throw new BlockError(`unterminated quote in [${inner}]`);
  }
  if (current.trim() !== "" || items.length > 0) {
    items.push(current);
  }
  return items.map((item) => item.trim());
};
var parseScalar = (raw) => {
  const text = raw.trim();
  if (text.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(text)) {
      throw new BlockError(`broken double-quoted scalar: ${text}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new BlockError(`unsupported escape in: ${text}`);
    }
  }
  if (text.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(text)) {
      throw new BlockError(`broken single-quoted scalar: ${text}`);
    }
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) {
      throw new BlockError(`unterminated flow list: ${text}`);
    }
    return splitFlowItems(text.slice(1, -1)).map((item) => {
      if (item === "") {
        throw new BlockError(`empty item in flow list: ${text}`);
      }
      return parseScalar(item);
    });
  }
  if (text === "true" || text === "false") {
    return text === "true";
  }
  const withoutComment = text.replace(/\s+#.*$/, "");
  if (/^[{&*!|>%@`]/.test(withoutComment)) {
    throw new BlockError(`unsupported YAML in: ${text}`);
  }
  return withoutComment;
};
var takeChildren = (lines, start, parentIndent) => {
  const children = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    const isSiblingItem = line.indent === parentIndent && line.text.startsWith("- ");
    if (line.indent <= parentIndent && !isSiblingItem) {
      break;
    }
    children.push(line);
  }
  return children;
};
var parseMapping = (lines, column) => {
  const mapping = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== column) {
      throw new BlockError(`line ${line.no}: unexpected indentation`);
    }
    const match = KEY_LINE.exec(line.text);
    if (!match) {
      throw new BlockError(`line ${line.no}: expected "key: value"`);
    }
    const [, key, rest] = match;
    if (isReservedKey(key)) {
      throw new BlockError(`line ${line.no}: unknown key ${key}`);
    }
    if (rest !== void 0 && rest.trim() !== "") {
      mapping[key] = parseScalar(rest);
      i += 1;
      continue;
    }
    const children = takeChildren(lines, i + 1, column);
    if (children.length === 0) {
      throw new BlockError(`line ${line.no}: ${key} has no value`);
    }
    mapping[key] = parseBlockList(children);
    i += 1 + children.length;
  }
  return mapping;
};
var parseBlockList = (lines) => {
  const itemIndent = lines[0].indent;
  const items = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== itemIndent || !(line.text.startsWith("- ") || line.text === "-")) {
      throw new BlockError(`line ${line.no}: expected a "- " list item`);
    }
    const content = line.text.slice(2);
    const column = itemIndent + 2 + (content.length - content.trimStart().length);
    const continuation = [];
    for (const child of takeChildren(lines, i + 1, itemIndent)) {
      if (child.indent === itemIndent) {
        break;
      }
      continuation.push(child);
    }
    const trimmed = content.trim();
    if (KEY_LINE.test(trimmed) && !trimmed.startsWith('"') && !trimmed.startsWith("'")) {
      items.push(parseMapping([{ no: line.no, indent: column, text: trimmed }, ...continuation], column));
    } else {
      if (continuation.length > 0) {
        throw new BlockError(`line ${continuation[0].no}: a scalar list item cannot continue on the next line`);
      }
      items.push(parseScalar(trimmed));
    }
    i += 1 + continuation.length;
  }
  return items;
};
var asStringList = (value, key) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new BlockError(`${key} must be a list of strings`);
  }
  return value;
};
var asMappingList = (value, key) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "object" || item === null || Array.isArray(item))) {
    throw new BlockError(`${key} must be a list of mappings`);
  }
  return value;
};
var toBlock = (root) => {
  for (const key of Object.keys(root)) {
    if (!BLOCK_KEYS.includes(key)) {
      throw new BlockError(`unknown key ${key}`);
    }
  }
  const followups = asMappingList(root.followups ?? [], "followups").map((item, index) => {
    const type = item.type;
    if (!FOLLOWUP_TYPES.includes(type)) {
      throw new BlockError(`followups[${index}].type must be issue, improve or fix`);
    }
    if (typeof item.text !== "string" || item.text === "") {
      throw new BlockError(`followups[${index}].text is required`);
    }
    if (item.file !== void 0 && typeof item.file !== "string") {
      throw new BlockError(`followups[${index}].file must be a string`);
    }
    return item.file === void 0 ? { type, text: item.text } : { type, text: item.text, file: item.file };
  });
  const questions = asMappingList(root.questions ?? [], "questions").map((item, index) => {
    if (typeof item.text !== "string" || item.text === "") {
      throw new BlockError(`questions[${index}].text is required`);
    }
    if (item.blocking !== void 0 && typeof item.blocking !== "boolean") {
      throw new BlockError(`questions[${index}].blocking must be true or false`);
    }
    const blocking = item.blocking === true;
    if (item.options === void 0) {
      return { text: item.text, blocking };
    }
    return { text: item.text, blocking, options: asStringList(item.options, `questions[${index}].options`) };
  });
  return {
    decisions: asStringList(root.decisions ?? [], "decisions"),
    followups,
    questions,
    files: asStringList(root.files ?? [], "files")
  };
};
var parseBlockBody = (body) => {
  const lines = [];
  body.split(/\r?\n/).forEach((raw, index) => {
    if (raw.includes("	")) {
      throw new BlockError(`line ${index + 1}: tabs are not allowed`);
    }
    const text = raw.trimEnd();
    if (text.trim() === "" || text.trimStart().startsWith("#")) {
      return;
    }
    lines.push({ no: index + 1, indent: text.length - text.trimStart().length, text: text.trimStart() });
  });
  const root = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.indent === 0 ? KEY_LINE.exec(line.text) : null;
    if (!match) {
      throw new BlockError(`line ${line.no}: expected a top-level "key:"`);
    }
    const [, key, rest] = match;
    if (isReservedKey(key)) {
      throw new BlockError(`line ${line.no}: unknown key ${key}`);
    }
    const children = takeChildren(lines, i + 1, 0);
    if (rest !== void 0 && rest.trim() !== "") {
      if (children.length > 0) {
        throw new BlockError(`line ${children[0].no}: ${key} already has an inline value`);
      }
      root[key] = parseScalar(rest);
    } else {
      root[key] = children.length > 0 ? parseBlockList(children) : [];
    }
    i += 1 + children.length;
  }
  return toBlock(root);
};
var parseReportBlock = (report) => {
  const raw = findReportBlock(report);
  if (raw === void 0) {
    return void 0;
  }
  try {
    return parseBlockBody(raw);
  } catch (error) {
    if (error instanceof BlockError) {
      return { raw, blockError: error.message };
    }
    throw error;
  }
};
var isBlockError = (result) => "blockError" in result;

// src/model/paths.ts
var time = (at) => Date.parse(at);
var compareText = (a, b) => Number(a > b) - Number(a < b);
var shortBranch = (branch) => branch.replace(/^(feat|fix|chore|docs|refactor|test|perf|build|ci)\//, "");
var normalizePath = (path) => {
  const prefix = path.startsWith("~/") || path === "~" ? "~" : "";
  const parts = [];
  for (const part of path.slice(prefix.length).split("/")) {
    if (part === "..") {
      parts.pop();
    } else if (part !== "" && part !== ".") {
      parts.push(part);
    }
  }
  return `${prefix}/${parts.join("/")}`;
};
var isAbsolute2 = (path) => path.startsWith("/") || path.startsWith("~/");
var resolvePath = (base, path) => normalizePath(isAbsolute2(path) ? path : `${base}/${path}`);
var isInside2 = (path, root) => path === root || path.startsWith(`${root}/`);
var baseName = (path) => path.split("/").filter(Boolean).pop() ?? path;
var escapeRegExp2 = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var relativePath = (run, path) => {
  const normalized = isAbsolute2(path) ? normalizePath(path) : path;
  return isInside2(normalized, run.worktree) ? normalized.slice(run.worktree.length + 1) : normalized;
};
var packageOf = (relative, config) => config.packages.find((pkg) => pkg.paths.some((path) => relative === path || relative.startsWith(`${path}/`)))?.id;
var SHELL_EXPANSION = /[$`*?[{\\'"]|.~|^~[^/]/;
var literalWord = (word) => {
  if (word === void 0) {
    return void 0;
  }
  const single = /^'([^']*)'$/.exec(word);
  if (single) {
    return single[1];
  }
  const unquoted = word.replace(/^"([^"]*)"$/, "$1");
  return SHELL_EXPANSION.test(unquoted) ? void 0 : unquoted;
};
var cdTarget = (word) => word === "-" ? void 0 : literalWord(word);
var HEREDOC = /^<<(-?)[ \t]*(?:\\|(['"]?))([A-Za-z_][\w-]*)\2/;
var QUOTE_FILL = "_";
var quoteEnd = (command, start, escapes) => {
  const quote = command[start];
  for (let index = start + 1; index < command.length; index += 1) {
    if (escapes && command[index] === "\\") {
      index += 1;
    } else if (command[index] === quote) {
      return index + 1;
    }
  }
  return command.length;
};
var skipHeredocs = (command, start, pending, out) => {
  let index = start;
  for (const heredoc of pending) {
    while (index < command.length) {
      const newline = command.indexOf("\n", index);
      const end = newline === -1 ? command.length : newline;
      const line = command.slice(index, end);
      out.push(" ".repeat(line.length), newline === -1 ? "" : "\n");
      index = end + 1;
      if ((heredoc.tabs ? line.replace(/^\t+/, "") : line) === heredoc.word) {
        break;
      }
    }
  }
  pending.length = 0;
  return index;
};
var shellCode = (command) => {
  const out = [];
  const pending = [];
  let arithmetic = 0;
  let index = 0;
  while (index < command.length) {
    const char = command[index];
    const wordStart = index === 0 || /[\s;&|()]/.test(command[index - 1]);
    const ansi = char === "$" && command[index + 1] === "'";
    const heredoc = char === "<" && arithmetic === 0 ? HEREDOC.exec(command.slice(index)) : null;
    if (char === "'" || char === '"' || ansi) {
      const start = ansi ? index + 1 : index;
      const quote = command[start];
      const end = quoteEnd(command, start, quote === '"' || ansi);
      const closed = command[end - 1] === quote && end - start > 1;
      const inner = end - start - (closed ? 2 : 1);
      out.push(ansi ? "$" : "", quote, QUOTE_FILL.repeat(inner), closed ? quote : "");
      index = end;
    } else if (char === "\\") {
      out.push(command.slice(index, index + 2));
      index += 2;
    } else if (char === "#" && wordStart) {
      const newline = command.indexOf("\n", index);
      const end = newline === -1 ? command.length : newline;
      out.push(" ".repeat(end - index));
      index = end;
    } else if (command.startsWith("<<<", index)) {
      out.push("<<<");
      index += 3;
    } else if (command.startsWith("$((", index)) {
      out.push("$((");
      arithmetic += 2;
      index += 3;
    } else if (heredoc) {
      pending.push({ word: heredoc[3], tabs: heredoc[1] === "-" });
      out.push(heredoc[0]);
      index += heredoc[0].length;
    } else if (char === "\n" && pending.length > 0) {
      out.push("\n");
      index = skipHeredocs(command, index + 1, pending, out);
    } else {
      if (arithmetic > 0 && (char === "(" || char === ")")) {
        arithmetic += char === "(" ? 1 : -1;
      }
      out.push(char);
      index += 1;
    }
  }
  return out.join("");
};
var SEGMENT_BREAK = /&&|\|\||;|\||\n|(?<!\\)\$?\(|(?<!\\)\)/g;
var lastSplit;
var shellSegments = (command) => {
  if (lastSplit === void 0 || lastSplit.command !== command) {
    const segments = splitSegments(command).map((segment) => Object.freeze(segment));
    lastSplit = { command, segments: Object.freeze(segments) };
  }
  return lastSplit.segments;
};
var splitSegments = (command) => {
  const code = shellCode(command);
  const segments = [];
  let start = 0;
  let depth = 0;
  for (const match of code.matchAll(SEGMENT_BREAK)) {
    segments.push({ text: command.slice(start, match.index), code: code.slice(start, match.index), depth });
    start = match.index + match[0].length;
    if (match[0] === ")") {
      depth = Math.max(0, depth - 1);
    } else if (match[0].endsWith("(")) {
      depth += 1;
    }
  }
  segments.push({ text: command.slice(start), code: code.slice(start), depth });
  return segments;
};
var shellWords = (segment) => {
  const words = [...segment.code.matchAll(/\S+/g)];
  return words.map((match) => segment.text.slice(match.index, match.index + match[0].length));
};

// src/model/config-cache.ts
var compiledConfigs = /* @__PURE__ */ new WeakMap();
var packagePath = (path) => linearRegExp(`(?:^|[\\s"'\`(/])${escapeRegExp2(path)}(?:$|[\\s/"'\`).,:])`);
var kindRegExps = (patterns) => {
  const entries = Object.entries(patterns);
  return entries.map(([kind, pattern]) => [kind, linearRegExp(pattern)]);
};
var compile = (config) => {
  let compiled = compiledConfigs.get(config);
  if (!compiled) {
    const kinds = kindRegExps(config.verification.kinds);
    const failEntries = kindRegExps(config.verification.failPatterns);
    const packagePaths = config.packages.flatMap((pkg) => pkg.paths.map((path) => [pkg.id, packagePath(path)]));
    const promptKey = config.keyPattern === "" ? void 0 : keyRegExp(config.keyPattern);
    const branchKey2 = branchKeyRegExp(config.keyPattern || BRANCH_KEY_PATTERN);
    const keyIgnoreCase = config.keyIgnoreCase === true && promptKey !== void 0;
    const join4 = linearRegExp(config.join.pattern);
    compiled = { branchKey: branchKey2, promptKey, keyIgnoreCase, join: join4, kinds, failPatterns: new Map(failEntries), packagePaths, runners: new Set(config.verification.runners) };
    compiledConfigs.set(config, compiled);
  }
  return compiled;
};
var longestPrefix = (map, model) => {
  let best;
  for (const prefix of Object.keys(map)) {
    if (prefix !== "default" && model?.startsWith(prefix) && (!best || prefix.length > best.length)) {
      best = prefix;
    }
  }
  return best === void 0 ? void 0 : map[best];
};
var contextLimit = (model, config) => longestPrefix(config.budgets.contextLimits, model) ?? config.budgets.contextLimits.default;
var roleConfig = (role, config) => {
  const own = Object.hasOwn(config.roles, role) ? config.roles[role] : void 0;
  const fallback = Object.hasOwn(config.roles, "*") ? config.roles["*"] : void 0;
  return own ?? fallback ?? { stage: "other" };
};
var isModelAlias = (model) => !model.includes("-");

// src/model/factories.ts
var STAGE_ORDER = ["plan", "build", "join", "review", "fix", "pr", "merge", "promote", "docs"];
var GATE_IDS = ["plan", "merge", "promote", "docs"];
var LOG_CAP = 200;
var JOINS_CAP = 20;
var REBASES_CAP = JOINS_CAP;
var MESSAGE_CAP = 50;
var MESSAGE_TEXT_BUDGET = 64e3;
var RECENT_CAP = 20;
var WARNING_CAP = 50;
var factStamp = (at) => ({ at, sessionId: "" });
var ownValue = (map, key) => Object.hasOwn(map, key) ? map[key] : void 0;
var ownEntry = (map, key, create) => {
  if (Object.hasOwn(map, key)) {
    return map[key];
  }
  const entry = create();
  if (key !== "__proto__") {
    map[key] = entry;
  }
  return entry;
};
var emptyCounts = () => ({ requests: 0, input: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, usd: 0 });
var newMeter = (limit) => ({ used: 0, limit: limit ?? 0, level: "ok" });
var newBudget = (role, config) => {
  const limits = ownValue(config.budgets.roles, role) ?? {};
  const toolCalls = limits.toolCalls === void 0 ? config.budgets.default.toolCalls : limits.toolCalls;
  const verifyRounds = limits.verifyRounds === void 0 ? config.budgets.default.verifyRounds : limits.verifyRounds;
  const tokens = { requests: 0, input: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
  const verifyMeter = { ...newMeter(verifyRounds), commands: { typecheck: 0, lint: 0, test: 0 }, results: { typecheck: [], lint: [], test: [] } };
  const context = newMeter(contextLimit(void 0, config));
  return { toolCalls: newMeter(toolCalls), verifyRounds: verifyMeter, context, requests: 0, tokens, costUsd: 0, toolOutput: {}, largeOutputs: 0 };
};
var newGate = (id) => ({ id, state: "pending", source: "derived" });
var newRun = (id, worktree, branch, at) => ({
  id,
  sessionIds: [],
  worktree,
  branch,
  startedAt: at,
  lastEventAt: at,
  lastActiveAt: at,
  chip: { text: "Plan", tone: "normal" },
  stages: Object.fromEntries(STAGE_ORDER.map((stage) => [stage, { id: stage, state: "pending", waits: [] }])),
  streams: [],
  joins: [],
  rebases: [],
  reviewers: [],
  fixes: [],
  gates: Object.fromEntries(GATE_IDS.map((gate) => [gate, newGate(gate)])),
  agents: {},
  questions: [],
  followups: [],
  messages: [],
  log: [],
  tokens: { points: [], byStage: {}, total: emptyCounts(), marks: [] },
  costUsd: 0
});
var keepMessages = (messages) => {
  let start = Math.max(0, messages.length - MESSAGE_CAP);
  let total = messages.slice(start).reduce((sum, message) => sum + message.text.length, 0);
  while (start < messages.length - 1 && total > MESSAGE_TEXT_BUDGET) {
    total -= messages[start].text.length;
    start += 1;
  }
  return messages.slice(start);
};
var warn = (state, at, text) => {
  state.board.warnings.push({ at, text, tone: "warn" });
  if (state.board.warnings.length > WARNING_CAP) {
    state.board.warnings.shift();
  }
};
var logRun = (run, line, text, tone = "normal", agentId, origin) => {
  const { at, sessionId } = line;
  const entry = agentId ? { at, text, tone, agentId, sessionId } : { at, text, tone, sessionId };
  run.log.push(origin ? { ...entry, origin } : entry);
  if (run.log.length > LOG_CAP) {
    run.log.shift();
  }
};
var isTrunkLike = (branch, config) => branch === config.branches.trunk || config.branches.promote.includes(branch);
var newAgent = (agentKey, event, config) => {
  const role = agentKey === "main" ? "main" : event.agentType ?? "unknown";
  return { id: agentKey, role, stage: agentKey === "main" ? "other" : roleConfig(role, config).stage, state: "running", background: false, startedAt: event.at, recent: [], budget: newBudget(role, config), filesChanged: [] };
};
var ensureAgent = (run, agentKey, event, config) => {
  let agent = run.agents[agentKey];
  if (!agent) {
    agent = newAgent(agentKey, event, config);
    run.agents[agentKey] = agent;
  }
  return agent;
};

// src/model/stages.ts
var GATE_STAGE = { plan: "plan", merge: "merge", promote: "promote", docs: "docs" };
var STAGE_LABELS = { plan: "Plan", build: "Build", join: "Join", review: "Review", fix: "Fix", pr: "PR", merge: "Merge", promote: "Promote", docs: "Docs" };
var FINAL_STATES = /* @__PURE__ */ new Set(["done", "approved", "changes", "handed", "failed", "skipped"]);
var ACTIVE_STATES = /* @__PURE__ */ new Set(["running", "waiting"]);
var PAST_BUILD = ["join", "review", "pr", "merge"];
var SETTLED = /* @__PURE__ */ new Set(["done", "failed", "skipped"]);
var SETTLED_PAST_BUILD = /* @__PURE__ */ new Set([...SETTLED, "handed"]);
var setStage = (run, id, state, at) => {
  const stage = run.stages[id];
  if (stage.state === state) {
    return;
  }
  let started = false;
  if (!stage.startedAt && state !== "pending" && state !== "skipped") {
    stage.startedAt = at;
    run.tokens.marks.push({ at, stage: id, kind: "start" });
    started = true;
  }
  if (FINAL_STATES.has(state)) {
    stage.endedAt = at;
    run.tokens.marks.push({ at, stage: id, kind: "end" });
  } else {
    delete stage.endedAt;
  }
  stage.state = state;
  if (started && PAST_BUILD.includes(id)) {
    passBuild(run, at);
  }
};
var setGate = (run, id, state, line, source, note) => {
  const { at } = line;
  const gate = run.gates[id];
  if (source === "derived" && gate.source === "marker" && gate.state !== "pending" && state === "waiting") {
    return;
  }
  gate.source = source;
  if (note !== void 0) {
    gate.note = note;
  }
  if (gate.state === state) {
    return;
  }
  gate.state = state;
  gate.sessionId = line.sessionId;
  if (state === "waiting") {
    gate.waitingSince = at;
    delete gate.resolvedAt;
  } else if (state === "done" || state === "skipped") {
    gate.resolvedAt = at;
  }
};
var nodeStage = (node) => {
  if (node.kind === "stream") {
    return "build";
  }
  if (node.kind === "reviewer") {
    return "review";
  }
  if (node.kind === "fix") {
    return "fix";
  }
  if (node.kind === "gate") {
    return GATE_STAGE[node.id] ?? "plan";
  }
  return STAGE_ORDER.includes(node.id) ? node.id : "plan";
};
var currentStage = (run) => {
  let reached = "plan";
  let active;
  for (const id of STAGE_ORDER) {
    const state = run.stages[id].state;
    if (ACTIVE_STATES.has(state) || state === "changes") {
      active = id;
    }
    if (state !== "pending" && state !== "skipped") {
      reached = id;
    }
  }
  return active ?? reached;
};
var openPermission = (run) => Object.values(run.agents).some((agent) => agent.recent.some((call) => call.permission === "waiting"));
var syncWaits = (run, at) => {
  const wanted = /* @__PURE__ */ new Map();
  const want = (stage, reason) => wanted.set(stage, (wanted.get(stage) ?? /* @__PURE__ */ new Set()).add(reason));
  for (const gate of Object.values(run.gates)) {
    if (gate.state === "waiting") {
      want(GATE_STAGE[gate.id], "gate");
    }
  }
  for (const question of run.questions) {
    if (question.state === "open" && question.blocking && question.audience === "user" && question.origin !== "permission") {
      want(nodeStage(question.node), "question");
    }
  }
  const current = currentStage(run);
  if (openPermission(run) && run.stages[current].state !== "pending") {
    want(current, "permission");
  }
  for (const id of STAGE_ORDER) {
    const stage = run.stages[id];
    const reasons = wanted.get(id) ?? /* @__PURE__ */ new Set();
    for (const wait of stage.waits) {
      if (!wait.to && !reasons.has(wait.reason)) {
        wait.to = at;
        run.tokens.marks.push({ at, stage: id, kind: "wait-end" });
      }
    }
    for (const reason of reasons) {
      if (!stage.waits.some((wait) => !wait.to && wait.reason === reason)) {
        stage.waits.push({ from: at, reason });
        run.tokens.marks.push({ at, stage: id, kind: "wait-start" });
      }
    }
    const waiting = stage.waits.some((wait) => !wait.to);
    if (waiting && (stage.state === "running" || stage.state === "pending")) {
      setStage(run, id, "waiting", at);
    } else if (!waiting && stage.state === "waiting") {
      setStage(run, id, "running", at);
    }
  }
};
var endPlan = (run, line) => {
  if (ACTIVE_STATES.has(run.stages.plan.state)) {
    setStage(run, "plan", "done", line.at);
  }
  if (run.gates.plan.state === "waiting") {
    setGate(run, "plan", "done", line, run.gates.plan.source);
  }
};
var pastBuild = (run) => PAST_BUILD.some((id) => run.stages[id].startedAt !== void 0);
var checkBuild = (run, at) => {
  if (run.streams.length === 0) {
    return;
  }
  const settled = pastBuild(run) ? SETTLED_PAST_BUILD : SETTLED;
  const settledAll = run.streams.every((stream) => settled.has(stream.state));
  if (settledAll) {
    let end = "done";
    if (run.streams.some((stream) => stream.state === "failed")) {
      end = "failed";
    } else if (!run.stages.build.startedAt && run.streams.every((stream) => stream.state === "skipped")) {
      end = "skipped";
    }
    setStage(run, "build", end, at);
  } else if (!ACTIVE_STATES.has(run.stages.build.state)) {
    setStage(run, "build", "running", at);
  }
};
var passBuild = (run, at) => {
  for (const stream of run.streams) {
    if (stream.planned && stream.state === "pending" && stream.agentIds.length === 0) {
      stream.state = "skipped";
    }
  }
  checkBuild(run, at);
};
var checkReview = (run, at) => {
  if (run.reviewers.length === 0) {
    return;
  }
  if (run.reviewers.some((reviewer) => reviewer.state === "running" || reviewer.state === "waiting")) {
    setStage(run, "review", "running", at);
  } else if (run.reviewers.some((reviewer) => reviewer.state === "changes")) {
    setStage(run, "review", "changes", at);
  } else if (run.reviewers.some((reviewer) => reviewer.state === "failed")) {
    setStage(run, "review", "failed", at);
  } else {
    setStage(run, "review", "done", at);
  }
};
var agentFix = (run, agentId) => [...run.fixes].reverse().find((fix) => fix.agentId === agentId);
var checkFix = (run, at) => {
  if (run.fixes.length === 0) {
    return;
  }
  if (run.fixes.some((fix) => fix.state === "running")) {
    setStage(run, "fix", "running", at);
  } else {
    setStage(run, "fix", run.fixes.some((fix) => fix.state === "failed") ? "failed" : "done", at);
  }
};

// src/model/questions.ts
var DAY_MS = 24 * 60 * 60 * 1e3;
var closeQuestion = (run, question, state, line, via) => {
  question.state = state;
  question.resolvedAt = line.at;
  if (via) {
    question.answeredVia = via;
  }
  if (state === "answered" && question.origin !== "permission") {
    logRun(run, line, `Answered: ${question.text}`, "you", void 0, "developer");
  }
  if (state === "handled") {
    logRun(run, line, `Handled by the main thread: ${question.text}`, "normal");
  }
  if (state === "relayed") {
    logRun(run, line, `Relayed to you: ${question.text}`, "normal");
  }
};
var audienceOf = (origin) => origin === "report" ? "main" : "user";
var logAsked = (run, question) => {
  const line = { at: question.createdAt, sessionId: question.sessionId };
  if (audienceOf(question.origin) === "main") {
    logRun(run, line, `Question for the main thread: ${question.text}`, "normal", question.source.agentId);
  } else if (question.origin !== "permission") {
    logRun(run, line, `Question for you: ${question.text}`, "you", question.source.agentId);
  }
};
var addQuestion = (run, question) => {
  if (run.questions.some((existing) => existing.id === question.id)) {
    return;
  }
  run.questions.push({ ...question, audience: audienceOf(question.origin), state: "open" });
  logAsked(run, question);
};
var reaskQuestion = (run, question, asked) => {
  question.text = asked.text;
  question.blocking = asked.blocking;
  question.options = asked.options;
  question.node = asked.node;
  question.source = asked.source;
  question.sessionId = asked.sessionId;
  question.createdAt = asked.createdAt;
  question.state = "open";
  delete question.resolvedAt;
  delete question.answeredVia;
  delete question.messageId;
  logAsked(run, asked);
};
var noteReport = (session, agentId) => {
  if (agentId !== "" && !(session.handbacks ?? []).includes(agentId)) {
    session.handbacks = [...session.handbacks ?? [], agentId];
  }
};
var mainQuestions = (state, keep) => {
  const found = [];
  for (const run of Object.values(state.board.runs)) {
    for (const question of run.questions) {
      if (question.audience === "main" && keep(question)) {
        found.push({ run, question });
      }
    }
  }
  return found.sort((a, b) => time(a.question.createdAt) - time(b.question.createdAt));
};
var STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "and",
  "but",
  "not",
  "you",
  "your",
  "yours",
  "our",
  "ours",
  "they",
  "them",
  "their",
  "his",
  "her",
  "its",
  "this",
  "that",
  "these",
  "those",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "are",
  "was",
  "were",
  "been",
  "being",
  "have",
  "has",
  "had",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "for",
  "from",
  "with",
  "without",
  "into",
  "onto",
  "about",
  "over",
  "under",
  "after",
  "before",
  "between",
  "through",
  "via"
]);
var contentWords = (text) => {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
};
var closestQuestion = (candidates, text) => {
  const asked = contentWords(text);
  const shared = (item) => [...contentWords(item.question.text)].filter((word) => asked.has(word)).length;
  let best;
  let bestShared = 0;
  for (const item of candidates) {
    const count = shared(item);
    if (count > bestShared) {
      best = item;
      bestShared = count;
    }
  }
  return best;
};
var relayedQuestion = (state, session, text, relays, at) => {
  if (relays !== void 0) {
    const named = mainQuestions(state, (question) => question.id === relays && (question.state === "open" || question.state === "handled"))[0];
    if (named) {
      return named;
    }
    warn(state, at, `question marker: relays names no open subagent question ${relays}`);
  }
  const reports = session?.handbacks ?? [];
  if (reports.length !== 1) {
    return void 0;
  }
  return closestQuestion(mainQuestions(state, (question) => question.state === "open" && question.source.agentId === reports[0]), text);
};
var relayQuestion = (relayed, line) => {
  const { run, question } = relayed;
  closeQuestion(run, question, "relayed", line);
  return { id: question.id, text: question.text, source: { ...question.source }, node: { ...question.node } };
};
var handleHandbacks = (state, session, line) => {
  const changed = [];
  for (const agentId of session.handbacks ?? []) {
    const runId = state.index.agentRuns[agentId];
    const run = runId ? state.board.runs[runId] : void 0;
    if (!run) {
      continue;
    }
    const open = run.questions.filter((question) => question.state === "open" && question.audience === "main" && question.source.agentId === agentId);
    for (const question of open) {
      closeQuestion(run, question, "handled", line);
    }
    if (open.length > 0 && !changed.includes(run)) {
      changed.push(run);
    }
  }
  delete session.handbacks;
  return changed;
};
var agentNode = (run, agent) => {
  const fix = agentFix(run, agent.id);
  if (fix) {
    return { kind: "fix", id: fix.id };
  }
  if (agent.reviewerId) {
    return { kind: "reviewer", id: agent.reviewerId };
  }
  if (agent.streamId) {
    return { kind: "stream", id: agent.streamId };
  }
  return { kind: "stage", id: currentStage(run) };
};
var expireOpenQuestions = (run, line, reason) => {
  for (const question of run.questions) {
    if (question.state === "open") {
      closeQuestion(run, question, "expired", line);
      logRun(run, line, `Question expired (${reason}): ${question.text}`, "normal");
    }
  }
};
var closeElicitations = (run, line) => {
  for (const question of run.questions) {
    const own = !question.sessionId || question.sessionId === line.sessionId;
    if (question.origin === "elicitation" && question.state === "open" && own) {
      closeQuestion(run, question, "answered", line, "terminal");
    }
  }
};
var onTick = (state, now) => {
  const touched = [];
  const line = factStamp(now);
  for (const run of Object.values(state.board.runs)) {
    let changed = false;
    for (const question of run.questions) {
      if (question.state === "open" && time(now) - time(question.createdAt) >= DAY_MS) {
        closeQuestion(run, question, "expired", line);
        logRun(run, line, `Question expired after 24 h: ${question.text}`, "normal");
        changed = true;
      }
    }
    if (changed) {
      touched.push(run);
    }
  }
  return touched;
};
var permissionQuestion = (run, call) => run.questions.find((question) => question.id === `q-perm-${call.toolUseId}`);
var closePermissions = (run, agent, line, how, sessionId) => {
  const { at } = line;
  const closed = [];
  for (const call of agent.recent) {
    if (call.permission !== "waiting") {
      continue;
    }
    const question = permissionQuestion(run, call);
    if (sessionId !== void 0 && question?.sessionId && question.sessionId !== sessionId) {
      continue;
    }
    const askedAt = question?.createdAt ?? call.startedAt;
    if (how === "denied" && time(askedAt) >= time(at)) {
      continue;
    }
    call.endedAt = at;
    if (how === "denied") {
      call.permission = "denied";
      call.outcome = "denied";
      logRun(run, line, `${call.tool} call denied: ${call.summary}`, "warn", agent.id);
    } else {
      delete call.permission;
      call.outcome = "interrupted";
      logRun(run, line, `${call.tool} call ended without a permission answer: ${call.summary}`, "warn", agent.id);
    }
    if (agent.now === call) {
      delete agent.now;
    }
    if (question?.state === "open") {
      closeQuestion(run, question, "expired", line);
    }
    closed.push(call);
  }
  return closed;
};
var expireDroppedPermissions = (run, agent, line, how, sessionId) => {
  let expired = 0;
  for (const question of run.questions) {
    const waiting = question.origin === "permission" && question.state === "open" && question.source.agentId === agent.id;
    const dropped = waiting && !agent.recent.some((call) => question.id === `q-perm-${call.toolUseId}`);
    const otherSession = sessionId !== void 0 && Boolean(question.sessionId) && question.sessionId !== sessionId;
    if (!dropped || otherSession || how === "denied" && time(question.createdAt) >= time(line.at)) {
      continue;
    }
    closeQuestion(run, question, "expired", line);
    expired += 1;
  }
  return expired;
};
var ENDS_MAIN_TURN = /* @__PURE__ */ new Set(["turn.stop", "prompt", "session.end"]);
var ownAgent = (state, agent, sessionId) => agent.id === "main" || (state.index.agentSessions[agent.id] ?? sessionId) === sessionId;
var closeRunPermissions = (state, session, line, ended) => {
  const changed = [];
  for (const runId of session.runIds) {
    const run = state.board.runs[runId];
    const all = Object.values(run?.agents ?? {});
    const own = all.filter((agent) => ownAgent(state, agent, line.sessionId));
    const agents = ended ? own : [run?.agents.main];
    let closed = 0;
    for (const agent of agents) {
      closed += run && agent ? closePermissions(run, agent, line, "unanswered", line.sessionId).length : 0;
      closed += run && agent ? expireDroppedPermissions(run, agent, line, "unanswered", line.sessionId) : 0;
    }
    if (run && closed > 0) {
      changed.push(run);
    }
  }
  return changed;
};
var closeSessionPermissions = (state, event) => {
  const session = state.index.sessions[event.sessionId];
  if (!session || event.agentId || !ENDS_MAIN_TURN.has(event.event)) {
    return [];
  }
  return closeRunPermissions(state, session, event, event.event === "session.end");
};

// src/model/budget.ts
var meterLevel = (meter, warnAt) => {
  const ratio = meter.used / meter.limit;
  if (ratio >= 1) {
    return "limit";
  }
  return ratio >= warnAt ? "warn" : "ok";
};
var setLevel = (meter, warnAt) => {
  if (meter.limit > 0) {
    meter.level = meterLevel(meter, warnAt);
  }
};
var updateMeter = (state, run, agent, name, meter, warnAt, line) => {
  if (meter.limit <= 0) {
    return;
  }
  const level = meterLevel(meter, warnAt);
  meter.level = level;
  const key = `${run.id}/${agent.id}/${name}/${level}`;
  if (level !== "ok" && !state.index.warned[key]) {
    state.index.warned[key] = true;
    logRun(run, line, `${name}: ${meter.used} of ${meter.limit}${level === "limit" ? ", budget reached" : ""}`, "warn", agent.id);
  }
};
var verificationKinds = (command, config) => {
  const stripped = stripPrefix(command);
  const compiled = compile(config);
  const runner = stripped.split(/\s+/)[0];
  if (!compiled.runners.has(runner)) {
    return void 0;
  }
  const firstCommand = stripped.split(/\s*(?:\||&&|;)\s*/)[0];
  const kinds = [];
  const full = [];
  for (const [kind, pattern] of compiled.kinds) {
    const match = pattern.exec(patternInput(stripped));
    if (!match) {
      continue;
    }
    kinds.push(kind);
    const scriptMatch = pattern.exec(patternInput(firstCommand));
    const args = scriptMatch ? firstCommand.slice(scriptMatch.index + scriptMatch[0].length).split(/\s+/).filter(Boolean) : [];
    const hasPath = args.some((arg) => arg.includes("/") || /\.(?:ts|tsx|mjs)$/.test(arg));
    if (!config.verification.fullRunOnly || !hasPath) {
      full.push(kind);
    }
  }
  return { kinds, full };
};
var countVerification = (state, run, agent, match) => {
  if (!match) {
    return [];
  }
  const key = `${run.id}/${agent.id}`;
  const full = state.index.fullRuns[key] ?? (state.index.fullRuns[key] = { typecheck: 0, lint: 0, test: 0 });
  const entries = [];
  for (const kind of match.kinds) {
    agent.budget.verifyRounds.commands[kind] += 1;
  }
  for (const kind of match.full) {
    full[kind] += 1;
    entries.push({ kind, position: agent.budget.verifyRounds.results[kind].push("running") - 1 });
  }
  agent.budget.verifyRounds.used = Math.max(full.typecheck, full.lint, full.test);
  return entries;
};
var SGR = /\x1b\[[0-9;]*m/g;
var verifyResult = (kind, event, config) => {
  if (event.event === "tool.fail") {
    return "fail";
  }
  const { exitCode, interrupted, stdoutTail } = event.data;
  if (interrupted === true || typeof exitCode === "number" && exitCode !== 0) {
    return "fail";
  }
  const pattern = compile(config).failPatterns.get(kind);
  const tail = (stdoutTail ?? "").replace(SGR, "");
  return pattern?.test(patternInput(tail)) ? "fail" : "pass";
};
var settleVerification = (agent, entries, event, config) => {
  for (const { kind, position } of entries) {
    agent.budget.verifyRounds.results[kind][position] = verifyResult(kind, event, config);
  }
};

// src/model/sessions.ts
var PROMPTS_CAP = 200;
var RESUMES_CAP = MESSAGE_CAP;
var SOURCES = /* @__PURE__ */ new Set(["startup", "resume", "clear", "compact"]);
var KIND_ORDER = ["start", "worktree", "agent", "edit", "join", "git", "pr"];
var RESUMES_WORK = /* @__PURE__ */ new Set([
  "prompt",
  "tool.pre",
  "tool.post",
  "tool.fail",
  "permission",
  "agent.start",
  "agent.stop",
  "task.created",
  "task.completed"
]);
var MARKERS = /* @__PURE__ */ new Set(["plan", "gate", "question"]);
var byLineTime = (a, b) => time(a.at) - time(b.at) || compareText(a.id ?? "", b.id ?? "");
var bySessionTime = (a, b) => time(a.at) - time(b.at) || compareText(a.sessionId, b.sessionId);
var byWorkTime = (a, b) => {
  const byKind = KIND_ORDER.indexOf(a.how) - KIND_ORDER.indexOf(b.how);
  return time(a.at) - time(b.at) || compareText(a.runId, b.runId) || byKind;
};
var isTrunkBranch = (state, branch) => branch === state.board.branches.trunk || state.board.branches.promote.includes(branch);
var branchWorkKey = (run) => run.branch === "?" ? run.id : run.branch;
var hasBranchWork = (session, runId) => session.branchWork.some((work) => work.runId === runId);
var recordOf = (state, sessionId) => {
  if (!sessionId || !Object.hasOwn(state.index.sessions, sessionId)) {
    return void 0;
  }
  return state.index.sessions[sessionId];
};
var sessionOfAgent = (state, agentId) => {
  if (agentId === void 0 || !Object.hasOwn(state.index.agentSessions, agentId)) {
    return void 0;
  }
  return state.index.agentSessions[agentId];
};
var noteActive = (session, at) => {
  if (session.lastActiveAt === void 0 || time(at) > time(session.lastActiveAt)) {
    session.lastActiveAt = at;
  }
};
var addBranchSession = (map, key, entry) => {
  const list = ownEntry(map, key, () => []);
  const existing = list.find((item) => item.sessionId === entry.sessionId);
  if (!existing) {
    list.push({ ...entry });
  } else if (time(entry.at) < time(existing.at)) {
    existing.at = entry.at;
  }
  list.sort(bySessionTime);
};
var addWork = (list, work) => {
  const existing = list.find((item) => item.runId === work.runId && item.how === work.how);
  if (!existing) {
    list.push({ ...work });
  } else if (time(work.at) < time(existing.at)) {
    existing.at = work.at;
  }
};
var noteBranchWork = (state, sessionId, run, how, at) => {
  const session = recordOf(state, sessionId);
  if (!session || isTrunkBranch(state, run.branch)) {
    return;
  }
  addWork(session.branchWork, { runId: run.id, at, how });
  session.branchWork.sort(byWorkTime);
  addBranchSession(state.index.branchSessions, branchWorkKey(run), { sessionId, at });
};
var moveBranchWork = (state, oldId, newId) => {
  const run = state.board.runs[newId];
  const drop = run === void 0 || isTrunkBranch(state, run.branch);
  for (const session of Object.values(state.index.sessions)) {
    if (!hasBranchWork(session, oldId)) {
      continue;
    }
    const moved = [];
    for (const work of session.branchWork) {
      if (work.runId !== oldId) {
        addWork(moved, work);
      } else if (!drop) {
        addWork(moved, { ...work, runId: newId });
      }
    }
    session.branchWork = moved.sort(byWorkTime);
  }
  const entries = Object.hasOwn(state.index.branchSessions, oldId) ? state.index.branchSessions[oldId] : [];
  delete state.index.branchSessions[oldId];
  if (run && !drop) {
    for (const entry of entries) {
      addBranchSession(state.index.branchSessions, branchWorkKey(run), entry);
    }
  }
};
var firstLine2 = (text) => text.split("\n").find((line) => line.trim() !== "")?.trim() ?? "";
var BREAK_MS = 30 * 60 * 1e3;
var KEEPS_WAIT = /* @__PURE__ */ new Set(["agent.stop", "notification"]);
var subagentRuns = (state, session) => session.agentIds.some((agentId) => {
  const runId = Object.hasOwn(state.index.agentRuns, agentId) ? state.index.agentRuns[agentId] : void 0;
  const agent = runId === void 0 ? void 0 : state.board.runs[runId]?.agents[agentId];
  return agent?.state === "running" && agent.staleSince === void 0;
});
var noteWait = (state, session, event) => {
  if (event.event === "turn.stop" && !event.agentId) {
    const tasks = event.data.backgroundTasks;
    const background = Array.isArray(tasks) && tasks.some((task) => task?.status === "running");
    if (background || subagentRuns(state, session)) {
      delete session.waitFrom;
    } else {
      session.waitFrom = event.at;
    }
    return;
  }
  const from = session.waitFrom;
  if (from === void 0 || KEEPS_WAIT.has(event.event)) {
    return;
  }
  delete session.waitFrom;
  if (event.event !== "prompt" || event.data.kind !== "user" || event.agentId) {
    return;
  }
  const gap = time(event.at) - time(from);
  if (gap < 0) {
    return;
  }
  if (gap <= BREAK_MS) {
    session.developerWait.waits += 1;
    session.developerWait.totalMs += gap;
  } else {
    session.developerWait.breaks += 1;
  }
};
var agentStartedAt = (state, agentId) => {
  const runId = Object.hasOwn(state.index.agentRuns, agentId) ? state.index.agentRuns[agentId] : void 0;
  const started = runId === void 0 ? void 0 : state.board.runs[runId]?.agents[agentId]?.startedAt;
  return started === void 0 ? Number.MAX_SAFE_INTEGER : time(started);
};
var recordLine = (state, event, run) => {
  const session = recordOf(state, event.sessionId);
  if (!session) {
    return;
  }
  if (time(event.at) < time(session.startedAt)) {
    session.startedAt = event.at;
  }
  if (RESUMES_WORK.has(event.event)) {
    noteActive(session, event.at);
  }
  if (event.event === "session.start") {
    noteSessionStart(session, event.at, event.data);
    noteResume(session, event);
  }
  if (event.event === "prompt" && event.data.kind === "user" && !event.agentId) {
    const earliest = session.prompts.length === 0 || time(event.at) < time(session.prompts[0].at);
    if (earliest && run) {
      noteBranchWork(state, event.sessionId, run, "start", event.at);
    }
    session.prompts.push({ at: event.at, line: firstLine2(event.data.text), keys: [...event.data.keys], id: event.id });
    session.prompts.sort(byLineTime);
    session.prompts.splice(0, session.prompts.length - PROMPTS_CAP);
  }
  const agentId = event.agentId;
  if (event.event === "agent.start" && agentId && sessionOfAgent(state, agentId) === event.sessionId) {
    if (!session.agentIds.includes(agentId)) {
      session.agentIds.push(agentId);
    }
    session.agentIds.sort((a, b) => agentStartedAt(state, a) - agentStartedAt(state, b) || compareText(a, b));
  }
  noteWait(state, session, event);
};
var noteSessionStart = (session, at, data) => {
  if (session.sourceAt !== void 0 && time(at) >= time(session.sourceAt)) {
    return;
  }
  session.sourceAt = at;
  if (SOURCES.has(data.source)) {
    session.source = data.source;
  } else {
    delete session.source;
  }
  const resolved = session.main?.model;
  if (data.model && !(isModelAlias(data.model) && resolved && !isModelAlias(resolved))) {
    session.model = data.model;
  } else if (resolved) {
    session.model = resolved;
  } else {
    delete session.model;
  }
};
var noteResume = (session, event) => {
  const { source, contextTokens, promptCacheLikelyExpired, estimatedCacheWriteUsd, secondsSinceLastResponse } = event.data;
  const fields = [contextTokens, promptCacheLikelyExpired, estimatedCacheWriteUsd, secondsSinceLastResponse];
  if (fields.every((value) => value === void 0) || session.resumes.some((entry2) => entry2.id === event.id)) {
    return;
  }
  const entry = { at: event.at, source, id: event.id };
  if (contextTokens !== void 0) {
    entry.contextTokens = contextTokens;
  }
  if (promptCacheLikelyExpired !== void 0) {
    entry.cacheLikelyExpired = promptCacheLikelyExpired;
  }
  if (estimatedCacheWriteUsd !== void 0) {
    entry.cacheWriteUsd = estimatedCacheWriteUsd;
  }
  if (secondsSinceLastResponse !== void 0) {
    entry.idleSeconds = secondsSinceLastResponse;
  }
  session.resumes.push(entry);
  session.resumes.sort(byLineTime);
  session.resumes.splice(0, session.resumes.length - RESUMES_CAP);
};
var mainOf = (state, sessionId) => recordOf(state, sessionId)?.main;
var sessionMain = (session, event, config) => {
  if (!session || event.agentId || event.event === "session.start" || event.event === "session.end") {
    return void 0;
  }
  if (!session.main) {
    session.main = newAgent("main", event, config);
  }
  return session.main;
};
var noteMainModel = (state, sessionId, model) => {
  const session = recordOf(state, sessionId);
  if (!session?.main) {
    return;
  }
  session.main.model = model;
  if (session.model === void 0 || isModelAlias(session.model) && !isModelAlias(model)) {
    session.model = model;
  }
};
var addMainCall = (main, call, warnAt) => {
  const copy = { ...call };
  main.now = copy;
  main.recent.push(copy);
  main.recent.splice(0, main.recent.length - RECENT_CAP);
  main.budget.toolCalls.used += 1;
  setLevel(main.budget.toolCalls, warnAt);
};
var mainCall = (main, toolUseId) => {
  if (main.now?.toolUseId === toolUseId) {
    return main.now;
  }
  return main.recent.find((call) => call.toolUseId === toolUseId);
};
var countMainVerification = (main, match, warnAt) => {
  if (!match) {
    return [];
  }
  const rounds = main.budget.verifyRounds;
  for (const kind of match.kinds) {
    rounds.commands[kind] += 1;
  }
  const entries = [];
  for (const kind of match.full) {
    entries.push({ kind, position: rounds.results[kind].push("running") - 1 });
  }
  rounds.used = Math.max(rounds.results.typecheck.length, rounds.results.lint.length, rounds.results.test.length);
  setLevel(rounds, warnAt);
  return entries;
};
var runCall = (state, session, toolUseId) => {
  for (const runId of session.runIds) {
    const main = state.board.runs[runId]?.agents.main;
    const call = main?.now?.toolUseId === toolUseId ? main.now : main?.recent.find((item) => item.toolUseId === toolUseId);
    if (call) {
      return call;
    }
  }
  return void 0;
};
var copyDecision = (call, source) => {
  if (source.permission === void 0) {
    delete call.permission;
  } else {
    call.permission = source.permission;
  }
  if (source.endedAt !== void 0) {
    call.endedAt = source.endedAt;
  }
  if (source.outcome !== void 0) {
    call.outcome = source.outcome;
  }
};
var settleDropped = (state, session, call, event) => {
  const id = `q-perm-${call.toolUseId}`;
  const runs = session.runIds.map((runId) => state.board.runs[runId]).filter((run) => run !== void 0);
  const question = runs.flatMap((run) => run.questions).find((item) => item.id === id);
  if (!question || question.state === "open" || question.resolvedAt === void 0) {
    return;
  }
  call.endedAt = question.resolvedAt;
  const ownCall = event.event === "tool.pre" && !event.agentId && event.at === question.resolvedAt;
  if (ownCall) {
    call.permission = "denied";
    call.outcome = "denied";
  } else {
    delete call.permission;
    call.outcome = "interrupted";
  }
};
var SYNCS_ALL = /* @__PURE__ */ new Set(["tick", "git.fact"]);
var syncMainCalls = (state, event) => {
  let sessions = [];
  if (SYNCS_ALL.has(event.event)) {
    sessions = Object.values(state.index.sessions);
  } else if (event.src === "hook") {
    sessions = [recordOf(state, event.sessionId)];
  }
  for (const session of sessions) {
    const main = session?.main;
    if (!session || !main) {
      continue;
    }
    const calls = main.now && !main.recent.includes(main.now) ? [...main.recent, main.now] : main.recent;
    for (const call of calls) {
      const open = call.endedAt === void 0 || call.permission === "waiting";
      const source = open ? runCall(state, session, call.toolUseId) : void 0;
      if (source) {
        copyDecision(call, source);
      } else if (open && call.permission === "waiting") {
        settleDropped(state, session, call, event);
      }
    }
    if (main.now?.endedAt !== void 0) {
      delete main.now;
    }
  }
};
var requestSessionId = (state, event) => sessionOfAgent(state, event.agentId) ?? event.sessionId;
var mainTokenStage = (session, at) => {
  const worked = session.branchWork.some((work) => time(work.at) <= time(at));
  return worked ? "main" : "plan";
};
var noteMarker = (state, event, line) => {
  const session = recordOf(state, line.sessionId);
  if (!session) {
    return;
  }
  noteActive(session, line.at);
  if (event.event === "plan") {
    session.plans.push({ at: line.at, ...event.data.note ? { note: event.data.note } : {}, id: event.id });
    session.plans.sort(byLineTime);
  }
};
var namedRun = (state, ref) => {
  if (ref === void 0) {
    return void 0;
  }
  if (Object.hasOwn(state.board.runs, ref)) {
    return state.board.runs[ref];
  }
  let matches = Object.values(state.board.runs).filter((run) => run.id.includes(ref));
  if (matches.length > 1) {
    matches = matches.filter((run) => run.pr?.state !== "merged" && run.branch !== "?");
  }
  return matches.length === 1 ? matches[0] : void 0;
};
var reachedRuns = (state, event) => {
  const runs = Object.values(state.board.runs);
  if (event.event === "gh.fact") {
    if (event.data.kind !== "pr") {
      return [];
    }
    const pr = event.data.pr;
    const promote = state.board.branches.promote.includes(pr.baseRefName);
    return runs.filter((run) => run.branch === pr.headRefName || promote && run.pr !== void 0);
  }
  if (event.event === "git.fact") {
    const branch = event.data.branch;
    return runs.filter((run) => run.branch === branch);
  }
  if (event.event === "usage.fact" || event.event === "tick") {
    return [];
  }
  const named = MARKERS.has(event.event) ? namedRun(state, event.data.run) : void 0;
  const session = recordOf(state, event.sessionId);
  const own = session ? sessionRuns(state, session) : [];
  return named && !own.includes(named) ? [named, ...own] : own;
};
var sessionRunIds = (session) => {
  const worked = session.branchWork.map((work) => work.runId);
  return [.../* @__PURE__ */ new Set([...session.runIds, ...worked])].sort(compareText);
};
var sessionRuns = (state, session) => {
  const runs = sessionRunIds(session).map((id) => state.board.runs[id]);
  return runs.filter((run) => run !== void 0);
};
var addBranchSessions = (state, run, ids) => {
  const key = branchWorkKey(run);
  for (const entry of Object.hasOwn(state.index.branchSessions, key) ? state.index.branchSessions[key] : []) {
    ids.add(entry.sessionId);
  }
};
var tickSessions = (state, now, ids) => {
  for (const [sessionId, session] of Object.entries(state.index.sessions)) {
    if (session.endedAt === void 0 || session.goneAt === now) {
      ids.add(sessionId);
    }
    for (const run of session.goneAt === now ? sessionRuns(state, session) : []) {
      addBranchSessions(state, run, ids);
    }
  }
  for (const run of Object.values(state.board.runs)) {
    for (const question of run.questions) {
      if (question.sessionId && (question.state === "open" || question.resolvedAt === now)) {
        ids.add(question.sessionId);
      }
    }
    for (const agent of Object.values(run.agents)) {
      const sessionId = agent.staleSince === now ? sessionOfAgent(state, agent.id) : void 0;
      if (sessionId) {
        ids.add(sessionId);
      }
    }
  }
};
var tookGate = (run, event) => {
  if (!event.sessionId || event.event === "tick") {
    return false;
  }
  const at = time(event.at);
  const set = (gate) => gate.state === "pending" || time(gate.waitingSince ?? "") === at || time(gate.resolvedAt ?? "") === at;
  return Object.values(run.gates).some((gate) => gate.sessionId === event.sessionId && set(gate));
};
var sessionsAffected = (state, event) => {
  const ids = /* @__PURE__ */ new Set();
  if (event.event === "tick") {
    tickSessions(state, event.data.now, ids);
    return [...ids].sort(compareText);
  }
  if (event.sessionId) {
    ids.add(event.sessionId);
  }
  const agentSession = sessionOfAgent(state, event.agentId);
  if (agentSession) {
    ids.add(agentSession);
  }
  const marker = MARKERS.has(event.event);
  const fact = event.event === "git.fact" || event.event === "gh.fact";
  for (const run of reachedRuns(state, event)) {
    addBranchSessions(state, run, ids);
    for (const sessionId of fact || tookGate(run, event) ? run.sessionIds : []) {
      ids.add(sessionId);
    }
    for (const question of run.questions) {
      if (question.sessionId && (question.resolvedAt === event.at || question.messageId === event.id)) {
        ids.add(question.sessionId);
      }
    }
    for (const sessionId of marker ? run.sessionIds : []) {
      const other = recordOf(state, sessionId);
      if (!event.sessionId || other?.endedAt === void 0) {
        ids.add(sessionId);
      }
    }
  }
  return [...ids].sort(compareText);
};

// src/model/runs.ts
var ensureSession = (state, event) => ownEntry(state.index.sessions, event.sessionId, () => {
  const tokens = { points: [], byStage: {}, total: emptyCounts() };
  const cwd = normalizePath(event.cwd);
  const developerWait = { waits: 0, totalMs: 0, breaks: 0 };
  return { startCwd: cwd, cwd, agentWorktrees: {}, runIds: [], startedAt: event.at, prompts: [], plans: [], branchWork: [], agentIds: [], messages: [], tokens, developerWait, resumes: [] };
});
var findWorktree = (state, path, live = false) => {
  let end = path.length;
  for (; ; ) {
    const candidate = path.slice(0, end);
    const record = ownValue(state.index.worktrees, candidate);
    if (record !== void 0 && !(live && record.removedAt)) {
      return candidate;
    }
    end = end === 0 ? -1 : path.lastIndexOf("/", end - 1);
    if (end < 0) {
      return void 0;
    }
  }
};
var runIdFor = (state, worktree) => `${baseName(worktree)}:${ownValue(state.index.worktrees, worktree)?.branch ?? "?"}`;
var applyBranchKey = (run, config) => {
  const compiled = compile(config);
  const key = branchKey(run.branch, compiled.branchKey, compiled.keyIgnoreCase);
  if (key) {
    run.key = key;
  }
};
var TITLE_MAX = 60;
var escapeRegExp3 = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var keyPrefixLength = (line, key) => {
  if (!key) {
    return 0;
  }
  const match = new RegExp(`^${escapeRegExp3(key)}(?:\\s*[:-]\\s*|\\s+)`, "i").exec(line);
  return match ? match[0].length : 0;
};
var promptTitle = (text, key, limit = TITLE_MAX) => {
  const line = text.split("\n").find((candidate) => candidate.trim() !== "")?.trim() ?? "";
  const prefix = keyPrefixLength(line, key);
  const max = prefix + limit;
  if (line.length <= max) {
    return line;
  }
  const space = line.slice(0, max + 1).lastIndexOf(" ");
  const head = space >= prefix + limit / 2 ? line.slice(0, space) : line.slice(0, max);
  return `${head.replace(/[\s,;:.\-]+$/, "")}\u2026`;
};
var adoptPrompt = (run, prompt, config) => {
  if (time(prompt.at) < time(run.startedAt)) {
    run.startedAt = prompt.at;
  }
  const stageStarted = Object.values(run.stages).some((stage) => stage.startedAt !== void 0);
  if (!stageStarted && run.stages.plan.state === "pending") {
    setStage(run, "plan", "running", prompt.at);
  }
  if (!run.key && prompt.keys[0] && compile(config).promptKey) {
    run.key = prompt.keys[0];
  }
  if (!run.title && !run.pr) {
    run.title = promptTitle(prompt.text, run.key);
  }
};
var ensureRun = (state, worktree, event, config) => {
  const record = ownEntry(state.index.worktrees, worktree, () => ({ path: worktree }));
  const id = runIdFor(state, worktree);
  const session = event.sessionId ? state.index.sessions[event.sessionId] : void 0;
  let run = state.board.runs[id];
  if (!run) {
    run = newRun(id, worktree, record.branch ?? "?", event.at);
    state.board.runs[id] = run;
    if (record.forkAt) {
      run.fork = { at: record.forkAt, base: record.base ?? config.branches.trunk, sha: record.forkSha };
    }
    applyBranchKey(run, config);
  }
  if (event.sessionId && !run.sessionIds.includes(event.sessionId)) {
    run.sessionIds.push(event.sessionId);
    if (run.sessionIds.length > 1) {
      logRun(run, event, `Session ${event.sessionId.slice(0, 8)} joined the run`);
    }
  }
  if (session && !session.runIds.includes(id)) {
    session.runIds.push(id);
  }
  return run;
};
var homeWorktree = (state, session) => findWorktree(state, session.startCwd) ?? session.startCwd;
var homeRun = (state, event, config) => ensureRun(state, homeWorktree(state, ensureSession(state, event)), event, config);
var existingHomeRun = (state, session) => state.board.runs[runIdFor(state, homeWorktree(state, session))];
var addCounts = (target, source) => {
  for (const key of Object.keys(source)) {
    target[key] += source[key];
  }
};
var bySessionTime2 = (a, b) => time(a.at) - time(b.at) || compareText(a.sessionId, b.sessionId);
var missingById = (target, source) => source.filter((item) => !target.some((existing) => existing.id === item.id));
var mergeRun = (target, run) => {
  target.sessionIds = [.../* @__PURE__ */ new Set([...target.sessionIds, ...run.sessionIds])];
  target.agents = { ...run.agents, ...target.agents };
  target.log = [...run.log, ...target.log].sort((a, b) => time(a.at) - time(b.at)).slice(-LOG_CAP);
  const messages = [...target.messages, ...missingById(target.messages, run.messages)];
  target.messages = keepMessages(messages.sort((a, b) => time(a.at) - time(b.at)));
  target.startedAt = time(run.startedAt) < time(target.startedAt) ? run.startedAt : target.startedAt;
  target.key = target.key ?? run.key;
  target.title = target.title ?? run.title;
  target.plan = target.plan ?? run.plan;
  target.pr = target.pr ?? run.pr;
  if (run.join && (!target.join || time(run.join.at) > time(target.join.at))) {
    target.join = run.join;
  }
  target.joins = [...target.joins, ...run.joins].sort(bySessionTime2).slice(-JOINS_CAP);
  target.rebases = [...target.rebases, ...run.rebases].sort(bySessionTime2).slice(-REBASES_CAP);
  for (const id of STAGE_ORDER) {
    if (target.stages[id].state === "pending" && run.stages[id].state !== "pending") {
      target.stages[id] = run.stages[id];
    }
  }
  for (const id of Object.keys(target.gates)) {
    if (target.gates[id].state === "pending" && run.gates[id].state !== "pending") {
      target.gates[id] = run.gates[id];
    }
  }
  target.streams.push(...missingById(target.streams, run.streams));
  target.reviewers.push(...missingById(target.reviewers, run.reviewers));
  target.fixes.push(...missingById(target.fixes, run.fixes));
  target.questions.push(...missingById(target.questions, run.questions));
  target.followups.push(...missingById(target.followups, run.followups));
  const tokens = target.tokens;
  tokens.points = [...run.tokens.points, ...tokens.points].sort((a, b) => time(a.at) - time(b.at));
  tokens.marks = [...run.tokens.marks, ...tokens.marks].sort((a, b) => time(a.at) - time(b.at));
  addCounts(tokens.total, run.tokens.total);
  for (const [stage, counts] of Object.entries(run.tokens.byStage)) {
    const key = stage;
    if (counts) {
      addCounts(tokens.byStage[key] ?? (tokens.byStage[key] = emptyCounts()), counts);
    }
  }
  target.costUsd += run.costUsd;
  if (pastBuild(target)) {
    passBuild(target, time(run.lastEventAt) > time(target.lastEventAt) ? run.lastEventAt : target.lastEventAt);
  }
};
var remapRunKeys = (entries, oldId, newId) => {
  for (const key of Object.keys(entries)) {
    if (key.startsWith(`${oldId}/`)) {
      const next = `${newId}${key.slice(oldId.length)}`;
      entries[next] = entries[next] ?? entries[key];
      delete entries[key];
    }
  }
};
var renameRun = (state, oldId, newId, config) => {
  const run = state.board.runs[oldId];
  const target = state.board.runs[newId];
  delete state.board.runs[oldId];
  if (target) {
    mergeRun(target, run);
  } else {
    const worktree = ownValue(state.index.worktrees, run.worktree) ? run.worktree : findWorktree(state, run.worktree) ?? run.worktree;
    run.id = newId;
    run.worktree = worktree;
    run.branch = ownValue(state.index.worktrees, worktree)?.branch ?? run.branch;
    applyBranchKey(run, config);
    state.board.runs[newId] = run;
  }
  const remap = (id) => id === oldId ? newId : id;
  for (const session of Object.values(state.index.sessions)) {
    session.runIds = [...new Set(session.runIds.map(remap))];
  }
  for (const spawn2 of Object.values(state.index.spawns)) {
    spawn2.runId = remap(spawn2.runId);
  }
  for (const [agentId, runId] of Object.entries(state.index.agentRuns)) {
    state.index.agentRuns[agentId] = remap(runId);
  }
  for (const call of Object.values(state.index.calls)) {
    call.runId = remap(call.runId);
    if (call.join !== void 0) {
      call.join = remap(call.join);
    }
  }
  for (const request of Object.values(state.index.requests)) {
    request.runId = remap(request.runId);
  }
  remapRunKeys(state.index.fullRuns, oldId, newId);
  remapRunKeys(state.index.warned, oldId, newId);
  moveBranchWork(state, oldId, newId);
};
var onWorktreeFact = (state, data, config) => {
  const path = normalizePath(data.worktree);
  const record = ownEntry(state.index.worktrees, path, () => ({ path }));
  const unknown = [path];
  for (const other of Object.keys(state.index.worktrees)) {
    if (other !== path && isInside2(other, path) && !state.index.worktrees[other].branch) {
      unknown.push(other);
      delete state.index.worktrees[other];
    }
  }
  const hadBranch = record.branch !== void 0;
  record.branch = data.branch;
  delete record.removedAt;
  for (const session of Object.values(state.index.sessions)) {
    for (const [agentKey, worktree] of Object.entries(session.agentWorktrees)) {
      if (unknown.includes(worktree)) {
        session.agentWorktrees[agentKey] = path;
      }
    }
  }
  if (hadBranch) {
    return;
  }
  const newId = runIdFor(state, path);
  for (const worktree of unknown) {
    const oldId = `${baseName(worktree)}:?`;
    if (state.board.runs[oldId]) {
      renameRun(state, oldId, newId, config);
    }
  }
};
var eventPaths = (session, event) => {
  let input;
  if (event.event === "tool.pre" || event.event === "permission") {
    input = event.data.input;
  }
  if (event.event === "cwd") {
    return [normalizePath(event.data.to)];
  }
  if (!input) {
    return [];
  }
  const cds = event.event === "tool.pre" && event.data.tool === "Bash" ? bashSteps(session, event).flatMap((step) => step.cd && step.cwd ? [step.cwd] : []) : [];
  const paths = [input.filePath, input.path, ...input.paths ?? [], ...findAbsolutePaths(input.command ?? ""), ...cds];
  return paths.filter((path) => typeof path === "string" && isAbsolute2(path)).map(normalizePath);
};
var worktreeFromPaths = (state, paths, config) => {
  const counts = /* @__PURE__ */ new Map();
  for (const path of paths) {
    const worktree = findWorktree(state, path, true);
    if (worktree) {
      counts.set(worktree, (counts.get(worktree) ?? 0) + 1);
    }
  }
  let best;
  let bestScore = -1;
  for (const [worktree, count] of counts) {
    const branch = ownValue(state.index.worktrees, worktree)?.branch;
    const score = count + (branch && !isTrunkLike(branch, config) ? 1e3 : 0);
    if (score > bestScore) {
      best = worktree;
      bestScore = score;
    }
  }
  return best;
};
var resolveFrom = (base, path) => {
  if (path === "~") {
    return path;
  }
  if (isAbsolute2(path)) {
    return normalizePath(path);
  }
  return base === void 0 ? void 0 : resolvePath(base, path);
};
var PREFIX_WORD = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*|command)$/;
var stepsOfLine = /* @__PURE__ */ new WeakMap();
var bashSteps = (session, event) => {
  const command = event.data.input.command ?? "";
  const base = event.cwd ? normalizePath(event.cwd) : session.cwd;
  const known = stepsOfLine.get(event);
  if (known !== void 0 && known.command === command && known.base === base) {
    return known.steps;
  }
  const steps = Object.freeze(splitSteps(command, base));
  stepsOfLine.set(event, { command, base, steps });
  return steps;
};
var splitSteps = (command, base) => {
  const cwds = [base];
  const steps = [];
  for (const segment of shellSegments(command)) {
    cwds.length = Math.min(cwds.length, segment.depth + 1);
    while (cwds.length <= segment.depth) {
      cwds.push(cwds[cwds.length - 1]);
    }
    const words = shellWords(segment);
    while (words.length > 0 && PREFIX_WORD.test(words[0])) {
      words.shift();
    }
    const cd = words[0] === "cd" && words.length === 2;
    if (cd) {
      const target = cdTarget(words[1]);
      cwds[segment.depth] = target === void 0 ? void 0 : resolveFrom(cwds[segment.depth], target);
    }
    steps.push(Object.freeze({ words: Object.freeze(words), cwd: cwds[segment.depth], cd }));
  }
  return steps;
};
var REBASE_CONTROL = /* @__PURE__ */ new Set(["--abort", "--quit", "--skip", "--edit-todo"]);
var gitArgs = (words) => {
  const start = words.findIndex((word) => !PREFIX_WORD.test(word));
  if (start < 0 || !/(?:^|\/)git$/.test(words[start])) {
    return void 0;
  }
  let at = start + 1;
  while (at < words.length && words[at].startsWith("-")) {
    at += words[at] === "-C" || words[at] === "-c" ? 2 : 1;
  }
  return words.slice(at);
};
var runsRebase = (command) => shellSegments(command).some((segment) => {
  const args = gitArgs(shellWords(segment));
  return args?.[0] === "rebase" && !args.slice(1).some((word) => REBASE_CONTROL.has(word));
});
var GIT_WORK = /* @__PURE__ */ new Set(["commit", "rebase", "merge", "cherry-pick", "push"]);
var runsGitWork = (command) => shellSegments(command).some((segment) => {
  const args = gitArgs(shellWords(segment));
  return args !== void 0 && GIT_WORK.has(args[0]) && !args.slice(1).some((word) => REBASE_CONTROL.has(word));
});
var READ_COMMANDS = /* @__PURE__ */ new Set([
  "cd",
  "pwd",
  "ls",
  "cat",
  "head",
  "tail",
  "less",
  "grep",
  "egrep",
  "rg",
  "find",
  "fd",
  "wc",
  "sort",
  "uniq",
  "cut",
  "tr",
  "diff",
  "echo",
  "printf",
  "tree",
  "stat",
  "file",
  "which",
  "type",
  "du",
  "df",
  "jq",
  "sed",
  "true",
  "test",
  "date",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "nl",
  "column"
]);
var WRITING_OPTIONS = {
  find: /^-(?:delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/,
  fd: /^(?:-x|-X|--exec|--exec-batch)(?:=|$)/,
  sort: /^(?:-o|--output)/
};
var sedWrites = (args) => args.some((word) => /^-[a-zA-Z]*i|^--in-place/.test(word) || /(?:^|[\s;{}/0-9$'"])w\s+\S/.test(word));
var GIT_READS = /* @__PURE__ */ new Set([
  "status",
  "log",
  "diff",
  "show",
  "blame",
  "grep",
  "ls-files",
  "ls-tree",
  "rev-parse",
  "rev-list",
  "describe",
  "shortlog",
  "reflog",
  "cat-file",
  "merge-base",
  "show-ref",
  "name-rev",
  "fetch",
  "for-each-ref",
  "ls-remote"
]);
var BRANCH_LISTS = /* @__PURE__ */ new Set(["--show-current", "--list", "-a", "--all", "-r", "--remotes", "-v", "-vv"]);
var CONFIG_READS = /* @__PURE__ */ new Set(["--get", "--get-all", "--get-regexp", "--list", "-l"]);
var GIT_READ_FORMS = {
  branch: (args) => args.every((word) => BRANCH_LISTS.has(word)),
  worktree: (args) => args[0] === "list",
  remote: (args) => args.every((word) => word === "-v" || word === "--verbose"),
  stash: (args) => args[0] === "list",
  tag: (args) => args.some((word) => word === "-l" || word === "--list"),
  config: (args) => args.some((word) => CONFIG_READS.has(word))
};
var GH_READS = {
  pr: /* @__PURE__ */ new Set(["view", "list", "diff", "checks", "status"]),
  run: /* @__PURE__ */ new Set(["view", "list"]),
  issue: /* @__PURE__ */ new Set(["view", "list"])
};
var gitReads = (args) => {
  const [sub, ...rest] = args;
  if (sub === void 0) {
    return false;
  }
  return GIT_READS.has(sub) || Object.hasOwn(GIT_READ_FORMS, sub) && GIT_READ_FORMS[sub](rest);
};
var ghReads = (args) => {
  const [group, sub] = args;
  return group !== void 0 && sub !== void 0 && Object.hasOwn(GH_READS, group) && GH_READS[group].has(sub);
};
var writesFile = (code) => code.replace(/\d*>>?\s*\/dev\/null|&>>?\s*\/dev\/null|\d*>&\d+/g, "").includes(">");
var readsOnlyWords = (words) => {
  const at = words.findIndex((word) => !PREFIX_WORD.test(word));
  if (at < 0) {
    return true;
  }
  const git = gitArgs(words);
  if (git) {
    return gitReads(git);
  }
  const command = words[at];
  const args = words.slice(at + 1);
  if (command === "gh") {
    return ghReads(args);
  }
  const writingOption = Object.hasOwn(WRITING_OPTIONS, command) && args.some((word) => WRITING_OPTIONS[command].test(word));
  const writingScript = command === "sed" && sedWrites(args);
  return READ_COMMANDS.has(command) && !writingOption && !writingScript;
};
var LONE_AMPERSAND = /(?<![>&])&(?![&>])/g;
var backgroundParts = (segment) => {
  const parts = [];
  let start = 0;
  for (const match of segment.code.matchAll(LONE_AMPERSAND)) {
    parts.push({ text: segment.text.slice(start, match.index), code: segment.code.slice(start, match.index), depth: segment.depth });
    start = match.index + 1;
  }
  parts.push({ text: segment.text.slice(start), code: segment.code.slice(start), depth: segment.depth });
  return parts;
};
var readsOnly = (command) => {
  const segments = shellSegments(command).flatMap(backgroundParts);
  return segments.every((segment) => !writesFile(segment.code) && readsOnlyWords(shellWords(segment)));
};
var worktreeAddOf = (session, event) => worktreeAddIn(bashSteps(session, event));
var worktreeAddOfCommand = (command, cwd) => worktreeAddIn(splitSteps(command, cwd ? normalizePath(cwd) : void 0));
var worktreeAddIn = (steps) => {
  for (const { words, cwd, cd } of steps) {
    if (cd) {
      continue;
    }
    const at = words.findIndex((word) => /(?:^|\/)git$/.test(word));
    const directory = at >= 0 && words[at + 1] === "-C" ? words[at + 2] : void 0;
    const sub = at + (directory === void 0 ? 1 : 3);
    if (at >= 0 && words[sub] === "worktree" && words[sub + 1] === "add") {
      return worktreeAddFrom(words.slice(sub + 2), directory, cwd);
    }
  }
  return void 0;
};
var addBase = (word, branch) => {
  const base = word?.replace(/^origin\//, "");
  const none = base === void 0 || base === "HEAD" || base === "@" || /^[0-9a-f]{7,40}$/i.test(base);
  return none || base === branch ? void 0 : base;
};
var worktreeAddFrom = (args, directoryWord, cwd) => {
  const positional = [];
  let branch;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "-b" || args[i] === "-B") {
      branch = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith("-")) {
      positional.push(args[i]);
    }
  }
  const target = literalWord(positional[0]);
  const directory = directoryWord === void 0 ? "." : literalWord(directoryWord);
  if (!target || !directory) {
    return void 0;
  }
  const path = resolveFrom(resolveFrom(cwd, directory), target);
  const named = literalWord(branch);
  const base = branch === void 0 ? void 0 : addBase(literalWord(positional[1]), named);
  return path ? { path, branch: named, base } : void 0;
};
var registerWorktreeAdd = (state, event, add, agentKey, config) => {
  const record = ownEntry(state.index.worktrees, add.path, () => ({ path: add.path }));
  record.branch = record.removedAt !== void 0 && add.branch !== void 0 ? add.branch : record.branch ?? add.branch;
  delete record.removedAt;
  record.base = add.base;
  record.forkAt = event.at;
  ensureSession(state, event).agentWorktrees[agentKey] = add.path;
  const run = ensureRun(state, add.path, event, config);
  run.fork = { at: event.at, base: record.base ?? config.branches.trunk, sha: record.forkSha };
  return run;
};
var branchRun = (state, branch) => {
  const runs = Object.values(state.board.runs).filter((run) => run.branch === branch);
  const current = runs.filter((run) => !ownValue(state.index.worktrees, run.worktree)?.removedAt && runIdFor(state, run.worktree) === run.id);
  const pool = current.length > 0 ? current : runs;
  return pool.sort((a, b) => time(b.lastActiveAt) - time(a.lastActiveAt) || compareText(a.id, b.id))[0];
};
var namesPath = (entry, path) => entry.startsWith(path) && /^[.,)-]*$/.test(entry.slice(path.length));
var mentionsPath = (text, path) => {
  for (let at = text.indexOf(path); at >= 0; at = text.indexOf(path, at + 1)) {
    const before = text[at - 1] ?? " ";
    const after = text[at + path.length] ?? " ";
    if (!/[\w./-]/.test(before) && !/[\w./-]/.test(after)) {
      return true;
    }
  }
  return false;
};
var diffPathRun = (state, event) => {
  if (event.event !== "tool.pre" && event.event !== "permission" || event.data.tool !== "Agent" && event.data.tool !== "Task") {
    return void 0;
  }
  const prompt = event.data.input.prompt ?? "";
  const paths = event.data.input.paths ?? [];
  const named = (path) => {
    const absolute = path !== void 0 && isAbsolute2(path);
    return absolute && (paths.some((entry) => namesPath(entry, path)) || mentionsPath(prompt, path));
  };
  const ownJoins = (run) => run.joins.filter((join4) => join4.sessionId === event.sessionId && named(join4.diffPath));
  const candidates = Object.values(state.board.runs).flatMap((run) => ownJoins(run).map((join4) => ({ run, at: time(join4.at) })));
  candidates.sort((a, b) => b.at - a.at || compareText(a.run.id, b.run.id));
  const live = (run) => !ownValue(state.index.worktrees, run.worktree)?.removedAt && runIdFor(state, run.worktree) === run.id;
  return candidates.find((candidate) => live(candidate.run))?.run;
};
var hookRun = (state, event, config) => {
  const session = ensureSession(state, event);
  const reviewed = diffPathRun(state, event);
  if (reviewed) {
    return ensureRun(state, reviewed.worktree, event, config);
  }
  const agentKey = event.agentId ?? "main";
  const fromPaths = worktreeFromPaths(state, eventPaths(session, event), config);
  const last = session.agentWorktrees[agentKey];
  const lastBranch = last ? ownValue(state.index.worktrees, last)?.branch : void 0;
  const fromPathsBranch = fromPaths ? ownValue(state.index.worktrees, fromPaths)?.branch : void 0;
  const staysInFeature = fromPathsBranch !== void 0 && isTrunkLike(fromPathsBranch, config) && lastBranch !== void 0 && !isTrunkLike(lastBranch, config);
  let worktree = staysInFeature ? last : fromPaths;
  if (!worktree && event.agentId) {
    const runId = state.index.agentRuns[event.agentId];
    const run = runId ? state.board.runs[runId] : void 0;
    if (run) {
      ensureRun(state, run.worktree, event, config);
      return run;
    }
  }
  worktree = worktree ?? session.agentWorktrees[agentKey] ?? (event.agentId ? session.agentWorktrees.main : void 0);
  worktree = worktree ?? findWorktree(state, normalizePath(event.cwd), true) ?? findWorktree(state, session.startCwd);
  if (!worktree) {
    worktree = session.startCwd;
    ownEntry(state.index.worktrees, worktree, () => ({ path: session.startCwd }));
  }
  session.agentWorktrees[agentKey] = worktree;
  return ensureRun(state, worktree, event, config);
};
var markerRun = (state, event, config) => {
  const ref = event.data.run;
  if (ref === void 0 && event.src === "hook") {
    return event.agentId ? hookRun(state, event, config) : homeRun(state, event, config);
  }
  if (ref === void 0) {
    warn(state, event.at, `${event.event} marker: no run ref`);
    return void 0;
  }
  if (Object.hasOwn(state.board.runs, ref)) {
    return state.board.runs[ref];
  }
  let matches = Object.values(state.board.runs).filter((run) => run.id.includes(ref));
  if (matches.length > 1) {
    matches = matches.filter((run) => run.pr?.state !== "merged" && run.branch !== "?");
  }
  if (matches.length === 1) {
    return matches[0];
  }
  warn(state, event.at, `${event.event} marker: ${matches.length === 0 ? "unknown" : "ambiguous"} run ref "${ref}"`);
  return void 0;
};

// src/model/activity.ts
var STALE_AGENT_MS = 30 * 60 * 1e3;
var GONE_SESSION_MS = 12 * 60 * 60 * 1e3;
var later = (at, than) => than === void 0 || time(at) > time(than);
var holdsRun = (state, session, run) => {
  if (isTrunkBranch(state, run.branch)) {
    return true;
  }
  return hasBranchWork(session, run.id);
};
var endRun = (state, session, run, at) => {
  if (run.pr?.state === "merged" || run.removedAt !== void 0) {
    return false;
  }
  const others = Object.values(state.index.sessions).filter((other) => other !== session && other.runIds.includes(run.id));
  if (others.some((other) => other.endedAt === void 0 && holdsRun(state, other, run))) {
    return false;
  }
  const ends = others.map((other) => other.endedAt);
  run.endedAt = ends.reduce((latest, end) => end !== void 0 && later(end, latest) ? end : latest, at);
  return true;
};
var endSession = (state, session, landed, at) => {
  const others = session.runIds.map((id) => state.board.runs[id]).filter((run) => run !== void 0 && run !== landed);
  const withMain = others.filter((run) => Object.hasOwn(run.agents, "main"));
  const ending = landed ? [landed, ...withMain] : withMain;
  return ending.filter((run) => endRun(state, session, run, at));
};
var wakeAgent = (state, agentId) => {
  if (!state.index.staleAgents[agentId]) {
    return [];
  }
  delete state.index.staleAgents[agentId];
  const woken = [];
  for (const run of Object.values(state.board.runs)) {
    const agent = Object.hasOwn(run.agents, agentId) ? run.agents[agentId] : void 0;
    if (agent?.staleSince) {
      delete agent.staleSince;
      woken.push(run);
    }
  }
  return woken;
};
var noteActivity = (state, event) => {
  if (event.src === "server") {
    return [];
  }
  const session = event.sessionId ? state.index.sessions[event.sessionId] : void 0;
  if (session && later(event.at, session.lastEventAt)) {
    session.lastEventAt = event.at;
  }
  if (session && event.event === "session.end") {
    session.endedAt = event.at;
    delete session.goneAt;
  } else if (session?.endedAt && time(event.at) >= time(session.endedAt)) {
    delete session.endedAt;
    delete session.goneAt;
  }
  const agentId = event.agentId;
  if (!agentId) {
    return [];
  }
  if (later(event.at, state.index.agentSeen[agentId])) {
    state.index.agentSeen[agentId] = event.at;
  }
  return wakeAgent(state, agentId);
};
var sessionEndRun = (state, session) => {
  const worktree = session.agentWorktrees.main;
  const run = worktree ? state.board.runs[runIdFor(state, worktree)] : void 0;
  return run ?? existingHomeRun(state, session);
};
var endGoneSessions = (state, now) => {
  const changed = /* @__PURE__ */ new Set();
  for (const [sessionId, session] of Object.entries(state.index.sessions)) {
    const last = session.lastEventAt;
    if (session.endedAt || last === void 0 || time(now) - time(last) < GONE_SESSION_MS) {
      continue;
    }
    session.endedAt = last;
    session.goneAt = now;
    for (const run of endSession(state, session, sessionEndRun(state, session), last)) {
      changed.add(run);
    }
    const line = { at: last, sessionId };
    for (const other of [...closeRunPermissions(state, session, line, true), ...handleHandbacks(state, session, line)]) {
      changed.add(other);
    }
  }
  return changed;
};
var mayGoStale = (agent) => {
  const active = agent.id !== "main" && agent.state === "running" && agent.endedAt === void 0 && agent.staleSince === void 0;
  return active && !agent.recent.some((call) => call.permission === "waiting" && call.endedAt === void 0);
};
var markStaleAgents = (state, now, changed) => {
  for (const run of Object.values(state.board.runs)) {
    for (const agent of Object.values(run.agents)) {
      const seen = state.index.agentSeen[agent.id] ?? agent.startedAt;
      if (mayGoStale(agent) && time(now) - time(seen) >= STALE_AGENT_MS) {
        agent.staleSince = now;
        state.index.staleAgents[agent.id] = true;
        changed.add(run);
      }
    }
  }
};
var onActivityTick = (state, now) => {
  const changed = endGoneSessions(state, now);
  markStaleAgents(state, now, changed);
  return [...changed];
};
var staysRemoved = (state, run) => {
  const record = ownValue(state.index.worktrees, run.worktree);
  return run.removedAt !== void 0 && (record === void 0 || record.removedAt !== void 0);
};
var settleRemovedRun = (run, branch, at) => {
  const end = later(at, run.lastEventAt) ? run.lastEventAt : at;
  run.removedAt = at;
  run.endedAt = run.endedAt ?? end;
  for (const agent of Object.values(run.agents)) {
    closePermissions(run, agent, factStamp(end), "unanswered");
  }
  expireOpenQuestions(run, factStamp(end), "worktree removed");
  logRun(run, factStamp(at), `Worktree and branch ${branch} removed`, "done");
};
var settleRemovalOfClosedPr = (state, run) => {
  const record = ownValue(state.index.worktrees, run.worktree);
  if (run.removedAt === void 0 && record?.removedAt !== void 0 && record.branch === run.branch) {
    settleRemovedRun(run, run.branch, record.removedAt);
  }
};
var onWorktreeRemoved = (state, data, at) => {
  const path = normalizePath(data.worktree);
  const record = ownValue(state.index.worktrees, path);
  if (record?.branch !== data.branch) {
    warn(state, at, `Ignored the removal of ${path}: no known worktree there on ${data.branch}`);
    return [];
  }
  if (record.removedAt !== void 0) {
    return [];
  }
  record.removedAt = at;
  for (const session of Object.values(state.index.sessions)) {
    for (const [agentKey, worktree] of Object.entries(session.agentWorktrees)) {
      if (worktree === path) {
        delete session.agentWorktrees[agentKey];
      }
    }
  }
  const run = state.board.runs[runIdFor(state, path)];
  if (!run || run.pr?.state === "open" || run.pr?.state === "merged") {
    return [];
  }
  settleRemovedRun(run, data.branch, at);
  return [run];
};

// src/model/github.ts
var prFromUrl = (text) => {
  const match = /\/pull\/(\d+)/.exec(text);
  return match ? Number(match[1]) : void 0;
};
var mergeWaits = (config) => config.github.mergeBy !== "agent";
var openPr = (run, pr, line, config) => {
  const { at } = line;
  if (!run.pr) {
    run.pr = { ...pr, state: "open", promotions: [] };
    logRun(run, line, `PR #${pr.number} opened`, "normal");
  }
  if (pr.title) {
    run.pr.title = pr.title;
    run.title = pr.title;
  }
  run.pr.url = pr.url || run.pr.url;
  if (run.stages.pr.state === "pending") {
    setStage(run, "pr", "running", at);
  }
  setStage(run, "pr", "done", at);
  if (run.pr.state === "open" && mergeWaits(config)) {
    setGate(run, "merge", "waiting", line, "derived");
  }
};
var OPENER_BEFORE_MS = 2 * 6e4;
var OPENER_AFTER_MS = 10 * 6e4;
var openedByCall = (pr, opener) => {
  if (opener.number !== void 0) {
    return opener.number === pr.number;
  }
  const offset = time(pr.createdAt) - opener.atMs;
  return offset >= -OPENER_BEFORE_MS && offset <= OPENER_AFTER_MS;
};
var applyOpener = (state, run) => {
  const opener = ownValue(state.index.prOpeners, run.branch);
  if (run.pr && !run.pr.openedBy && opener && openedByCall(run.pr, opener)) {
    run.pr.openedBy = { agentId: opener.agentId, sessionId: opener.sessionId };
  }
};
var notePrOpener = (state, branch, opener) => {
  if (branch === "__proto__") {
    return;
  }
  state.index.prOpeners[branch] = opener;
  for (const run of Object.values(state.board.runs).filter((item) => item.branch === branch)) {
    applyOpener(state, run);
  }
};
var noteClosed = (current, pr, at) => {
  if (pr.state === "OPEN") {
    delete current.closedAt;
  } else if (!current.closedAt && pr.closedAt) {
    current.closedAt = pr.closedAt;
  } else if (!current.closedAt && pr.state === "CLOSED") {
    current.closedAt = at;
  }
};
var onTrunkPr = (state, pr, at, config) => {
  const runs = Object.values(state.board.runs).filter((run) => run.branch === pr.headRefName);
  for (const run of runs) {
    openPr(run, { number: pr.number, url: pr.url, title: pr.title, createdAt: pr.createdAt }, factStamp(at), config);
    applyOpener(state, run);
    const current = run.pr;
    if (pr.state === "MERGED" && current.state !== "merged") {
      const mergedAt = pr.mergedAt ?? at;
      current.state = "merged";
      current.mergedAt = mergedAt;
      setGate(run, "merge", "done", factStamp(mergedAt), run.gates.merge.source);
      setStage(run, "merge", "done", mergedAt);
      run.endedAt = mergedAt;
      expireOpenQuestions(run, factStamp(mergedAt), "merged");
      logRun(run, factStamp(mergedAt), `PR #${pr.number} merged into ${pr.baseRefName}`, "done");
    } else if (pr.state === "CLOSED" && current.state === "open") {
      current.state = "closed";
      setGate(run, "merge", "pending", factStamp(at), run.gates.merge.source);
      logRun(run, factStamp(at), `PR #${pr.number} closed without merging`, "warn");
      settleRemovalOfClosedPr(state, run);
    } else if (pr.state === "OPEN" && current.state === "closed") {
      current.state = "open";
      if (mergeWaits(config)) {
        setGate(run, "merge", "waiting", factStamp(at), "derived");
      }
      logRun(run, factStamp(at), `PR #${pr.number} reopened`, "normal");
    }
    if (current.number === pr.number) {
      noteClosed(current, pr, at);
    }
  }
  if (pr.state === "MERGED") {
    const merges = state.board.branches.merges;
    if (!merges.some((dot) => dot.prNumber === pr.number)) {
      const keyRun = runs.find((run) => run.key);
      const dot = { branch: pr.headRefName, prNumber: pr.number, mergedAt: pr.mergedAt ?? at, runIds: runs.map((run) => run.id) };
      merges.push(keyRun?.key ? { ...dot, key: keyRun.key } : dot);
    }
    for (const lane of state.board.branches.lanes) {
      if (lane.branch === pr.headRefName) {
        lane.mergedAt = pr.mergedAt ?? at;
      }
    }
  }
};
var promoteCarries = (state, pr, config) => {
  const named = [...(pr.body ?? "").matchAll(/(?:^|[^\w&])#(\d+)\b/g)].map((match) => Number(match[1]));
  if (named.length > 0) {
    return [...new Set(named)];
  }
  const carriedBefore = new Set(state.board.branches.promotions.filter((promotion) => promotion.target === pr.baseRefName).flatMap((promotion) => promotion.carries));
  return Object.values(state.index.prs).filter((item) => item.baseRefName === config.branches.trunk && item.state === "MERGED" && item.mergedAt && time(item.mergedAt) < time(pr.createdAt) && !carriedBefore.has(item.number)).map((item) => item.number);
};
var isPromotePr = (pr, config) => {
  const prefix = ownValue(config.github.promoteTitlePrefix, pr.baseRefName);
  return config.branches.promote.includes(pr.baseRefName) && prefix !== void 0 && prefix !== "" && pr.title.startsWith(prefix);
};
var carriedByOtherOpenPromotes = (state, prNumber, config) => {
  const others = Object.values(state.index.prs).filter((item) => item.number !== prNumber && item.state === "OPEN" && isPromotePr(item, config));
  return new Set(others.flatMap((item) => promoteCarries(state, item, config)));
};
var onPromoteClosed = (state, pr, runs, at, config) => {
  const stillCarried = carriedByOtherOpenPromotes(state, pr.number, config);
  for (const run of runs) {
    const gate = run.gates.promote;
    if (!run.pr || stillCarried.has(run.pr.number) || gate.state !== "waiting" || gate.source !== "derived") {
      continue;
    }
    setGate(run, "promote", "pending", factStamp(at), "derived");
    logRun(run, factStamp(at), `Promote PR #${pr.number} closed unmerged`, "warn");
  }
};
var onPromotePr = (state, pr, at, config) => {
  const carries = promoteCarries(state, pr, config);
  const runs = Object.values(state.board.runs).filter((run) => run.pr && carries.includes(run.pr.number));
  if (pr.state === "OPEN") {
    for (const run of runs) {
      setGate(run, "promote", "waiting", factStamp(at), "derived");
    }
    return;
  }
  if (pr.state === "CLOSED") {
    onPromoteClosed(state, pr, runs, at, config);
    return;
  }
  if (pr.state !== "MERGED") {
    return;
  }
  const mergedAt = pr.mergedAt ?? at;
  const promotions = state.board.branches.promotions;
  if (promotions.some((promotion) => promotion.prNumber === pr.number)) {
    return;
  }
  promotions.push({ target: pr.baseRefName, prNumber: pr.number, title: pr.title, mergedAt, carries });
  for (const run of runs) {
    run.pr.promotions.push({ target: pr.baseRefName, prNumber: pr.number, mergedAt });
    setGate(run, "promote", "done", factStamp(mergedAt), run.gates.promote.source);
    setStage(run, "promote", "done", mergedAt);
    if (run.stages.docs.state === "pending" && run.gates.docs.state === "pending") {
      setStage(run, "docs", "skipped", mergedAt);
      setGate(run, "docs", "skipped", factStamp(mergedAt), "derived");
    }
    logRun(run, factStamp(mergedAt), `Promoted to ${pr.baseRefName} (#${pr.number})`, "done");
  }
};
var onGitFact = (state, data, config) => {
  if (data.kind === "worktree") {
    onWorktreeFact(state, data, config);
    const path = normalizePath(data.worktree);
    const run = state.board.runs[runIdFor(state, path)];
    return run ? [run] : [];
  }
  const runs = Object.values(state.board.runs).filter((run) => run.branch === data.branch);
  if (data.kind === "fork") {
    for (const run of runs) {
      const record = ownValue(state.index.worktrees, run.worktree);
      const parent = record?.base !== void 0 && record.base !== run.branch ? record.base : void 0;
      const base = parent !== void 0 && data.base === config.branches.trunk ? parent : data.base;
      run.fork = { at: run.fork?.at ?? record?.forkAt ?? run.startedAt, base, sha: data.sha };
    }
  } else {
    for (const run of runs) {
      if (!run.pr && !run.plan?.note) {
        run.title = data.subject;
      }
    }
  }
  return runs;
};
var onGhFact = (state, event, config) => {
  const data = event.data;
  if (data.kind === "status") {
    const github = { polling: data.polling, accountOk: data.accountOk, checkedAt: event.at };
    if (data.activeAccount) {
      github.activeAccount = data.activeAccount;
    }
    if (data.error) {
      github.error = data.error;
    }
    if (data.repoMismatch) {
      github.repoMismatch = data.repoMismatch;
    }
    state.board.github = github;
    return [];
  }
  const pr = data.pr;
  state.index.prs[String(pr.number)] = pr;
  if (isPromotePr(pr, config)) {
    onPromotePr(state, pr, event.at, config);
    return Object.values(state.board.runs).filter((run) => run.pr !== void 0);
  }
  if (pr.baseRefName === config.branches.trunk) {
    onTrunkPr(state, pr, event.at, config);
  }
  return Object.values(state.board.runs).filter((run) => run.branch === pr.headRefName);
};

// src/model/markers.ts
var newestLine = (session) => time(session.lastEventAt ?? session.startedAt);
var markerStamp = (state, event, run) => {
  if (event.src === "hook") {
    return event;
  }
  const holding = Object.entries(state.index.sessions).filter(([, session]) => session.runIds.includes(run.id));
  const open = holding.filter(([, session]) => session.endedAt === void 0);
  const candidates = (open.length > 0 ? open : holding).sort(([, a], [, b]) => newestLine(b) - newestLine(a));
  const [first, second] = candidates;
  if (first === void 0) {
    warn(state, event.at, `${event.event} marker for ${run.id}: no session works in the run, so the marker belongs to none`);
    return factStamp(event.at);
  }
  if (second !== void 0 && newestLine(first[1]) === newestLine(second[1])) {
    warn(state, event.at, `${event.event} marker for ${run.id}: sessions ${first[0].slice(0, 8)} and ${second[0].slice(0, 8)} tie as the newest, so the marker belongs to none`);
    return factStamp(event.at);
  }
  return { at: event.at, sessionId: first[0] };
};
var renameStream = (run, stream, id) => {
  const old = stream.id;
  stream.id = id;
  for (const agent of Object.values(run.agents)) {
    agent.streamId = agent.streamId === old ? id : agent.streamId;
  }
  for (const fix of run.fixes) {
    fix.streamId = fix.streamId === old ? id : fix.streamId;
  }
  for (const item of run.streams) {
    item.after = item.after.map((after) => after === old ? id : after);
  }
  for (const question of run.questions) {
    if (question.node.kind === "stream" && question.node.id === old) {
      question.node = { kind: "stream", id };
    }
  }
};
var onPlan = (state, event, config) => {
  const run = markerRun(state, event, config);
  if (!run) {
    return void 0;
  }
  const streams = event.data.streams ?? [];
  if (!Array.isArray(streams) || streams.some((stream) => typeof stream.id !== "string" || typeof stream.package !== "string")) {
    warn(state, event.at, `plan marker for ${run.id}: every stream needs an id and a package`);
    return void 0;
  }
  run.plan = event.data.note ? { streams, note: event.data.note, at: event.at } : { streams, at: event.at };
  if (event.data.note && !run.pr?.title) {
    run.title = promptTitle(event.data.note, run.key);
  }
  const planIds = new Set(streams.map((stream) => stream.id));
  const kept = /* @__PURE__ */ new Set();
  for (const planned of streams) {
    let stream = run.streams.find((item) => item.id === planned.id);
    if (!stream) {
      stream = run.streams.find((item) => item.package === planned.package && !planIds.has(item.id) && !kept.has(item));
      if (stream) {
        renameStream(run, stream, planned.id);
      }
    }
    if (stream) {
      kept.add(stream);
      stream.planned = true;
      stream.after = [...planned.after ?? []];
      stream.model = planned.model ?? stream.model;
      if (stream.state === "skipped" && stream.agentIds.length === 0) {
        stream.state = "pending";
      }
    } else {
      const added = { id: planned.id, package: planned.package, state: "pending", after: [...planned.after ?? []], planned: true, addedAt: event.at, agentIds: [] };
      if (planned.model) {
        added.model = planned.model;
      }
      run.streams.push(added);
      kept.add(added);
    }
  }
  for (const stream of run.streams) {
    if (stream.planned && !kept.has(stream) && stream.agentIds.length === 0) {
      stream.state = "skipped";
    }
  }
  if (run.streams.some((stream) => stream.agentIds.length > 0)) {
    checkBuild(run, event.at);
  }
  const describe = streams.map((stream) => stream.after?.length ? `${stream.id} after ${stream.after.join(", ")}` : stream.id).join("; ");
  const line = markerStamp(state, event, run);
  noteMarker(state, event, line);
  logRun(run, line, `Plan: ${describe}`, "normal");
  return run;
};
var onGate = (state, event, config) => {
  const run = markerRun(state, event, config);
  if (!run) {
    return void 0;
  }
  const { state: gateState, note } = event.data;
  const gate = event.data.gate === "brief" ? "plan" : event.data.gate;
  if (!GATE_IDS.includes(gate) || !["waiting", "done", "skipped"].includes(gateState)) {
    warn(state, event.at, `gate marker for ${run.id}: unknown gate ${gate} or state ${gateState}`);
    return void 0;
  }
  const line = markerStamp(state, event, run);
  noteMarker(state, event, line);
  setGate(run, gate, gateState, line, "marker", note);
  const stage = GATE_STAGE[gate];
  if (gateState === "waiting" && FINAL_STATES.has(run.stages[stage].state)) {
    setStage(run, stage, "waiting", event.at);
  }
  if (gateState === "done" && gate !== "plan") {
    setStage(run, stage, "done", event.at);
  } else if (gateState === "skipped" && run.stages[stage].state === "pending") {
    setStage(run, stage, "skipped", event.at);
  }
  logRun(run, line, `${STAGE_LABELS[stage]} gate: ${gateState}${note ? ` (${note})` : ""}`, gateState === "waiting" ? "you" : "normal");
  return run;
};
var questionNode = (run, ref) => {
  if (!ref) {
    return { kind: "stage", id: currentStage(run) };
  }
  if (run.streams.some((stream) => stream.id === ref)) {
    return { kind: "stream", id: ref };
  }
  if (run.reviewers.some((reviewer) => reviewer.id === ref)) {
    return { kind: "reviewer", id: ref };
  }
  if (run.fixes.some((fix) => fix.id === ref)) {
    return { kind: "fix", id: ref };
  }
  const id = ref === "brief" ? "plan" : ref;
  if (GATE_IDS.includes(id)) {
    return { kind: "gate", id };
  }
  return { kind: "stage", id: STAGE_ORDER.includes(id) ? id : currentStage(run) };
};
var markerSession = (state, event, run) => {
  if (event.sessionId) {
    return event.agentId ? void 0 : state.index.sessions[event.sessionId];
  }
  const receiving = run.sessionIds.map((id) => state.index.sessions[id]).filter((session) => (session?.handbacks ?? []).length > 0);
  return receiving.length === 1 ? receiving[0] : void 0;
};
var onQuestion = (state, event, config, touched = []) => {
  const run = markerRun(state, event, config);
  if (!run) {
    return void 0;
  }
  const marker = event.data;
  if ("answers" in marker) {
    const question2 = run.questions.find((item) => item.id === marker.answers);
    if (!question2) {
      warn(state, event.at, `question marker for ${run.id}: unknown question ${marker.answers}`);
      return void 0;
    }
    if (question2.state === "open") {
      const line2 = markerStamp(state, event, run);
      noteMarker(state, event, line2);
      closeQuestion(run, question2, "answered", line2, "terminal");
    }
    return run;
  }
  const data = marker;
  if (!data.id || !data.text) {
    warn(state, event.at, `question marker for ${run.id}: id and text are required`);
    return void 0;
  }
  if (run.questions.some((existing) => existing.id === data.id)) {
    return run;
  }
  const line = markerStamp(state, event, run);
  noteMarker(state, event, line);
  const source = { agentId: "main", role: "main" };
  const node = questionNode(run, data.node);
  const question = { id: data.id, text: data.text, blocking: data.blocking === true, options: data.options ?? [], origin: "marker", source, node, sessionId: line.sessionId, createdAt: event.at };
  const relayed = relayedQuestion(state, markerSession(state, event, run), data.text, data.relays, event.at);
  if (relayed) {
    question.relays = relayQuestion(relayed, line);
    touched.push(relayed.run);
  }
  addQuestion(run, data.context ? { ...question, context: data.context } : question);
  return run;
};

// src/model/messages.ts
var isOpenMainAsk = (question) => {
  const asked = question.origin === "marker" || question.origin === "ask-tool";
  return asked && question.state === "open" && question.audience === "user" && question.source.agentId === "main";
};
var within = (at, from, to) => at !== void 0 && time(at) >= from && time(at) <= to;
var sessionRuns2 = (state, session) => session.runIds.map((id) => state.board.runs[id]).filter((run) => run !== void 0);
var kindOf = (asks, planned) => {
  if (asks) {
    return "ask";
  }
  return planned ? "plan" : "update";
};
var byTime = (a, b) => time(a.at) - time(b.at) || Number(a.id > b.id) - Number(a.id < b.id);
var addSessionMessage = (session, runs, message, from, to) => {
  const own = (sessionId) => sessionId === message.sessionId;
  const asks = runs.some((item) => item.questions.some((question) => own(question.sessionId) && isOpenMainAsk(question) && within(question.createdAt, from, to)));
  const waits = runs.some((item) => Object.values(item.gates).some((gate) => own(gate.sessionId) && gate.state === "waiting" && within(gate.waitingSince, from, to)));
  const planned = session.plans.some((plan) => within(plan.at, from, to));
  const copy = { ...message, kind: kindOf(asks || waits, planned) };
  session.messages = keepMessages([...session.messages.filter((item) => item.id !== copy.id), copy].sort(byTime));
};
var addMainMessage = (state, event, run) => {
  const session = state.index.sessions[event.sessionId];
  if (event.agentId || !session || event.data.lastMessage.trim() === "") {
    return;
  }
  const home = existingHomeRun(state, session) ?? run;
  const turnStartedAt = session.turnStartedAt ?? event.at;
  const from = time(turnStartedAt);
  const to = time(event.at);
  const runs = sessionRuns2(state, session);
  const asks = runs.flatMap((item) => item.questions.filter((question) => isOpenMainAsk(question) && within(question.createdAt, from, to)));
  const waits = runs.some((item) => Object.values(item.gates).some((gate) => gate.state === "waiting" && within(gate.waitingSince, from, to)));
  const planned = runs.some((item) => within(item.plan?.at, from, to));
  const kind = kindOf(waits || asks.length > 0, planned);
  const text = event.data.lastMessage;
  const truncated = event.data.lastMessageTruncated === true;
  const message = { id: event.id, sessionId: event.sessionId, turnStartedAt, at: event.at, text, truncated, kind };
  home.messages = keepMessages([...home.messages, message]);
  addSessionMessage(session, runs, message, from, to);
  for (const question of asks) {
    question.messageId = message.id;
  }
};

// src/model/overhead.ts
var OVERHEAD_CHARS_PER_TOKEN = 3;
var LISTING_CHARS = 513;
var TOOL_DEFINITION_CHARS = { plan: 1088, gate: 644, question: 1071 };
var SKILL_BODY_CHARS = 7593;
var SKILL_NAMES = /* @__PURE__ */ new Set(["nurselog", "nurselog:nurselog"]);
var MAIN = "main";
var OVERHEAD_PART_KEYS = ["markers", "reportParagraph", "listing", "toolDefinitions", "markerCalls", "reportBlocks", "skill"];
var isRate = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
var ratesOf = (data) => {
  const rates = data.rates;
  if (typeof rates !== "object" || rates === null) {
    return void 0;
  }
  const { cacheRead, output } = rates;
  return isRate(cacheRead) && isRate(output) ? { cacheRead, output } : void 0;
};
var addPart = (overhead, key, tokens, usd) => {
  if (tokens <= 0) {
    return;
  }
  const part = overhead.parts[key] ?? (overhead.parts[key] = { tokens: 0, usd: 0 });
  part.tokens += tokens;
  part.usd += usd;
  overhead.tokens += tokens;
  overhead.usd += usd;
};
var addWritten = (overhead, context, key, chars) => {
  const tokens = chars / OVERHEAD_CHARS_PER_TOKEN;
  addPart(overhead, key, tokens, tokens * (context.outputRate ?? 0) / 1e6);
};
var addChars = (context, key, chars) => {
  context.chars[key] = (context.chars[key] ?? 0) + chars;
};
var contextOf = (session, key) => {
  const contexts = session.overheadContexts ?? (session.overheadContexts = {});
  return ownEntry(contexts, key, () => ({ chars: {}, tools: [] }));
};
var onSessionStart = (session, data) => {
  const chars = data.injectedChars;
  if (!isCount(chars)) {
    return;
  }
  if (!session.overhead) {
    session.overhead = { parts: {}, tokens: 0, usd: 0 };
  }
  const main = contextOf(session, MAIN);
  main.chars.markers = chars;
  main.chars.listing = LISTING_CHARS;
  if (data.source === "compact" || data.source === "clear") {
    delete main.chars.toolDefinitions;
    delete main.chars.markerCalls;
    delete main.chars.reportBlocks;
    main.tools = [];
  }
  if (data.source === "clear") {
    delete main.chars.skill;
  }
};
var onReportText = (session, overhead, agentId, text) => {
  const block = text === void 0 ? void 0 : findReportBlock(text);
  if (block === void 0 || agentId === MAIN) {
    return;
  }
  const agent = contextOf(session, agentId);
  if (agent.reported) {
    return;
  }
  agent.reported = true;
  addWritten(overhead, agent, "reportBlocks", block.length);
  addChars(contextOf(session, MAIN), "reportBlocks", block.length);
};
var onToolPre = (session, overhead, event) => {
  const { tool, input, inputChars } = event.data;
  const key = event.agentId ?? MAIN;
  if (tool.startsWith(MARKER_TOOL_PREFIX)) {
    const context = contextOf(session, key);
    const name = tool.slice(MARKER_TOOL_PREFIX.length);
    if (!context.tools.includes(name)) {
      context.tools.push(name);
      addChars(context, "toolDefinitions", ownValue(TOOL_DEFINITION_CHARS, name) ?? 0);
    }
    if (isCount(inputChars)) {
      addWritten(overhead, context, "markerCalls", inputChars);
      addChars(context, "markerCalls", inputChars);
    }
  }
  if (tool === "Skill" && input.name !== void 0 && SKILL_NAMES.has(input.name)) {
    contextOf(session, key).chars.skill = SKILL_BODY_CHARS;
  }
  if (tool === "SubagentHandback" && event.agentId) {
    onReportText(session, overhead, event.agentId, input.message);
  }
};
var onOverheadLine = (state, event) => {
  const session = recordOf(state, requestSessionId(state, event));
  if (!session) {
    return;
  }
  if (event.event === "session.start" && !event.agentId) {
    onSessionStart(session, event.data);
    return;
  }
  const overhead = session.overhead;
  if (!overhead) {
    return;
  }
  switch (event.event) {
    case "agent.start": {
      if (!event.agentId) {
        break;
      }
      const context = contextOf(session, event.agentId);
      const chars = event.data.injectedChars;
      if (isCount(chars)) {
        context.chars.reportParagraph = chars;
      } else {
        delete context.chars.reportParagraph;
      }
      break;
    }
    case "tool.pre":
      onToolPre(session, overhead, event);
      break;
    case "tool.post":
      if (event.data.tool.startsWith(MARKER_TOOL_PREFIX) && isCount(event.data.responseChars)) {
        addChars(contextOf(session, event.agentId ?? MAIN), "markerCalls", event.data.responseChars);
      }
      break;
    case "agent.stop":
      if (event.agentId) {
        onReportText(session, overhead, event.agentId, event.data.lastMessage);
      }
      break;
    case "prompt":
      if (event.data.kind === "task-notification" && !event.agentId) {
        onReportText(session, overhead, event.data.taskId, event.data.result);
      }
      break;
    default:
      break;
  }
};
var onOverheadRequest = (session, event, first) => {
  const overhead = session.overhead;
  if (!overhead) {
    return;
  }
  const context = contextOf(session, event.agentId ?? MAIN);
  const rates = ratesOf(event.data);
  if (rates) {
    context.outputRate = rates.output;
  } else {
    delete context.outputRate;
  }
  if (!first) {
    return;
  }
  for (const key of OVERHEAD_PART_KEYS) {
    const tokens = (context.chars[key] ?? 0) / OVERHEAD_CHARS_PER_TOKEN;
    addPart(overhead, key, tokens, tokens * (rates?.cacheRead ?? 0) / 1e6);
  }
};

// src/model/delegation.ts
var FALLBACK_STREAM = { id: "repo", package: "repo" };
var isFallbackStream = (run, streamId) => {
  const planned = run.plan?.streams.some((stream) => stream.id === FALLBACK_STREAM.id) ?? false;
  return streamId === FALLBACK_STREAM.id && !planned;
};
var packageStream = (run, pkg) => {
  const planned = run.plan?.streams.find((stream) => stream.package === pkg);
  return { id: planned?.id ?? pkg, package: pkg };
};
var fixStreamFor = (run, target) => isFallbackStream(run, target?.id) ? void 0 : target?.id;
var streamFor = (run, spawn2, config) => {
  if (!spawn2) {
    return void 0;
  }
  for (const planned of run.plan?.streams ?? []) {
    if (new RegExp(`\\bstream[:\\s]+${escapeRegExp2(planned.id)}\\b`, "i").test(spawn2.prompt)) {
      return { id: planned.id, package: planned.package };
    }
  }
  const haystack = patternInput(`${spawn2.prompt}
${spawn2.paths.map((path) => relativePath(run, path)).join("\n")}`);
  let best;
  for (const [pkg, pattern] of compile(config).packagePaths) {
    const match = pattern.exec(haystack);
    if (match && (!best || match.index < best.index)) {
      best = { index: match.index, pkg };
    }
  }
  if (!best) {
    return { ...FALLBACK_STREAM };
  }
  return packageStream(run, best.pkg);
};
var reviewerWithChanges = (run) => [...run.reviewers].reverse().find((reviewer) => reviewer.state === "changes");
var startFix = (run, reviewer, streamId, agentId, line) => {
  const base = `fix-${streamId ?? "main"}`;
  const numbered = new RegExp(`^${escapeRegExp2(base)}-\\d+$`);
  const existing = run.fixes.filter((fix2) => fix2.id === base || numbered.test(fix2.id));
  const open = existing.find((fix2) => fix2.state === "running" && fix2.agentId === agentId);
  if (open) {
    return open;
  }
  const id = existing.length === 0 ? base : `${base}-${existing.length + 1}`;
  const fix = { id, reviewerId: reviewer.id, agentId, state: "running", sessionId: line.sessionId };
  if (streamId) {
    fix.streamId = streamId;
  }
  run.fixes.push(fix);
  setStage(run, "fix", "running", line.at);
  logRun(run, line, `Fix started for ${reviewer.id}`, "normal", agentId);
  return fix;
};
var sameSession = (sessions, a, b) => !sessions[a] || !sessions[b] || sessions[a] === sessions[b];
var attachStream = (run, agent, target, line, sessions) => {
  const { at } = line;
  let stream = run.streams.find((item) => item.id === target.id);
  if (!stream) {
    const midBuild = run.streams.length > 0 || run.plan !== void 0;
    stream = { id: target.id, package: target.package, state: "running", after: [], planned: false, addedAt: at, agentIds: [] };
    run.streams.push(stream);
    logRun(run, line, midBuild ? "added (not in the plan)" : "stream started", "normal", agent.id);
  }
  const previousId = stream.agentIds[stream.agentIds.length - 1];
  const previous = previousId ? run.agents[previousId] : void 0;
  if (previous && previous.id !== agent.id && previous.state !== "failed" && sameSession(sessions, previous.id, agent.id)) {
    previous.state = "handed";
    logRun(run, line, `continues in run ${stream.agentIds.length + 1}`, "normal", agent.id);
  }
  if (!stream.agentIds.includes(agent.id)) {
    stream.agentIds.push(agent.id);
  }
  stream.state = "running";
  stream.model = agent.model ?? stream.model;
  agent.streamId = stream.id;
  setStage(run, "build", "running", at);
};
var reopenStream = (run, agent, at) => {
  const stream = run.streams.find((item) => item.id === agent.streamId);
  if (!stream || stream.agentIds[stream.agentIds.length - 1] !== agent.id) {
    return;
  }
  stream.state = "running";
  checkBuild(run, at);
};
var linkReReviews = (run, reviewerId, agentId, at) => {
  let linked = false;
  for (const fix of run.fixes) {
    if (fix.reviewerId === reviewerId && !fix.reReview) {
      fix.reReview = { agentId, state: "running" };
      linked = true;
      if (fix.state === "running" && fix.agentId === "main") {
        fix.state = "done";
      }
    }
  }
  if (!linked) {
    const newest2 = /* @__PURE__ */ new Map();
    for (const fix of run.fixes) {
      if (fix.reReview?.agentId === agentId) {
        newest2.set(fix.streamId ?? "main", fix.reReview);
      }
    }
    for (const reReview of newest2.values()) {
      reReview.state = "running";
    }
  }
  checkFix(run, at);
};
var startImplementer = (run, agent, target, line, sessions) => {
  endPlan(run, line);
  const reviewer = reviewerWithChanges(run);
  if (reviewer) {
    agent.streamId = fixStreamFor(run, target);
    startFix(run, reviewer, agent.streamId, agent.id, line);
    return;
  }
  if (target) {
    attachStream(run, agent, target, line, sessions);
  } else {
    setStage(run, "build", "running", line.at);
  }
};
var startReviewer = (run, agent, line, config) => {
  const { at } = line;
  const short = roleConfig(agent.role, config).short ?? agent.role;
  if (!run.join || run.join.state === "pending") {
    run.join = { at, state: "skipped" };
    setStage(run, "join", "skipped", at);
  }
  agent.reviewerId = short;
  let reviewer = run.reviewers.find((item) => item.id === short);
  if (reviewer) {
    reviewer.round += 1;
    reviewer.agentId = agent.id;
    reviewer.state = "running";
    reviewer.model = agent.model ?? reviewer.model;
    linkReReviews(run, short, agent.id, at);
    logRun(run, line, `re-review (round ${reviewer.round})`, "normal", agent.id);
  } else {
    reviewer = { id: short, role: agent.role, agentId: agent.id, state: "running", round: 1, fixCount: 0 };
    if (agent.model) {
      reviewer.model = agent.model;
    }
    run.reviewers.push(reviewer);
  }
  checkReview(run, at);
};
var resumeRoleStage = (run, agent, line) => {
  const { at } = line;
  const fix = agentFix(run, agent.id);
  const changes = reviewerWithChanges(run);
  const reviewer = run.reviewers.find((item) => item.id === agent.reviewerId);
  if (fix && (!fix.reReview || !changes)) {
    fix.state = "running";
    checkFix(run, at);
  } else if (fix && changes) {
    startFix(run, changes, fix.streamId, agent.id, line);
  } else if (agent.stage === "build" && agent.streamId !== void 0 && changes) {
    startFix(run, changes, fixStreamFor(run, { id: agent.streamId }), agent.id, line);
  } else if (agent.stage === "build" && agent.streamId !== void 0) {
    reopenStream(run, agent, at);
  } else if (reviewer && reviewer.agentId === agent.id) {
    reviewer.state = "running";
    linkReReviews(run, reviewer.id, agent.id, at);
    checkReview(run, at);
  }
};
var startRoleStage = (state, run, agent, target, line, config) => {
  if (agent.stage === "build") {
    startImplementer(run, agent, target, line, state.index.agentSessions);
  } else if (agent.stage === "review") {
    startReviewer(run, agent, line, config);
  } else if (agent.stage === "pr" && run.stages.pr.state === "pending") {
    setStage(run, "pr", "running", line.at);
  }
};
var roleStageStarted = (run, agent) => {
  if (agent.stage === "build") {
    return agent.streamId !== void 0 || run.fixes.some((fix) => fix.agentId === agent.id);
  }
  if (agent.stage === "review") {
    return agent.reviewerId !== void 0;
  }
  return agent.stage !== "pr" || run.stages.pr.state !== "pending";
};
var roleStageStartedInRuns = (state, agentId, except) => {
  const runs = Object.values(state.board.runs).filter((run) => run !== except && Object.hasOwn(run.agents, agentId));
  return runs.some((run) => roleStageStarted(run, run.agents[agentId]));
};
var roleStream = (state, agent) => {
  const homeId = state.index.agentRuns[agent.id];
  const home = homeId ? state.board.runs[homeId] : void 0;
  const stream = home?.streams.find((item) => item.id === home.agents[agent.id]?.streamId);
  const named = state.index.agentStreams[agent.id];
  if (stream) {
    return { id: stream.id, package: stream.package };
  }
  return named ? { id: named.id, package: named.package } : { ...FALLBACK_STREAM };
};
var startRoleStageIn = (state, run, agent, line, config) => {
  if (roleStageStarted(run, agent)) {
    return;
  }
  startRoleStage(state, run, agent, roleStream(state, agent), line, config);
  if (roleStageStarted(run, agent)) {
    noteBranchWork(state, state.index.agentSessions[agent.id] ?? line.sessionId, run, "agent", line.at);
  }
};
var startRoleStageAtEnd = (state, run, agent, line, config) => {
  if (agent.id !== "main" && !roleStageStartedInRuns(state, agent.id)) {
    startRoleStageIn(state, run, agent, line, config);
  }
};
var detachStream = (run, agent) => {
  const stream = run.streams.find((item) => item.id === agent.streamId);
  delete agent.streamId;
  if (!stream) {
    return;
  }
  stream.agentIds = stream.agentIds.filter((id) => id !== agent.id);
  const newest2 = run.agents[stream.agentIds[stream.agentIds.length - 1]];
  if (newest2) {
    if (newest2.state === "handed" && !newest2.endedAt) {
      newest2.state = "running";
    }
    stream.state = newest2.state;
  } else if (stream.planned) {
    stream.state = pastBuild(run) ? "skipped" : "pending";
  } else {
    run.streams = run.streams.filter((item) => item !== stream);
  }
};
var rederiveImplementer = (state, run, agent, spawn2, line, config) => {
  const fromSpawn = streamFor(run, spawn2, config);
  const fix = agentFix(run, agent.id);
  if (fix) {
    fix.streamId = fixStreamFor(run, fromSpawn);
    agent.streamId = fix.streamId;
    return;
  }
  const edited = agent.filesChanged.map((path) => packageOf(path, config)).find((pkg) => pkg !== void 0);
  const target = isFallbackStream(run, fromSpawn?.id) && edited ? packageStream(run, edited) : fromSpawn;
  if (agent.streamId === target?.id) {
    return;
  }
  detachStream(run, agent);
  if (target) {
    attachStream(run, agent, target, line, state.index.agentSessions);
  }
  if (agent.state !== "running") {
    const stream = run.streams.find((item) => item.id === agent.streamId);
    if (stream) {
      stream.state = agent.state;
    }
  }
  checkBuild(run, line.at);
};
var swapId = (id, a, b) => {
  if (id === a) {
    return b;
  }
  return id === b ? a : id;
};
var swapBindings = (run, a, b, at) => {
  for (const stream of run.streams) {
    stream.agentIds = stream.agentIds.map((id) => swapId(id, a.id, b.id));
    const newest2 = run.agents[stream.agentIds[stream.agentIds.length - 1]];
    if (newest2 && (newest2 === a || newest2 === b)) {
      stream.state = newest2.state;
    }
  }
  for (const reviewer of run.reviewers) {
    reviewer.agentId = swapId(reviewer.agentId, a.id, b.id);
    if (reviewer.agentId === a.id || reviewer.agentId === b.id) {
      reviewer.state = run.agents[reviewer.agentId].state;
    }
  }
  for (const fix of run.fixes) {
    fix.agentId = swapId(fix.agentId, a.id, b.id);
    if (fix.reReview) {
      fix.reReview.agentId = swapId(fix.reReview.agentId, a.id, b.id);
    }
    if (fix.agentId === a.id || fix.agentId === b.id) {
      fix.state = run.agents[fix.agentId].state;
    }
  }
  [a.streamId, b.streamId] = [b.streamId, a.streamId];
  [a.reviewerId, b.reviewerId] = [b.reviewerId, a.reviewerId];
  checkBuild(run, at);
  checkReview(run, at);
  checkFix(run, at);
};

// src/model/reports.ts
var VERDICT_LINE = /Verdict:\s*(APPROVE|WARNING|BLOCK|GAPS|PASS)/i;
var reviewerVerdict = (agent) => {
  const report = agent.report;
  if (!report) {
    return "failed";
  }
  if (report.block) {
    return report.block.followups.some((item) => item.type === "fix") ? "changes" : "approved";
  }
  if (agent.role === "conventions-checker") {
    return report.text.includes("No convention findings.") ? "approved" : "changes";
  }
  const verdict = VERDICT_LINE.exec(report.text)?.[1]?.toUpperCase();
  if (verdict === "WARNING" || verdict === "BLOCK" || verdict === "GAPS") {
    return "changes";
  }
  return verdict ? "approved" : "done";
};
var setReport = (agent, text, via, at) => {
  const parsed = parseReportBlock(text);
  const report = { text, via, at };
  if (parsed && isBlockError(parsed)) {
    report.blockError = parsed.blockError;
  } else if (parsed) {
    report.block = parsed;
  }
  agent.report = report;
};
var fixFollowups = (agent) => agent.report?.block?.followups.filter((item) => item.type === "fix").length ?? 0;
var finalizeReviewer = (run, agent, at) => {
  const verdict = reviewerVerdict(agent);
  agent.state = verdict;
  const reviewer = run.reviewers.find((item) => item.id === agent.reviewerId);
  if (reviewer && reviewer.agentId === agent.id) {
    reviewer.state = verdict;
  }
  if (reviewer) {
    const rounds = Object.values(run.agents).filter((item) => item.reviewerId === reviewer.id && item.state !== "running");
    reviewer.fixCount = rounds.reduce((sum, item) => sum + fixFollowups(item), 0);
  }
  for (const item of run.fixes) {
    if (item.reReview?.agentId === agent.id && ACTIVE_STATES.has(item.reReview.state)) {
      item.reReview.state = verdict;
    }
  }
  checkReview(run, at);
};
var finalizeWorker = (run, agent, at, config) => {
  const hasReport = agent.report !== void 0 && agent.report.text.trim() !== "";
  const fix = agentFix(run, agent.id);
  if (fix) {
    fix.state = hasReport ? "done" : "failed";
    agent.state = fix.state;
    checkFix(run, at);
    return;
  }
  if (agent.stage === "build") {
    const budget = agent.budget;
    const atBudget = budget.toolCalls.level === "limit" || budget.verifyRounds.level === "limit";
    if (agent.state !== "handed") {
      agent.state = hasReport ? atBudget ? "handed" : "done" : "failed";
    }
    const stream = run.streams.find((item) => item.id === agent.streamId);
    if (stream && stream.agentIds[stream.agentIds.length - 1] === agent.id) {
      stream.state = agent.state;
    }
    checkBuild(run, at);
    return;
  }
  agent.state = hasReport ? "done" : "failed";
  if (agent.stage === "pr" && run.pr) {
    setStage(run, "pr", "done", at);
  }
  const docsAgent = config.docs.roles.includes(agent.role) || agent.recent.some((call) => config.docs.tools.includes(call.tool));
  if (docsAgent && ACTIVE_STATES.has(run.stages.docs.state) && run.gates.docs.state !== "waiting") {
    setStage(run, "docs", "done", at);
  }
};
var finalLogLine = (run, agent) => {
  const fix = agentFix(run, agent.id);
  const failed = agent.state === "failed";
  if (fix) {
    return { text: `fix for ${fix.reviewerId}: ${fix.state}`, tone: failed ? "failed" : "normal" };
  }
  if (agent.reviewerId) {
    const text = agent.state === "changes" ? "changes requested" : agent.state;
    return { text, tone: agent.state === "changes" || failed ? "warn" : "done" };
  }
  if (agent.stage === "build") {
    const text = agent.state === "handed" ? `handed back at ${agent.budget.toolCalls.used} calls` : agent.state;
    return { text, tone: failed ? "failed" : "normal" };
  }
  const summary = agent.state === "done" && agent.report ? reportSummary(agent.report.text) : "";
  return { text: summary ? `done: ${summary}` : agent.state, tone: failed ? "failed" : "normal" };
};
var settleNodes = (run, agent, line, config) => {
  const { at } = line;
  const ended = agent.endedAt !== void 0 && agent.state !== "running";
  if (ended && !agent.report) {
    return false;
  }
  const before = agent.state;
  agent.endedAt = agent.endedAt ?? at;
  agent.budget.toolCallsAtFirstStop = agent.budget.toolCallsAtFirstStop ?? agent.budget.toolCalls.used;
  delete agent.now;
  delete agent.staleSince;
  if (agent.reviewerId) {
    finalizeReviewer(run, agent, at);
  } else {
    finalizeWorker(run, agent, at, config);
  }
  if (!ended || agent.state !== before) {
    const final = finalLogLine(run, agent);
    logRun(run, line, final.text, final.tone, agent.id);
  }
  return true;
};
var copyRuns = (state, home, agentId) => {
  const runs = Object.values(state.board.runs);
  return runs.filter((run) => run !== home && Object.hasOwn(run.agents, agentId));
};
var endCopies = (state, home, agent, line, config) => {
  for (const run of copyRuns(state, home, agent.id)) {
    const copy = run.agents[agent.id];
    if (agent.report) {
      copy.report = structuredClone(agent.report);
    }
    closePermissions(run, copy, line, "unanswered");
    settleNodes(run, copy, line, config);
  }
};
var resumeCopies = (state, home, agentId, line) => {
  for (const run of copyRuns(state, home, agentId)) {
    const copy = run.agents[agentId];
    copy.state = "running";
    copy.resumedAt = line.at;
    delete copy.endedAt;
    resumeRoleStage(run, copy, line);
  }
};
var changedCopyRuns = (state, event, run) => {
  let agentId;
  if (event.event === "agent.stop") {
    agentId = event.agentId;
  } else if (event.event === "agent.start" && run && event.agentId && ownValue(run.agents, event.agentId)?.resumedAt === event.at) {
    agentId = event.agentId;
  } else if (event.event === "prompt" && event.data.kind === "task-notification") {
    agentId = event.data.taskId;
  } else if (event.event === "tool.fail" && run) {
    const toolUseId = event.data.toolUseId;
    agentId = Object.values(run.agents).find((agent) => agent.spawnToolUseId === toolUseId)?.id;
  }
  return agentId && run ? copyRuns(state, run, agentId) : [];
};
var reportOfLeg = (agent) => {
  const reportAt = agent.report?.at;
  return agent.resumedAt !== void 0 && reportAt !== void 0 && time(reportAt) >= time(agent.resumedAt);
};
var finalizeAgent = (run, agent, line, config) => {
  if (!settleNodes(run, agent, line, config)) {
    return;
  }
  const { at, sessionId } = line;
  const leg = reportOfLeg(agent) ? agent.resumedAt : void 0;
  const earlier = (itemAt) => leg !== void 0 && time(itemAt) < time(leg);
  if (leg !== void 0) {
    run.followups = run.followups.filter((item) => item.origin.agentId !== agent.id || !earlier(item.at));
  }
  const block = agent.report?.block;
  if (!block) {
    return;
  }
  block.followups.forEach((item, index) => {
    const id = `f-${agent.id}-${index + 1}`;
    if (run.followups.some((existing) => existing.id === id)) {
      return;
    }
    const followup = { id, type: item.type, text: item.text, origin: { agentId: agent.id, role: agent.role }, at };
    run.followups.push(item.file ? { ...followup, file: item.file } : followup);
  });
  block.questions.forEach((item, index) => {
    const source = { agentId: agent.id, role: agent.role };
    const node = agentNode(run, agent);
    const question = { id: `q-${agent.id}-${index + 1}`, text: item.text, blocking: item.blocking, options: item.options ?? [], origin: "report", source, node, sessionId, createdAt: at };
    const asked = run.questions.find((existing) => existing.id === question.id && earlier(existing.createdAt));
    if (asked) {
      reaskQuestion(run, asked, question);
    } else {
      addQuestion(run, question);
    }
  });
};
var answeredByPrompt = (state, question, prompt) => {
  const dialog = question.origin === "permission" || question.origin === "elicitation";
  const answerable = question.state === "open" && question.blocking && question.audience === "user";
  const asker = question.sessionId ? state.index.sessions[question.sessionId] : void 0;
  const own = !question.sessionId || question.sessionId === prompt.sessionId || asker?.endedAt !== void 0;
  return answerable && !dialog && own && time(question.createdAt) <= time(prompt.at);
};
var onPrompt = (state, event, config, answered) => {
  const data = event.data;
  const session = ensureSession(state, event);
  if (data.kind === "task-notification") {
    noteReport(session, data.taskId);
    const runId = state.index.agentRuns[data.taskId];
    const run2 = runId ? state.board.runs[runId] : void 0;
    const agent = run2?.agents[data.taskId];
    if (!run2 || !agent) {
      return void 0;
    }
    if (!agent.report && data.result) {
      setReport(agent, data.result, "task-notification", event.at);
    }
    if (data.status !== "completed" && agent.state === "running") {
      agent.state = "failed";
      logRun(run2, event, data.status, "failed", agent.id);
    }
    startRoleStageAtEnd(state, run2, agent, event, config);
    finalizeAgent(run2, agent, event, config);
    endCopies(state, run2, agent, event, config);
    return run2;
  }
  if (data.kind === "handback") {
    noteReport(session, data.from ?? "");
    return existingHomeRun(state, session);
  }
  answered.push(...handleHandbacks(state, session, event));
  const run = homeRun(state, event, config);
  adoptPrompt(run, { at: event.at, text: data.text, keys: data.keys }, config);
  for (const other of session.runIds.map((id) => state.board.runs[id])) {
    const open = (other?.questions ?? []).filter((question) => answeredByPrompt(state, question, event));
    for (const question of open) {
      closeQuestion(other, question, "answered", event, "terminal");
    }
    if (open.length > 0 && other !== run) {
      answered.push(other);
    }
  }
  return run;
};
var reportBeforeResume = (agent, at) => {
  const resumedLeg = agent.resumedAt !== void 0 && time(at) >= time(agent.resumedAt);
  return resumedLeg && !reportOfLeg(agent);
};
var onAgentStop = (state, event, config) => {
  const agentId = event.agentId;
  const runId = agentId ? state.index.agentRuns[agentId] : void 0;
  const run = runId ? state.board.runs[runId] : void 0;
  if (!agentId) {
    return hookRun(state, event, config);
  }
  if (!run) {
    state.index.pendingStops[agentId] = { ...event, atMs: time(event.at) };
    return void 0;
  }
  const agent = ensureAgent(run, agentId, event, config);
  if (event.data.transcriptPath) {
    agent.transcriptPath = event.data.transcriptPath;
  }
  const handback = copyRuns(state, run, agentId).map((other) => other.agents[agentId].report).find((report) => report?.via === "handback");
  if (!agent.report && handback) {
    agent.report = structuredClone(handback);
  }
  if ((!agent.report || reportBeforeResume(agent, event.at)) && event.data.lastMessage.trim() !== "") {
    setReport(agent, event.data.lastMessage, "stop", event.at);
  }
  closePermissions(run, agent, event, "unanswered");
  startRoleStageAtEnd(state, run, agent, event, config);
  finalizeAgent(run, agent, event, config);
  endCopies(state, run, agent, event, config);
  return run;
};

// src/model/spawns.ts
var onAgentPre = (state, run, parentAgent, event, config) => {
  const input = event.data.input;
  const subagentType = input.subagentType ?? "general-purpose";
  const prompt = input.prompt ?? "";
  const paths = input.paths ?? [];
  const background = input.runInBackground ?? false;
  const spawn2 = { toolUseId: event.data.toolUseId, runId: run.id, sessionId: event.sessionId, parentAgent, subagentType, at: event.at, atMs: time(event.at), prompt, paths, background };
  if (input.model) {
    spawn2.model = input.model;
  }
  state.index.spawns[spawn2.toolUseId] = spawn2;
  const compiled = compile(config);
  const promptKey = run.key ? void 0 : compiled.promptKey;
  const key = promptKey ? firstKey(spawn2.prompt, promptKey, compiled.keyIgnoreCase) : void 0;
  if (key) {
    run.key = key;
  }
  if (roleConfig(subagentType, config).stage === "build") {
    endPlan(run, event);
  }
};
var keepSpawnStream = (state, run, agentId, spawn2, config) => {
  const target = roleConfig(spawn2.subagentType, config).stage === "build" ? streamFor(run, spawn2, config) : void 0;
  if (target) {
    state.index.agentStreams[agentId] = { id: target.id, package: target.package, at: spawn2.at, atMs: spawn2.atMs };
  }
};
var retireSpawn = (state, toolUseId) => {
  delete state.index.spawns[toolUseId];
};
var callEnded = (state, spawn2) => {
  const parent = state.board.runs[spawn2.runId]?.agents[spawn2.parentAgent];
  const call = parent?.recent.find((item) => item.toolUseId === spawn2.toolUseId);
  return call?.outcome === "denied" || call?.outcome === "interrupted" || call?.outcome === "failed";
};
var matchSpawn = (state, event) => {
  const spawns = Object.values(state.index.spawns);
  const confirmed = spawns.find((spawn2) => spawn2.agentId === event.agentId);
  if (confirmed) {
    return confirmed;
  }
  for (const spawn2 of spawns) {
    if (!spawn2.agentId && callEnded(state, spawn2)) {
      retireSpawn(state, spawn2.toolUseId);
    }
  }
  const open = spawns.filter((spawn2) => !spawn2.agentId && spawn2.sessionId === event.sessionId && state.index.spawns[spawn2.toolUseId]);
  return open.find((spawn2) => spawn2.subagentType === event.agentType);
};
var rebindSpawn = (state, run, spawn2, data, line, config) => {
  const { at } = line;
  const agentId = data.agentId;
  const previousId = spawn2.agentId;
  state.index.agentRuns[agentId] = run.id;
  spawn2.agentId = agentId;
  keepSpawnStream(state, run, agentId, spawn2, config);
  if (previousId === agentId) {
    return;
  }
  const other = Object.values(state.index.spawns).find((item) => item !== spawn2 && item.agentId === agentId);
  if (other && previousId) {
    other.agentId = previousId;
    keepSpawnStream(state, run, previousId, other, config);
  } else if (other) {
    delete other.agentId;
  }
  const agent = run.agents[agentId];
  const previous = previousId ? run.agents[previousId] : void 0;
  if (agent && previous && agent.role === previous.role) {
    swapBindings(run, previous, agent, at);
    previous.spawnToolUseId = other?.toolUseId;
    previous.background = other?.background ?? previous.background;
  } else {
    if (previous && previous.stage === "build" && !run.fixes.some((fix) => fix.agentId === previous.id)) {
      detachStream(run, previous);
    }
    if (previous) {
      delete previous.spawnToolUseId;
    }
    if (agent && agent.stage === "build" && roleStageStarted(run, agent)) {
      rederiveImplementer(state, run, agent, spawn2, line, config);
    }
  }
  if (agent) {
    agent.spawnToolUseId = spawn2.toolUseId;
    agent.background = spawn2.background;
  }
  if (!previousId && !agent) {
    return;
  }
  logRun(run, line, `re-bound to its Agent call${previousId ? ` (was ${previousId.slice(0, 8)})` : ""}`, "normal", agentId);
};
var startWorkStage = (state, run, agent, line, config) => {
  const homeId = state.index.agentRuns[agent.id];
  if (agent.id === "main" || homeId === void 0) {
    return;
  }
  const home = state.board.runs[homeId]?.agents[agent.id];
  if (home && home !== agent) {
    agent.role = home.role;
    agent.stage = home.stage;
    agent.model = agent.model ?? home.model;
    if (home.budget.toolCallsAtFirstStop !== void 0 && agent.budget.toolCallsAtFirstStop === void 0) {
      agent.budget.toolCallsAtFirstStop = 0;
    }
  }
  if (roleStageStarted(run, agent) || homeId === run.id && roleStageStartedInRuns(state, agent.id, run)) {
    return;
  }
  startRoleStageIn(state, run, agent, line, config);
};
var onAgentStart = (state, event, config) => {
  const agentId = event.agentId;
  if (!agentId) {
    return void 0;
  }
  const spawn2 = matchSpawn(state, event);
  const run = spawn2 ? state.board.runs[spawn2.runId] : hookRun(state, event, config);
  if (!run) {
    return void 0;
  }
  ensureSession(state, event);
  ensureRun(state, run.worktree, event, config);
  state.index.agentRuns[agentId] = run.id;
  state.index.agentSessions[agentId] = event.sessionId;
  const session = state.index.sessions[event.sessionId];
  session.agentWorktrees[agentId] = run.worktree;
  const agent = ensureAgent(run, agentId, event, config);
  const stoppedAt = agent.endedAt;
  delete agent.endedAt;
  agent.role = event.agentType ?? agent.role;
  agent.stage = roleConfig(agent.role, config).stage;
  if (agent.budget.toolCalls.used === 0) {
    const firstStop = agent.budget.toolCallsAtFirstStop;
    agent.budget = newBudget(agent.role, config);
    if (firstStop !== void 0) {
      agent.budget.toolCallsAtFirstStop = firstStop;
    }
  }
  agent.startedAt = time(event.at) < time(agent.startedAt) ? event.at : agent.startedAt;
  const resumed = stoppedAt !== void 0 && time(event.at) > time(stoppedAt);
  if (resumed) {
    agent.resumedAt = event.at;
  }
  agent.state = "running";
  if (spawn2) {
    spawn2.agentId = agentId;
    agent.spawnToolUseId = spawn2.toolUseId;
    agent.background = spawn2.background;
    agent.model = agent.model ?? spawn2.model;
  }
  if (spawn2) {
    keepSpawnStream(state, run, agentId, spawn2, config);
  }
  if (config.docs.roles.includes(agent.role)) {
    setStage(run, "docs", "running", event.at);
    if (run.gates.docs.state === "skipped") {
      setGate(run, "docs", "pending", event, "derived");
    }
  }
  logRun(run, event, "started", "normal", agentId);
  if (resumed) {
    resumeRoleStage(run, agent, event);
    resumeCopies(state, run, agentId, event);
  } else if (stoppedAt) {
    const stopped = { at: stoppedAt, sessionId: event.sessionId };
    startRoleStageAtEnd(state, run, agent, stopped, config);
    finalizeAgent(run, agent, stopped, config);
  }
  const parentAgent = spawn2 ? state.board.runs[spawn2.runId]?.agents[spawn2.parentAgent] : void 0;
  const parentCall = parentAgent?.recent.find((call) => call.toolUseId === spawn2?.toolUseId);
  if (spawn2 && parentCall?.endedAt) {
    retireSpawn(state, spawn2.toolUseId);
  }
  const early = state.index.pendingStops[agentId];
  if (early) {
    delete state.index.pendingStops[agentId];
    onAgentStop(state, early, config);
  }
  return run;
};

// src/model/retention.ts
var PRUNE_EVERY_MS = 60 * 1e3;
var HOUR_MS = 60 * 60 * 1e3;
var DRAIN_MS = 10 * 6e4;
var PARSED_CAP = 2e4;
var currentTimes = /* @__PURE__ */ new Map();
var previousTimes = /* @__PURE__ */ new Map();
var parsedTime = (at) => {
  const known = currentTimes.get(at);
  if (known !== void 0) {
    return known;
  }
  const kept = previousTimes.get(at);
  const parsed = kept ?? time(at);
  previousTimes.delete(at);
  if (currentTimes.size >= PARSED_CAP) {
    previousTimes = currentTimes;
    currentTimes = /* @__PURE__ */ new Map();
  }
  currentTimes.set(at, parsed);
  return parsed;
};
var pruneOlder = (entries, floor) => {
  for (const id of Object.keys(entries)) {
    if (entries[id].atMs < floor) {
      delete entries[id];
    }
  }
};
var finiteTime = (at) => {
  const ms = parsedTime(at);
  return Number.isFinite(ms) ? ms : void 0;
};
var laneEnd = (lane) => {
  if (lane.mergedAt === void 0 && !lane.deleted) {
    return void 0;
  }
  const last = lane.segments[lane.segments.length - 1];
  const merged = lane.mergedAt === void 0 ? void 0 : finiteTime(lane.mergedAt);
  return merged ?? finiteTime(last ? last.to ?? last.from : lane.forkedAt);
};
var keepsLane = (lane, now) => {
  const end = laneEnd(lane);
  return end === void 0 || now - end < DRAIN_MS;
};
var pruneBranches = (branches2, now) => {
  if (!Number.isFinite(now)) {
    return;
  }
  branches2.lanes = branches2.lanes.filter((lane) => keepsLane(lane, now));
};
var pruneIndex = (state, at, config) => {
  const now = time(at);
  if (state.index.prunedAt && now - time(state.index.prunedAt) < PRUNE_EVERY_MS) {
    return;
  }
  state.index.prunedAt = at;
  const floor = now - config.retention.indexHours * HOUR_MS;
  pruneOlder(state.index.calls, floor);
  pruneOlder(state.index.spawns, floor);
  pruneOlder(state.index.requests, floor);
  pruneOlder(state.index.pendingStops, floor);
  pruneOlder(state.index.agentStreams, floor);
  pruneOlder(state.index.prOpeners, floor);
  pruneBranches(state.board.branches, now);
};

// src/model/display-state.ts
var MAIN_AGENT = "main";
var openPermission2 = (agent) => {
  if (agent.now?.permission === "waiting") {
    return agent.now;
  }
  for (let index = agent.recent.length - 1; index >= 0; index -= 1) {
    const call = agent.recent[index];
    if (call.permission === "waiting" && !call.endedAt) {
      return call;
    }
  }
  return void 0;
};
var runOver = (run) => run.chip.tone === "done" || run.endedAt !== void 0;
var mainWaits = (run, agent) => run.chip.tone === "you" && (agent.now === void 0 || agent.now.tool === "AskUserQuestion");
var mainState = (run, agent) => {
  if (runOver(run)) {
    return "done";
  }
  if (openPermission2(agent) || mainWaits(run, agent)) {
    return "waiting";
  }
  return agent.idleSince ? "idle" : "running";
};
var subagentState = (agent) => {
  if (agent.state === "running" && openPermission2(agent)) {
    return "waiting";
  }
  return agent.state === "running" && agent.staleSince ? "stale" : agent.state;
};
var displayState = (run, agent) => {
  if (agent.id === MAIN_AGENT && agent.state === "running") {
    return mainState(run, agent);
  }
  return subagentState(agent);
};
var sessionMainWords = (session) => {
  if (session.plan.state === "done") {
    return "ended";
  }
  if (session.plan.state === "waiting") {
    return "waiting for you";
  }
  if (session.plan.state === "running") {
    return "working";
  }
  const subagents = Object.values(session.agents).filter((agent) => agent.id !== MAIN_AGENT);
  const busy = subagents.some((agent) => agent.state === "running" || agent.state === "waiting");
  return busy ? "waiting on agents" : "idle";
};

// src/model/metrics.ts
var VERIFY_KINDS = ["typecheck", "lint", "test"];
var processedTokens = (counts) => counts.input + counts.cacheWrite + counts.cacheWrite1h + counts.cacheRead + counts.output;
var byStart = (a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.id, b.id);
var entryOf = (map, key, create) => {
  const found = map.get(key);
  if (found !== void 0) {
    return found;
  }
  const entry = create();
  map.set(key, entry);
  return entry;
};
var roleMetrics = (role, agents) => {
  const models = [...new Set(agents.flatMap((agent) => agent.model === void 0 ? [] : [agent.model]))];
  const sum = (value) => agents.reduce((total, agent) => total + value(agent), 0);
  const peakContext = Math.max(0, ...agents.map((agent) => agent.budget.context.used));
  const requests = sum((agent) => agent.budget.requests);
  const cacheRead = sum((agent) => agent.budget.tokens.cacheRead);
  const output = sum((agent) => agent.budget.tokens.output);
  return { role, models, runs: agents.length, requests, cacheRead, output, peakContext, usd: sum((agent) => agent.budget.costUsd) };
};
var totalOf = (roles) => {
  const total = { runs: 0, requests: 0, cacheRead: 0, output: 0, peakContext: 0, usd: 0 };
  for (const role of roles) {
    total.runs += role.runs;
    total.requests += role.requests;
    total.cacheRead += role.cacheRead;
    total.output += role.output;
    total.peakContext = Math.max(total.peakContext, role.peakContext);
    total.usd += role.usd;
  }
  return total;
};
var branchMetrics = (subagents, rows) => {
  const branches2 = /* @__PURE__ */ new Map();
  for (const agent of subagents) {
    const name = agent.branch;
    if (name === void 0) {
      continue;
    }
    const branch = entryOf(branches2, name, () => ({ branch: name, agents: 0, usd: 0 }));
    branch.agents += 1;
    branch.usd += agent.budget.costUsd;
  }
  const rowBranches = rows.map((row) => row.branch).filter((branch) => branches2.has(branch));
  const ordered = [.../* @__PURE__ */ new Set([...rowBranches, ...branches2.keys()])];
  return ordered.flatMap((branch) => branches2.get(branch) ?? []);
};
var toolMetrics = (agents) => {
  const tools = /* @__PURE__ */ new Map();
  for (const agent of agents) {
    for (const [tool, output] of Object.entries(agent.budget.toolOutput)) {
      const sum = entryOf(tools, tool, () => ({ tool, calls: 0, chars: 0, maxChars: 0 }));
      sum.calls += output.calls;
      sum.chars += output.chars;
      sum.maxChars = Math.max(sum.maxChars, output.maxChars);
    }
  }
  return [...tools.values()].sort((a, b) => b.chars - a.chars || compareText(a.tool, b.tool));
};
var verificationMetrics = (role, agents) => {
  const commands = { typecheck: 0, lint: 0, test: 0 };
  const failed = { typecheck: 0, lint: 0, test: 0 };
  for (const agent of agents) {
    const rounds = agent.budget.verifyRounds;
    for (const kind of VERIFY_KINDS) {
      commands[kind] += rounds.commands[kind];
      failed[kind] += rounds.results[kind].filter((result) => result === "fail").length;
    }
  }
  const all = VERIFY_KINDS.reduce((sum, kind) => sum + commands[kind], 0);
  if (all === 0) {
    return void 0;
  }
  return { role, runs: agents.length, commands, failed, meanPerRun: all / agents.length };
};
var sessionMetrics = (session) => {
  const main = Object.hasOwn(session.agents, MAIN_AGENT) ? session.agents[MAIN_AGENT] : void 0;
  const subagents = Object.entries(session.agents).filter(([key]) => key !== MAIN_AGENT).map(([, agent]) => agent).sort(byStart);
  const mainGroup = main ? [[MAIN_AGENT, [main]]] : [];
  const byRole = /* @__PURE__ */ new Map();
  for (const agent of subagents) {
    entryOf(byRole, agent.role, () => []).push(agent);
  }
  const groups = [...mainGroup, ...byRole.entries()];
  const roles = groups.map(([role, agents]) => roleMetrics(role, agents));
  const verification = groups.flatMap(([role, agents]) => verificationMetrics(role, agents) ?? []);
  const byStage = Object.fromEntries(Object.entries(session.tokens.byStage).map(([key, counts]) => [key, counts ? processedTokens(counts) : 0]));
  const tokens = { byStage, total: processedTokens(session.tokens.total), usd: session.tokens.total.usd };
  const tools = { main: toolMetrics(main ? [main] : []), subagents: toolMetrics(subagents) };
  const total = totalOf(roles);
  const resumes = resumeMetrics(session.resumes ?? []);
  const metrics = { roles, total, branches: branchMetrics(subagents, session.rows), tools, verification, tokens, resumes };
  if (session.overhead) {
    metrics.overhead = overheadMetrics(session.overhead, total.usd);
  }
  return metrics;
};
var overheadMetrics = (overhead, sessionUsd) => {
  const share = sessionUsd > 0 ? overhead.usd / sessionUsd : 0;
  return { ...structuredClone(overhead), share };
};
var resumeMetrics = (resumes) => {
  const expired = resumes.filter((entry) => entry.cacheLikelyExpired === true).length;
  const cacheWriteUsd = resumes.reduce((sum, entry) => sum + (entry.cacheWriteUsd ?? 0), 0);
  return { count: resumes.length, expired, cacheWriteUsd, items: structuredClone(resumes) };
};

// src/model/tokens.ts
var tokenStage = (state, run, agent, config) => {
  if (run.fixes.some((fix) => fix.agentId === agent.id && agent.id !== "main")) {
    return "fix";
  }
  if (agent.stage === "build" && !roleStageStarted(run, agent) && reviewerWithChanges(run)) {
    return "fix";
  }
  if (agent.stage === "build") {
    const stream = run.streams.find((item) => item.id === agent.streamId);
    return `build:${stream?.package ?? state.index.agentStreams[agent.id]?.package ?? "main"}`;
  }
  if (agent.stage === "review") {
    return "review";
  }
  const docsCall = agent.now && config.docs.tools.includes(agent.now.tool);
  if (config.docs.roles.includes(agent.role) || docsCall) {
    return "docs";
  }
  if (agent.stage === "pr") {
    return "pr";
  }
  const stage = currentStage(run);
  if (stage === "plan" || stage === "fix" || stage === "docs") {
    return stage;
  }
  if (stage === "build") {
    return "build:main";
  }
  return stage === "join" || stage === "review" ? "review" : "pr";
};
var addCounts2 = (target, source, sign) => {
  target.requests += sign * source.requests;
  target.input += sign * source.input;
  target.cacheWrite += sign * source.cacheWrite;
  target.cacheWrite1h += sign * source.cacheWrite1h;
  target.cacheRead += sign * source.cacheRead;
  target.output += sign * source.output;
  if (target.usd !== void 0) {
    target.usd += sign * source.usd;
  }
};
var adoptModel = (run, agent, model) => {
  agent.model = model;
  const stream = run.streams.find((item) => item.id === agent.streamId && item.agentIds[item.agentIds.length - 1] === agent.id);
  if (stream && (!stream.model || isModelAlias(stream.model))) {
    stream.model = model;
  }
  const reviewer = run.reviewers.find((item) => item.agentId === agent.id);
  if (reviewer && (!reviewer.model || isModelAlias(reviewer.model))) {
    reviewer.model = model;
  }
};
var addAgentTokens = (agent, source, sign) => {
  const agentTokens = { ...agent.budget.tokens, usd: agent.budget.costUsd };
  addCounts2(agentTokens, source, sign);
  agent.budget.costUsd = agentTokens.usd;
  const { requests, input, cacheWrite, cacheWrite1h, cacheRead, output } = agentTokens;
  agent.budget.tokens = { requests, input, cacheWrite, cacheWrite1h, cacheRead, output };
  agent.budget.requests += sign;
};
var addSeriesTokens = (series, stage, source, sign) => {
  addCounts2(series.total, source, sign);
  const byStage = series.byStage[stage] ?? (series.byStage[stage] = emptyCounts());
  addCounts2(byStage, source, sign);
};
var noteContext = (agent, data, config) => {
  const context = agent.budget.context;
  context.limit = contextLimit(agent.model ?? data.model, config);
  context.used = Math.max(context.used, data.input + data.cacheRead + data.cacheWrite + data.cacheWrite1h);
};
var MINUTE_MS = 60 * 1e3;
var BUCKET_LOOKBACK = 30;
var addPoint = (points, point) => {
  const at = new Date(Math.floor(time(point.at) / MINUTE_MS) * MINUTE_MS).toISOString();
  const recent = points.slice(-BUCKET_LOOKBACK);
  const bucket = recent.find((item) => item.at === at && item.stage === point.stage);
  if (bucket) {
    bucket.tokens += point.tokens;
    bucket.usd += point.usd;
  } else {
    points.push({ ...point, at });
  }
};
var onUsage = (state, event, config) => {
  const agentKey = event.agentId ?? "main";
  let runId = event.agentId ? state.index.agentRuns[event.agentId] : void 0;
  if (!runId) {
    const worktree = state.index.sessions[event.sessionId]?.agentWorktrees.main;
    runId = worktree ? runIdFor(state, worktree) : void 0;
  }
  const run = runId ? state.board.runs[runId] : void 0;
  if (!run) {
    return void 0;
  }
  const data = event.data;
  const agent = ensureAgent(run, agentKey, event, config);
  const counts = { requests: 1, input: data.input, cacheWrite: data.cacheWrite, cacheWrite1h: data.cacheWrite1h, cacheRead: data.cacheRead, output: data.output, usd: data.usd };
  const previous = state.index.requests[data.requestId];
  if (previous && previous.tokens.output >= counts.output) {
    return run;
  }
  const stage = previous?.stage ?? tokenStage(state, run, agent, config);
  const apply = (source, sign) => {
    addAgentTokens(agent, source, sign);
    run.costUsd += sign * source.usd;
    addSeriesTokens(run.tokens, stage, source, sign);
  };
  if (previous) {
    apply(previous.tokens, -1);
  }
  apply(counts, 1);
  const tokens = processedTokens(counts) - (previous ? processedTokens(previous.tokens) : 0);
  addPoint(run.tokens.points, { at: data.at, stage, agentId: agentKey, tokens, usd: counts.usd - (previous?.tokens.usd ?? 0) });
  const counted = addSessionTokens(state, event, previous, counts, stage, config);
  const entry = { runId: run.id, agentKey, stage, tokens: counts, at: event.at, atMs: time(event.at) };
  state.index.requests[data.requestId] = counted ? { ...entry, ...counted } : entry;
  if (!agent.model || isModelAlias(agent.model)) {
    adoptModel(run, agent, data.model);
  }
  noteContext(agent, data, config);
  updateMeter(state, run, agent, "context", agent.budget.context, config.budgets.warnAt, event);
  return run;
};
var addSessionTokens = (state, event, previous, counts, stage, config) => {
  const beforeId = previous?.sessionStage === void 0 ? void 0 : previous.sessionId;
  const before = beforeId === void 0 ? void 0 : recordOf(state, beforeId);
  if (previous?.sessionStage && before) {
    addSeriesTokens(before.tokens, previous.sessionStage, previous.tokens, -1);
  }
  if (previous?.agentKey === "main" && before?.main) {
    addAgentTokens(before.main, previous.tokens, -1);
  }
  const sessionId = requestSessionId(state, event);
  const session = recordOf(state, sessionId);
  if (!session) {
    return void 0;
  }
  const data = event.data;
  const own = sessionMain(session, event, config);
  let key = stage;
  if (previous?.sessionStage) {
    key = previous.sessionStage;
  } else if (own) {
    key = mainTokenStage(session, data.at);
  }
  addSeriesTokens(session.tokens, key, counts, 1);
  onOverheadRequest(session, event, previous?.sessionStage === void 0);
  const recounted = before === session ? previous : void 0;
  const tokens = processedTokens(counts) - (recounted ? processedTokens(recounted.tokens) : 0);
  addPoint(session.tokens.points, { at: data.at, stage: key, agentId: event.agentId ?? "main", tokens, usd: counts.usd - (recounted?.tokens.usd ?? 0) });
  if (!own) {
    return { sessionId, sessionStage: key };
  }
  addAgentTokens(own, counts, 1);
  if (!own.model || isModelAlias(own.model)) {
    noteMainModel(state, sessionId, data.model);
  }
  noteContext(own, data, config);
  setLevel(own.budget.context, config.budgets.warnAt);
  return { sessionId, sessionStage: key };
};
var rankEntry = (key, runs) => {
  const byStage = {};
  for (const run of runs) {
    for (const [stage, counts] of Object.entries(run.tokens.byStage)) {
      if (counts) {
        byStage[stage] = (byStage[stage] ?? 0) + processedTokens(counts);
      }
    }
  }
  const tokens = runs.reduce((sum, run) => sum + processedTokens(run.tokens.total), 0);
  const usd = runs.reduce((sum, run) => sum + run.costUsd, 0);
  const finished = runs.every((run) => run.pr?.state === "merged");
  const title = runs.find((run) => run.title)?.title;
  const entry = { key, runIds: runs.map((run) => run.id), finished, byStage, tokens, usd };
  return title ? { ...entry, title } : entry;
};
var updateRanking = (state) => {
  const { rankKeys, rankDirty } = state.index;
  for (const runId of Object.keys(rankKeys)) {
    if (!state.board.runs[runId]) {
      rankDirty[runId] = true;
    }
  }
  const visible = new Set(state.board.order);
  const keys = /* @__PURE__ */ new Set();
  for (const runId of Object.keys(rankDirty)) {
    const previous = rankKeys[runId];
    if (previous !== void 0) {
      keys.add(previous);
    }
    const run = state.board.runs[runId];
    if (run && visible.has(runId)) {
      rankKeys[runId] = run.key ?? run.branch;
      keys.add(rankKeys[runId]);
    } else {
      delete rankKeys[runId];
    }
  }
  state.index.rankDirty = {};
  if (keys.size === 0) {
    return;
  }
  const groups = /* @__PURE__ */ new Map();
  for (const id of state.board.order) {
    const key = rankKeys[id];
    if (key !== void 0 && keys.has(key)) {
      groups.set(key, [...groups.get(key) ?? [], state.board.runs[id]]);
    }
  }
  const kept = state.board.tokenRanking.filter((entry) => !keys.has(entry.key));
  const changed = [...groups.entries()].map(([key, runs]) => rankEntry(key, runs));
  state.board.tokenRanking = [...kept, ...changed].sort((a, b) => b.tokens - a.tokens);
};

// src/model/tool-calls.ts
var EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "NotebookEdit"]);
var findCall = (agent, toolUseId) => agent.recent.find((call) => call.toolUseId === toolUseId);
var endCall = (call, event) => {
  call.endedAt = event.at;
  call.durationMs = event.data.durationMs;
  const waited = call.permission === "waiting";
  if (waited) {
    call.permission = "granted";
  }
  if (event.event === "tool.fail") {
    call.outcome = event.data.isInterrupt ? "interrupted" : "failed";
    call.error = event.data.error;
  } else {
    call.outcome = event.data.interrupted ? "interrupted" : "ok";
    call.responseChars = event.data.responseChars;
  }
  return waited;
};
var LARGE_OUTPUT_CHARS = 2e4;
var BINARY_READ = /\.(png|jpe?g|gif|webp|pdf)$/i;
var isLargeOutput = (tool, chars, call) => {
  if (chars <= LARGE_OUTPUT_CHARS || EDIT_TOOLS.has(tool)) {
    return false;
  }
  return tool !== "Read" || !BINARY_READ.test(call?.summary ?? "");
};
var countOutput = (agent, event, call) => {
  const size = event.event === "tool.post" ? event.data.responseChars : void 0;
  const chars = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
  const output = ownEntry(agent.budget.toolOutput, event.data.tool, () => ({ calls: 0, chars: 0, maxChars: 0 }));
  output.calls += 1;
  output.chars += chars;
  output.maxChars = Math.max(output.maxChars, chars);
  if (isLargeOutput(event.data.tool, chars, call)) {
    agent.budget.largeOutputs += 1;
  }
};
var PROTOTYPE_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var commandBranch = (name) => name !== void 0 && isBranchName(name) && !PROTOTYPE_KEYS.has(name) ? name : void 0;
var joinBranch = (matched) => {
  const word = /\.\.\.([^\s>]+)/.exec(matched)?.[1];
  const branch = commandBranch(literalWord(word)?.replace(/^origin\//, ""));
  return branch === "HEAD" ? void 0 : branch;
};
var prCreateArgs = (command) => {
  const joined = command.replace(/\\\n/g, " ");
  for (const segment of shellSegments(joined)) {
    const words = shellWords(segment);
    const at = words.findIndex((word, index) => word === "gh" && words[index + 1] === "pr" && words[index + 2] === "create");
    if (at >= 0) {
      return words.slice(at + 3);
    }
  }
  return void 0;
};
var prHead = (command) => {
  const args = prCreateArgs(command) ?? [];
  for (const [index, word] of args.entries()) {
    const value = word === "--head" || word === "-H" ? args[index + 1] ?? "" : /^(?:--head=|-H)(.+)$/s.exec(word)?.[1];
    if (value !== void 0) {
      return commandBranch(literalWord(value)?.replace(/^[^:]*:/, ""));
    }
  }
  return void 0;
};
var callSummary = (tool, input, run) => {
  if (input.command !== void 0) {
    return input.command.slice(0, 160);
  }
  if (input.filePath) {
    return relativePath(run, input.filePath);
  }
  if (input.subagentType || input.description) {
    return [input.subagentType, input.description].filter(Boolean).join(": ");
  }
  if (input.pattern) {
    return input.pattern;
  }
  const asked = input.questions?.[0]?.question;
  if (asked) {
    return asked.slice(0, 160);
  }
  return input.name ?? input.pageId ?? input.issueIdOrKey ?? tool;
};
var onToolPre2 = (state, event, config, touched) => {
  const run = hookRun(state, event, config);
  const agentKey = event.agentId ?? "main";
  const agent = ensureAgent(run, agentKey, event, config);
  const addsWorktree = event.data.tool === "Bash" && worktreeAddOf(ensureSession(state, event), event) !== void 0;
  if (!addsWorktree) {
    startWorkStage(state, run, agent, event, config);
  }
  const { tool, input, toolUseId } = event.data;
  noteCallWork(state, run, agentKey, event);
  for (const denied of closePermissions(run, agent, event, "denied", event.sessionId)) {
    retireSpawn(state, denied.toolUseId);
  }
  expireDroppedPermissions(run, agent, event, "denied", event.sessionId);
  closeElicitations(run, event);
  const call = { toolUseId, tool, summary: callSummary(tool, input, run), startedAt: event.at };
  agent.now = call;
  agent.recent.push(call);
  if (agent.recent.length > RECENT_CAP) {
    agent.recent.shift();
  }
  const own = agentKey === "main" ? mainOf(state, event.sessionId) : void 0;
  if (own) {
    addMainCall(own, call, config.budgets.warnAt);
  }
  const early = state.index.calls[toolUseId]?.early;
  state.index.calls[toolUseId] = { runId: run.id, agentKey, at: event.at, atMs: time(event.at) };
  agent.budget.toolCalls.used += 1;
  updateMeter(state, run, agent, "tool calls", agent.budget.toolCalls, config.budgets.warnAt, event);
  if (tool === "Bash" && input.command) {
    onBashPre(state, run, agent, event, config, touched);
  }
  if (EDIT_TOOLS.has(tool) && input.filePath) {
    onEditPre(state, run, agent, input.filePath, event, config);
  }
  if (tool === "Agent" || tool === "Task") {
    onAgentPre(state, run, agentKey, event, config);
  }
  if (tool === "SubagentHandback" && input.message !== void 0 && agentKey !== "main") {
    setReport(agent, input.message, "handback", event.at);
    if (agent.endedAt) {
      finalizeAgent(run, agent, event, config);
    }
  }
  if (tool === "AskUserQuestion") {
    onAskPre(state, run, agent, event, touched);
  }
  if (config.docs.tools.includes(tool) && agentKey !== "main") {
    state.index.docsAgents[agentKey] = true;
  }
  if (config.docs.tools.includes(tool) && !ACTIVE_STATES.has(run.stages.docs.state)) {
    setStage(run, "docs", "running", event.at);
  }
  if (early) {
    onToolEnd(state, early, config, touched);
  }
  return run;
};
var noteCallWork = (state, run, agentKey, event) => {
  const { tool, input } = event.data;
  const edits = EDIT_TOOLS.has(tool);
  if (agentKey !== "main" && (edits || tool === "Bash" && !readsOnly(input.command ?? ""))) {
    noteBranchWork(state, event.sessionId, run, "agent", event.at);
  }
  if (agentKey === "main" && edits && input.filePath && isInside2(normalizePath(input.filePath), run.worktree)) {
    noteBranchWork(state, event.sessionId, run, "edit", event.at);
  }
};
var onAskPre = (state, run, agent, event, touched) => {
  const { toolUseId, input } = event.data;
  const session = agent.id === "main" ? state.index.sessions[event.sessionId] : void 0;
  (input.questions ?? []).forEach((item, index) => {
    const id = index === 0 ? `q-${toolUseId}` : `q-${toolUseId}-${index + 1}`;
    if (run.questions.some((existing) => existing.id === id)) {
      return;
    }
    const source = { agentId: agent.id, role: agent.role };
    const node = agentNode(run, agent);
    const question = { id, text: item.question, blocking: true, options: item.options ?? [], origin: "ask-tool", source, node, sessionId: event.sessionId, createdAt: event.at };
    const relayed = relayedQuestion(state, session, item.question, void 0, event.at);
    if (relayed) {
      question.relays = relayQuestion(relayed, event);
      touched.push(relayed.run);
    }
    addQuestion(run, question);
  });
};
var onBashPre = (state, run, agent, event, config, touched) => {
  const command = event.data.input.command ?? "";
  const callIndex = state.index.calls[event.data.toolUseId];
  const match = verificationKinds(command, config);
  const verify = countVerification(state, run, agent, match);
  if (verify.length > 0) {
    callIndex.verify = verify;
  }
  const own = agent.id === "main" ? mainOf(state, event.sessionId) : void 0;
  const mainVerify = own ? countMainVerification(own, match, config.budgets.warnAt) : [];
  if (mainVerify.length > 0) {
    callIndex.mainVerify = mainVerify;
  }
  updateMeter(state, run, agent, "verification rounds", agent.budget.verifyRounds, config.budgets.warnAt, event);
  const worktreeAdd = worktreeAddOf(ensureSession(state, event), event);
  if (worktreeAdd) {
    callIndex.worktreeAdd = worktreeAdd;
  }
  const join4 = compile(config).join.exec(patternInput(command));
  if (join4 && agent.id === "main") {
    const redirect = /^\s*(\S+)/.exec(command.slice(join4.index + join4[0].length))?.[1];
    const diffPath = redirect?.startsWith("/dev/") ? void 0 : redirect;
    const branch = joinBranch(join4[0]);
    const target = (branch ? branchRun(state, branch) : void 0) ?? run;
    target.join = diffPath ? { at: event.at, state: "running", diffPath } : { at: event.at, state: "running" };
    target.joins.push({ ...target.join, sessionId: event.sessionId });
    target.joins.splice(0, target.joins.length - JOINS_CAP);
    callIndex.join = target.id;
    noteBranchWork(state, event.sessionId, target, "join", event.at);
    setStage(target, "join", "running", event.at);
    if (target !== run) {
      touched.push(target);
    }
  }
  if (runsRebase(command)) {
    callIndex.rebase = true;
  }
  if (agent.id === "main" && runsGitWork(command)) {
    callIndex.gitWork = true;
  }
  if (/\bgh\s+pr\s+create\b/.test(command)) {
    const head = prHead(command);
    const target = head ? branchRun(state, head) : run;
    callIndex.prCreate = true;
    if (head) {
      callIndex.prHead = head;
    }
    if (target?.stages.pr.state === "pending") {
      setStage(target, "pr", "running", event.at);
    }
    if (target && agent.id === "main") {
      noteBranchWork(state, event.sessionId, target, "pr", event.at);
    }
    if (target && target !== run) {
      touched.push(target);
    }
  }
};
var onEditPre = (state, run, agent, filePath, line, config) => {
  const relative = relativePath(run, filePath);
  if (!agent.filesChanged.includes(relative)) {
    agent.filesChanged.push(relative);
  }
  const own = agent.id === "main" ? mainOf(state, line.sessionId) : void 0;
  if (own && !own.filesChanged.includes(relative)) {
    own.filesChanged.push(relative);
  }
  const pkg = packageOf(relative, config);
  const unset = !agent.streamId || isFallbackStream(run, agent.streamId);
  if (agent.stage === "build" && unset && pkg && !run.fixes.some((fix) => fix.agentId === agent.id)) {
    const target = packageStream(run, pkg);
    if (target.id !== agent.streamId) {
      detachStream(run, agent);
      attachStream(run, agent, target, line, state.index.agentSessions);
    }
  }
  if (agent.id !== "main" || !isInside2(normalizePath(filePath), run.worktree)) {
    return;
  }
  if (run.streams.length === 0 && run.fixes.length === 0) {
    endPlan(run, line);
  }
  const reviewer = reviewerWithChanges(run);
  if (reviewer) {
    const streamId = run.streams.find((stream) => stream.package === pkg)?.id ?? pkg;
    const open = run.fixes.find((fix) => fix.agentId === "main" && fix.state === "running" && fix.streamId === streamId);
    if (!open) {
      startFix(run, reviewer, streamId, "main", line);
    }
  }
};
var onToolEnd = (state, event, config, touched) => {
  const index = state.index.calls[event.data.toolUseId];
  const run = index ? state.board.runs[index.runId] : hookRun(state, event, config);
  if (!run) {
    return void 0;
  }
  const agentKey = index?.agentKey ?? event.agentId ?? "main";
  const agent = ensureAgent(run, agentKey, event, config);
  const call = findCall(agent, event.data.toolUseId);
  if (!index && !call) {
    state.index.calls[event.data.toolUseId] = { runId: run.id, agentKey, early: event, at: event.at, atMs: time(event.at) };
    return run;
  }
  delete state.index.calls[event.data.toolUseId];
  closeElicitations(run, event);
  if (index?.verify) {
    settleVerification(agent, index.verify, event, config);
  }
  const own = agentKey === "main" ? mainOf(state, event.sessionId) : void 0;
  const ownCall = own ? mainCall(own, event.data.toolUseId) : void 0;
  const repeated = (copy) => !index && copy?.endedAt !== void 0;
  if (!repeated(call)) {
    countOutput(agent, event, call);
  }
  if (own && !repeated(ownCall)) {
    countOutput(own, event, ownCall ?? call);
  }
  if (index?.mainVerify && own) {
    settleVerification(own, index.mainVerify, event, config);
  }
  const runWaited = call ? endCall(call, event) : false;
  const ownWaited = ownCall ? endCall(ownCall, event) : false;
  const asked = runWaited || ownWaited ? run.questions.find((q) => q.id === `q-perm-${event.data.toolUseId}`) : void 0;
  if (asked?.state === "open") {
    closeQuestion(run, asked, "answered", event, "terminal");
  }
  if (call && agent.now === call) {
    delete agent.now;
  }
  if (own && ownCall && own.now === ownCall) {
    delete own.now;
  }
  for (const question of run.questions) {
    if (question.origin === "ask-tool" && question.state === "open" && question.id.startsWith(`q-${event.data.toolUseId}`)) {
      closeQuestion(run, question, "answered", event, "terminal");
    }
  }
  if (event.event === "tool.fail") {
    const joined2 = endJoin(state, run, index, event, "failed", touched);
    if (joined2) {
      setStage(joined2, "join", "failed", event.at);
    }
    const spawn3 = state.index.spawns[event.data.toolUseId];
    const spawned = spawn3?.agentId ? run.agents[spawn3.agentId] : void 0;
    if (spawned && spawned.state === "running") {
      startRoleStageAtEnd(state, run, spawned, event, config);
      finalizeAgent(run, spawned, event, config);
      endCopies(state, run, spawned, event, config);
    }
    if (spawn3) {
      retireSpawn(state, spawn3.toolUseId);
    }
    return run;
  }
  const data = event.data;
  const succeeded = !data.interrupted && (data.exitCode === void 0 || data.exitCode === 0);
  if (index?.worktreeAdd && succeeded) {
    touched.push(onWorktreeAdded(state, event, index.worktreeAdd, agentKey, config));
  }
  const joined = endJoin(state, run, index, event, "done", touched);
  if (joined?.join) {
    setStage(joined, "join", "done", event.at);
    logRun(joined, event, `Join written${joined.join.diffPath ? `: ${baseName(joined.join.diffPath)}` : ""}`, "normal");
  }
  if (index?.prCreate) {
    onPrCreated(state, run, index, event, call, succeeded, touched, config);
  }
  if (index?.gitWork && succeeded) {
    noteBranchWork(state, event.sessionId, run, "git", event.at);
  }
  if (index?.rebase && succeeded && !isTrunkLike(run.branch, config)) {
    run.rebases.push({ at: event.at, sessionId: event.sessionId });
    run.rebases.splice(0, run.rebases.length - REBASES_CAP);
  }
  const spawn2 = state.index.spawns[data.toolUseId];
  const reporter = data.agentId ?? spawn2?.agentId;
  const foreground = !data.interrupted && data.isAsync !== true && data.status !== "async_launched";
  if (agentKey === "main" && (data.tool === "Agent" || data.tool === "Task") && reporter && foreground) {
    noteReport(ensureSession(state, event), reporter);
  }
  if (spawn2 && data.agentId) {
    rebindSpawn(state, run, spawn2, { ...data, agentId: data.agentId }, event, config);
    const spawned = run.agents[data.agentId];
    if (spawned) {
      retireSpawn(state, spawn2.toolUseId);
    }
    if (spawned) {
      spawned.background = data.isAsync ?? spawned.background;
      spawned.model = data.resolvedModel ?? spawned.model;
      const reviewer = run.reviewers.find((item) => item.agentId === spawned.id);
      if (reviewer && data.resolvedModel) {
        reviewer.model = data.resolvedModel;
      }
      const stream = run.streams.find((item) => item.id === spawned.streamId);
      if (stream && data.resolvedModel) {
        stream.model = data.resolvedModel;
      }
    }
  }
  return run;
};
var endJoin = (state, run, index, event, outcome, touched) => {
  const target = index?.join ? state.board.runs[index.join] : void 0;
  const entry = [...target?.joins ?? []].reverse().find((item) => item.at === index?.at && item.sessionId === event.sessionId);
  if (!target || !entry) {
    return void 0;
  }
  entry.state = outcome;
  if (target !== run) {
    touched.push(target);
  }
  const newest2 = [...target.joins].reverse().find((item) => item.at === target.join?.at);
  const current = target.join !== void 0 && newest2 === entry;
  if (!current || !target.join) {
    return void 0;
  }
  target.join.state = outcome;
  return target;
};
var onPrCreated = (state, run, index, event, call, succeeded, touched, config) => {
  const target = index.prHead ? branchRun(state, index.prHead) : run;
  const output = event.data.stdoutTail ?? "";
  const number = prFromUrl(output);
  const url = /https:\/\/\S+\/pull\/\d+/.exec(output)?.[0] ?? "";
  const title = /--title\s+"([^"]*)"/.exec(call?.summary ?? "")?.[1] ?? "";
  if (target && number !== void 0) {
    openPr(target, { number, url, title, createdAt: event.at }, event, config);
  }
  const landed = run.branch === "?" ? void 0 : run.branch;
  const branch = index.prHead ? target?.branch ?? index.prHead : landed;
  if (succeeded && branch) {
    const opener = { agentId: index.agentKey, sessionId: event.sessionId, at: event.at, atMs: time(event.at) };
    notePrOpener(state, branch, number === void 0 ? opener : { ...opener, number });
  }
  if (target && target !== run) {
    touched.push(target);
  }
};
var onWorktreeAdded = (state, event, add, agentKey, config) => {
  const run = registerWorktreeAdd(state, event, add, agentKey, config);
  noteBranchWork(state, event.sessionId, run, "worktree", event.at);
  const agent = ensureAgent(run, agentKey, event, config);
  startWorkStage(state, run, agent, event, config);
  logRun(run, event, `Worktree ${baseName(run.worktree)} created on ${run.branch}`, "normal", agent.id);
  return run;
};
var onPermission = (state, event, config) => {
  const run = hookRun(state, event, config);
  if (event.data.tool === "AskUserQuestion") {
    return run;
  }
  const agent = ensureAgent(run, event.agentId ?? "main", event, config);
  const asks = (item) => item.tool === event.data.tool && !item.endedAt && !item.permission;
  const own = event.agentId ? void 0 : mainOf(state, event.sessionId);
  const ownCall = own ? [...own.recent].reverse().find(asks) : void 0;
  if (ownCall) {
    ownCall.permission = "waiting";
  }
  const fallback = own ? void 0 : [...agent.recent].reverse().find(asks);
  const call = ownCall ? findCall(agent, ownCall.toolUseId) : fallback;
  if (call) {
    call.permission = "waiting";
  }
  const asked = call ?? ownCall;
  if (!asked) {
    return run;
  }
  const text = `Allow ${asked.tool}: ${asked.summary}?`;
  const source = { agentId: agent.id, role: agent.role };
  addQuestion(run, { id: `q-perm-${asked.toolUseId}`, text, blocking: true, options: [], origin: "permission", source, node: agentNode(run, agent), sessionId: event.sessionId, createdAt: event.at });
  logRun(run, event, `Waiting for permission: ${asked.tool} ${asked.summary}`, "you", agent.id);
  return run;
};

// src/model/views.ts
var isVisible = (run, config) => {
  const subagents = Object.keys(run.agents).some((key) => key !== "main");
  const mainEdits = (run.agents.main?.filesChanged.length ?? 0) > 0;
  const keyed = run.key !== void 0 && !isTrunkLike(run.branch, config);
  const prompted = run.stages.plan.startedAt !== void 0;
  return subagents || mainEdits || keyed || prompted || run.pr !== void 0 || run.plan !== void 0;
};
var stageLabel = (run, stage) => {
  if (stage === "build") {
    const counted = run.streams.filter((stream) => stream.state !== "skipped");
    if (counted.length > 1) {
      return `Build \xB7 ${counted.filter((stream) => stream.state === "done").length}/${counted.length} at join`;
    }
    if (counted.length === 1) {
      return `Build \xB7 ${counted[0].id}`;
    }
  }
  if (stage === "review" && run.reviewers.length > 0) {
    const approved = run.reviewers.filter((reviewer) => reviewer.state === "approved").length;
    return `Review \xB7 ${approved}/${run.reviewers.length}`;
  }
  if (stage === "fix") {
    const streams = [...new Set(run.fixes.filter((fix) => fix.state === "running").map((fix) => fix.streamId ?? "main"))];
    return streams.length > 0 ? `Fix \xB7 ${streams.join(", ")}` : "Fix";
  }
  return STAGE_LABELS[stage];
};
var settlesByRemoval = (removed, pr) => removed && pr?.state !== "merged" && pr?.state !== "open";
var isRemoved = (run) => settlesByRemoval(run.removedAt !== void 0, run.pr);
var doneText = (run) => {
  if (ACTIVE_STATES.has(run.stages.docs.state)) {
    return void 0;
  }
  const promotion = run.pr?.promotions[run.pr.promotions.length - 1];
  if (promotion) {
    return `Promoted to ${promotion.target}`;
  }
  return run.pr?.state === "merged" ? "Merged" : void 0;
};
var waitText = (run) => {
  if (run.questions.some((question) => question.state === "open" && question.blocking && question.audience === "user")) {
    return "question for you";
  }
  return Object.values(run.gates).some((gate) => gate.state === "waiting") ? "waiting for you" : void 0;
};
var chipTone = (run) => {
  if (isRemoved(run)) {
    return "done";
  }
  const warm = ACTIVE_STATES.has(run.stages.fix.state) || run.reviewers.some((reviewer) => reviewer.state === "changes");
  const handed = !pastBuild(run) && run.streams.some((stream) => stream.state === "handed");
  const rules = [
    ["failed", run.agents.main?.state === "failed"],
    ["you", waitText(run) !== void 0],
    ["done", doneText(run) !== void 0],
    ["amber", handed],
    ["warm", warm]
  ];
  return rules.find(([, applies]) => applies)?.[0] ?? "normal";
};
var updateChip = (run) => {
  if (isRemoved(run)) {
    run.chip = { text: "Removed", tone: "done" };
    return;
  }
  const base = doneText(run) ?? stageLabel(run, currentStage(run));
  const wait = waitText(run);
  const text = wait ? `${base} \xB7 ${wait}` : base;
  run.chip = { text, tone: chipTone(run) };
};
var updateLane = (state, run, at, config) => {
  if (run.branch === "?" || isTrunkLike(run.branch, config)) {
    return;
  }
  const lanes = state.board.branches.lanes;
  let lane = lanes.find((item) => item.branch === run.branch);
  const stage = currentStage(run);
  const waiting = run.stages[stage].waits.some((wait) => !wait.to);
  if (!lane) {
    if (run.pr?.state === "merged" || isRemoved(run)) {
      return;
    }
    lane = { branch: run.branch, runIds: [], forkedAt: run.fork?.at ?? run.startedAt, segments: [], head: { stage, waiting }, deleted: false };
    lanes.push(lane);
  }
  if (!lane.runIds.includes(run.id)) {
    lane.runIds.push(run.id);
  }
  if (run.fork?.sha) {
    lane.forkSha = run.fork.sha;
  }
  lane.head = { stage, waiting };
  lane.deleted = isRemoved(run);
  const kind = waiting ? "wait" : stage;
  const last = lane.segments[lane.segments.length - 1];
  if (lane.mergedAt || lane.deleted) {
    const end = run.endedAt ?? at;
    if (last && !last.to) {
      last.to = lane.mergedAt ?? (time(end) < time(last.from) ? last.from : end);
    }
    return;
  }
  if (!last || last.to || last.stage !== kind) {
    if (last && !last.to) {
      last.to = at;
    }
    lane.segments.push({ stage: kind, from: at });
  }
};
var refreshRun = (state, run, at, config) => {
  syncWaits(run, at);
  updateChip(run);
  if (isVisible(run, config)) {
    updateLane(state, run, at, config);
  }
};
var refreshOrder = (state, touched, config) => {
  const touchedIds = new Set(touched.map((run) => run.id));
  const order = state.board.order.filter((id) => state.board.runs[id] && !touchedIds.has(id));
  for (const run of touched) {
    if (state.board.runs[run.id] !== run || !isVisible(run, config)) {
      continue;
    }
    const at = time(run.lastEventAt);
    const position = order.findIndex((id) => time(state.board.runs[id].lastEventAt) < at);
    order.splice(position === -1 ? order.length : position, 0, run.id);
  }
  state.board.order = order;
};

// src/model/reducer.ts
var createState = (config) => ({
  board: {
    runs: {},
    order: [],
    branches: { trunk: config.branches.trunk, promote: [...config.branches.promote], lanes: [], merges: [], promotions: [] },
    tokenRanking: [],
    github: { polling: false, accountOk: false },
    warnings: []
  },
  index: {
    sessions: {},
    worktrees: {},
    spawns: {},
    agentRuns: {},
    agentStreams: {},
    agentSeen: {},
    staleAgents: {},
    docsAgents: {},
    calls: {},
    pendingStops: {},
    requests: {},
    prs: {},
    warned: {},
    fullRuns: {},
    rankKeys: {},
    rankDirty: {},
    agentSessions: {},
    branchSessions: {},
    prOpeners: {}
  }
});
var RESUMES_AGENT = /* @__PURE__ */ new Set(["prompt", "tool.pre", "tool.post", "tool.fail"]);
var resumeFailedAgent = (agent, event) => {
  if (agent?.state === "failed" && !agent.endedAt && RESUMES_AGENT.has(event.event)) {
    agent.state = "running";
  }
};
var WAKES_MAIN = /* @__PURE__ */ new Set(["prompt", "tool.pre"]);
var wakeMainThread = (main, event) => {
  if (main?.idleSince && WAKES_MAIN.has(event.event) && (event.agentId ?? "main") === "main") {
    delete main.idleSince;
  }
};
var idleMainThread = (state, session, at) => {
  for (const runId of session.runIds) {
    const main = state.board.runs[runId]?.agents.main;
    if (main) {
      main.idleSince = at;
    }
  }
  if (session.main) {
    session.main.idleSince = at;
  }
};
var onHookEvent = (state, event, config, touched) => {
  const mode = event.data.permissionMode;
  if (typeof mode === "string") {
    ensureSession(state, event).permissionMode = mode;
  }
  const session = event.agentId ? void 0 : ensureSession(state, event);
  if (session && event.event === "prompt" && (session.turnStartedAt === void 0 || time(event.at) > time(session.turnStartedAt))) {
    session.turnStartedAt = event.at;
  }
  const own = sessionMain(session, event, config);
  const run = hookEventRun(state, event, config, touched);
  resumeFailedAgent(run?.agents[event.agentId ?? "main"], event);
  resumeFailedAgent(own, event);
  wakeMainThread(run?.agents.main, event);
  wakeMainThread(own, event);
  return run;
};
var hookEventRun = (state, event, config, touched) => {
  switch (event.event) {
    case "prompt":
      return onPrompt(state, event, config, touched);
    case "tool.pre":
      return onToolPre2(state, event, config, touched);
    case "tool.post":
    case "tool.fail":
      return onToolEnd(state, event, config, touched);
    case "permission":
      return onPermission(state, event, config);
    case "agent.start":
      return onAgentStart(state, event, config);
    case "agent.stop":
      return onAgentStop(state, event, config);
    default:
      break;
  }
  const session = ensureSession(state, event);
  if (event.event === "cwd") {
    session.cwd = normalizePath(event.data.to);
  }
  if (event.event === "session.start" && event.data.transcriptPath) {
    session.transcriptPath = event.data.transcriptPath;
  }
  const run = hookRun(state, event, config);
  const agent = event.event === "session.start" || event.event === "session.end" ? void 0 : ensureAgent(run, event.agentId ?? "main", event, config);
  switch (event.event) {
    case "session.start":
      if (event.data.source === "resume") {
        logRun(run, event, `Session ${event.sessionId.slice(0, 8)} resumed`, "normal");
      }
      break;
    case "session.end":
      touched.push(...endSession(state, session, run, event.at).filter((other) => other !== run));
      touched.push(...handleHandbacks(state, session, event));
      break;
    case "turn.stop":
      if (agent?.now && agent.now.permission !== "waiting") {
        delete agent.now;
      }
      if (agent?.id === "main" && session.main?.now && session.main.now.permission !== "waiting") {
        delete session.main.now;
      }
      if (agent?.id === "main") {
        idleMainThread(state, session, event.at);
        touched.push(...handleHandbacks(state, session, event));
        addMainMessage(state, event, run);
      }
      break;
    case "turn.failure":
      if (agent) {
        agent.state = "failed";
      }
      if (agent?.id === "main" && session.main) {
        session.main.state = "failed";
      }
      logRun(run, event, `API failure: ${String(event.data.error ?? event.data.message ?? "unknown")}`, "failed", agent?.id);
      if (agent?.id === "main") {
        touched.push(...handleHandbacks(state, session, event));
      }
      break;
    case "elicitation": {
      const text = event.data.message ?? `Input requested by ${event.data.server ?? "an MCP server"}`;
      const source = { agentId: agent?.id ?? "main", role: agent?.role ?? "main" };
      const node = { kind: "stage", id: currentStage(run) };
      addQuestion(run, { id: `q-elicit-${event.id}`, text, blocking: true, options: [], origin: "elicitation", source, node, sessionId: event.sessionId, createdAt: event.at });
      break;
    }
    case "notification":
      logRun(run, event, `Notification: ${event.data.message}`, "you", agent?.id);
      break;
    case "compact.pre":
    case "compact.post":
      logRun(run, event, `Context ${event.event === "compact.pre" ? "compaction started" : "compacted"}${event.data.trigger ? ` (${event.data.trigger})` : ""}`, "normal", agent?.id);
      break;
    case "model.switch":
      if (agent && typeof event.data.model === "string") {
        agent.model = event.data.model;
      }
      if (agent?.id === "main" && typeof event.data.model === "string") {
        noteMainModel(state, event.sessionId, event.data.model);
      }
      logRun(run, event, `Model switched${typeof event.data.model === "string" ? ` to ${event.data.model}` : ""}`, "normal", agent?.id);
      break;
    case "task.created":
    case "task.completed":
      logRun(run, event, `Task ${event.event === "task.created" ? "created" : "completed"}: ${event.data.subject ?? event.data.taskId}`, "normal", agent?.id);
      break;
    default:
      break;
  }
  return run;
};
var RESUMES_WORK2 = /* @__PURE__ */ new Set([
  "prompt",
  "tool.pre",
  "tool.post",
  "tool.fail",
  "permission",
  "agent.start",
  "agent.stop",
  "task.created",
  "task.completed",
  "plan",
  "gate",
  "question"
]);
var applyEvent = (state, event, config) => {
  if (!state.index.now || time(event.at) > time(state.index.now)) {
    state.index.now = event.at;
  }
  let touched = [];
  let resumeActivity = false;
  switch (event.event) {
    case "plan":
      touched = [onPlan(state, event, config)].filter((run) => run !== void 0);
      break;
    case "gate":
      touched = [onGate(state, event, config)].filter((run) => run !== void 0);
      break;
    case "question": {
      const changed = [];
      const run = onQuestion(state, event, config, changed);
      touched = [...new Set(run ? [run, ...changed] : changed)];
      break;
    }
    case "git.fact":
      if (event.data.kind === "worktree-removed") {
        touched = onWorktreeRemoved(state, event.data, event.at);
      } else {
        touched = onGitFact(state, event.data, config);
      }
      break;
    case "gh.fact":
      touched = onGhFact(state, event, config);
      break;
    case "usage.fact":
      touched = [onUsage(state, event, config)].filter((run) => run !== void 0);
      break;
    case "tick":
      touched = [.../* @__PURE__ */ new Set([...onActivityTick(state, event.data.now), ...onTick(state, event.data.now)])];
      break;
    default: {
      const changed = [];
      const run = onHookEvent(state, event, config, changed);
      recordLine(state, event, run);
      onOverheadLine(state, event);
      const others = [...changed, ...closeSessionPermissions(state, event), ...changedCopyRuns(state, event, run)].filter((item) => item !== run);
      touched = [...new Set(run ? [run, ...others] : others)];
      resumeActivity = event.event !== "session.end";
      break;
    }
  }
  syncMainCalls(state, event);
  touched = [.../* @__PURE__ */ new Set([...touched, ...noteActivity(state, event)])];
  for (const run of touched) {
    if (event.src !== "server" || event.event === "usage.fact") {
      run.lastEventAt = event.at;
    }
    if (RESUMES_WORK2.has(event.event) && time(event.at) > time(run.lastActiveAt)) {
      run.lastActiveAt = event.at;
    }
    if (resumeActivity && run.endedAt && run.pr?.state !== "merged" && !staysRemoved(state, run)) {
      delete run.endedAt;
      delete run.removedAt;
    }
    refreshRun(state, run, event.at, config);
    state.index.rankDirty[run.id] = true;
  }
  refreshOrder(state, touched, config);
  pruneIndex(state, event.at, config);
  if (event.event === "usage.fact" || event.event === "gh.fact" || event.event === "git.fact") {
    updateRanking(state);
  }
};
var reduce = (state, event, config) => {
  const next = structuredClone(state);
  applyEvent(next, event, config);
  return next;
};

// src/model/agent-merge.ts
var homeRunOf = (state, agentId) => Object.hasOwn(state.index.agentRuns, agentId) ? state.index.agentRuns[agentId] : void 0;
var agentCopies = (state, runIds, agentId) => {
  const home = homeRunOf(state, agentId);
  const ids = new Set(runIds);
  if (home !== void 0) {
    ids.add(home);
  }
  const copies = [];
  for (const id of ids) {
    const run = state.board.runs[id];
    if (run && Object.hasOwn(run.agents, agentId)) {
      copies.push({ run, agent: run.agents[agentId] });
    }
  }
  const homeFirst = (a, b) => Number(b.run.id === home) - Number(a.run.id === home);
  const byStart2 = (a, b) => time(a.agent.startedAt) - time(b.agent.startedAt);
  return copies.sort((a, b) => homeFirst(a, b) || byStart2(a, b) || compareText(a.run.id, b.run.id));
};
var addCounts3 = (target, source) => {
  for (const key of Object.keys(target)) {
    target[key] += source[key];
  }
};
var addToolOutput = (target, source) => {
  for (const [tool, output] of Object.entries(source)) {
    const sum = ownEntry(target, tool, () => ({ calls: 0, chars: 0, maxChars: 0 }));
    sum.calls += output.calls;
    sum.chars += output.chars;
    sum.maxChars = Math.max(sum.maxChars, output.maxChars);
  }
};
var mergeBudget = (lead, rest, warnAt) => {
  const merged = structuredClone(lead);
  for (const budget of rest) {
    merged.toolCalls.used += budget.toolCalls.used;
    merged.context.used = Math.max(merged.context.used, budget.context.used);
    merged.requests += budget.requests;
    addCounts3(merged.tokens, budget.tokens);
    merged.costUsd += budget.costUsd;
    addToolOutput(merged.toolOutput, budget.toolOutput);
    merged.largeOutputs += budget.largeOutputs;
    if (budget.toolCallsAtFirstStop !== void 0) {
      merged.toolCallsAtFirstStop = (merged.toolCallsAtFirstStop ?? 0) + budget.toolCallsAtFirstStop;
    }
    for (const kind of VERIFY_KINDS) {
      merged.verifyRounds.commands[kind] += budget.verifyRounds.commands[kind];
      merged.verifyRounds.results[kind].push(...budget.verifyRounds.results[kind]);
    }
  }
  const fullRuns = Math.max(...VERIFY_KINDS.map((kind) => merged.verifyRounds.results[kind].length));
  merged.verifyRounds.used = Math.max(fullRuns, lead.verifyRounds.used, ...rest.map((budget) => budget.verifyRounds.used));
  for (const meter of [merged.toolCalls, merged.verifyRounds, merged.context]) {
    setLevel(meter, warnAt);
  }
  return merged;
};
var byCallStart = (a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.toolUseId, b.toolUseId);
var mergeRecent = (agents) => {
  const calls = /* @__PURE__ */ new Map();
  for (const call of agents.flatMap((agent) => agent.recent)) {
    if (!calls.has(call.toolUseId)) {
      calls.set(call.toolUseId, call);
    }
  }
  return structuredClone([...calls.values()].sort(byCallStart).slice(-RECENT_CAP));
};
var mergeAgent = (lead, rest, config) => {
  const merged = structuredClone(lead.agent);
  if (rest.length === 0) {
    return merged;
  }
  const agents = [lead.agent, ...rest.map((copy) => copy.agent)];
  const budgets = rest.map((copy) => copy.agent.budget);
  merged.budget = mergeBudget(lead.agent.budget, budgets, config.budgets.warnAt);
  merged.recent = mergeRecent(agents);
  const open = agents.flatMap((agent) => agent.now ? [agent.now] : []);
  const newestOpen = open.sort(byCallStart).at(-1);
  delete merged.now;
  if (newestOpen) {
    merged.now = structuredClone(newestOpen);
  }
  merged.filesChanged = [...new Set(agents.flatMap((agent) => agent.filesChanged))];
  delete merged.resumedAt;
  for (const agent of agents) {
    if (time(agent.startedAt) < time(merged.startedAt)) {
      merged.startedAt = agent.startedAt;
    }
    if (agent.resumedAt !== void 0 && (merged.resumedAt === void 0 || time(agent.resumedAt) > time(merged.resumedAt))) {
      merged.resumedAt = agent.resumedAt;
    }
  }
  return merged;
};
var openedBranch = (state, agentId) => {
  const opened = Object.values(state.board.runs).filter((run) => run.pr?.openedBy?.agentId === agentId && !isTrunkBranch(state, run.branch));
  const first = opened.sort((a, b) => compareText(a.id, b.id))[0];
  return first === void 0 ? void 0 : branchWorkKey(first);
};
var workedIn = (state, { run, agent }) => {
  const worked = roleStageStarted(run, agent) || agent.budget.toolCalls.used > 0;
  return worked && !isTrunkBranch(state, run.branch);
};
var agentBranch = (state, lead, rest) => {
  const worked = [lead, ...rest].filter((copy) => workedIn(state, copy));
  const first = worked.sort((a, b) => time(a.agent.startedAt) - time(b.agent.startedAt) || compareText(a.run.id, b.run.id))[0];
  if (first) {
    return branchWorkKey(first.run);
  }
  return lead.agent.stage === "pr" ? openedBranch(state, lead.agent.id) : void 0;
};
var sessionAgents = (state, session, runIds, config) => {
  const agents = {};
  if (session.main) {
    agents[MAIN_AGENT] = { ...structuredClone(session.main), pipeline: 0 };
  }
  for (const agentId of session.agentIds.filter((id) => id !== MAIN_AGENT)) {
    const [lead, ...rest] = agentCopies(state, runIds, agentId);
    if (!lead) {
      continue;
    }
    const branch = agentBranch(state, lead, rest);
    agents[agentId] = { ...mergeAgent(lead, rest, config), ...branch === void 0 ? {} : { branch }, pipeline: 0 };
  }
  return agents;
};

// src/model/session-rows.ts
var byNodeStart = (a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.agentId, b.agentId);
var byAgentStart = (a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.id, b.id);
var newest = (times) => [...times].sort((a, b) => time(a) - time(b)).pop();
var ownAgent2 = (ctx, agentId) => {
  const sessions = ctx.state.index.agentSessions;
  return Object.hasOwn(sessions, agentId) && sessions[agentId] === ctx.sessionId;
};
var ownFix = (ctx, fix) => fix.sessionId === void 0 ? ownAgent2(ctx, fix.agentId) : fix.sessionId === ctx.sessionId;
var groupRows = (state, session) => {
  const groups = /* @__PURE__ */ new Map();
  for (const work of session.branchWork) {
    const run = state.board.runs[work.runId];
    if (!run) {
      continue;
    }
    const key = branchWorkKey(run);
    const group = groups.get(key) ?? { at: work.at, runs: /* @__PURE__ */ new Map() };
    if (time(work.at) < time(group.at)) {
      group.at = work.at;
    }
    const entry = group.runs.get(run.id);
    if (!entry || time(work.at) < time(entry.at)) {
      group.runs.set(run.id, { run, at: work.at });
    }
    groups.set(key, group);
  }
  const rows = [...groups].map(([branch, group]) => {
    const entries = [...group.runs.values()].sort((a, b) => time(a.at) - time(b.at) || compareText(a.run.id, b.run.id));
    return { branch, runs: entries.map((entry) => entry.run), firstWorkAt: group.at };
  });
  return rows.sort((a, b) => time(a.firstWorkAt) - time(b.firstWorkAt) || compareText(a.branch, b.branch));
};
var agentNode2 = (agent, merged) => {
  const model = agent.model ?? merged?.model;
  const stale = (merged ?? agent).staleSince !== void 0;
  return { agentId: agent.id, state: agent.state, ...model === void 0 ? {} : { model }, stale, startedAt: agent.startedAt };
};
var rowStreams = (ctx, runs) => {
  const streams = /* @__PURE__ */ new Map();
  for (const run of runs) {
    for (const stream of run.streams) {
      const ids = stream.agentIds.filter((id) => ownAgent2(ctx, id) && Object.hasOwn(run.agents, id));
      if (ids.length === 0) {
        continue;
      }
      const entry = streams.get(stream.id) ?? { id: stream.id, package: stream.package, after: [...stream.after], runs: [] };
      for (const id of ids.filter((agentId) => !entry.runs.some((node) => node.agentId === agentId))) {
        entry.runs.push(agentNode2(run.agents[id], ctx.agents[id]));
      }
      streams.set(stream.id, entry);
    }
  }
  const list = [...streams.values()];
  for (const entry of list) {
    entry.runs.sort(byNodeStart);
  }
  return list;
};
var ownFixes = (ctx, runs) => {
  const fixes = /* @__PURE__ */ new Map();
  for (const fix of runs.flatMap((run) => run.fixes)) {
    if (ownFix(ctx, fix) && !fixes.has(fix.id)) {
      fixes.set(fix.id, fix);
    }
  }
  return [...fixes.values()];
};
var rowReviewers = (ctx, runs, fixes) => {
  const seen = /* @__PURE__ */ new Map();
  for (const agent of runs.flatMap((run) => Object.values(run.agents))) {
    if (agent.stage === "review" && agent.reviewerId !== void 0 && !seen.has(agent.id)) {
      seen.set(agent.id, { agent, reviewerId: agent.reviewerId });
    }
  }
  const all = [...seen.values()].sort((a, b) => byAgentStart(a.agent, b.agent));
  return all.filter(({ agent }) => ownAgent2(ctx, agent.id)).map((entry) => {
    const round = all.filter((other) => other.reviewerId === entry.reviewerId).indexOf(entry) + 1;
    const afterFix = fixes.filter((fix) => fix.reReview?.agentId === entry.agent.id).at(-1)?.id;
    return { ...agentNode2(entry.agent, ctx.agents[entry.agent.id]), reviewerId: entry.reviewerId, round, ...afterFix === void 0 ? {} : { afterFix } };
  });
};
var answeredReviewer = (fix, reviewers) => {
  const reReview = reviewers.find((reviewer) => reviewer.agentId === fix.reReview?.agentId);
  const before = (reviewer) => !reReview || byNodeStart(reviewer, reReview) < 0;
  const answered = reviewers.filter((reviewer) => reviewer.reviewerId === fix.reviewerId && reviewer !== reReview && before(reviewer));
  return answered.at(-1)?.agentId;
};
var rowFixes = (ctx, fixes, reviewers) => fixes.map((fix) => {
  const agent = ctx.agents[fix.agentId];
  const reviewerAgentId = answeredReviewer(fix, reviewers);
  const model = agent?.model;
  const node = { id: fix.id, agentId: fix.agentId, state: fix.state, stale: agent?.staleSince !== void 0 };
  if (reviewerAgentId !== void 0) {
    node.reviewerAgentId = reviewerAgentId;
  }
  if (model !== void 0) {
    node.model = model;
  }
  return node;
});
var rowJoin = (ctx, runs) => {
  let found;
  for (const join4 of runs.flatMap((run) => run.joins)) {
    if (join4.sessionId === ctx.sessionId && (found === void 0 || time(join4.at) >= time(found.at))) {
      found = join4;
    }
  }
  return found === void 0 ? void 0 : { state: found.state, at: found.at };
};
var branchPr = (state, row) => {
  let runs = row.runs.filter((run) => run.pr !== void 0);
  if (runs.length === 0 && row.runs.every((run) => run.branch !== "?")) {
    runs = Object.values(state.board.runs).filter((run) => run.branch === row.branch && run.pr !== void 0);
  }
  const prs = runs.flatMap((run) => run.pr ? [run.pr] : []);
  return prs.sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.number - a.number)[0];
};
var rowPr = (ctx, branch, pr) => {
  const shepherds = Object.values(ctx.agents).filter((agent) => agent.id !== MAIN_AGENT && agent.stage === "pr" && agent.branch === branch);
  const shepherd = shepherds.sort(byAgentStart).pop();
  if (!pr && !shepherd) {
    return void 0;
  }
  const node = { state: pr || !shepherd ? "done" : shepherd.state };
  if (shepherd) {
    node.agentId = shepherd.id;
  }
  if (pr) {
    node.pr = { ...structuredClone(pr), openedHere: pr.openedBy?.sessionId === ctx.sessionId };
  }
  return node;
};
var handedOver = (gate) => gate.source === "marker" && (gate.state === "waiting" || gate.state === "done");
var rowMerge = (ctx, row, pr) => {
  const endedAt = ctx.session.endedAt;
  if (pr.state === "merged") {
    const at = pr.mergedAt ?? pr.closedAt;
    const afterEnd = at !== void 0 && endedAt !== void 0 && time(at) > time(endedAt);
    return { state: "done", ...at === void 0 ? {} : { at }, afterEnd };
  }
  if (pr.state === "closed") {
    return { state: "closed", ...pr.closedAt === void 0 ? {} : { at: pr.closedAt }, afterEnd: false };
  }
  const handed = row.runs.some((run) => handedOver(run.gates.merge));
  return mergeWaits(ctx.config) || handed ? { state: "waiting", afterEnd: false } : void 0;
};
var isRemovedRow = (row, pr) => settlesByRemoval(row.runs.every((run) => run.removedAt !== void 0), pr);
var settleTime = (row, pr, continuedAt) => {
  let at;
  if (pr?.state === "merged" || pr?.state === "closed") {
    at = pr.state === "merged" ? pr.mergedAt ?? pr.closedAt : pr.closedAt;
  } else if (isRemovedRow(row, pr)) {
    at = newest(row.runs.flatMap((run) => run.removedAt === void 0 ? [] : [run.removedAt]));
  }
  if (continuedAt !== void 0 && (at === void 0 || time(continuedAt) < time(at))) {
    at = continuedAt;
  }
  return at;
};
var latestReviewers = (reviewers) => [...new Map(reviewers.map((reviewer) => [reviewer.reviewerId, reviewer])).values()];
var building = (stream, past) => {
  const latest = stream.runs.at(-1);
  return latest !== void 0 && (ACTIVE_STATES.has(latest.state) || latest.state === "handed" && !past);
};
var activeStage = (row, past) => {
  const reviewing = latestReviewers(row.reviewers).some((reviewer) => ACTIVE_STATES.has(reviewer.state) || reviewer.state === "changes");
  const columns = [
    ["build", row.streams.some((stream) => building(stream, past))],
    ["join", row.join !== void 0 && ACTIVE_STATES.has(row.join.state)],
    ["review", reviewing],
    ["fix", row.fixes.some((fix) => ACTIVE_STATES.has(fix.state))],
    ["pr", row.pr !== void 0 && ACTIVE_STATES.has(row.pr.state)],
    ["merge", row.merge?.state === "waiting"]
  ];
  return columns.filter(([, active]) => active).map(([stage]) => stage).at(-1);
};
var allApproved = (row) => {
  const latest = latestReviewers(row.reviewers);
  return latest.length > 0 && latest.every((reviewer) => reviewer.state === "approved");
};
var reachedStage = (row) => {
  if (row.merge?.state === "waiting") {
    return "merge";
  }
  if (row.pr) {
    return "pr";
  }
  if (row.fixes.length > 0 && !allApproved(row)) {
    return "fix";
  }
  if (row.reviewers.length > 0) {
    return "review";
  }
  if (row.join) {
    return "join";
  }
  return row.streams.length > 0 ? "built" : "worktree";
};
var settledStage = (row, removed) => {
  const pr = row.pr?.pr;
  if (removed) {
    return "removed";
  }
  if (pr?.state === "merged") {
    return pr.promotions.length > 0 ? "promoted" : "merged";
  }
  return pr?.state === "closed" ? "closed" : void 0;
};
var stageText = (row, stage) => {
  const pr = row.pr?.pr;
  switch (stage) {
    case "worktree":
      return "Worktree created";
    case "build":
      return "Build";
    case "built":
      return "Built";
    case "join":
      return "Join";
    case "review": {
      const latest = latestReviewers(row.reviewers);
      const approved = latest.filter((reviewer) => reviewer.state === "approved").length;
      return `Review \xB7 ${approved}/${latest.length} approved`;
    }
    case "fix":
      return "Fix";
    case "pr":
      return pr?.state === "open" ? `PR #${pr.number} open` : "PR";
    case "merge":
      return "Merge \xB7 waiting for you";
    case "merged":
    case "promoted":
      return `#${pr?.number ?? "?"} ${stage}`;
    case "closed":
    case "removed":
      return stage;
  }
};
var continuedStage = (row) => {
  if (row.pr?.pr?.state === "open") {
    return { stage: "pr", text: stageText(row, "pr") };
  }
  return { stage: reachedStage(row), text: "continued" };
};
var isLiveRow = (row) => {
  const states = [
    ...row.streams.flatMap((stream) => stream.runs.map((node) => node.state)),
    ...row.reviewers.map((reviewer) => reviewer.state),
    ...row.fixes.map((fix) => fix.state),
    ...row.join ? [row.join.state] : [],
    ...row.pr ? [row.pr.state] : []
  ];
  return states.some((state) => ACTIVE_STATES.has(state)) || row.merge?.state === "waiting";
};
var firstEditPackage = (agents, config) => {
  for (const file of [...agents].sort(byAgentStart).flatMap((agent) => agent.filesChanged)) {
    const pkg = packageOf(file, config);
    if (pkg !== void 0) {
      return pkg;
    }
  }
  return void 0;
};
var branchRuns = (state, branch) => {
  const runs = Object.values(state.board.runs).filter((run) => branchWorkKey(run) === branch);
  return runs.sort((a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.id, b.id));
};
var streamPackages = (runs) => {
  const started = runs.flatMap((run) => run.streams.filter((stream) => stream.agentIds.some((id) => Object.hasOwn(run.agents, id))));
  return [...new Set(started.map((stream) => stream.package))];
};
var editedPackage = (runs, config) => {
  const agents = runs.flatMap((run) => Object.values(run.agents));
  const subagents = agents.filter((agent) => agent.id !== MAIN_AGENT);
  return firstEditPackage(subagents, config) ?? firstEditPackage(agents.filter((agent) => agent.id === MAIN_AGENT), config);
};
var rowPackage = (ctx, branch) => {
  const runs = branchRuns(ctx.state, branch);
  const packages = streamPackages(runs);
  if (packages.length > 0) {
    return packages.length === 1 ? packages[0] : void 0;
  }
  return editedPackage(runs, ctx.config);
};
var branchEntries = (state, branch) => {
  const entries = Object.hasOwn(state.index.branchSessions, branch) ? state.index.branchSessions[branch] : [];
  return [...entries].sort((a, b) => time(a.at) - time(b.at) || compareText(a.sessionId, b.sessionId));
};
var workedBeyondStart = (state, sessionId, branch) => {
  const works = recordOf(state, sessionId)?.branchWork ?? [];
  return works.some((work) => {
    const run = work.how === "start" ? void 0 : ownValue(state.board.runs, work.runId);
    return run !== void 0 && branchWorkKey(run) === branch;
  });
};
var branchWorkers = (state, branch) => {
  const entries = branchEntries(state, branch);
  const worked = entries.filter((entry) => workedBeyondStart(state, entry.sessionId, branch));
  return { entries, workers: new Set((worked.length > 0 ? worked : entries).map((entry) => entry.sessionId)) };
};
var workerNeighbour = (sessions, sessionId, step) => {
  const position = sessions.entries.findIndex((entry) => entry.sessionId === sessionId);
  if (position === -1) {
    return void 0;
  }
  const side = step === 1 ? sessions.entries.slice(position + 1) : sessions.entries.slice(0, position).reverse();
  return side.find((entry) => sessions.workers.has(entry.sessionId));
};
var branchOwner = (sessions) => sessions.entries.filter((entry) => sessions.workers.has(entry.sessionId)).at(-1)?.sessionId;
var buildRow = (ctx, row) => {
  const workers = branchWorkers(ctx.state, row.branch);
  const ownerId = branchOwner(workers);
  const owner = ownerId === void 0 || ownerId === ctx.sessionId;
  const continuedAt = owner ? void 0 : workerNeighbour(workers, ctx.sessionId, 1)?.at;
  const streams = rowStreams(ctx, row.runs);
  const fixes = ownFixes(ctx, row.runs);
  const reviewers = rowReviewers(ctx, row.runs, fixes);
  const pr = branchPr(ctx.state, row);
  const pkg = rowPackage(ctx, row.branch);
  const join4 = rowJoin(ctx, row.runs);
  const prNode = rowPr(ctx, row.branch, pr);
  const merge = owner && pr ? rowMerge(ctx, row, pr) : void 0;
  const built = {
    branch: row.branch,
    runIds: row.runs.map((run) => run.id),
    firstWorkAt: row.firstWorkAt,
    pipeline: 0,
    ...pkg === void 0 ? {} : { package: pkg },
    owner,
    stage: "worktree",
    stageText: "",
    streams,
    ...join4 === void 0 ? {} : { join: join4 },
    reviewers,
    fixes: rowFixes(ctx, fixes, reviewers),
    ...prNode === void 0 ? {} : { pr: prNode },
    ...merge === void 0 ? {} : { merge },
    rebased: row.runs.some((run) => run.rebases.some((rebase) => rebase.sessionId === ctx.sessionId)),
    live: false
  };
  const settledAt = settleTime(row, pr, continuedAt);
  if (settledAt !== void 0) {
    built.settledAt = settledAt;
  }
  const settled = settledStage(built, isRemovedRow(row, pr));
  if (settled === void 0 && continuedAt !== void 0) {
    const continued = continuedStage(built);
    built.stage = continued.stage;
    built.stageText = continued.text;
  } else {
    built.stage = settled ?? activeStage(built, row.runs.some(pastBuild)) ?? reachedStage(built);
    built.stageText = stageText(built, built.stage);
  }
  built.live = isLiveRow(built);
  return built;
};
var parentBranch = (state, row, branches2) => {
  for (const id of row.runIds) {
    const base = state.board.runs[id]?.fork?.base;
    if (base !== void 0 && base !== row.branch && branches2.has(base)) {
      return base;
    }
  }
  return void 0;
};
var sessionRows = (ctx) => {
  const rows = groupRows(ctx.state, ctx.session).map((row) => buildRow(ctx, row));
  const branches2 = new Set(rows.map((row) => row.branch));
  for (const row of rows) {
    const parent = parentBranch(ctx.state, row, branches2);
    if (parent !== void 0) {
      row.from = { kind: "branch", branch: parent };
    }
  }
  return rows;
};
var sessionGates = (ctx, rows, id) => {
  const owned = new Set(rows.filter((row) => row.owner).flatMap((row) => row.runIds));
  return ctx.runIds.flatMap((runId) => {
    const gate = ctx.state.board.runs[runId]?.gates[id];
    const unowned = (gate?.sessionId ?? "") === "";
    const mine = gate !== void 0 && (gate.sessionId === ctx.sessionId || unowned && owned.has(runId));
    return gate && mine ? [gate] : [];
  });
};
var promoteNode = (ctx, rows) => {
  const merged = rows.filter((row) => row.owner && row.pr?.pr?.state === "merged").flatMap((row) => row.pr?.pr ? [row.pr.pr] : []);
  const promotions = merged.flatMap((pr) => pr.promotions).sort((a, b) => time(a.mergedAt) - time(b.mergedAt) || compareText(a.target, b.target));
  const targets = [...new Set(promotions.map((promotion) => promotion.target))];
  const waiting = sessionGates(ctx, rows, "promote").some((gate) => gate.state === "waiting");
  if (targets.length === 0 && !waiting) {
    return void 0;
  }
  if (waiting) {
    const gates = new Set(sessionGates(ctx, rows, "promote").filter((gate) => gate.state === "waiting"));
    const gateOf = (runId) => ownValue(ctx.state.board.runs, runId)?.gates.promote;
    const carried = (row) => row.runIds.some((runId) => gates.has(gateOf(runId)));
    return { state: "waiting", targets, carries: rows.filter(carried).map((row) => row.branch) };
  }
  return { state: merged.every((pr) => pr.promotions.length > 0) ? "done" : "pending", targets };
};
var isDocsAgent = (ctx, agent) => {
  const docsCall = Object.hasOwn(ctx.state.index.docsAgents, agent.id);
  return agent.id !== MAIN_AGENT && (ctx.config.docs.roles.includes(agent.role) || docsCall);
};
var docsAgentOf = (ctx) => {
  const docsAgents = Object.values(ctx.agents).filter((agent) => isDocsAgent(ctx, agent));
  return docsAgents.sort(byAgentStart).at(-1);
};
var docsNode = (ctx, rows) => {
  const agent = docsAgentOf(ctx);
  const gates = sessionGates(ctx, rows, "docs").filter((gate) => gate.state === "waiting" || gate.state === "done");
  const waiting = gates.some((gate) => gate.state === "waiting");
  if (!agent && gates.length === 0) {
    return void 0;
  }
  let state = waiting ? "waiting" : "done";
  if (agent && !waiting) {
    state = agent.state;
  }
  return { state, ...agent ? { agentId: agent.id } : {}, ...agent?.branch === void 0 ? {} : { branch: agent.branch } };
};
var planGate = () => ({ kind: "gate", gate: "plan" });
var agentRef = (node) => node === void 0 ? void 0 : { kind: "agent", agentId: node.agentId };
var idNode = (row, node) => {
  if (node.kind === "stream") {
    return agentRef(row.streams.find((stream) => stream.id === node.id)?.runs.at(-1));
  }
  if (node.kind === "reviewer") {
    return agentRef(row.reviewers.filter((reviewer) => reviewer.reviewerId === node.id).at(-1));
  }
  return row.fixes.some((fix) => fix.id === node.id) ? { kind: "fix", branch: row.branch, fixId: node.id } : void 0;
};
var stageNode = (row, stage) => {
  switch (stage) {
    case "build":
      return agentRef(row.streams[0]?.runs.at(-1));
    case "join":
      return row.join ? { kind: "join", branch: row.branch } : void 0;
    case "review":
      return agentRef(row.reviewers.at(-1));
    case "fix": {
      const fix = row.fixes.at(-1);
      return fix ? { kind: "fix", branch: row.branch, fixId: fix.id } : void 0;
    }
    case "pr":
      return row.pr ? { kind: "pr", branch: row.branch } : void 0;
    case "merge":
      return row.merge ? { kind: "merge", branch: row.branch } : void 0;
    default:
      return void 0;
  }
};
var gateNode = (id, row, nodes) => {
  if (id === "merge" && row?.merge) {
    return { place: { kind: "merge", branch: row.branch }, branch: row.branch };
  }
  if (id === "promote" && nodes.promote) {
    return { place: { kind: "promote" } };
  }
  if (id === "docs" && nodes.docs) {
    return { place: { kind: "docs" } };
  }
  return void 0;
};
var idPlace = (node, own, rows) => {
  for (const row of [...own ? [own] : [], ...[...rows].reverse()]) {
    const place = idNode(row, node);
    if (place) {
      return { place, branch: row.branch };
    }
  }
  return void 0;
};
var placeOf = (ctx, question, runId, rows, nodes) => {
  const own = rows.find((row) => row.runIds.includes(runId));
  const node = question.node;
  const asker = question.source.agentId;
  const byId = node.kind === "stream" || node.kind === "reviewer" || node.kind === "fix" ? idPlace(node, own, rows) : void 0;
  const byGate = node.kind === "gate" || node.kind === "stage" ? gateNode(node.id, own, nodes) : void 0;
  if (byId) {
    return byId;
  }
  if (asker === MAIN_AGENT) {
    return node.kind === "gate" && byGate ? byGate : { place: { kind: "plan" } };
  }
  if (asker !== "" && Object.hasOwn(ctx.agents, asker)) {
    const branch = ctx.agents[asker].branch;
    return { place: { kind: "agent", agentId: asker }, ...branch === void 0 ? {} : { branch } };
  }
  if (byGate) {
    return byGate;
  }
  const place = node.kind === "stage" && own ? stageNode(own, node.id) : void 0;
  return place && own ? { place, branch: own.branch } : { place: planGate() };
};
var sessionQuestions = (ctx, rows, nodes) => {
  const found = [];
  for (const runId of ctx.runIds) {
    for (const question of ctx.state.board.runs[runId]?.questions ?? []) {
      if (question.sessionId === ctx.sessionId) {
        found.push({ question, runId });
      }
    }
  }
  const byCreation = (a, b) => time(a.question.createdAt) - time(b.question.createdAt);
  const ordered = found.sort((a, b) => byCreation(a, b) || compareText(a.question.id, b.question.id) || compareText(a.runId, b.runId));
  return ordered.map(({ question, runId }) => ({ ...structuredClone(question), ...placeOf(ctx, question, runId, rows, nodes) }));
};
var markQuestionRows = (rows, questions) => {
  for (const question of questions) {
    const row = rows.find((item) => item.branch === question.branch);
    if (row && question.state === "open" && question.audience === "user") {
      row.live = true;
    }
  }
};

// src/model/session-links.ts
var afterOf = (session) => {
  const source = session?.source;
  return source === "clear" || source === "resume" ? source : void 0;
};
var firstRowOf = (state, session) => groupRows(state, session)[0];
var continuedOf = (state, sessionId) => {
  const session = recordOf(state, sessionId);
  const first = session ? firstRowOf(state, session) : void 0;
  if (!first) {
    return void 0;
  }
  const workers = branchWorkers(state, first.branch);
  const previous = workerNeighbour(workers, sessionId, -1);
  return previous ? { sessionId: previous.sessionId, branch: first.branch, at: first.firstWorkAt, counts: workers.workers.has(sessionId) } : void 0;
};
var sessionKey = (state, sessionId, config) => keyOf(state, sessionId, config, /* @__PURE__ */ new Set());
var keyOf = (state, sessionId, config, seen) => {
  const session = recordOf(state, sessionId);
  if (!session || seen.has(sessionId)) {
    return void 0;
  }
  seen.add(sessionId);
  const compiled = compile(config);
  const promptKey = compiled.promptKey ? session.prompts[0]?.keys[0] : void 0;
  if (promptKey !== void 0) {
    return promptKey;
  }
  const first = firstRowOf(state, session);
  const fromBranch = first ? branchKey(first.branch, compiled.branchKey, compiled.keyIgnoreCase) : void 0;
  if (fromBranch !== void 0) {
    return fromBranch;
  }
  const continued = continuedOf(state, sessionId);
  return continued ? keyOf(state, continued.sessionId, config, seen) : void 0;
};
var newestNote = (session) => {
  const notes = session.plans.filter((plan) => plan.note !== void 0 && plan.note.trim() !== "");
  return notes.sort(byLineTime).at(-1)?.note;
};
var sessionTitle = (state, sessionId, config) => {
  const session = recordOf(state, sessionId);
  if (!session) {
    return void 0;
  }
  const key = sessionKey(state, sessionId, config);
  const note = newestNote(session);
  if (note !== void 0) {
    return promptTitle(note, key);
  }
  const rows = groupRows(state, session);
  const pr = rows.length === 1 ? branchPr(state, rows[0]) : void 0;
  if (pr) {
    return pr.title;
  }
  const prompt = session.prompts[0];
  return prompt ? promptTitle(prompt.line, key) : void 0;
};
var linkTo = (state, sessionId, branch, after, config) => {
  const key = sessionKey(state, sessionId, config);
  const title = sessionTitle(state, sessionId, config);
  return {
    sessionId,
    branch,
    ...key === void 0 ? {} : { key },
    ...title === void 0 ? {} : { title },
    ...after === void 0 ? {} : { after }
  };
};
var continuesLink = (state, sessionId, config) => {
  const continued = continuedOf(state, sessionId);
  if (!continued) {
    return void 0;
  }
  return linkTo(state, continued.sessionId, continued.branch, afterOf(recordOf(state, sessionId)), config);
};
var continuedInLinks = (state, sessionId, rows, config) => {
  const candidates = /* @__PURE__ */ new Set();
  for (const row of rows) {
    for (const entry of branchEntries(state, row.branch)) {
      candidates.add(entry.sessionId);
    }
  }
  candidates.delete(sessionId);
  const found = [];
  for (const candidate of candidates) {
    const continued = continuedOf(state, candidate);
    if (continued?.sessionId === sessionId && continued.counts) {
      found.push({ ...continued, sessionId: candidate });
    }
  }
  found.sort((a, b) => time(a.at) - time(b.at) || compareText(a.sessionId, b.sessionId));
  return found.map((item) => linkTo(state, item.sessionId, item.branch, afterOf(recordOf(state, item.sessionId)), config));
};
var rowContinuedIn = (state, sessionId, row, config) => {
  const next = row.owner ? void 0 : workerNeighbour(branchWorkers(state, row.branch), sessionId, 1)?.sessionId;
  return next === void 0 ? void 0 : linkTo(state, next, row.branch, afterOf(recordOf(state, next)), config);
};

// src/model/session-view.ts
var SESSION_LOG_CAP = 20;
var PIPELINE_TITLE_MAX = 40;
var GATE_ORDER = ["plan", "merge", "promote", "docs"];
var newestOf = (times) => times.reduce((best, at) => time(at) > time(best) ? at : best);
var byAgentStart2 = (a, b) => time(a.startedAt) - time(b.startedAt) || compareText(a.id, b.id);
var isShown = (session) => session.prompts.length > 0 || session.agentIds.length > 0 || session.branchWork.length > 0;
var sessionOrder = (state) => {
  const activeAt = (session) => time(session.lastActiveAt ?? session.startedAt);
  const shown = Object.entries(state.index.sessions).filter(([, session]) => isShown(session));
  return shown.sort(([aId, a], [bId, b]) => activeAt(b) - activeAt(a) || compareText(aId, bId)).map(([id]) => id);
};
var kindOf2 = (session, rows) => {
  const mainEdits = (session.main?.filesChanged.length ?? 0) > 0;
  const card = session.agentIds.length > 0 || mainEdits || rows.some((row) => row.pr?.pr !== void 0);
  return card ? "card" : "conversation";
};
var finishedAtOf = (endedAt, rows) => {
  const owned = rows.filter((row) => row.owner && row.pr?.pr !== void 0);
  if (endedAt === void 0 || owned.some((row) => row.pr?.pr?.state === "open" || row.settledAt === void 0)) {
    return void 0;
  }
  const settled = owned.flatMap((row) => row.settledAt === void 0 ? [] : [row.settledAt]);
  return newestOf([endedAt, ...settled]);
};
var planAgentsOf = (agents, docsAgentId) => {
  const underPlan = (agent) => agent.id !== docsAgentId && (agent.branch === void 0 || agent.stage === "other");
  const list = Object.values(agents).filter((agent) => agent.id !== MAIN_AGENT && underPlan(agent));
  return list.sort(byAgentStart2).map((agent) => agent.id);
};
var linkRows = (state, sessionId, rows, continues, config) => {
  if (continues && rows[0]) {
    rows[0].from = { kind: "session", link: structuredClone(continues) };
  }
  for (const row of rows) {
    const next = rowContinuedIn(state, sessionId, row, config);
    if (next) {
      row.continuedIn = next;
    }
  }
};
var settledBy = (row, at) => row.settledAt !== void 0 && time(row.settledAt) <= time(at);
var draftPipelines = (session, startedAt, rows, prompts) => {
  const plans = session.plans.map((plan) => ({ at: plan.at, tie: plan.id ?? "", ...plan.note === void 0 ? {} : { note: plan.note } }));
  const works = rows.map((row) => ({ at: row.firstWorkAt, tie: row.branch, row }));
  const byKind = (a, b) => Number(a.row !== void 0) - Number(b.row !== void 0);
  const steps = [...plans, ...works].sort((a, b) => time(a.at) - time(b.at) || byKind(a, b) || compareText(a.tie, b.tie));
  const drafts = [{ index: 0, startedAt, notes: [], rows: [] }];
  const dealt = [];
  for (const step of steps) {
    let current = drafts[drafts.length - 1];
    const row = step.row;
    const allSettled = dealt.every((earlier) => settledBy(earlier, step.at));
    if (!row) {
      if (current.rows.length > 0 && allSettled) {
        current = { index: drafts.length, startedAt: step.at, notes: [], rows: [] };
        drafts.push(current);
      }
      if (step.note !== void 0 && step.note.trim() !== "") {
        current.notes.push(step.note);
      }
      continue;
    }
    const since = current.startedAt;
    const prompt = prompts.filter((item) => time(item.at) > time(since) && time(item.at) <= time(row.firstWorkAt)).at(-1);
    if (prompt && current.rows.length > 0 && allSettled) {
      current = { index: drafts.length, startedAt: prompt.at, prompt, notes: [], rows: [] };
      drafts.push(current);
    }
    row.pipeline = current.index;
    current.rows.push(row);
    dealt.push(row);
  }
  return drafts;
};
var pipelineAt = (drafts, at) => drafts.filter((draft) => time(draft.startedAt) <= time(at)).at(-1)?.index ?? 0;
var pipelineTitle = (draft, prompts, key) => {
  const note = draft.notes.at(-1);
  if (note !== void 0) {
    return promptTitle(note, key);
  }
  let prompt = draft.index === 0 ? prompts[0] : draft.prompt;
  prompt ??= prompts.filter((item) => time(item.at) <= time(draft.startedAt)).at(-1);
  return prompt ? promptTitle(prompt.line, void 0, PIPELINE_TITLE_MAX) : void 0;
};
var pipelinesOf = (drafts, prompts, key, agents, planAgents) => {
  const plan = new Set(planAgents);
  const subagents = Object.values(agents).filter((agent) => agent.id !== MAIN_AGENT).sort(byAgentStart2);
  return drafts.map((draft) => {
    const branches2 = draft.rows.map((row) => row.branch);
    const onBranches = subagents.filter((agent) => !plan.has(agent.id) && agent.branch !== void 0 && branches2.includes(agent.branch));
    const exploring = subagents.some((agent) => plan.has(agent.id) && agent.pipeline === draft.index && ACTIVE_STATES.has(agent.state));
    const prNumbers = [...new Set(draft.rows.flatMap((row) => row.pr?.pr ? [row.pr.pr.number] : []))];
    const title = pipelineTitle(draft, prompts, key);
    return {
      index: draft.index,
      startedAt: draft.startedAt,
      ...title === void 0 ? {} : { title },
      branches: branches2,
      settled: draft.rows.length > 0 && draft.rows.every((row) => row.settledAt !== void 0),
      live: draft.rows.some((row) => row.live) || exploring,
      agentCount: onBranches.length,
      costUsd: onBranches.reduce((sum, agent) => sum + agent.budget.costUsd, 0),
      prNumbers
    };
  });
};
var blockingForYou = (question) => question.state === "open" && question.blocking && question.audience === "user";
var onPlanGate = (place) => place.kind === "plan" || place.kind === "gate" && place.gate === "plan";
var planNodeOf = (session, questions, planGateWaits, prompts) => {
  const main = session.main;
  const waits = questions.some(blockingForYou) || planGateWaits || main !== void 0 && openPermission2(main) !== void 0;
  let state = "running";
  if (session.endedAt !== void 0) {
    state = "done";
  } else if (waits) {
    state = "waiting";
  } else if (main?.idleSince !== void 0) {
    state = "idle";
  }
  const newest2 = prompts.at(-1);
  if (!newest2) {
    return { state };
  }
  let you = "prompt";
  if (questions.some((question) => blockingForYou(question) && onPlanGate(question.place))) {
    you = "waiting";
  } else if (questions.some((question) => question.audience === "user" && question.state === "answered")) {
    you = "answered";
  }
  return { state, you, prompt: newest2.line, promptAt: newest2.at };
};
var drawnPrs = (rows) => {
  const prs = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const pr = row.pr?.pr;
    if (pr && (row.owner || pr.openedHere) && !prs.has(pr.number)) {
      prs.set(pr.number, pr);
    }
  }
  return [...prs.values()].sort((a, b) => a.number - b.number);
};
var outcomeRowText = (rows) => {
  const prs = drawnPrs(rows);
  if (prs.length === 0) {
    return "no PR";
  }
  if (prs.length === 1) {
    const [pr] = prs;
    const promotions = [...pr.promotions].sort((a, b) => time(a.mergedAt) - time(b.mergedAt) || compareText(a.target, b.target));
    const targets = [...new Set(promotions.map((promotion) => promotion.target))];
    if (pr.state === "merged" && targets.length > 0) {
      return `PR #${pr.number} \xB7 ${targets.join(" + ")}`;
    }
    return `PR #${pr.number} ${pr.state}`;
  }
  const count = (state) => prs.filter((pr) => pr.state === state).length;
  const merged = count("merged");
  if (merged === prs.length) {
    return `${prs.length} PRs merged`;
  }
  const open = count("open");
  const closed = count("closed");
  const openText = open > 0 ? ` \xB7 ${open} open` : "";
  const closedText = closed > 0 ? ` \xB7 ${closed} closed` : "";
  return `${merged} of ${prs.length} PRs merged${openText}${closedText}`;
};
var outcomeOf = (kind, finishedAt, rows, promote) => {
  if (kind === "conversation" || finishedAt === void 0) {
    return void 0;
  }
  const rowText = outcomeRowText(rows);
  const owned = rows.filter((row) => row.owner);
  const merged = owned.filter((row) => row.pr?.pr?.state === "merged").length;
  if (promote && promote.targets.length > 0) {
    return { text: `Promoted to ${promote.targets.join(" + ")}`, rowText, tone: "promoted" };
  }
  if (merged > 0) {
    return { text: merged === 1 ? "Merged" : `${merged} PRs merged`, rowText, tone: "merged" };
  }
  if (owned.some((row) => row.pr?.pr?.state === "closed")) {
    return { text: "Closed", rowText, tone: "none" };
  }
  if (owned.some((row) => row.stage === "removed")) {
    return { text: "Removed", rowText, tone: "removed" };
  }
  return { text: "Done", rowText, tone: "none" };
};
var isExplorer = (agent) => {
  const unattached = agent.branch === void 0 && agent.stage === "other";
  return unattached && ACTIVE_STATES.has(agent.state);
};
var agentColumn = (agentId, rows, docs) => {
  if (rows.some((row) => row.streams.some((stream) => stream.runs.some((node) => node.agentId === agentId)))) {
    return "build";
  }
  if (rows.some((row) => row.reviewers.some((node) => node.agentId === agentId))) {
    return "review";
  }
  if (rows.some((row) => row.fixes.some((fix) => fix.agentId === agentId))) {
    return "fix";
  }
  if (rows.some((row) => row.pr?.agentId === agentId)) {
    return "pr";
  }
  return docs?.agentId === agentId ? "docs" : "plan";
};
var placeColumn = (place, rows, docs) => {
  switch (place.kind) {
    case "plan":
      return "plan";
    case "gate":
      return place.gate;
    case "agent":
      return agentColumn(place.agentId, rows, docs);
    default:
      return place.kind;
  }
};
var rowPastBuild = (state, row) => {
  const runs = row.runIds.map((id) => ownValue(state.board.runs, id));
  return runs.some((run) => run !== void 0 && pastBuild(run));
};
var handedOpen = (stream) => {
  const unfinished = (index) => stream.runs.slice(index + 1).every((node) => ACTIVE_STATES.has(node.state));
  return stream.runs.some((node, index) => node.state === "handed" && unfinished(index));
};
var fixing = (row) => {
  const latest = [...new Map(row.reviewers.map((reviewer) => [reviewer.reviewerId, reviewer])).values()];
  return row.stage === "fix" || row.fixes.some((fix) => ACTIVE_STATES.has(fix.state)) || latest.some((reviewer) => reviewer.state === "changes");
};
var branches = (count) => `${count} ${count === 1 ? "branch" : "branches"}`;
var CHIP_STAGES = { worktree: "build", build: "build", built: "build", join: "join", review: "review", fix: "fix", pr: "pr", merge: "merge" };
var stageChip = (state, rows, open) => {
  const amber = open.some((row) => !rowPastBuild(state, row) && row.streams.some(handedOpen));
  const tone = amber ? "amber" : open.some(fixing) ? "warm" : "normal";
  const at = (stage) => open.filter((row) => CHIP_STAGES[row.stage] === stage);
  const texts = [
    ["build", (list) => `Build \xB7 ${list.length} of ${branches(rows.length)}`],
    ["fix", (list) => `Fix \xB7 ${list.map((row) => shortBranch(row.branch)).join(", ")}`],
    ["join", () => "Join \xB7 writing the diff"],
    ["review", (list) => `Review \xB7 ${branches(list.length)}`],
    ["pr", (list) => `PR \xB7 ${list.length} open`]
  ];
  for (const [stage, text] of texts) {
    const list = at(stage);
    if (list.length > 0) {
      return { text: text(list), tone };
    }
  }
  return at("merge").length > 0 ? { text: "Merge \xB7 waiting for you", tone: "you" } : { text: "Build", tone };
};
var mainThreadChip = (main) => {
  const words = sessionMainWords(main);
  return { text: `Main thread \xB7 ${words}`, tone: words === "waiting for you" ? "you" : "normal" };
};
var baseChip = (input) => {
  const question = input.questions.find(blockingForYou);
  if (question) {
    return { text: `${STAGE_LABELS[placeColumn(question.place, input.rows, input.docs)]} \xB7 question for you`, tone: "you" };
  }
  if (input.waitingGate) {
    return { text: `${STAGE_LABELS[input.waitingGate]} \xB7 waiting for you`, tone: "you" };
  }
  if (input.finishedAt !== void 0) {
    return { text: input.outcome?.text ?? "Done", tone: "done" };
  }
  if (input.kind === "conversation") {
    return mainThreadChip(input.main);
  }
  const current = input.rows.filter((row) => row.pipeline === input.pipeline);
  if (current.length === 0) {
    return { text: input.exploring ? "Plan \xB7 exploring" : "Plan", tone: "normal" };
  }
  const open = current.filter((row) => row.settledAt === void 0);
  if (open.length === 0) {
    return mainThreadChip(input.main);
  }
  return stageChip(input.state, current, open);
};
var followupsOf = (ctx) => {
  const runIds = new Set(ctx.runIds);
  for (const agentId of Object.keys(ctx.agents)) {
    const home = Object.hasOwn(ctx.state.index.agentRuns, agentId) ? ctx.state.index.agentRuns[agentId] : void 0;
    if (home !== void 0) {
      runIds.add(home);
    }
  }
  const found = /* @__PURE__ */ new Map();
  for (const runId of [...runIds].sort(compareText)) {
    for (const followup of ctx.state.board.runs[runId]?.followups ?? []) {
      const originId = followup.origin.agentId;
      const agent = originId !== MAIN_AGENT && Object.hasOwn(ctx.agents, originId) ? ctx.agents[originId] : void 0;
      if (agent && !found.has(followup.id)) {
        found.set(followup.id, { ...structuredClone(followup), ...agent.branch === void 0 ? {} : { branch: agent.branch } });
      }
    }
  }
  return [...found.values()].sort((a, b) => time(a.at) - time(b.at) || compareText(a.id, b.id));
};
var logOf = (ctx, rows) => {
  const owned = new Set(rows.filter((row) => row.owner).flatMap((row) => row.runIds));
  const lines = [];
  for (const runId of ctx.runIds) {
    (ctx.state.board.runs[runId]?.log ?? []).forEach((line, position) => {
      const unowned = (line.sessionId ?? "") === "";
      if (line.sessionId === ctx.sessionId || unowned && owned.has(runId)) {
        lines.push({ line, runId, position });
      }
    });
  }
  lines.sort((a, b) => time(a.line.at) - time(b.line.at) || compareText(a.runId, b.runId) || a.position - b.position);
  return lines.slice(-SESSION_LOG_CAP).map((entry) => structuredClone(entry.line));
};
var projectSession = (state, sessionId, config) => {
  const session = recordOf(state, sessionId);
  if (!session) {
    return void 0;
  }
  const runIds = sessionRunIds(session);
  const agents = sessionAgents(state, session, runIds, config);
  const ctx = { state, sessionId, session, runIds, agents, config };
  const rows = sessionRows(ctx);
  const promote = promoteNode(ctx, rows);
  const docs = docsNode(ctx, rows);
  const questions = sessionQuestions(ctx, rows, { promote, docs });
  markQuestionRows(rows, questions);
  const startedAt = session.prompts[0]?.at ?? session.startedAt;
  const model = session.model ?? session.main?.model;
  const finishedAt = finishedAtOf(session.endedAt, rows);
  const kind = kindOf2(session, rows);
  const key = sessionKey(state, sessionId, config);
  const title = sessionTitle(state, sessionId, config);
  const continues = continuesLink(state, sessionId, config);
  linkRows(state, sessionId, rows, continues, config);
  const prompts = [...session.prompts].sort(byLineTime);
  const drafts = draftPipelines(session, startedAt, rows, prompts);
  const current = drafts.length - 1;
  for (const agent of Object.values(agents)) {
    agent.pipeline = agent.id === MAIN_AGENT ? current : pipelineAt(drafts, agent.startedAt);
  }
  const planAgents = planAgentsOf(agents, docsAgentOf(ctx)?.id);
  const pipelines = pipelinesOf(drafts, prompts, key, agents, planAgents);
  const gateWaits = (id) => sessionGates(ctx, rows, id).some((gate) => gate.state === "waiting");
  const plan = planNodeOf(session, questions, gateWaits("plan"), prompts);
  const outcome = outcomeOf(kind, finishedAt, rows, promote);
  const exploring = planAgents.some((id) => isExplorer(agents[id]));
  const waitingGate = GATE_ORDER.find(gateWaits);
  const chipInput = { state, kind, rows, pipeline: current, questions, docs, finishedAt, outcome, exploring, main: { plan, agents } };
  if (waitingGate) {
    chipInput.waitingGate = waitingGate;
  }
  const chip = baseChip(chipInput);
  const planAt = session.plans[0]?.at;
  return {
    id: sessionId,
    ...key === void 0 ? {} : { key },
    ...title === void 0 ? {} : { title },
    ...session.source === void 0 ? {} : { source: session.source },
    ...model === void 0 ? {} : { model },
    kind,
    startedAt,
    ...session.endedAt === void 0 ? {} : { endedAt: session.endedAt },
    lastEventAt: session.lastEventAt ?? session.startedAt,
    lastActiveAt: session.lastActiveAt ?? session.startedAt,
    ...finishedAt === void 0 ? {} : { finishedAt },
    chip: session.main?.state === "failed" ? { text: chip.text, tone: "failed" } : chip,
    ...outcome === void 0 ? {} : { outcome },
    plan,
    agents,
    planAgents,
    rows,
    pipelines,
    ...promote === void 0 ? {} : { promote },
    ...docs === void 0 ? {} : { docs },
    ...continues === void 0 ? {} : { continues },
    continuedIn: continuedInLinks(state, sessionId, rows, config),
    questions,
    followups: followupsOf(ctx),
    messages: structuredClone(session.messages),
    log: logOf(ctx, rows),
    tokens: structuredClone(session.tokens),
    ...session.overhead === void 0 ? {} : { overhead: structuredClone(session.overhead) },
    ...planAt === void 0 ? {} : { planAt },
    costUsd: session.tokens.total.usd,
    developerWait: structuredClone(session.developerWait),
    resumes: structuredClone(session.resumes)
  };
};

// src/model/store.ts
var SEEN_MARGIN_MS = 60 * 60 * 1e3;
var MODE_RANK = { leaf: 0, down: 1, root: 2 };
var linksOf = (entry) => ({
  up: entry?.continues ? [entry.continues.sessionId] : [],
  down: (entry?.continuedIn ?? []).map((link) => link.sessionId)
});
var namesOf = (entry) => {
  const rows = (entry?.rows ?? []).flatMap((row) => row.continuedIn ? [row.continuedIn.sessionId] : []);
  const links = linksOf(entry);
  return [.../* @__PURE__ */ new Set([...links.up, ...links.down, ...rows])];
};
var createStore = (config, options = {}) => {
  const windowMs = options.windowMs ?? 1e3;
  const seenMarginMs = options.seenMarginMs ?? SEEN_MARGIN_MS;
  const seen = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  let committed = createState(config);
  let live = createState(config);
  let committedAt;
  let pending = [];
  let dirty = false;
  let newestAt;
  let rebuiltAt;
  let prunedAt;
  const project = options.project ?? projectSession;
  const affected = options.affected ?? sessionsAffected;
  const cache = /* @__PURE__ */ new Map();
  const namedBy = /* @__PURE__ */ new Map();
  const marked = /* @__PURE__ */ new Set();
  const skewed = /* @__PURE__ */ new Set();
  const failures = /* @__PURE__ */ new Map();
  const affectedFailures = /* @__PURE__ */ new Map();
  const unmarked = /* @__PURE__ */ new Map();
  const finishFailures = /* @__PURE__ */ new Map();
  const notify = () => {
    for (const listener of listeners) {
      listener(live.board);
    }
  };
  const rejection = (event, problem) => `Spool line ${event.id} (${event.event}) not applied: ${problem}`;
  const attempt = (state, event) => {
    try {
      applyEvent(state, event, config);
      return void 0;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const warnBoth = (text) => {
    const at = boardAt();
    warn(committed, at, text);
    warn(live, at, text);
  };
  const messageOf = (error) => error instanceof Error ? error.message : String(error);
  const boardAt = () => live.index.now ?? (/* @__PURE__ */ new Date(0)).toISOString();
  const allSessions = (state) => [...Object.keys(state.index.sessions), ...cache.keys()];
  const markAll = (state) => {
    for (const sessionId of allSessions(state)) {
      marked.add(sessionId);
    }
  };
  const collectAffected = (state, event, into) => {
    try {
      for (const sessionId of affected(state, event)) {
        into.add(sessionId);
      }
    } catch (error) {
      const message = messageOf(error);
      if (!affectedFailures.has(message)) {
        const text = `Sessions affected by line ${event.id} (${event.event}) not computed, all sessions re-projected: ${message}`;
        affectedFailures.set(message, { text, at: boardAt() });
      }
      for (const sessionId of allSessions(state)) {
        into.add(sessionId);
      }
    }
  };
  const markLine = (state, event) => collectAffected(state, event, marked);
  const rebuild = () => {
    const dropped = [];
    for (; ; ) {
      live = structuredClone(committed);
      let broken;
      for (const event of pending) {
        const problem = attempt(live, event);
        if (problem !== void 0) {
          broken = { event, problem };
          break;
        }
      }
      if (!broken) {
        break;
      }
      const failed = broken;
      pending = pending.filter((event) => event !== failed.event);
      dropped.push(failed.event);
      warn(committed, failed.event.at, rejection(failed.event, failed.problem));
    }
    for (const event of [...pending, ...dropped]) {
      markLine(live, event);
    }
    for (const sessionId of skewed) {
      marked.add(sessionId);
    }
    skewed.clear();
    dirty = false;
    rebuiltAt = newestAt;
  };
  const parse2 = (line) => {
    const parsed = typeof line === "string" ? parseSpoolLine(line) : line;
    const problem = "error" in parsed ? parsed.error : checkEvent(parsed);
    if (problem !== void 0) {
      warnBoth(`Spool line rejected: ${problem}`);
      return void 0;
    }
    return parsed;
  };
  const markSeen = (event) => {
    if (seen.has(event.id)) {
      return false;
    }
    const at = time(event.at);
    seen.set(event.id, at);
    newestAt = newestAt === void 0 ? at : Math.max(newestAt, at);
    return true;
  };
  const pruneSeen = () => {
    if (newestAt === void 0 || prunedAt !== void 0 && newestAt - prunedAt < windowMs) {
      return;
    }
    const floor = newestAt - windowMs - seenMarginMs;
    for (const [id, at] of seen) {
      if (at >= floor) {
        break;
      }
      seen.delete(id);
    }
    prunedAt = newestAt;
  };
  const applyLate = (event) => {
    const problem = attempt(committed, event);
    if (problem !== void 0) {
      warn(committed, event.at, rejection(event, problem));
    }
    const liveProblem = problem === void 0 ? attempt(live, event) : void 0;
    if (liveProblem !== void 0) {
      warn(committed, event.at, `Spool line ${event.id} (${event.event}) applied to the committed state only, the live state rebuilt: ${liveProblem}`);
    }
    markLine(live, event);
    for (const item of pending) {
      collectAffected(live, item, skewed);
    }
    if (problem !== void 0 || liveProblem !== void 0) {
      rebuild();
      markLine(live, event);
    }
  };
  const applyInWindow = (event) => {
    const at = time(event.at);
    const lastAt = pending.length > 0 ? time(pending[pending.length - 1].at) : void 0;
    const inOrder = lastAt === void 0 || at >= lastAt;
    if (inOrder) {
      pending.push(event);
    } else {
      pending.splice(pending.findIndex((item) => time(item.at) > at), 0, event);
    }
    const rebuildNow = !inOrder && (rebuiltAt === void 0 || (newestAt ?? at) - rebuiltAt >= windowMs);
    if (rebuildNow) {
      rebuild();
      return;
    }
    const problem = attempt(live, event);
    if (problem !== void 0) {
      pending = pending.filter((item) => item !== event);
      warn(committed, event.at, rejection(event, problem));
      markLine(live, event);
      rebuild();
      return;
    }
    const reordered = inOrder ? [event] : pending.filter((item) => time(item.at) >= at);
    for (const item of reordered) {
      markLine(live, item);
    }
    dirty = dirty || !inOrder;
  };
  const commit = () => {
    const newest2 = pending.length > 0 ? time(pending[pending.length - 1].at) : void 0;
    while (newest2 !== void 0 && pending.length > 0 && time(pending[0].at) <= newest2 - windowMs) {
      const event = pending.shift();
      committedAt = time(event.at);
      const problem = attempt(committed, event);
      if (problem !== void 0) {
        warn(committed, event.at, rejection(event, problem));
        markLine(live, event);
        dirty = true;
      }
    }
  };
  const applyParsed = (event) => {
    if (!markSeen(event)) {
      return;
    }
    if (committedAt !== void 0 && time(event.at) < committedAt) {
      applyLate(event);
    } else {
      applyInWindow(event);
    }
    commit();
    pruneSeen();
    notify();
  };
  const reportFinish = (sessionId, previous, next) => {
    if (options.onFinish === void 0 || next?.finishedAt === void 0 || next.finishedAt === previous?.finishedAt) {
      return;
    }
    try {
      options.onFinish(sessionId, next.finishedAt);
    } catch (error) {
      const message = messageOf(error);
      if (!finishFailures.has(message)) {
        finishFailures.set(message, { text: `The finish of session ${sessionId} was not passed on: ${message}`, at: boardAt() });
      }
    }
  };
  const reindex = (sessionId, before, after) => {
    for (const target of before) {
      const referrers = namedBy.get(target);
      referrers?.delete(sessionId);
      if (referrers?.size === 0) {
        namedBy.delete(target);
      }
    }
    for (const target of after) {
      const referrers = namedBy.get(target) ?? /* @__PURE__ */ new Set();
      referrers.add(sessionId);
      namedBy.set(target, referrers);
    }
  };
  const reproject = (sessionId) => {
    const previous = cache.get(sessionId);
    try {
      const next = project(live, sessionId, config);
      if (next === void 0 && Object.hasOwn(live.index.sessions, sessionId)) {
        throw new Error("the projection gave nothing");
      }
      const before = linksOf(previous);
      const after = linksOf(next);
      reindex(sessionId, namesOf(previous), namesOf(next));
      if (next) {
        cache.set(sessionId, next);
      } else {
        cache.delete(sessionId);
      }
      failures.delete(sessionId);
      reportFinish(sessionId, previous, next);
      return { up: [...before.up, ...after.up], down: [...before.down, ...after.down] };
    } catch (error) {
      const message = messageOf(error);
      if (failures.get(sessionId)?.message !== message) {
        failures.set(sessionId, { message, at: boardAt() });
      }
      try {
        return linksOf(previous);
      } catch {
        return { up: [], down: [] };
      }
    }
  };
  const recoverUnmarked = () => {
    const missing = Object.keys(live.index.sessions).filter((sessionId) => !cache.has(sessionId) && !failures.has(sessionId));
    if (missing.length === 0) {
      return;
    }
    const shown = new Set(sessionOrder(live));
    for (const sessionId of missing.filter((id) => shown.has(id)).sort(compareText)) {
      unmarked.set(sessionId, boardAt());
      reproject(sessionId);
    }
  };
  const refreshMarked = () => {
    if (marked.size === 0) {
      return;
    }
    for (const sessionId of failures.keys()) {
      marked.add(sessionId);
    }
    const queue = [...marked].sort(compareText).map((sessionId) => [sessionId, "root"]);
    marked.clear();
    let active;
    try {
      const reached = /* @__PURE__ */ new Map();
      const links = /* @__PURE__ */ new Map();
      while (queue.length > 0) {
        const [sessionId, mode] = queue.pop();
        const rank = reached.get(sessionId);
        if (rank !== void 0 && rank >= MODE_RANK[mode]) {
          continue;
        }
        active = sessionId;
        reached.set(sessionId, MODE_RANK[mode]);
        if (rank === void 0) {
          links.set(sessionId, reproject(sessionId));
        }
        const { up, down } = links.get(sessionId);
        for (const other of mode === "root" ? up : []) {
          queue.push([other, "leaf"]);
        }
        for (const other of mode === "leaf" ? [] : namedBy.get(sessionId) ?? []) {
          queue.push([other, cache.get(other)?.continues?.sessionId === sessionId ? "down" : "leaf"]);
        }
        for (const other of mode === "leaf" ? [] : down) {
          queue.push([other, "down"]);
        }
        active = void 0;
      }
    } finally {
      if (active !== void 0) {
        marked.add(active);
      }
      for (const [sessionId] of queue) {
        marked.add(sessionId);
      }
    }
  };
  const refresh = () => {
    refreshMarked();
    recoverUnmarked();
  };
  const readWarnings = () => {
    const warnLine = (at, text) => ({ at, text, tone: "warn" });
    const looks = [...affectedFailures].sort(([a], [b]) => compareText(a, b)).map(([, failure]) => warnLine(failure.at, failure.text));
    const missed = [...unmarked].sort(([a], [b]) => compareText(a, b)).map(([sessionId, at]) => warnLine(at, `Session ${sessionId} was not marked for a refresh`));
    const failed = [...failures].sort(([a], [b]) => compareText(a, b)).map(([sessionId, failure]) => warnLine(failure.at, `Session ${sessionId} not projected: ${failure.message}`));
    const finishes = [...finishFailures].sort(([a], [b]) => compareText(a, b)).map(([, failure]) => warnLine(failure.at, failure.text));
    return [...looks, ...missed, ...failed, ...finishes];
  };
  const current = () => {
    if (dirty) {
      rebuild();
    }
    refresh();
    return live;
  };
  return {
    apply(line) {
      if (typeof line === "string" && line.trim() === "") {
        return;
      }
      const event = parse2(line);
      if (event) {
        applyParsed(event);
      } else {
        notify();
      }
    },
    replay(lines) {
      const ordered = pending.map((event) => ({ at: time(event.at), event }));
      for (const line of lines) {
        const event = typeof line === "string" && line.trim() === "" ? void 0 : parse2(line);
        if (event && markSeen(event)) {
          ordered.push({ at: time(event.at), event });
        }
      }
      ordered.sort((a, b) => a.at - b.at);
      pending = [];
      for (const { event } of ordered) {
        const problem = attempt(committed, event);
        if (problem !== void 0) {
          warn(committed, event.at, rejection(event, problem));
        }
      }
      const last = ordered[ordered.length - 1];
      if (last) {
        committedAt = Math.max(committedAt ?? last.at, last.at);
      }
      rebuild();
      markAll(live);
      pruneSeen();
      notify();
    },
    sessions() {
      const state = current();
      const { branches: branches2, tokenRanking, github, warnings } = state.board;
      const entries = [...cache.keys()].sort(compareText).map((sessionId) => [sessionId, cache.get(sessionId)]);
      const order = sessionOrder(state).filter((sessionId) => cache.has(sessionId));
      const sessions = Object.fromEntries(entries);
      const view = { branches: branches2, tokenRanking, github, warnings: [...warnings, ...readWarnings()], sessions, sessionOrder: order, summaries: [] };
      return structuredClone(view);
    },
    session(sessionId) {
      current();
      const entry = cache.get(sessionId);
      return entry === void 0 ? void 0 : structuredClone(entry);
    },
    sessionAgent(sessionId, agentId) {
      current();
      const entry = cache.get(sessionId);
      if (entry === void 0) {
        return { missing: "session" };
      }
      return Object.hasOwn(entry.agents, agentId) ? { agent: structuredClone(entry.agents[agentId]) } : { missing: "agent" };
    },
    snapshot() {
      const board = structuredClone(current().board);
      board.warnings.push(...readWarnings());
      return board;
    },
    state: current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
};

// src/spool/decode.ts
import { createHash as createHash2 } from "crypto";
var ignoreErrors = () => void 0;
var isObject4 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var eventsOf = (line) => line.marker ? [line.event, line.marker] : [line.event];
var timeOf = (record) => {
  if (typeof record.at === "string") {
    return record.at;
  }
  return typeof record.receivedAt === "string" ? record.receivedAt : (/* @__PURE__ */ new Date(0)).toISOString();
};
var decodeLine = (text, keyConfig) => {
  let record;
  try {
    record = JSON.parse(text);
  } catch (error) {
    return { error: `not JSON: ${error.message}` };
  }
  if (isObject4(record) && isObject4(record.payload) && record.event === void 0) {
    const id = typeof record.id === "string" ? record.id : `r-${createHash2("sha1").update(text).digest("hex").slice(0, 12)}`;
    const injectedChars = isCount(record.injectedChars) ? record.injectedChars : void 0;
    const { keyPattern, keyIgnoreCase } = keyConfig;
    const options = { at: timeOf(record), id, keyPattern, keyIgnoreCase, truncated: record.truncated === true, injectedChars };
    const event = hookPayloadToEvent(record.payload, options);
    if (!event) {
      return { skipped: `no event for hook ${String(record.payload.hook_event_name)}` };
    }
    const marker = hookPayloadToMarker(record.payload, options);
    return marker ? { event, marker, payload: record.payload } : { event, payload: record.payload };
  }
  const parsed = parseSpoolLine(text);
  return "error" in parsed ? { error: parsed.error } : { event: parsed };
};
var createLineHandler = (store, keyConfig, observers = []) => (text) => {
  const decoded = decodeLine(text, keyConfig);
  if ("skipped" in decoded) {
    return;
  }
  if ("error" in decoded) {
    store.apply(text);
    return;
  }
  for (const event of eventsOf(decoded)) {
    store.apply(event);
    for (const observer of observers) {
      observer(event, decoded.payload);
    }
  }
};
var createHistoryHandler = (store, keyConfig, observers = [], onError = ignoreErrors) => {
  let lines = [];
  let count = 0;
  const observe = (event, payload) => {
    for (const observer of observers) {
      try {
        observer(event, payload);
      } catch (error) {
        onError(`a fact producer failed on line ${event.id}: ${error.message}`);
      }
    }
  };
  return {
    line(text) {
      count += 1;
      let line;
      try {
        line = decodeLine(text, keyConfig);
      } catch (error) {
        onError(`history line ${count} skipped, it could not be decoded: ${error.message}`);
        return;
      }
      if ("skipped" in line) {
        return;
      }
      if ("error" in line) {
        lines.push(text);
        return;
      }
      for (const event of eventsOf(line)) {
        lines.push(event);
        observe(event, line.payload);
      }
    },
    end() {
      const batch = lines;
      lines = [];
      count = 0;
      store.replay(batch);
    }
  };
};

// src/spool/reader.ts
import { closeSync as closeSync2, constants as constants2, fstatSync as fstatSync2, lstatSync as lstatSync2, openSync as openSync2, readdirSync as readdirSync2, readFileSync, readSync as readSync2, watch } from "fs";
import { join as join3 } from "path";
var FILE_NAME = /^events-(\d{4}-\d{2}-\d{2})\.ndjson$/;
var CHUNK_BYTES = 1 << 20;
var NEWLINE = 10;
var READ_NO_FOLLOW = constants2.O_RDONLY | (constants2.O_NOFOLLOW ?? 0) | (constants2.O_NONBLOCK ?? 0);
var identityOf = (stat) => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
var refusalOf = (path, stat) => {
  if (!stat.isFile()) {
    return `${path} is not a regular file`;
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : void 0;
  return uid !== void 0 && stat.uid !== uid ? `${path} belongs to another user` : void 0;
};
var readWindowStart = (now, readDays) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (readDays - 1));
var openNoFollow = (path) => {
  let fd;
  try {
    fd = openSync2(path, READ_NO_FOLLOW);
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") {
      return void 0;
    }
    return { refused: code === "ELOOP" ? `${path}: a symlink is refused` : `${path}: ${error.message}` };
  }
  let stat;
  try {
    stat = fstatSync2(fd);
  } catch (error) {
    closeSync2(fd);
    throw error;
  }
  const refusal = refusalOf(path, stat);
  if (refusal === void 0) {
    return { fd, stat };
  }
  closeSync2(fd);
  return { refused: refusal };
};
var lineTexts = (complete) => complete.toString("utf8").split("\n").filter((line) => line.trim() !== "");
var listSpoolFiles = (dir) => {
  if (lstatSync2(dir, { throwIfNoEntry: false }) === void 0) {
    return [];
  }
  const files = [];
  for (const name of readdirSync2(dir)) {
    const day = FILE_NAME.exec(name)?.[1];
    if (day) {
      files.push({ day, path: join3(dir, name) });
    }
  }
  return files.sort((a, b) => a.day.localeCompare(b.day));
};
var readSpoolDays = (dir, onError = () => void 0) => {
  const days = [];
  for (const file of listSpoolFiles(dir)) {
    const opened = openNoFollow(file.path);
    if (opened === void 0) {
      continue;
    }
    if ("refused" in opened) {
      onError(`skipped ${opened.refused}`);
      continue;
    }
    let data;
    try {
      data = readFileSync(opened.fd);
    } finally {
      closeSync2(opened.fd);
    }
    const end = data.lastIndexOf(NEWLINE);
    days.push({ day: file.day, lines: end === -1 ? [] : lineTexts(data.subarray(0, end)) });
  }
  return days;
};
var deleteExpiredFiles = (dir, keepDays, now) => pruneSpool(dir, keepDays, now);
var createSpoolReader = (options) => {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const offsets = /* @__PURE__ */ new Map();
  const partial = /* @__PURE__ */ new Map();
  const identities = /* @__PURE__ */ new Map();
  const refused = /* @__PURE__ */ new Set();
  let watcher;
  let timer;
  let scheduled;
  let cleanedDay = "";
  let delivered = 0;
  let history;
  const report = options.onError ?? (() => void 0);
  const emit = (line, path) => {
    delivered += 1;
    try {
      if (history) {
        history.line(line);
      } else {
        options.onLine(line, path);
      }
    } catch (error) {
      report(`skipped a line of ${path}: ${error.message}`);
    }
  };
  const deliver = (path, chunk) => {
    const previous = partial.get(path);
    const data = previous ? Buffer.concat([previous, chunk]) : chunk;
    const end = data.lastIndexOf(NEWLINE);
    if (end === -1) {
      partial.set(path, data);
      return;
    }
    partial.set(path, Buffer.from(data.subarray(end + 1)));
    for (const line of lineTexts(data.subarray(0, end))) {
      emit(line, path);
    }
  };
  const forget = (path) => {
    offsets.delete(path);
    partial.delete(path);
    identities.delete(path);
  };
  const openDayFile = (path) => {
    const opened = openNoFollow(path);
    if (opened === void 0) {
      forget(path);
      return void 0;
    }
    if ("refused" in opened) {
      if (!refused.has(path)) {
        refused.add(path);
        report(`skipped ${opened.refused}`);
      }
      return void 0;
    }
    refused.delete(path);
    return opened;
  };
  const unchanged = (path) => {
    let stat;
    try {
      stat = lstatSync2(path);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      forget(path);
      return true;
    }
    return stat.isFile() && identities.get(path) === identityOf(stat) && offsets.get(path) === stat.size;
  };
  const readNew = (path) => {
    const opened = unchanged(path) ? void 0 : openDayFile(path);
    if (!opened) {
      return;
    }
    const { fd, stat } = opened;
    try {
      const size = stat.size;
      const identity = identityOf(stat);
      const known = identities.get(path);
      let offset = offsets.get(path) ?? 0;
      if (known !== void 0 && known !== identity || size < offset) {
        offset = 0;
        partial.delete(path);
      }
      identities.set(path, identity);
      offsets.set(path, offset);
      while (offset < size) {
        const buffer = Buffer.alloc(Math.min(CHUNK_BYTES, size - offset));
        const read = readSync2(fd, buffer, 0, buffer.length, offset);
        if (read === 0) {
          break;
        }
        offset += read;
        offsets.set(path, offset);
        deliver(path, buffer.subarray(0, read));
      }
    } finally {
      closeSync2(fd);
    }
  };
  const skipToEnd = (path) => {
    const opened = openDayFile(path);
    if (opened) {
      closeSync2(opened.fd);
      offsets.set(path, opened.stat.size);
      identities.set(path, identityOf(opened.stat));
    }
  };
  const readAtStart = (file, first) => {
    try {
      if (file.day < first) {
        skipToEnd(file.path);
      } else {
        readNew(file.path);
      }
    } catch (error) {
      report(`history of ${file.path} not read at start: ${error.message}`);
    }
  };
  const lastFailure = /* @__PURE__ */ new Map();
  const reportOnce = (source, message) => {
    if (lastFailure.get(source) !== message) {
      lastFailure.set(source, message);
      report(message);
    }
  };
  const cleanUp = () => {
    const today = localDay(now());
    if (today !== cleanedDay) {
      deleteExpiredFiles(options.dir, options.keepDays, now());
      options.onCleanUp?.(now());
      cleanedDay = today;
    }
  };
  const runCleanUp = () => {
    try {
      cleanUp();
      lastFailure.delete("clean-up");
    } catch (error) {
      reportOnce("clean-up", `clean-up of ${options.dir} failed: ${error.message}`);
    }
  };
  const poll = () => {
    runCleanUp();
    try {
      const files = listSpoolFiles(options.dir);
      const listed = new Set(files.map((file) => file.path));
      for (const path of [...offsets.keys()].filter((known) => !listed.has(known))) {
        forget(path);
      }
      for (const file of files) {
        readNew(file.path);
      }
      lastFailure.delete("poll");
    } catch (error) {
      reportOnce("poll", `spool poll failed: ${error.message}`);
    }
  };
  const schedulePoll = () => {
    if (!scheduled) {
      scheduled = setTimeout(() => {
        scheduled = void 0;
        poll();
      }, 20);
    }
  };
  return {
    start() {
      ensurePrivateDir(options.dir);
      runCleanUp();
      const first = localDay(readWindowStart(now(), options.readDays));
      history = options.onHistory;
      try {
        for (const file of listSpoolFiles(options.dir)) {
          readAtStart(file, first);
        }
      } finally {
        history = void 0;
      }
      options.onHistory?.end();
      if (options.watch !== false) {
        try {
          watcher = watch(options.dir, schedulePoll);
          watcher.on("error", (error) => report(`spool watch failed, polling only: ${error.message}`));
        } catch {
        }
        timer = setInterval(poll, options.pollMs ?? 500);
      }
    },
    poll,
    stop() {
      watcher?.close();
      clearInterval(timer);
      clearTimeout(scheduled);
    },
    lines: () => delivered
  };
};

export {
  stripPrefix,
  HOOK_DEFAULTS,
  shellWord,
  cliCommand,
  startCommand,
  notSetUpMessage,
  stripControl,
  stripControlLines,
  escapeRegExp,
  expandHome,
  tildeHome,
  repositoryRoot,
  MAX_CONFIG_BYTES,
  readSmallFile,
  gitCommonDir,
  repoHash,
  defaultRoot,
  userConfigPath,
  serverStatePath,
  findConfig,
  dropUserOnlyKeys,
  MAX_READ_DAYS,
  readHookConfig,
  configKeepDays,
  spoolDirFor,
  localDay,
  newLineId,
  redactString,
  redactValue,
  ensurePrivateDir,
  appendPrivate,
  writePrivate,
  pruneSpool,
  spoolDirExists,
  purgeableDayFiles,
  purgeSpool,
  excludeFromBackup,
  excludedFromBackup,
  appendSpoolLine,
  buildHookLine,
  readRepositoryRecord,
  recordedRootValid,
  readServerState,
  serverRunning,
  ensureBoardToken,
  NONCE,
  tokenHmac,
  boardProof,
  sameText,
  RUNNING_CHECK_MS,
  boardUrl,
  boardLogPath,
  startBoardDetached,
  loopbackJson,
  checkBoard,
  notProvenMessage,
  TOKEN_CHANGED,
  signInBoard,
  waitForBoard,
  MAC_APP_BROWSERS,
  LINUX_APP_BROWSERS,
  MAC_OPEN,
  UNTIL_EXIT,
  launch,
  resolveCommand,
  openAppWindow,
  patternInput,
  linearRegExp,
  BRANCH_KEY_PATTERN,
  branchKeyRegExp,
  branchKey,
  PACKAGE_ROOT,
  DEFAULT_CONFIG,
  mergeConfig,
  isBranchName,
  githubRepoOfRemote,
  MIN_POLL_SECONDS,
  MAX_POLL_SECONDS,
  validateConfig,
  mergeOverDefaults,
  loadConfig,
  uiConfig,
  SPOOL_EVENT_NAMES,
  checkEvent,
  parseSpoolLine,
  STREAM_ID,
  FIELD_NAMES,
  validateMarkerInput,
  findAbsolutePaths,
  summarizeToolInput,
  promptData,
  hookPayloadToEvent,
  hookPayloadToMarker,
  findReportBlock,
  reportLine,
  parseBlockBody,
  parseReportBlock,
  isBlockError,
  time,
  compareText,
  literalWord,
  cdTarget,
  shellCode,
  ownValue,
  ownEntry,
  isTrunkBranch,
  recordOf,
  sessionRunIds,
  sessionsAffected,
  worktreeAddOfCommand,
  promoteCarries,
  MAIN_AGENT,
  displayState,
  VERIFY_KINDS,
  processedTokens,
  byStart,
  sessionMetrics,
  blockingForYou,
  createStore,
  createState,
  applyEvent,
  reduce,
  eventsOf,
  decodeLine,
  createLineHandler,
  createHistoryHandler,
  readWindowStart,
  openNoFollow,
  listSpoolFiles,
  readSpoolDays,
  deleteExpiredFiles,
  createSpoolReader
};
