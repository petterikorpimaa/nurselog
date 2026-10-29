import {
  BoardRunningError,
  DEFAULT_PORT,
  OrphanedCopyError,
  USAGE,
  alreadyRunningMessage,
  boardTab,
  insightsOf,
  listOrphanedSpools,
  listRepositories,
  plainText,
  purgeAggregates,
  purgeableAggregates,
  readAggregates,
  resolveRepository,
  runEmit,
  runLink,
  runStatus,
  startNurselog
} from "./chunk-YNDBNRBJ.js";
import {
  sessionFixture,
  spoolSessionIds
} from "./chunk-HYV5PM6C.js";
import {
  DEFAULT_CONFIG,
  PACKAGE_ROOT,
  SAFE_GIT,
  SAFE_GIT_ENV,
  loadConfig,
  mergeOverDefaults,
  runCommand,
  validateConfig
} from "./chunk-4YEIGH7M.js";
import {
  BRANCH_KEY_PATTERN,
  LINUX_APP_BROWSERS,
  MAC_APP_BROWSERS,
  MAX_CONFIG_BYTES,
  OWNER_LINE,
  RUNNING_CHECK_MS,
  STREAM_ID,
  SignInFileError,
  UNTIL_EXIT,
  boardLogPath,
  branchKey,
  branchKeyRegExp,
  cacheDirOf,
  checkBoard,
  cliCommand,
  defaultRoot,
  dropUserOnlyKeys,
  ensurePrivateDir,
  escapeRegExp,
  excludeFromBackup,
  excludedFromBackup,
  findConfig,
  githubRepoOfRemote,
  isBranchName,
  launch,
  localDay,
  notProvenMessage,
  notSetUpMessage,
  openAppWindow,
  ownEntry,
  ownValue,
  purgeSpool,
  purgeableDayFiles,
  readHookConfig,
  readLegacyNames,
  readServerState,
  readSmallFile,
  readSpoolDays,
  repoHash,
  repositoryRoot,
  resolveCommand,
  serverStatePath,
  shellWord,
  signInBoard,
  spoolDirExists,
  spoolDirFor,
  startBoardDetached,
  stripControl,
  terminalCommandLine,
  terminalCommandPath,
  tildeHome,
  userConfigPath,
  waitForBoard,
  writeSignInFile
} from "./chunk-YQE4KOST.js";

// src/cli.ts
import { existsSync as existsSync3 } from "fs";
import { dirname as dirname5, join as join4, resolve as resolve4 } from "path";
import { parseArgs as parseArgs8 } from "util";

// src/cli/fixture.ts
import { writeFileSync } from "fs";
import { resolve } from "path";
import { parseArgs } from "util";
var MIN_PREFIX = 8;
var SYNOPSIS = "nurselog fixture <session id or a prefix of 8+ characters> [--repo <path>] [--out <file>]";
var matchSessions = (ids, wanted) => ids.includes(wanted) ? [wanted] : ids.filter((id) => id.startsWith(wanted));
var writeNew = (path, text) => {
  try {
    writeFileSync(path, text, { mode: 384, flag: "wx" });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }
    throw error;
  }
};
var runFixture = async (args, io, deps = {}) => {
  const options = { repo: { type: "string" }, out: { type: "string" } };
  let parsed;
  try {
    parsed = parseArgs({ args, options, allowPositionals: true });
  } catch (error) {
    io.err(`nurselog fixture: ${error.message}
Usage: ${SYNOPSIS}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const wanted = positionals.length === 1 ? positionals[0] : void 0;
  if (wanted === void 0) {
    io.err(`nurselog fixture: name one session
Usage: ${SYNOPSIS}`);
    return 2;
  }
  if (wanted.length < MIN_PREFIX) {
    io.err(`nurselog fixture: a session id prefix needs at least ${MIN_PREFIX} characters, not ${stripControl(wanted)}`);
    return 2;
  }
  if (values.out === "") {
    io.err("nurselog fixture: --out needs a file");
    return 2;
  }
  if (values.repo === void 0 && repositoryRoot(io.cwd ?? process.cwd()) === void 0) {
    io.err("nurselog fixture: not inside a git repository; use --repo <path>");
    return 2;
  }
  const root = resolveRepository(values.repo, io.cwd);
  const config = loadConfig(findConfig(root), root, (message) => io.err(`nurselog fixture: ${stripControl(message)}`));
  const dir = spoolDirFor(config, root);
  const days = readSpoolDays(dir, (message) => io.err(`nurselog fixture: ${stripControl(message)}`));
  if (days.length === 0) {
    io.err(`nurselog fixture: no spool day files in ${stripControl(tildeHome(dir))}`);
    return 1;
  }
  const matches = matchSessions(spoolSessionIds(days), wanted);
  const shown2 = stripControl(wanted);
  if (matches.length > 1) {
    io.err(`nurselog fixture: ${shown2} matches ${matches.length} sessions; name one of them:
${matches.map((id) => `  ${stripControl(id)}`).join("\n")}`);
    return 1;
  }
  const fixture = matches.length === 1 ? sessionFixture(days, matches[0], config) : void 0;
  if (!fixture) {
    io.err(`nurselog fixture: no session ${shown2} in the spool of ${stripControl(tildeHome(root))}`);
    return 1;
  }
  if (values.out === void 0) {
    const tty = (deps.stdoutTty ?? (() => process.stdout.isTTY === true))();
    io.out((tty ? fixture.lines.map((line) => stripControl(line)) : fixture.lines).join("\n"));
    return 0;
  }
  const target = resolve(io.cwd ?? process.cwd(), values.out);
  const shownTarget = stripControl(tildeHome(target));
  if (!writeNew(target, `${fixture.lines.join("\n")}
`)) {
    io.err(`nurselog fixture: ${shownTarget} already exists; remove it first or choose another --out`);
    return 1;
  }
  const lines = fixture.lines.length === 1 ? "1 line" : `${fixture.lines.length} lines`;
  io.out(`Wrote ${lines} of session ${stripControl(matches[0])} to ${shownTarget}`);
  return 0;
};

// src/cli/init.ts
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync as writeFileSync2 } from "fs";
import { basename, dirname, isAbsolute, join, normalize, posix, sep } from "path";
import { parseArgs as parseArgs2 } from "util";
var PALETTE = ["#8cb4ff", "#8fe3b8", "#f2a7dd", "#f7c99a", "#c4b0ff", "#b8e0f2", "#f2d388", "#9fd6c9", "#d9a7a7", "#b3c7a0"];
var LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
var AGENT_NAME = /^[\w.-]+$/;
var KEY = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]+)-\d+/;
var BRANCH_KEY = branchKeyRegExp(BRANCH_KEY_PATTERN);
var GLOB_CHARS = /[*?{}[\]]/;
var COMMENT = /\s+#.*$/;
var ARGUMENTS = /\([^)]*\)?/g;
var IMPLEMENT_NAMES = ["implementer", "builder", "developer", "coder", "engineer"];
var IMPLEMENT_SUFFIXES = ["-dev"];
var REVIEW_NAMES = ["reviewer", "qa", "tester"];
var REVIEW_SUFFIXES = ["-reviewer", "-checker", "-analyzer", "-hunter", "-qa", "-tester"];
var FILE_WRITING_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var IMPLEMENT_TOOLS = /* @__PURE__ */ new Set([...FILE_WRITING_TOOLS, "Bash"]);
var QUOTED = /^(["'])((?:(?!\1).)*)\1$/;
var SKIPPED_LIST_LINE = /^\s*(?:#.*)?$/;
var RECENT_BRANCHES = 50;
var AGENT_HEAD_BYTES = 4096;
var MAX_WORKSPACE_LINE = 1e3;
var MIN_KEYED_BRANCHES = 3;
var SKIPPED_DIRECTORIES = /* @__PURE__ */ new Set(["node_modules"]);
var unquote = (value) => value.replace(/^(["'])(.*)\1$/, "$2");
var attempt = async (detect) => {
  try {
    return await detect();
  } catch {
    return void 0;
  }
};
var detectTrunk = async (root, run) => {
  const git = (args) => run("git", [...SAFE_GIT, ...args], root, SAFE_GIT_ENV);
  const head = await attempt(() => git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]));
  const remote = head?.replace(/^(?:remotes\/)?origin\//, "");
  if (remote && remote !== head && isBranchName(remote)) {
    return remote;
  }
  for (const name of ["main", "master"]) {
    if (await attempt(() => git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`])) !== void 0) {
      return name;
    }
  }
  return void 0;
};
var githubRepoOf = (url) => githubRepoOfRemote(url, "github.com");
var detectRepo = async (root, run) => {
  const url = await attempt(() => run("git", [...SAFE_GIT, "remote", "get-url", "origin"], root, SAFE_GIT_ENV));
  return url ? githubRepoOf(url) : void 0;
};
var detectAccountPattern = async (root, run) => {
  const login = await attempt(() => run("gh", ["api", "user", "--jq", ".login"], root));
  return login && LOGIN.test(login) ? `^${escapeRegExp(login)}$` : void 0;
};
var pnpmWorkspaceEntries = (text) => {
  const entries = [];
  let inList = false;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length > MAX_WORKSPACE_LINE) {
      continue;
    }
    const line = raw.replace(/(^|\s)#.*$/, "");
    const inline = /^packages\s*:\s*\[(.*)\]\s*$/.exec(line);
    const item = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (inline) {
      entries.push(...inline[1].split(",").map((entry) => unquote(entry.trim())).filter(Boolean));
    } else if (/^packages\s*:\s*$/.test(line)) {
      inList = true;
    } else if (inList && item) {
      entries.push(unquote(item[1]));
    } else if (/^\S/.test(line)) {
      inList = false;
    }
  }
  return entries;
};
var packageJsonWorkspaces = (text) => {
  const workspaces = JSON.parse(text).workspaces;
  const list = Array.isArray(workspaces) ? workspaces : workspaces?.packages;
  return Array.isArray(list) ? list.filter((entry) => typeof entry === "string") : [];
};
var isPackageDirectory = (root, path) => {
  try {
    const real = realpathSync(join(root, path));
    const inside = real.startsWith(`${realpathSync(root)}${sep}`);
    return inside && lstatSync(join(root, path)).isDirectory() && existsSync(join(real, "package.json"));
  } catch {
    return false;
  }
};
var expandEntry = (root, entry) => {
  const cleaned = entry.replace(/^\.\//, "").replace(/\/+$/, "");
  const wild = /^(?:(.+)\/)?\*$/.exec(cleaned);
  const base = wild ? wild[1] ?? "" : cleaned;
  const unsafe = base !== "" && (isAbsolute(base) || normalize(base).startsWith("..") || normalize(base) === ".");
  if (unsafe || GLOB_CHARS.test(base) || !wild && base === "") {
    return [];
  }
  if (!wild) {
    return isPackageDirectory(root, base) ? [posix.normalize(base)] : [];
  }
  let children = [];
  try {
    children = readdirSync(join(root, base), { withFileTypes: true });
  } catch {
    return [];
  }
  const names = children.filter((child) => child.isDirectory()).map((child) => child.name);
  const wanted = names.filter((name) => !name.startsWith(".") && !SKIPPED_DIRECTORIES.has(name)).sort();
  return wanted.map((name) => posix.join(base, name)).filter((path) => isPackageDirectory(root, path));
};
var detectPackages = (root) => {
  const pnpmFile = join(root, "pnpm-workspace.yaml");
  const jsonFile = join(root, "package.json");
  let entries = existsSync(pnpmFile) ? pnpmWorkspaceEntries(readSmallFile(pnpmFile, MAX_CONFIG_BYTES)) : [];
  if (entries.length === 0 && existsSync(jsonFile)) {
    entries = packageJsonWorkspaces(readSmallFile(jsonFile, MAX_CONFIG_BYTES));
  }
  const directories = entries.filter((entry) => !entry.startsWith("!")).flatMap((entry) => expandEntry(root, entry));
  const packages = [];
  for (const path of directories) {
    const id = posix.basename(path);
    if (STREAM_ID.test(id) && !packages.some((existing) => existing.id === id)) {
      packages.push({ id, color: PALETTE[packages.length % PALETTE.length], paths: [path] });
    }
  }
  return packages.length > 0 ? packages : void 0;
};
var toolNamesOf = (frontmatter) => {
  const lines = frontmatter.split(/\r?\n/);
  const start2 = lines.findIndex((line) => /^tools:/.test(line));
  if (start2 < 0) {
    return void 0;
  }
  const inline = lines[start2].slice("tools:".length).replace(COMMENT, "").trim();
  const items = [];
  if (inline === "") {
    for (const line of lines.slice(start2 + 1)) {
      if (SKIPPED_LIST_LINE.test(line)) {
        continue;
      }
      const item = /^\s*-\s*(.+?)\s*$/.exec(line)?.[1];
      if (item === void 0) {
        break;
      }
      items.push(item);
    }
    if (items.length === 0) {
      return void 0;
    }
  } else {
    items.push(...inline.replace(QUOTED, "$2").replace(/^\[|\]$/g, "").replace(ARGUMENTS, "").split(","));
  }
  return items.map((item) => unquote(item.replace(COMMENT, "").replace(ARGUMENTS, "").trim())).filter((tool) => tool !== "");
};
var readAgent = (file) => {
  const fallback = basename(file, ".md");
  let head = "";
  try {
    head = readSmallFile(file, AGENT_HEAD_BYTES, { head: true });
  } catch {
    return { name: fallback, tools: void 0 };
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)?.[1] ?? "";
  const name = unquote(/^name:\s*(.+?)\s*$/m.exec(frontmatter)?.[1] ?? "");
  return { name: AGENT_NAME.test(name) ? name : fallback, tools: toolNamesOf(frontmatter) };
};
var endsAfter = (name, suffix) => name.endsWith(suffix) && name.length > suffix.length;
var roleOf = (name) => {
  const implementName = IMPLEMENT_NAMES.some((stem) => name === stem || endsAfter(name, `-${stem}`));
  if (implementName || IMPLEMENT_SUFFIXES.some((suffix2) => endsAfter(name, suffix2))) {
    return { stage: "implement" };
  }
  if (REVIEW_NAMES.includes(name)) {
    return { stage: "review" };
  }
  const suffix = REVIEW_SUFFIXES.find((candidate) => endsAfter(name, candidate));
  if (suffix) {
    return { stage: "review", short: name.slice(0, -suffix.length) };
  }
  return name.endsWith("shepherd") ? { stage: "pr" } : void 0;
};
var roleOfTools = (name, tools) => {
  const writes = tools?.some((tool) => FILE_WRITING_TOOLS.has(tool)) ?? false;
  return writes && !DEFAULT_CONFIG.docs.roles.includes(name) ? { stage: "implement" } : void 0;
};
var roleOfAgent = (agent) => {
  const named = roleOf(agent.name);
  if (named) {
    const readOnly = named.stage === "implement" && agent.tools !== void 0 && !agent.tools.some((tool) => IMPLEMENT_TOOLS.has(tool));
    return readOnly ? void 0 : named;
  }
  return roleOfTools(agent.name, agent.tools);
};
var byName = (a, b) => a.name < b.name ? -1 : Number(a.name > b.name);
var detectRoles = (root) => {
  const dir = join(root, ".claude", "agents");
  const files = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.name.endsWith(".md") && !entry.isDirectory());
  const agents = files.map((file) => readAgent(join(dir, file.name))).filter((agent) => AGENT_NAME.test(agent.name));
  agents.sort(byName);
  const roles = {};
  for (const agent of agents) {
    const role = roleOfAgent(agent);
    if (role) {
      ownEntry(roles, agent.name, () => role);
    }
  }
  return Object.keys(roles).length > 0 ? roles : void 0;
};
var sharedPrefix = (prefixes) => {
  const found = prefixes.filter((prefix) => prefix !== void 0);
  const shared = new Set(found);
  return found.length >= MIN_KEYED_BRANCHES && shared.size === 1 ? found[0] : void 0;
};
var upperCasePrefix = (branch) => KEY.exec(branch)?.[1];
var anyCasePrefix = (branch) => {
  const key = branchKey(branch, BRANCH_KEY, true);
  return key === void 0 ? void 0 : key.slice(0, key.lastIndexOf("-"));
};
var keyPatternOf = (branches) => {
  const distinct = [...new Set(branches)];
  const upper = sharedPrefix(distinct.map(upperCasePrefix));
  if (upper !== void 0) {
    return { keyPattern: `${upper}-\\d+` };
  }
  const anyCase = sharedPrefix(distinct.map(anyCasePrefix));
  return anyCase === void 0 ? void 0 : { keyPattern: `${anyCase}-\\d+`, keyIgnoreCase: true };
};
var detectKeyPattern = async (root, run) => {
  const args = ["for-each-ref", "--sort=-committerdate", `--count=${RECENT_BRANCHES}`, "--format=%(refname)", "refs/heads", "refs/remotes"];
  const refs = await attempt(() => run("git", [...SAFE_GIT, ...args], root, SAFE_GIT_ENV));
  const branches = (refs ?? "").split("\n").map((ref) => ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/[^/]+\//, ""));
  return keyPatternOf(branches);
};
var detectConfig = async (root, run = runCommand, { repoFile = false } = {}) => {
  const [trunk, repo, accountPattern, key] = await Promise.all([
    detectTrunk(root, run),
    detectRepo(root, run),
    repoFile ? void 0 : detectAccountPattern(root, run),
    detectKeyPattern(root, run)
  ]);
  const packages = await attempt(() => detectPackages(root));
  const roles = await attempt(() => detectRoles(root));
  const proposal = {};
  if (key) {
    proposal.keyPattern = key.keyPattern;
  }
  if (key?.keyIgnoreCase) {
    proposal.keyIgnoreCase = true;
  }
  if (trunk) {
    proposal.branches = { trunk };
  }
  if (repo || accountPattern) {
    proposal.github = { ...repo ? { repo } : {}, ...accountPattern ? { accountPattern } : {} };
  }
  if (packages) {
    proposal.packages = packages;
  }
  if (roles) {
    proposal.roles = roles;
  }
  return proposal;
};
var dropAccountPattern = (proposal) => {
  const github = proposal.github;
  if (typeof github !== "object" || github === null || !("accountPattern" in github)) {
    return false;
  }
  delete github.accountPattern;
  return true;
};
var repositoryOnly = (proposal) => {
  const accountPattern = dropAccountPattern(proposal) ? ["github.accountPattern"] : [];
  return [...dropUserOnlyKeys(proposal), ...accountPattern];
};
var proposalProblems = (text, root, repoFile) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { problems: [`the proposal on stdin is not valid JSON: ${error.message}`], dropped: [] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { problems: ["the proposal on stdin must be a JSON object"], dropped: [] };
  }
  const proposal = parsed;
  readLegacyNames(proposal);
  const dropped = repoFile ? repositoryOnly(proposal) : [];
  try {
    const problems = validateConfig(mergeOverDefaults(proposal), root);
    return problems.length > 0 ? { problems, dropped } : { proposal, problems, dropped };
  } catch (error) {
    return { problems: [`the proposal on stdin is not a valid config: ${error.message}`], dropped };
  }
};
var printableJson = (value) => {
  const text = JSON.stringify(value, null, 2);
  return text.replace(/[\u007f-\u009f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
};
var exists = (path) => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};
var spoolBaseOf = (root, io) => {
  try {
    return dirname(spoolDirFor(readHookConfig(root), root));
  } catch (error) {
    io.err(`nurselog init: the spool directory is not excluded from backups: ${stripControl(error.message)}`);
    return void 0;
  }
};
var writeNew2 = (path, text, mode) => {
  try {
    writeFileSync2(path, text, { mode, flag: "wx" });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }
    throw error;
  }
};
var runInit = async (args, io, run = runCommand, backup = {}) => {
  const options = { repo: { type: "string" }, "repo-file": { type: "boolean" }, write: { type: "boolean" }, from: { type: "string" } };
  const { values } = parseArgs2({ args, options });
  if (values.from !== void 0 && values.from !== "-") {
    io.err("nurselog init: --from reads the proposal from stdin; use --from -");
    return 2;
  }
  const root = resolveRepository(values.repo, io.cwd);
  let proposal;
  if (values.from === void 0) {
    proposal = await detectConfig(root, run, { repoFile: values["repo-file"] });
  } else {
    const read = io.stdin ?? (() => readFileSync(0, "utf8"));
    const result = proposalProblems(read(), root, values["repo-file"] === true);
    for (const key of result.dropped) {
      io.err(`nurselog init: ${stripControl(key)} is left out of a repository config; set it in the user config`);
    }
    if (!result.proposal) {
      result.problems.forEach((problem) => io.err(`nurselog init: ${stripControl(problem)}`));
      return 1;
    }
    proposal = result.proposal;
  }
  const userPath = userConfigPath(root);
  const repositoryPath = join(root, "nurselog.config.json");
  const target = values["repo-file"] ? repositoryPath : userPath;
  const shown2 = stripControl(tildeHome(target));
  const text = `${printableJson(proposal)}
`;
  if (!values.write) {
    io.out(text.trimEnd());
    io.out(`Would write: ${shown2}`);
    if (exists(target)) {
      io.err(`nurselog init: ${shown2} already exists; --write would not replace it`);
    }
    return 0;
  }
  if (!values["repo-file"]) {
    ensurePrivateDir(dirname(userPath));
  }
  const written = exists(target) ? false : writeNew2(target, text, values["repo-file"] ? 420 : 384);
  if (!written) {
    io.err(`nurselog init: ${shown2} already exists; edit it or remove it first`);
    return 1;
  }
  io.out(`Wrote ${shown2}`);
  if (!values["repo-file"] && exists(repositoryPath)) {
    io.out(`The user config now replaces ${stripControl(tildeHome(repositoryPath))}: the first config found is used whole.`);
  }
  if (values["repo-file"] && exists(userPath)) {
    io.out(`The user config ${tildeHome(userPath)} takes precedence over this file.`);
  }
  const base = (backup.platform ?? process.platform) === "darwin" ? spoolBaseOf(root, io) : void 0;
  if (base !== void 0) {
    const excluded = excludeFromBackup(base, backup);
    const undo = `tmutil removeexclusion ${shellWord(stripControl(base))}`;
    const shownBase = stripControl(tildeHome(base));
    if (excluded) {
      io.out(`On macOS the spool directory ${shownBase} is excluded from Time Machine backups; undo with: ${undo}`);
    } else if (excludedFromBackup(base)) {
      io.out(`On macOS the spool directory ${shownBase} was excluded from Time Machine backups earlier; undo with: ${undo}`);
    }
  }
  return 0;
};

// src/cli/insights.ts
import { parseArgs as parseArgs3 } from "util";

// src/insights/markdown.ts
var NO_WORK_SESSIONS = "No work sessions yet: the board writes a session aggregate when a session finishes.";
var insightsMarkdown = (report) => {
  const lines = ["# Workflow health", ""];
  if (report.basis.window === 0) {
    lines.push(NO_WORK_SESSIONS);
  }
  for (const insight of report.insights) {
    const text = plainText(insight.text);
    lines.push(insight.flag === void 0 ? `- ${text}` : `- ! ${text}`);
  }
  lines.push("", plainText(report.closing));
  return lines.join("\n");
};

// src/cli/insights.ts
var SYNOPSIS2 = "nurselog insights [--repo <path>] [--json]";
var PREFIX = "nurselog insights: ";
var UNESCAPED = /[\u007f-\u009f]/g;
var unicodeEscape = (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
var safeJson = (value) => {
  const json = JSON.stringify(value, null, 2);
  return json.replace(UNESCAPED, unicodeEscape);
};
var runInsights = async (args, io, deps = {}) => {
  const options = { repo: { type: "string" }, json: { type: "boolean" } };
  let parsed;
  try {
    parsed = parseArgs3({ args, options, allowPositionals: false });
  } catch (error) {
    io.err(`${PREFIX}${stripControl(error.message)}
Usage: ${SYNOPSIS2}`);
    return 2;
  }
  const { values } = parsed;
  let root;
  try {
    root = resolveRepository(values.repo, io.cwd);
  } catch (error) {
    io.err(`${PREFIX}${stripControl(error.message)}`);
    return 2;
  }
  const warn = (message) => io.err(`${PREFIX}${stripControl(message)}`);
  const config = loadConfig(findConfig(root), root, warn);
  let refused = false;
  const aggregates2 = readAggregates(spoolDirFor(config, root), (message, refusedFile) => {
    refused ||= refusedFile;
    warn(message);
  });
  if (refused) {
    return 1;
  }
  const report = insightsOf(aggregates2, config.insights, (deps.now ?? (() => /* @__PURE__ */ new Date()))().toISOString());
  if (values.json === true) {
    io.out(safeJson(report));
    return 0;
  }
  io.out(insightsMarkdown(report));
  return 0;
};

// src/cli/install-cli.ts
import { randomBytes } from "crypto";
import { chmodSync, lstatSync as lstatSync2, mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync as writeFileSync3 } from "fs";
import { delimiter, dirname as dirname2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from "path";
import { parseArgs as parseArgs4 } from "util";
var PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';
var HEAD_BYTES = 4096;
var terminalCommandScript = (root) => {
  const cache = cacheDirOf(root);
  const lines = ["#!/bin/sh", OWNER_LINE];
  if (cache === void 0) {
    lines.push(terminalCommandLine(root));
  } else {
    lines.push(
      "# Runs bin/nurselog of the newest plugin copy in this directory that no update or uninstall has orphaned.",
      terminalCommandLine(root),
      "newest_copy() {",
      '  command ls -d "$cache"/[0-9]*.[0-9]*.[0-9]*/ 2>/dev/null | sort -V | while IFS= read -r dir; do',
      "    name=${dir%/}",
      "    name=${name##*/}",
      "    case $name in",
      "      *[!0-9.]* | .* | *. | *..* | *.*.*.*) continue ;;",
      "      *.*.*) ;;",
      "      *) continue ;;",
      "    esac",
      `    [ -e "\${dir}.orphaned_at" ] || printf '%s\\n' "$dir"`,
      "  done | tail -1",
      "}",
      "copy=$(newest_copy)",
      "case $copy in",
      "  /*/) ;;",
      "  *) copy= ;;",
      "esac",
      'if [ -z "$copy" ] || [ ! -f "${copy}bin/nurselog" ]; then',
      "  echo 'nurselog: the plugin is not installed' >&2",
      "  exit 1",
      "fi",
      'exec node "${copy}bin/nurselog" "$@"'
    );
  }
  return `${lines.join("\n")}
`;
};
var onPath = (dir, path) => {
  const entries = path.split(delimiter);
  const absolute = entries.filter((entry) => isAbsolute2(entry));
  return absolute.some((entry) => resolve2(entry) === dir);
};
var lstatOf = (path) => {
  try {
    return lstatSync2(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return void 0;
    }
    throw error;
  }
};
var foreignReason = (path, stat) => {
  if (stat.isSymbolicLink()) {
    return "is a symbolic link";
  }
  if (!stat.isFile()) {
    return "is not a regular file";
  }
  const ownerLine = readSmallFile(path, HEAD_BYTES, { head: true }).split("\n")[1];
  return ownerLine === OWNER_LINE ? void 0 : "was not written by nurselog install-cli";
};
var terminalCommandState = (path = terminalCommandPath()) => {
  const stat = lstatOf(path);
  if (stat === void 0) {
    return { kind: "missing" };
  }
  const reason = foreignReason(path, stat);
  return reason === void 0 ? { kind: "own" } : { kind: "foreign", reason };
};
var replaceFile = (target, text) => {
  const temporary = join2(dirname2(target), `.nurselog-${randomBytes(6).toString("hex")}`);
  try {
    writeFileSync3(temporary, text, { mode: 493, flag: "wx" });
    chmodSync(temporary, 493);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    const code = error.code ?? "write failed";
    throw new Error(`cannot write ${stripControl(tildeHome(target))} (${code})`, { cause: error });
  }
};
var runInstallCli = (args, io, deps = {}) => {
  const { values } = parseArgs4({ args, options: { remove: { type: "boolean" } } });
  const target = terminalCommandPath();
  const shown2 = stripControl(tildeHome(target));
  const state = terminalCommandState(target);
  if (state.kind === "foreign") {
    const action = values.remove ? "not removed" : "not replaced; move it away first to let Nurselog write that path";
    io.err(`nurselog install-cli: ${shown2} ${state.reason}; ${action}`);
    return 1;
  }
  if (values.remove) {
    if (state.kind === "missing") {
      io.out(`Nothing to remove: ${shown2} does not exist`);
      return 0;
    }
    unlinkSync(target);
    io.out(`Removed ${shown2}`);
    return 0;
  }
  const root = deps.packageRoot ?? PACKAGE_ROOT;
  const cache = cacheDirOf(root);
  mkdirSync(dirname2(target), { recursive: true, mode: 493 });
  replaceFile(target, terminalCommandScript(root));
  const cloneBin = stripControl(tildeHome(join2(root, "bin", "nurselog")));
  const newestCopy = `the newest installed plugin copy in ${stripControl(tildeHome(cache ?? root))}`;
  const runs = cache === void 0 ? cloneBin : newestCopy;
  const verb = state.kind === "missing" ? "Installed" : "Updated";
  io.out(`${verb} ${shown2}: it runs ${runs}`);
  if (cache === void 0 && lstatOf(join2(root, ".git"))?.isFile() === true) {
    io.err(`nurselog install-cli: ${stripControl(tildeHome(root))} is a linked git worktree; the terminal command now runs it and stops working when the worktree is removed`);
  }
  if (!onPath(dirname2(target), deps.path ?? process.env.PATH ?? "")) {
    io.out(`~/.local/bin is not on PATH; add this line to ~/.zshrc or ~/.bashrc, then open a new shell: ${PATH_LINE}`);
  }
  return 0;
};

// src/cli/open.ts
import { existsSync as existsSync2 } from "fs";
import { parseArgs as parseArgs5 } from "util";
var OPEN_WAIT_MS = 5e3;
var XDG_OPEN_GRACE_MS = 1e3;
var MAC_OSASCRIPT = "/usr/bin/osascript";
var DEFAULT_DEPS = {
  platform: process.platform,
  launch,
  resolve: (command) => resolveCommand(command),
  exists: (path) => existsSync2(path),
  signInFile: (signIn) => writeSignInFile(signIn),
  startBoard: () => startBoardDetached(),
  waitForBoard: (timeoutMs, exited2) => waitForBoard(timeoutMs, { exited: exited2 }),
  signInBoard: () => signInBoard()
};
var boardAddress = async (io, deps) => {
  const running = await deps.signInBoard();
  if (running.status === "unproven") {
    io.err(`The board did not open: ${notProvenMessage(running.port)}`);
    return void 0;
  }
  if ("signIn" in running) {
    return running;
  }
  const start2 = deps.startBoard();
  if (start2.status === "not-built") {
    io.err(`Nurselog is not built; run pnpm build in ${tildeHome(PACKAGE_ROOT)} and try again.`);
    return void 0;
  }
  const wait = await deps.waitForBoard(OPEN_WAIT_MS, start2.exited);
  const log = tildeHome(boardLogPath());
  if (wait.outcome === "exited") {
    io.err(`Nurselog board did not start; see ${log}`);
    return void 0;
  }
  if (wait.outcome === "timeout") {
    io.err(`The board did not answer within ${OPEN_WAIT_MS / 1e3} s; log: ${log}`);
    return void 0;
  }
  io.out(`Nurselog board started: ${wait.url}`);
  const started = await deps.signInBoard();
  if ("signIn" in started) {
    return started;
  }
  io.err(started.status === "unproven" ? `The board did not open: ${notProvenMessage(started.port)}` : `The board stopped answering; log: ${log}`);
  return void 0;
};
var appleScriptString = (text) => `"${text.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
var openDefaultBrowser = async (url, deps) => {
  if (deps.platform === "darwin") {
    return deps.launch(MAC_OSASCRIPT, [], UNTIL_EXIT, { input: `open location ${appleScriptString(url)}
` });
  }
  const xdgOpen = deps.resolve("xdg-open");
  return xdgOpen !== void 0 && await deps.launch(xdgOpen, [url], XDG_OPEN_GRACE_MS);
};
var openApp = async (signIn, deps) => {
  try {
    const browser = await openAppWindow(signIn, deps);
    if (browser !== void 0) {
      return { browser };
    }
  } catch (error) {
    if (!(error instanceof SignInFileError)) {
      throw error;
    }
    return { fallback: `No sign-in file for the app window (${error.reason}); opening the default browser.` };
  }
  const tried = deps.platform === "darwin" ? MAC_APP_BROWSERS : LINUX_APP_BROWSERS;
  return { fallback: `No Chromium browser for an app window (tried ${tried.join(", ")}); opening the default browser.` };
};
var runOpen = async (args, io, deps = DEFAULT_DEPS) => {
  const { values } = parseArgs5({ args, options: { app: { type: "boolean" } } });
  const board = await boardAddress(io, deps);
  if (board === void 0) {
    return 1;
  }
  const { url } = board;
  if (board.signIn === void 0) {
    io.err("The board gave no sign-in ticket; a browser that is not signed in shows the sign-in notice.");
  }
  const signIn = board.signIn ?? url;
  if (deps.platform !== "darwin" && deps.platform !== "linux") {
    io.out(`Open the board at ${signIn}`);
    return 0;
  }
  if (values.app) {
    const app = await openApp(signIn, deps);
    if ("browser" in app) {
      io.out(`Opened ${url} in an app window of ${app.browser}`);
      return 0;
    }
    io.err(app.fallback);
  }
  if (await openDefaultBrowser(signIn, deps)) {
    io.out(`Opened ${url} in the default browser`);
    return 0;
  }
  io.out(`Open the board at ${signIn}`);
  return 0;
};

// src/cli/purge.ts
import { basename as basename2, dirname as dirname3 } from "path";
import { createInterface } from "readline";
import { parseArgs as parseArgs6 } from "util";
var DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
var isCalendarDay = (text) => {
  const match = DAY.exec(text);
  if (!match) {
    return false;
  }
  return localDay(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) === text;
};
var dayFiles = (count) => count === 1 ? "1 day file" : `${count} day files`;
var markers = (count) => count === 1 ? "1 notified marker" : `${count} notified markers`;
var aggregates = (count) => count === 1 ? "1 session aggregate" : `${count} session aggregates`;
var unreadableFiles = (count) => count === 1 ? "1 unreadable aggregates file" : `${count} unreadable aggregates files`;
var countOf = (stored) => typeof stored === "number" ? stored : 0;
var phrase = (parts) => parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
var daySpan = (files) => files.length === 1 ? files[0].day : `${files[0].day} to ${files.at(-1)?.day}`;
var askOnTerminal = (question) => new Promise((done) => {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  prompt.once("SIGINT", () => prompt.close());
  prompt.once("close", () => done(""));
  prompt.question(question, (answer) => {
    done(answer);
    prompt.close();
  });
});
var boardAlive = () => {
  const state = readServerState(serverStatePath());
  if (!state) {
    return false;
  }
  try {
    process.kill(state.pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};
var orphanName = (orphan) => {
  if (orphan.root === void 0) {
    return `${orphan.hash} (no repository record)`;
  }
  return `${tildeHome(orphan.root)} (checkout moved or gone)`;
};
var targetsOf = (all, repo, cwd, onError) => {
  if (all) {
    const repositories = listRepositories().map((repository) => ({ name: repository.name, root: repository.root }));
    const orphans = listOrphanedSpools(/* @__PURE__ */ new Date(), onError).map((orphan) => ({ name: orphanName(orphan), dir: orphan.dir }));
    return [...repositories, ...orphans];
  }
  const root = resolveRepository(repo, cwd);
  const hash = repoHash(root);
  const listed = listRepositories().find((repository) => repository.hash === hash);
  return [{ name: listed?.name ?? basename2(root), root }];
};
var repositorySpoolDir = (root, name, io) => {
  const config = readHookConfig(root);
  const problems = config.problems ?? [];
  if (problems.length > 0) {
    const path = stripControl(tildeHome(config.found?.path ?? ""));
    io.err(`nurselog purge: ${name}: ${path}: ${stripControl(problems.join("; "))}; using the default spool directory`);
  }
  return spoolDirFor(config, root);
};
var runPurge = async (args, io, deps = {}) => {
  const options = { repo: { type: "string" }, all: { type: "boolean" }, before: { type: "string" }, yes: { type: "boolean" } };
  let values;
  try {
    values = parseArgs6({ args, options }).values;
  } catch (error) {
    io.err(`nurselog purge: ${error.message}`);
    return 2;
  }
  if (values.all && values.repo !== void 0) {
    io.err("nurselog purge: use --repo <path> or --all, not both");
    return 2;
  }
  if (values.before !== void 0 && !isCalendarDay(values.before)) {
    io.err(`nurselog purge: --before needs a day as YYYY-MM-DD, not ${stripControl(values.before)}`);
    return 2;
  }
  if (!values.all && values.repo === void 0 && repositoryRoot(io.cwd ?? process.cwd()) === void 0) {
    io.err("nurselog purge: not inside a git repository; use --repo <path> or --all");
    return 2;
  }
  const before = values.before;
  let failed = false;
  const targets = targetsOf(values.all === true, values.repo, io.cwd, (message) => {
    io.err(`nurselog purge: ${stripControl(message)}`);
    failed = true;
  });
  if (targets.length === 0) {
    io.out(`Nothing to delete: no repository is recorded in ${tildeHome(defaultRoot())}.`);
    return failed ? 1 : 0;
  }
  const found = [];
  for (const target of targets) {
    const name = stripControl(target.name);
    try {
      const dir = "dir" in target ? target.dir : repositorySpoolDir(target.root, name, io);
      const files = purgeableDayFiles(dir, before);
      let stored = "failed";
      try {
        stored = purgeableAggregates(dir, before) ?? "unreadable";
      } catch (error) {
        io.err(`nurselog purge: ${name}: its session aggregates are left alone: ${stripControl(error.message)}`);
        failed = true;
      }
      const shown2 = stripControl(tildeHome(dir));
      const none = before === void 0 ? "no day files" : `no day files before ${before}`;
      const days = files.length === 0 ? none : `${dayFiles(files.length)}, ${daySpan(files)},`;
      let listing = days;
      if (stored === "unreadable") {
        listing = `${days} and ${unreadableFiles(1)}`;
      } else if (countOf(stored) > 0) {
        listing = `${days} and ${aggregates(countOf(stored))}`;
      }
      io.out(`${name}: ${listing} in ${shown2}`);
      found.push({ name, dir, files, aggregates: stored });
    } catch (error) {
      io.err(`nurselog purge: ${name}: ${stripControl(error.message)}`);
      failed = true;
    }
  }
  const totalFiles = found.reduce((sum, target) => sum + target.files.length, 0);
  const totalAggregates = found.reduce((sum, target) => sum + countOf(target.aggregates), 0);
  const totalUnreadable = found.filter((target) => target.aggregates === "unreadable").length;
  if (totalFiles + totalAggregates + totalUnreadable === 0) {
    io.out("Nothing to delete.");
    return failed ? 1 : 0;
  }
  if (!values.yes) {
    const isTty = deps.isTty ?? (() => process.stdin.isTTY === true);
    if (!isTty()) {
      io.err("nurselog purge: stdin is not a terminal to ask on, so nothing was deleted; pass --yes to delete without the question");
      return 1;
    }
    const asked = [
      ...totalFiles > 0 ? [dayFiles(totalFiles)] : [],
      ...totalAggregates > 0 ? [aggregates(totalAggregates)] : [],
      ...totalUnreadable > 0 ? [unreadableFiles(totalUnreadable)] : []
    ];
    const answer = await (deps.ask ?? askOnTerminal)(`Delete ${phrase(asked)}? [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) {
      io.out("Nothing deleted.");
      return failed ? 1 : 0;
    }
  }
  let deletedFiles = 0;
  let deletedMarkers = 0;
  let deletedAggregates = 0;
  let deletedUnreadable = 0;
  let undeleted = 0;
  const hasWork = (candidate) => candidate.files.length > 0 || countOf(candidate.aggregates) > 0 || candidate.aggregates === "unreadable";
  for (const target of found.filter(hasWork)) {
    const onFailure = (_path, error) => {
      io.err(`nurselog purge: ${target.name}: ${stripControl(error.message)}`);
      undeleted += 1;
    };
    try {
      const deleted = purgeSpool(target.dir, before, onFailure);
      const files = deleted.filter((path) => dirname3(path) === target.dir).length;
      deletedFiles += files;
      deletedMarkers += deleted.length - files;
      const taken = target.aggregates === "failed" ? 0 : purgeAggregates(target.dir, before);
      if (taken === void 0) {
        deletedUnreadable += 1;
      } else {
        deletedAggregates += taken;
      }
    } catch (error) {
      io.err(`nurselog purge: ${target.name}: ${stripControl(error.message)}`);
      failed = true;
    }
  }
  const deletedParts = [
    ...totalFiles > 0 || deletedAggregates + deletedUnreadable === 0 ? [dayFiles(deletedFiles)] : [],
    ...deletedMarkers > 0 ? [markers(deletedMarkers)] : [],
    ...deletedAggregates > 0 ? [aggregates(deletedAggregates)] : [],
    ...deletedUnreadable > 0 ? [unreadableFiles(deletedUnreadable)] : []
  ];
  const summary = `Deleted ${phrase(deletedParts)}`;
  io.out(undeleted === 0 ? `${summary}.` : `${summary}; ${dayFiles(undeleted)} could not be deleted.`);
  if ((deps.boardRunning ?? boardAlive)()) {
    io.out("The board keeps the lines it already read in memory until it restarts.");
  }
  return failed || undeleted > 0 ? 1 : 0;
};

// src/cli/uninstall.ts
import { spawnSync } from "child_process";
import { lstatSync as lstatSync3, readFileSync as readFileSync2, rmdirSync, rmSync as rmSync2, statSync, unlinkSync as unlinkSync2 } from "fs";
import { homedir } from "os";
import { dirname as dirname4, join as join3, resolve as resolve3, sep as sep2 } from "path";
import { setTimeout as delay } from "timers/promises";
import { parseArgs as parseArgs7 } from "util";
var CLAUDE_REMOVALS = [["plugin", "uninstall", "nurselog@nurselog"], ["plugin", "marketplace", "remove", "nurselog"]];
var LOCAL_SCOPE_REMOVAL = "claude plugin uninstall nurselog@nurselog --scope local";
var SESSIONS_LINE = "Close other Claude Code sessions first: their hooks keep recording and can restart the board until they end.";
var PROFILES = [".zshenv", ".zshrc", ".zprofile", ".zlogin", ".bashrc", ".bash_profile", ".profile", join3(".config", "fish", "config.fish")];
var STOP_WAIT_MS = 5e3;
var STOP_POLL_MS = 200;
var MAX_LISTED_BYTES = 1024 * 1024;
var NAMES_NURSELOG = /nurselog/i;
var PRUNE_STAMP = ".pruned";
var NOTIFIED_DIR = "notified";
var BACKUP_MARKER = ".backup-excluded";
var shown = (path) => plainText(tildeHome(path));
var messageOf = (error) => plainText(error.message);
var commandText = (command, args) => [shown(command), ...args].join(" ");
var within = (dir, root) => dir === root || dir.startsWith(`${root}${sep2}`);
var objectAt = (value, key) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return void 0;
  }
  const entry = ownValue(value, key);
  return typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry : void 0;
};
var readListed = (path) => {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === void 0) {
    return void 0;
  }
  if (!stat.isFile() || stat.size > MAX_LISTED_BYTES) {
    throw new Error(`${path} is not a regular file of at most 1 MiB`);
  }
  return readFileSync2(path, "utf8");
};
var listedLine = (path, index, line) => `${shown(path)}:${index + 1}: ${plainText(line.trim())}`;
var profileLines = (path) => {
  const lines = readListed(path)?.split("\n") ?? [];
  return lines.flatMap((line, index) => NAMES_NURSELOG.test(line) ? [listedLine(path, index, line)] : []);
};
var lineWith = (path, lines, key, from, fallback) => {
  const pattern = new RegExp(`${escapeRegExp(JSON.stringify(key))}\\s*:`);
  const index = lines.findIndex((line, at) => at >= from && pattern.test(line));
  return index === -1 ? `${shown(path)}: ${fallback}` : listedLine(path, index, lines[index]);
};
var settingsLines = (path) => {
  const text = readListed(path);
  if (text === void 0) {
    return [];
  }
  const settings = JSON.parse(text);
  const lines = text.split("\n");
  const env = objectAt(settings, "env") ?? {};
  const keys = Object.keys(env).filter((key) => key === "CLAUDE_CODE_PLUGIN_DIRS" || key.startsWith("NURSELOG_"));
  const found = keys.map((key) => lineWith(path, lines, key, 0, `env.${plainText(key)}`));
  const command = ownValue(objectAt(settings, "statusLine") ?? {}, "command");
  if (typeof command === "string" && NAMES_NURSELOG.test(command)) {
    const statusLine = lines.findIndex((line) => /"statusLine"\s*:/.test(line));
    found.push(lineWith(path, lines, "command", Math.max(statusLine, 0), "statusLine.command"));
  }
  return found;
};
var baseLines = (base) => {
  const marked = lstatSync3(join3(base, BACKUP_MARKER), { throwIfNoEntry: false }) !== void 0;
  const marker = marked ? `; delete its ${BACKUP_MARKER} marker by hand once nothing else is in it` : "";
  return [`${shown(base)}: a spool.dir, left in place${marker}`];
};
var settingsPath = (env) => {
  const configDir = env.CLAUDE_CONFIG_DIR;
  return configDir ? join3(resolve3(configDir), "settings.json") : join3(homedir(), ".claude", "settings.json");
};
var handListing = (roots, bases, env, io) => {
  const listed = [];
  const collect = (path, read) => {
    try {
      listed.push(...read(path));
    } catch (error) {
      io.err(`nurselog uninstall: cannot read ${shown(path)}, so it is not listed; check it by hand: ${messageOf(error)}`);
    }
  };
  for (const profile of PROFILES) {
    collect(join3(homedir(), profile), profileLines);
  }
  collect(settingsPath(env), settingsLines);
  for (const root of roots) {
    const config = join3(root, "nurselog.config.json");
    collect(config, (path) => lstatSync3(path, { throwIfNoEntry: false }) === void 0 ? [] : [`${shown(path)}: a repository config`]);
  }
  for (const base of bases) {
    collect(base, baseLines);
  }
  listed.push(`A --scope local install: run ${LOCAL_SCOPE_REMOVAL} in each repository that has one.`);
  listed.push("An installed board app: remove it from the browser or the Dock.");
  return listed;
};
var claudeStep = (root, path) => {
  if (cacheDirOf(root) === void 0) {
    return { mode: "clone", root };
  }
  const claude = resolveCommand("claude", path);
  return claude === void 0 ? { mode: "print" } : { mode: "run", claude };
};
var boardLine = (plan) => {
  const board = plan.board;
  if (board.status === "proven") {
    return `Board: stop pid ${board.pid} on port ${board.port} and wait for it to exit.`;
  }
  if (board.status === "unproven") {
    return `Board: leave pid ${board.pid} on port ${board.port} running, as it does not prove the board token; stop it by hand.`;
  }
  if (plan.stale !== void 0) {
    return `Board: none answers; leave pid ${plan.stale.pid} of server.json alone, as it may be another process by now.`;
  }
  return "Board: none runs.";
};
var commandLine = (plan) => {
  const path = shown(terminalCommandPath());
  if (plan.command.kind === "own") {
    return `Terminal command: delete ${path}.`;
  }
  if (plan.command.kind === "foreign") {
    return `Terminal command: keep ${path}, which ${plan.command.reason}.`;
  }
  if (plan.command.kind === "error") {
    return `Terminal command: ${path} cannot be checked: ${plan.command.message}.`;
  }
  return `Terminal command: none at ${path}.`;
};
var spoolLine = (spool) => {
  const where = spool.dir === void 0 ? "its spool directory cannot be looked up" : shown(spool.dir);
  return `     ${plainText(spool.name)}: ${where}`;
};
var dataLines = (plan, keepData) => {
  const root = defaultRoot();
  if (keepData) {
    return ["Recorded data: keep it (--keep-data)."];
  }
  if (plan.board.status === "unproven") {
    return [`Recorded data: keep it while pid ${plan.board.pid} runs.`];
  }
  if (plan.spools.length === 0 && plan.orphans === 0) {
    return ["Recorded data: none is recorded."];
  }
  const orphans = plan.orphans === 1 ? "1 orphaned spool directory" : `${plan.orphans} orphaned spool directories`;
  const outside = plan.spools.some((spool) => spool.dir !== void 0 && !within(spool.dir, root));
  return [
    "Recorded data, once the board is stopped: delete the day files, notified markers and session aggregates, as nurselog purge --all does, of",
    ...plan.spools.map(spoolLine),
    ...plan.orphans > 0 ? [`     ${orphans} in ${shown(root)}`] : [],
    ...outside ? [`     and then each emptied spool directory outside ${shown(root)}.`] : []
  ];
};
var rootLine = (plan, keepData) => {
  const root = shown(defaultRoot());
  if (keepData) {
    return `Data directory: keep ${root}, with the repository records, user configs and board token (--keep-data).`;
  }
  if (plan.board.status === "unproven") {
    return `Data directory: keep ${root} while pid ${plan.board.pid} runs.`;
  }
  if (!plan.rootExists) {
    return `Data directory: none at ${root}.`;
  }
  return `Data directory, once the purge succeeded: delete ${root} whole: repository records, user configs, session aggregates, board token, server.json and board.log.`;
};
var claudePlanLine = (step) => {
  if (step.mode === "run") {
    const commands2 = CLAUDE_REMOVALS.map((args) => commandText(step.claude, args)).join(", then ");
    return `Claude Code: run ${commands2}.`;
  }
  const commands = CLAUDE_REMOVALS.map((args) => commandText("claude", args)).join(", then ");
  if (step.mode === "print") {
    return `Claude Code: claude is not on PATH, so print ${commands}.`;
  }
  return `Claude Code: change nothing, as this runs from the clone ${shown(step.root)}; print what to remove.`;
};
var printPlan = (plan, keepData, io) => {
  const steps = [[boardLine(plan)], [commandLine(plan)], dataLines(plan, keepData), [rootLine(plan, keepData)], [claudePlanLine(plan.claude)]];
  io.out("nurselog uninstall removes Nurselog from this machine:");
  steps.forEach((lines, index) => {
    io.out(`  ${index + 1}. ${lines[0]}`);
    lines.slice(1).forEach((line) => io.out(line));
  });
  io.out(SESSIONS_LINE);
  io.out("Listed only, never changed; remove them by hand:");
  plan.listed.forEach((line) => io.out(`  ${line}`));
};
var makePlan = async (deps, keepData, io) => {
  let failed = false;
  const board = await (deps.checkBoard ?? defaultCheck)();
  const state = board.status === "none" ? readServerState(serverStatePath()) : void 0;
  let command;
  try {
    command = terminalCommandState();
  } catch (error) {
    command = { kind: "error", message: messageOf(error) };
  }
  let repositories = [];
  let orphans = 0;
  try {
    repositories = listRepositories();
    orphans = listOrphanedSpools().length;
  } catch (error) {
    io.err(`nurselog uninstall: cannot list the recorded repositories: ${messageOf(error)}`);
    failed = true;
  }
  const spools = repositories.map((repository) => {
    try {
      return { name: repository.name, dir: spoolDirFor(readHookConfig(repository.root), repository.root) };
    } catch {
      return { name: repository.name };
    }
  });
  const root = defaultRoot();
  const outside = spools.flatMap((spool) => spool.dir !== void 0 && !within(spool.dir, root) ? [dirname4(spool.dir)] : []);
  const bases = keepData ? [] : [...new Set(outside)];
  const rootExists = lstatSync3(root, { throwIfNoEntry: false }) !== void 0;
  const claude = claudeStep(deps.packageRoot ?? PACKAGE_ROOT, deps.path ?? process.env.PATH ?? "");
  const roots = repositories.map((repository) => repository.root);
  const listed = handListing(roots, bases, deps.env ?? process.env, io);
  const stale = state === void 0 ? void 0 : { pid: state.pid, port: state.port };
  return { plan: { board, stale, command, spools, orphans, rootExists, claude, listed }, failed };
};
var defaultCheck = () => checkBoard(serverStatePath(), RUNNING_CHECK_MS);
var defaultKill = (pid, signal) => {
  process.kill(pid, signal);
};
var defaultRun = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  return result.error === void 0 ? result.status : null;
};
var exited = (kill, pid) => {
  try {
    kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
};
var stopBoard = async (deps, io) => {
  const board = await (deps.checkBoard ?? defaultCheck)();
  if (board.status === "none") {
    const state = readServerState(serverStatePath());
    if (state === void 0) {
      io.out("No board runs.");
    } else {
      io.out(`No board answers on port ${state.port}; pid ${state.pid} of the stale server.json is left alone.`);
    }
    return true;
  }
  if (board.status === "unproven") {
    io.err(`nurselog uninstall: pid ${board.pid} on port ${board.port} does not prove the board token, so it was not stopped; stop it by hand`);
    return false;
  }
  const kill = deps.kill ?? defaultKill;
  try {
    kill(board.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") {
      io.err(`nurselog uninstall: cannot stop the board, pid ${board.pid}: ${messageOf(error)}`);
      return false;
    }
  }
  const sleep = deps.sleep ?? ((ms) => delay(ms).then(() => void 0));
  for (let waited = 0; waited < STOP_WAIT_MS; waited += STOP_POLL_MS) {
    await sleep(STOP_POLL_MS);
    if (exited(kill, board.pid)) {
      io.out(`Stopped the board, pid ${board.pid}.`);
      return true;
    }
  }
  io.err(`nurselog uninstall: the board, pid ${board.pid}, did not exit within ${STOP_WAIT_MS / 1e3} s; stop it with: kill ${board.pid}`);
  return false;
};
var removeTerminalCommand = (io) => {
  const target = terminalCommandPath();
  try {
    const state = terminalCommandState(target);
    if (state.kind === "missing") {
      io.out(`No terminal command at ${shown(target)}.`);
    } else if (state.kind === "foreign") {
      io.out(`Kept ${shown(target)}: it ${state.reason}.`);
    } else {
      unlinkSync2(target);
      io.out(`Removed ${shown(target)}`);
    }
    return true;
  } catch (error) {
    io.err(`nurselog uninstall: cannot remove ${shown(target)}: ${messageOf(error)}`);
    return false;
  }
};
var removeEmptiedSpool = (dir, io) => {
  if (!spoolDirExists(dir)) {
    return;
  }
  const stamp = join3(dir, PRUNE_STAMP);
  if (lstatSync3(stamp, { throwIfNoEntry: false })?.isFile() === true) {
    unlinkSync2(stamp);
  }
  for (const folder of [join3(dir, NOTIFIED_DIR), dir]) {
    try {
      rmdirSync(folder);
    } catch (error) {
      const code = error.code;
      if (code === "ENOTEMPTY" || code === "EEXIST") {
        io.out(`Kept ${shown(folder)}: it holds files the purge did not delete.`);
        return;
      }
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
  io.out(`Removed ${shown(dir)}`);
};
var purgeData = async (spools, io) => {
  let purged;
  try {
    purged = await runPurge(["--all", "--yes"], io, { boardRunning: () => false });
  } catch (error) {
    io.err(`nurselog uninstall: the purge failed: ${messageOf(error)}`);
    return false;
  }
  let failed = purged !== 0;
  const root = defaultRoot();
  for (const spool of spools) {
    if (spool.dir === void 0 || within(spool.dir, root)) {
      continue;
    }
    try {
      removeEmptiedSpool(spool.dir, io);
    } catch (error) {
      io.err(`nurselog uninstall: ${plainText(spool.name)}: cannot remove ${shown(spool.dir)}: ${messageOf(error)}`);
      failed = true;
    }
  }
  return !failed;
};
var removeDataRoot = (io) => {
  const root = defaultRoot();
  try {
    const stat = lstatSync3(root, { throwIfNoEntry: false });
    if (stat === void 0) {
      io.out(`Nothing to delete: ${shown(root)} does not exist.`);
      return true;
    }
    if (!stat.isDirectory()) {
      io.err(`nurselog uninstall: ${shown(root)} is not a directory (a symlink is refused); not deleted`);
      return false;
    }
    rmSync2(root, { recursive: true, force: true });
    io.out(`Deleted ${shown(root)}`);
    return true;
  } catch (error) {
    io.err(`nurselog uninstall: cannot delete ${shown(root)}: ${messageOf(error)}`);
    return false;
  }
};
var removeData = async (spools, boardStopped, io) => {
  const root = shown(defaultRoot());
  if (!boardStopped) {
    io.err(`nurselog uninstall: kept the recorded data and ${root}, as the board was not stopped`);
    return true;
  }
  if (!await purgeData(spools, io)) {
    io.err(`nurselog uninstall: kept ${root}, as the purge did not succeed and its user configs name the spool directories still to purge`);
    return false;
  }
  return removeDataRoot(io);
};
var removeFromClaudeCode = (step, deps, io) => {
  const commands = CLAUDE_REMOVALS.map((args) => `  ${commandText("claude", args)}`);
  if (step.mode === "print") {
    io.out("claude is not on PATH; remove the plugin from Claude Code with:");
    commands.forEach((line) => io.out(line));
    return true;
  }
  if (step.mode === "clone") {
    io.out(`This runs from the clone ${shown(step.root)}: delete it from CLAUDE_CODE_PLUGIN_DIRS, or stop passing --plugin-dir. A marketplace install is removed with:`);
    commands.forEach((line) => io.out(line));
    return true;
  }
  let ok = true;
  for (const args of CLAUDE_REMOVALS) {
    const text = commandText(step.claude, args);
    io.out(`Running ${text}`);
    const status = (deps.run ?? defaultRun)(step.claude, args);
    if (status !== 0) {
      const outcome = status === null ? "did not run to the end" : `exited with ${status}`;
      io.err(`nurselog uninstall: ${text} ${outcome}`);
      ok = false;
    }
  }
  return ok;
};
var runUninstall = async (args, io, deps = {}) => {
  const options = { yes: { type: "boolean" }, "keep-data": { type: "boolean" } };
  let values;
  try {
    values = parseArgs7({ args, options }).values;
  } catch (error) {
    io.err(`nurselog uninstall: ${error.message}`);
    return 2;
  }
  const keepData = values["keep-data"] === true;
  const { plan, failed: planFailed } = await makePlan(deps, keepData, io);
  printPlan(plan, keepData, io);
  if ((deps.env ?? process.env).CLAUDECODE) {
    io.err("nurselog uninstall: refused inside Claude Code, as it would remove the plugin under the running session, so nothing was removed; run nurselog uninstall from a terminal outside Claude Code");
    return 1;
  }
  if (!values.yes) {
    const isTty = deps.isTty ?? (() => process.stdin.isTTY === true);
    if (!isTty()) {
      io.err("nurselog uninstall: stdin is not a terminal to ask on, so nothing was removed; pass --yes to remove without the question");
      return 1;
    }
    const answer = await (deps.ask ?? askOnTerminal)("Remove Nurselog from this machine? [y/N] ");
    if (!/^y(es)?$/i.test(answer.trim())) {
      io.out("Nothing removed.");
      return planFailed ? 1 : 0;
    }
  }
  const boardStopped = await stopBoard(deps, io);
  const results = [boardStopped, removeTerminalCommand(io)];
  if (!keepData) {
    results.push(await removeData(plan.spools, boardStopped, io));
  }
  results.push(removeFromClaudeCode(plan.claude, deps, io));
  if (planFailed || results.includes(false)) {
    const retry = cliCommand(void 0, "uninstall", join3(deps.packageRoot ?? PACKAGE_ROOT, "bin", "nurselog"), false);
    io.err(`nurselog uninstall: not every step succeeded; see the messages above, then run it again with: ${retry}`);
    return 1;
  }
  const kept = keepData ? `, its data kept in ${shown(defaultRoot())}` : "";
  io.out(`Nurselog is removed from this machine${kept}; remove what is listed above by hand.`);
  return 0;
};

// src/cli.ts
var defaultIo = () => ({
  cwd: process.cwd(),
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  tty: process.stdout.isTTY === true
});
var fixturePath = (name) => {
  const candidates = [resolve4(name), join4(PACKAGE_ROOT, "fixtures", name), join4(PACKAGE_ROOT, "fixtures", `${name}.ndjson`)];
  return candidates.find((path) => existsSync3(path)) ?? resolve4(name);
};
var fixturePaths = (list) => list.split(",").map((name) => name.trim()).filter(Boolean).map(fixturePath);
var replayConfig = (replay, root) => {
  const beside = join4(dirname5(replay), "nurselog.config.json");
  if (existsSync3(beside)) {
    return { path: beside, kind: "repository" };
  }
  return root ? findConfig(root) : void 0;
};
var portsInUseMessage = (port, root) => {
  const ports = port === void 0 ? `Ports ${DEFAULT_PORT} to ${DEFAULT_PORT + 19} are` : `Port ${port} is`;
  return `${ports} in use; check the board with: ${cliCommand(root, "status")}`;
};
var runningMessage = async (state, root) => {
  const tab = state ? await boardTab(await checkBoard(serverStatePath(), RUNNING_CHECK_MS), root) : void 0;
  return alreadyRunningMessage(state, tab?.url);
};
var start = async (args, io) => {
  const options = { replay: { type: "string" }, speed: { type: "string" }, port: { type: "string" }, repo: { type: "string" } };
  const { values } = parseArgs8({ args, options });
  const speed = values.speed === void 0 ? 1 : Number(values.speed);
  if (!(speed > 0)) {
    io.err("--speed must be a positive number");
    return 2;
  }
  if (values.speed !== void 0 && !values.replay) {
    io.err("--speed works only with --replay; the live spool is never paced");
    return 2;
  }
  const replay = values.replay === void 0 ? void 0 : fixturePaths(values.replay);
  if (replay?.length === 0) {
    io.err("--replay needs a fixture: a path or a name in fixtures/, several separated by commas");
    return 2;
  }
  const cwd = io.cwd ?? process.cwd();
  const repository = values.repo === void 0 ? repositoryRoot(cwd) : resolveRepository(values.repo, cwd);
  const port = values.port === void 0 ? void 0 : Number(values.port);
  let replayStart;
  if (replay) {
    const root = repository ?? resolve4(cwd);
    const found = replayConfig(replay[0], repository);
    replayStart = { fixtures: replay, speed, root, config: loadConfig(found, root, (message) => io.err(`nurselog: ${message}`)) };
  } else {
    if (repository !== void 0 && !findConfig(repository)) {
      io.err(notSetUpMessage());
    }
    const board = await checkBoard(serverStatePath(), RUNNING_CHECK_MS);
    if (board.status === "unproven") {
      io.err(`Nurselog did not start: ${notProvenMessage(board.port)}`);
      return 1;
    }
    if (board.status === "proven") {
      io.out(alreadyRunningMessage(board, (await boardTab(board, repository))?.url));
      return 0;
    }
  }
  let nurselog;
  try {
    nurselog = await startNurselog({ port, replay: replayStart, onSelfClose: () => process.exit(0) });
  } catch (error) {
    if (error instanceof BoardRunningError) {
      io.out(await runningMessage(error.state, repository));
      return 0;
    }
    if (error.code === "EADDRINUSE") {
      io.err(portsInUseMessage(port, repository));
      return 1;
    }
    if (error instanceof OrphanedCopyError) {
      io.err(error.message);
      return 1;
    }
    throw error;
  }
  const shutdown = () => {
    void nurselog.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  const source = replay ? `replaying ${replay.map(tildeHome).join(", ")} at speed ${speed}` : `serving the repositories recorded in ${tildeHome(defaultRoot())}`;
  if (replay || io.tty === true) {
    io.out(`Nurselog on ${nurselog.ticketUrl()} (${source}). Stop with Ctrl+C.`);
  } else {
    io.out(`Nurselog on ${nurselog.url}/ (${source}); sign in with: nurselog open. Stop with Ctrl+C.`);
  }
  return 0;
};
var main = async (argv, io = defaultIo()) => {
  const [first, ...rest] = argv;
  try {
    if (first === void 0 || first === "start") {
      return await start(rest, io);
    }
    if (first.startsWith("--") && first !== "--help") {
      return await start(argv, io);
    }
    if (first === "emit") {
      return runEmit(rest, io);
    }
    if (first === "status") {
      return await runStatus(rest, io);
    }
    if (first === "link") {
      return await runLink(rest, io);
    }
    if (first === "init") {
      return await runInit(rest, io);
    }
    if (first === "open") {
      return await runOpen(rest, io);
    }
    if (first === "purge") {
      return await runPurge(rest, io);
    }
    if (first === "fixture") {
      return await runFixture(rest, io);
    }
    if (first === "insights") {
      return await runInsights(rest, io);
    }
    if (first === "install-cli") {
      return runInstallCli(rest, io);
    }
    if (first === "uninstall") {
      return await runUninstall(rest, io);
    }
    if (first === "help" || first === "--help" || first === "-h") {
      io.out(USAGE);
      return 0;
    }
    io.err(`Unknown command ${first}
${USAGE}`);
    return 2;
  } catch (error) {
    io.err(`nurselog: ${error.message}`);
    return 1;
  }
};
export {
  fixturePaths,
  main,
  portsInUseMessage,
  replayConfig
};
