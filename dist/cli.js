import {
  BoardRunningError,
  DEFAULT_PORT,
  OrphanedCopyError,
  SAFE_GIT,
  USAGE,
  alreadyRunningMessage,
  boardTab,
  listOrphanedSpools,
  listRepositories,
  purgeAggregates,
  purgeableAggregates,
  readAggregates,
  resolveRepository,
  runCommand,
  runEmit,
  runLink,
  runStatus,
  startNurselog
} from "./chunk-VGB744M5.js";
import {
  sessionFixture,
  spoolSessionIds
} from "./chunk-ODEVUTYB.js";
import {
  BRANCH_KEY_PATTERN,
  DEFAULT_CONFIG,
  LINUX_APP_BROWSERS,
  MAC_APP_BROWSERS,
  MAC_OPEN,
  MAX_CONFIG_BYTES,
  PACKAGE_ROOT,
  RUNNING_CHECK_MS,
  STREAM_ID,
  UNTIL_EXIT,
  boardLogPath,
  branchKey,
  branchKeyRegExp,
  checkBoard,
  cliCommand,
  compareText,
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
  loadConfig,
  localDay,
  mergeOverDefaults,
  notProvenMessage,
  notSetUpMessage,
  openAppWindow,
  ownEntry,
  purgeSpool,
  purgeableDayFiles,
  readHookConfig,
  readServerState,
  readSmallFile,
  readSpoolDays,
  repoHash,
  repositoryRoot,
  resolveCommand,
  serverStatePath,
  shellWord,
  signInBoard,
  spoolDirFor,
  startBoardDetached,
  stripControl,
  tildeHome,
  time,
  userConfigPath,
  validateConfig,
  waitForBoard
} from "./chunk-WVTBF6C4.js";

// src/cli.ts
import { existsSync as existsSync3 } from "fs";
import { dirname as dirname4, join as join3, resolve as resolve3 } from "path";
import { parseArgs as parseArgs7 } from "util";

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
  const shown = stripControl(wanted);
  if (matches.length > 1) {
    io.err(`nurselog fixture: ${shown} matches ${matches.length} sessions; name one of them:
${matches.map((id) => `  ${stripControl(id)}`).join("\n")}`);
    return 1;
  }
  const fixture = matches.length === 1 ? sessionFixture(days, matches[0], config) : void 0;
  if (!fixture) {
    io.err(`nurselog fixture: no session ${shown} in the spool of ${stripControl(tildeHome(root))}`);
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
var BUILD_NAMES = ["implementer", "builder", "developer", "coder", "engineer"];
var REVIEW_SUFFIXES = ["-reviewer", "-checker", "-analyzer", "-hunter"];
var FILE_WRITING_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var BUILD_TOOLS = /* @__PURE__ */ new Set([...FILE_WRITING_TOOLS, "Bash"]);
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
  const git = (args) => run("git", [...SAFE_GIT, ...args], root);
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
  const url = await attempt(() => run("git", [...SAFE_GIT, "remote", "get-url", "origin"], root));
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
var roleOf = (name) => {
  if (BUILD_NAMES.some((build) => name === build || name.endsWith(`-${build}`) && name.length > build.length + 1)) {
    return { stage: "build" };
  }
  const suffix = REVIEW_SUFFIXES.find((candidate) => name.endsWith(candidate) && name.length > candidate.length);
  if (suffix) {
    return { stage: "review", short: name.slice(0, -suffix.length) };
  }
  return name.endsWith("shepherd") ? { stage: "pr" } : void 0;
};
var roleOfTools = (name, tools) => {
  const writes = tools?.some((tool) => FILE_WRITING_TOOLS.has(tool)) ?? false;
  return writes && !DEFAULT_CONFIG.docs.roles.includes(name) ? { stage: "build" } : void 0;
};
var roleOfAgent = (agent) => {
  const named = roleOf(agent.name);
  if (named) {
    const readOnly = named.stage === "build" && agent.tools !== void 0 && !agent.tools.some((tool) => BUILD_TOOLS.has(tool));
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
  const refs = await attempt(() => run("git", [...SAFE_GIT, ...args], root));
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
  const shown = stripControl(tildeHome(target));
  const text = `${printableJson(proposal)}
`;
  if (!values.write) {
    io.out(text.trimEnd());
    io.out(`Would write: ${shown}`);
    if (exists(target)) {
      io.err(`nurselog init: ${shown} already exists; --write would not replace it`);
    }
    return 0;
  }
  if (!values["repo-file"]) {
    ensurePrivateDir(dirname(userPath));
  }
  const written = exists(target) ? false : writeNew2(target, text, values["repo-file"] ? 420 : 384);
  if (!written) {
    io.err(`nurselog init: ${shown} already exists; edit it or remove it first`);
    return 1;
  }
  io.out(`Wrote ${shown}`);
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

// src/ui/format.ts
var cost = (usd) => `$${(Number.isFinite(usd) ? Math.max(0, usd) : 0).toFixed(2)}`;
var tokens = (count2) => {
  const value = Number.isFinite(count2) ? Math.max(0, count2) : 0;
  if (value >= 999500) {
    return `${Number((value / 1e6).toFixed(2))}M`;
  }
  if (value >= 99950) {
    return `${Math.round(value / 1e3)}k`;
  }
  if (value >= 999.5) {
    return `${(value / 1e3).toFixed(1)}k`;
  }
  return String(Math.round(value));
};

// src/insights/insights.ts
var AREAS = ["implementers", "review", "verification", "tokens", "questions"];
var AREA_NAMES = { implementers: "Implementers", review: "Review", verification: "Verification", tokens: "Token economy", questions: "Questions and waits" };
var SIGNAL_NAMES = {
  "budget-first-stop": "budget at the first stop",
  "second-implementer": "second implementers",
  "second-round": "second review rounds",
  "fix-followups": "fix follow-ups",
  "quiet-reviewer": "quiet reviewers",
  "verify-commands": "verification commands",
  "failed-runs": "failed runs",
  "cache-per-output": "cache read per output token",
  "main-peak-context": "main-thread peak context",
  "main-cost-share": "main-thread cost share",
  "overhead-share": "Nurselog overhead share",
  "main-large-outputs": "main-thread large outputs",
  "question-open-time": "question open time",
  "questions-per-session": "questions per session",
  "developer-wait": "developer wait"
};
var FACTOR = 1.5;
var STANDING_PERCENT = 30;
var STANDING_RUNS = 5;
var QUIET_RUNS = 10;
var QUIET_FIXES = 2;
var SPREAD_VALUES = 3;
var MAIN_ROLE = "main";
var OVERHEAD_STANDING = 0.01;
var CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
var plainText = (text) => text.replace(CONTROL, "");
var NO_BUILDS = "no implementer runs, no subagent of a build-stage role ran";
var NO_BUDGET = "no tool-call budget is set for the build-stage roles (budgets.roles.<role>.toolCalls)";
var NO_FIRST_STOP = "no implementer run with a tool-call budget stopped";
var NO_STREAM = "no implementer ran on a stream";
var NO_REVIEWS = "no reviewer runs, no subagent of a review-stage role ran";
var NO_ROUND = "no review-stage role reviewed a branch";
var NO_BLOCK = "no reviewer wrote a report block (design section 10)";
var NO_COMMAND = "no command matched verification.kinds";
var NO_REQUESTS = "no requests were recorded (usage facts come from the transcripts)";
var NO_LIMIT = "no context limit is known for the main thread's model (budgets.contextLimits)";
var NO_OVERHEAD = "no session recorded the Nurselog overhead (its hook or board predates the count)";
var NOT_STORED = "the session aggregates lack it (an older board wrote them)";
var IMPLEMENTER_RUN = ["implementer run", "implementer runs"];
var STREAM = ["stream", "streams"];
var BRANCH = ["branch", "branches"];
var RUN = ["run", "runs"];
var SESSION = ["session", "sessions"];
var WORK_SESSION = ["work session", "work sessions"];
var ANSWERED = ["answered question", "answered questions"];
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var fieldsOf = (value) => isRecord(value) ? value : {};
var entriesOf = (value) => Array.isArray(value) ? value.filter(isRecord) : void 0;
var numberOf = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
var timeOf = (value) => typeof value === "string" ? time(value) : Number.NaN;
var isNumber = (value) => value !== null;
var buildRun = (entry) => ({
  callsAtFirstStop: numberOf(entry.callsAtFirstStop),
  callLimit: numberOf(entry.callLimit),
  commands: numberOf(entry.commands),
  failed: numberOf(entry.failed)
});
var reviewRuns = (entries) => {
  const runs = [];
  entries.forEach((entry, index) => {
    if (typeof entry.role === "string") {
      const start2 = timeOf(entry.startedAt);
      runs.push({ role: plainText(entry.role), start: Number.isFinite(start2) ? start2 : 0, index, fixItems: numberOf(entry.fixItems), usd: numberOf(entry.usd) });
    }
  });
  return runs;
};
var rowNumbers = (entry) => {
  const streamRuns2 = Array.isArray(entry.streamRuns) ? entry.streamRuns.map(numberOf).filter(isNumber) : [];
  return { owned: entry.owner === true, ownerKnown: typeof entry.owner === "boolean", reviewRound: numberOf(entry.reviewRound), streamRuns: streamRuns2 };
};
var roleNumbers = (entries) => entries.flatMap((entry) => {
  if (typeof entry.role !== "string") {
    return [];
  }
  const role = plainText(entry.role);
  return [{ role, runs: numberOf(entry.runs), cacheRead: numberOf(entry.cacheRead), output: numberOf(entry.output), peakContext: numberOf(entry.peakContext), usd: numberOf(entry.usd) }];
});
var openTime = (entry) => {
  const asked = timeOf(entry.askedAt);
  const answered = timeOf(entry.answeredAt);
  return Number.isFinite(asked) && Number.isFinite(answered) ? Math.max(0, answered - asked) : null;
};
var readSession = (aggregate, finished) => {
  const main2 = fieldsOf(aggregate.main);
  const metrics = fieldsOf(aggregate.metrics);
  const roles = entriesOf(metrics.roles);
  const reviews = entriesOf(aggregate.reviews);
  return {
    id: aggregate.id,
    finished,
    builds: entriesOf(aggregate.builds)?.map(buildRun),
    reviews: reviews === void 0 ? void 0 : reviewRuns(reviews),
    rows: entriesOf(aggregate.rows)?.map(rowNumbers),
    roles: roles === void 0 ? void 0 : roleNumbers(roles),
    totalUsd: numberOf(fieldsOf(metrics.total).usd),
    overheadUsd: numberOf(fieldsOf(metrics.overhead).usd),
    largeOutputs: numberOf(main2.largeOutputs),
    contextLimit: numberOf(main2.contextLimit),
    questions: entriesOf(aggregate.questions)?.map(openTime),
    waitMs: numberOf(fieldsOf(aggregate.developerWait).totalMs)
  };
};
var pad = (value) => String(value).padStart(2, "0");
var localDay2 = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
var sum = (values) => values.reduce((total, value) => total + value, 0);
var percentile = (values, p) => {
  if (values.length === 0) {
    return void 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p / 100 * sorted.length) - 1)];
};
var median = (values) => percentile(values, 50);
var count = (value, noun) => `${value} ${value === 1 ? noun[0] : noun[1]}`;
var percent = (fraction) => Math.round(fraction * 100);
var percentTenths = (fraction) => (fraction * 100).toFixed(1);
var duration = (ms) => {
  const seconds = Math.round(Math.max(0, ms) / 1e3);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const tenthMinutes = Math.round(seconds / 6);
  if (tenthMinutes < 100) {
    return `${(tenthMinutes / 10).toFixed(1)} min`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${(Math.round(seconds / 360) / 10).toFixed(1)} h`;
};
var listText = (items) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
var onBaseline = (sides, of) => sides.comparable ? of(sides.baseline) : void 0;
var kOfN = (units, hit) => ({ n: units.length, k: units.filter(hit).length });
var valueOver = (n, value) => value === void 0 ? { n } : { n, value };
var medianOf = (values) => valueOver(values.length, median(values));
var rateFlag = (window, baseline) => {
  if (baseline === void 0 || baseline.n === 0) {
    return false;
  }
  const k = window.k ?? 0;
  return k >= 2 && k * baseline.n >= FACTOR * (baseline.k ?? 0) * window.n;
};
var factorFlag = (window, baseline) => {
  if (window.value === void 0 || baseline?.value === void 0) {
    return false;
  }
  return window.value > 0 && window.value >= FACTOR * baseline.value;
};
var spreadFlag = (window, baseline) => {
  const middle = median(window);
  const high = baseline === void 0 ? void 0 : percentile(baseline, 75);
  return window.length >= SPREAD_VALUES && middle !== void 0 && high !== void 0 && middle > high;
};
var comparison = (flagged) => flagged ? "comparison" : void 0;
var before = (sides, baseline, noun, text) => {
  if (baseline === void 0) {
    return `before: fewer than ${count(sides.minimum, WORK_SESSION)}`;
  }
  return baseline.n === 0 ? `before: no ${noun[1]}` : `before: ${text(baseline)}`;
};
var kOfNText = (evidence) => `${evidence.k ?? 0} of ${evidence.n}`;
var rateLine = (sides, units, hit, noun, phrase2) => {
  const window = kOfN(units(sides.window), hit);
  const baseline = onBaseline(sides, (sessions) => kOfN(units(sessions), hit));
  const body = `${window.k ?? 0} of the last ${count(window.n, noun)} ${phrase2} (${before(sides, baseline, noun, kOfNText)})`;
  return { flag: comparison(rateFlag(window, baseline)), window, baseline, body };
};
var spreadSides = (sides, values) => {
  const windowValues = values(sides.window);
  const baselineValues = onBaseline(sides, values);
  const baseline = baselineValues === void 0 ? void 0 : medianOf(baselineValues);
  return { window: medianOf(windowValues), baseline, flag: comparison(spreadFlag(windowValues, baselineValues)) };
};
var rolesByRuns = (runs) => {
  const counts = /* @__PURE__ */ new Map();
  for (const run of runs) {
    const added = run.runs === void 0 ? 1 : run.runs ?? 0;
    counts.set(run.role, (counts.get(run.role) ?? 0) + added);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0])).map(([role]) => role);
};
var buildsOf = (sessions) => sessions.flatMap((session) => session.builds ?? []);
var budgetRuns = (sessions) => {
  const runs = [];
  for (const run of buildsOf(sessions)) {
    if (run.callsAtFirstStop !== null && run.callLimit !== null && run.callLimit > 0) {
      runs.push({ calls: run.callsAtFirstStop, limit: run.callLimit });
    }
  }
  return runs;
};
var atBudget = (run) => run.calls >= run.limit;
var budgetFirstStop = (sides) => {
  const builds = buildsOf(sides.window);
  const window = kOfN(budgetRuns(sides.window), atBudget);
  if (builds.length === 0) {
    return { lacks: NO_BUILDS };
  }
  if (window.n === 0) {
    const limited = builds.some((run) => run.callLimit !== null && run.callLimit > 0);
    return { lacks: limited ? NO_FIRST_STOP : NO_BUDGET };
  }
  const baseline = onBaseline(sides, (sessions) => kOfN(budgetRuns(sessions), atBudget));
  const k = window.k ?? 0;
  const ruled = window.n >= STANDING_RUNS;
  const standing = ruled && k * 100 >= STANDING_PERCENT * window.n;
  const flag = standing ? "standing" : comparison(rateFlag(window, baseline));
  const rule = ruled ? `; the rule flags ${STANDING_PERCENT} % or more` : "";
  const comparedTo = before(sides, baseline, IMPLEMENTER_RUN, kOfNText);
  const share = `${Math.floor(k * 100 / window.n)} %${rule}; ${comparedTo}`;
  const body = `${k} of the last ${count(window.n, IMPLEMENTER_RUN)} reached their tool-call budget by their first stop (${share})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var ownedRows = (sessions) => sessions.flatMap((session) => (session.rows ?? []).filter((row) => row.owned));
var streamRuns = (sessions) => ownedRows(sessions).flatMap((row) => row.streamRuns);
var ownerLacks = (sessions) => {
  const rows = sessions.flatMap((session) => session.rows ?? []);
  return rows.length > 0 && rows.every((row) => !row.ownerKnown);
};
var secondImplementer = (sides) => {
  if (streamRuns(sides.window).length === 0) {
    if (buildsOf(sides.window).length === 0) {
      return { lacks: NO_BUILDS };
    }
    return { lacks: ownerLacks(sides.window) ? NOT_STORED : NO_STREAM };
  }
  return { lines: [rateLine(sides, streamRuns, (runs) => runs >= 2, STREAM, "had a second implementer run")] };
};
var reviewsOf = (sessions) => sessions.flatMap((session) => session.reviews ?? []);
var blockRuns = (sessions) => reviewsOf(sessions).filter((run) => run.fixItems !== null);
var reviewRounds = (sessions) => ownedRows(sessions).map((row) => row.reviewRound).filter(isNumber);
var secondRound = (sides) => {
  if (reviewRounds(sides.window).length === 0) {
    if (reviewsOf(sides.window).length === 0) {
      return { lacks: NO_REVIEWS };
    }
    return { lacks: ownerLacks(sides.window) ? NOT_STORED : NO_ROUND };
  }
  return { lines: [rateLine(sides, reviewRounds, (round) => round >= 2, BRANCH, "ran a second review round")] };
};
var blockLacks = (sides) => {
  if (blockRuns(sides.window).length > 0) {
    return void 0;
  }
  return reviewsOf(sides.window).length === 0 ? NO_REVIEWS : NO_BLOCK;
};
var perRunText = (evidence) => `${(evidence.value ?? 0).toFixed(1)} over ${evidence.n}`;
var fixFollowups = (sides) => {
  const lacks = blockLacks(sides);
  if (lacks !== void 0) {
    return { lacks };
  }
  const lines = rolesByRuns(blockRuns(sides.window)).map((role) => {
    const of = (sessions) => {
      const runs = blockRuns(sessions).filter((run) => run.role === role);
      return valueOver(runs.length, runs.length === 0 ? void 0 : sum(runs.map((run) => run.fixItems ?? 0)) / runs.length);
    };
    const window = of(sides.window);
    const baseline = onBaseline(sides, of);
    const comparedTo = before(sides, baseline, RUN, perRunText);
    const body = `${role} reported ${(window.value ?? 0).toFixed(1)} fix follow-ups per run over ${count(window.n, RUN)} (${comparedTo})`;
    return { role, window, baseline, body };
  });
  return { lines };
};
var newestRuns = (sessions) => reviewsOf(sessions).sort((a, b) => b.start - a.start || b.index - a.index);
var quietReviewer = (sides) => {
  const lacks = blockLacks(sides);
  if (lacks !== void 0) {
    return { lacks };
  }
  const newest = newestRuns([...sides.window, ...sides.baseline]);
  const lines = [];
  for (const role of rolesByRuns(reviewsOf(sides.window))) {
    const last = newest.filter((run) => run.role === role && run.fixItems !== null).slice(0, QUIET_RUNS);
    const k = last.filter((run) => (run.fixItems ?? 0) >= 1).length;
    if (last.length === QUIET_RUNS && k <= QUIET_FIXES) {
      const usd = sum(last.map((run) => run.usd ?? 0));
      const body = `${role} had a fix follow-up in ${k} of its last ${QUIET_RUNS} runs, which cost ${cost(usd)}`;
      lines.push({ role, flag: "standing", window: { n: last.length, k, value: usd }, body });
    }
  }
  return { lines };
};
var commandCounts = (sessions) => buildsOf(sessions).map((run) => run.commands).filter(isNumber);
var verifiedRuns = (sessions) => buildsOf(sessions).filter((run) => run.commands !== null && run.commands > 0);
var commandLacks = (sides) => {
  if (verifiedRuns(sides.window).length > 0) {
    return void 0;
  }
  return buildsOf(sides.window).length === 0 ? NO_BUILDS : NO_COMMAND;
};
var verifyCommands = (sides) => {
  const lacks = commandLacks(sides);
  if (lacks !== void 0) {
    return { lacks };
  }
  const window = medianOf(commandCounts(sides.window));
  const baseline = onBaseline(sides, (sessions) => medianOf(commandCounts(sessions)));
  const commands = count(window.value ?? 0, ["verification command", "verification commands"]);
  const comparedTo = before(sides, baseline, IMPLEMENTER_RUN, (evidence) => String(evidence.value ?? 0));
  const body = `implementer runs ran a median of ${commands} over ${count(window.n, RUN)} (${comparedTo})`;
  return { lines: [{ window, baseline, body }] };
};
var failedUnits = (sessions) => verifiedRuns(sessions).filter((run) => run.failed !== null);
var failedRuns = (sides) => {
  const lacks = commandLacks(sides);
  if (lacks !== void 0) {
    return { lacks };
  }
  if (failedUnits(sides.window).length === 0) {
    return { lacks: NOT_STORED };
  }
  return { lines: [rateLine(sides, failedUnits, (run) => (run.failed ?? 0) >= 1, IMPLEMENTER_RUN, "had a failed full-package command")] };
};
var outputRoles = (sessions, role) => {
  const entries = sessions.flatMap((session) => session.roles ?? []);
  return entries.filter((entry) => entry.output !== null && entry.output > 0 && (role === void 0 || entry.role === role));
};
var cacheEntries = (sessions, role) => {
  const entries = [];
  for (const entry of outputRoles(sessions, role)) {
    if (entry.cacheRead !== null && entry.output !== null) {
      entries.push({ role: entry.role, runs: entry.runs, cacheRead: entry.cacheRead, output: entry.output });
    }
  }
  return entries;
};
var cachePerOutput = (sides) => {
  const entries = cacheEntries(sides.window);
  if (entries.length === 0) {
    return { lacks: outputRoles(sides.window).length === 0 ? NO_REQUESTS : NOT_STORED };
  }
  const ranked = rolesByRuns(entries);
  const roles = [...ranked.filter((role) => role === MAIN_ROLE), ...ranked.filter((role) => role !== MAIN_ROLE)];
  const lines = roles.map((role) => {
    const of = (sessions) => {
      const found = cacheEntries(sessions, role);
      return valueOver(found.length, found.length === 0 ? void 0 : sum(found.map((entry) => entry.cacheRead)) / sum(found.map((entry) => entry.output)));
    };
    const window = of(sides.window);
    const baseline = onBaseline(sides, of);
    const cached = count(Math.round(window.value ?? 0), ["cached token", "cached tokens"]);
    const comparedTo = before(sides, baseline, SESSION, (evidence) => String(Math.round(evidence.value ?? 0)));
    const body = `${role} read ${cached} per output token (${comparedTo})`;
    return { role, flag: comparison(factorFlag(window, baseline)), window, baseline, body };
  });
  return { lines };
};
var mainPeaks = (sessions) => {
  const peaks = [];
  for (const session of sessions) {
    const peak = session.roles?.find((entry) => entry.role === MAIN_ROLE)?.peakContext ?? null;
    if (peak !== null && session.contextLimit !== null && session.contextLimit > 0) {
      peaks.push({ peak, limit: session.contextLimit });
    }
  }
  return peaks;
};
var overHalf = (peaks) => peaks.filter((entry) => entry.peak > entry.limit / 2).length;
var mainPeakContext = (sides) => {
  const peaks = mainPeaks(sides.window);
  if (peaks.length === 0) {
    return { lacks: outputRoles(sides.window, MAIN_ROLE).length === 0 ? NO_REQUESTS : NO_LIMIT };
  }
  const spread = spreadSides(sides, (sessions) => mainPeaks(sessions).map((entry) => entry.peak));
  const window = { ...spread.window, k: overHalf(peaks) };
  const baseline = spread.baseline === void 0 ? void 0 : { ...spread.baseline, k: overHalf(mainPeaks(sides.baseline)) };
  const over = `${window.k} of ${count(window.n, SESSION)} over half the model's context limit`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => tokens(evidence.value ?? 0));
  const body = `the main thread's peak context had a median of ${tokens(window.value ?? 0)} per session, ${over} (${comparedTo})`;
  return { lines: [{ flag: spread.flag, window, baseline, body }] };
};
var mainShares = (sessions) => {
  const shares = [];
  for (const session of sessions) {
    const usd = session.roles?.find((entry) => entry.role === MAIN_ROLE)?.usd ?? null;
    if (usd !== null && session.totalUsd !== null && session.totalUsd > 0) {
      shares.push(usd / session.totalUsd);
    }
  }
  return shares;
};
var mainCostShare = (sides) => {
  if (mainShares(sides.window).length === 0) {
    return { lacks: NO_REQUESTS };
  }
  const { window, baseline, flag } = spreadSides(sides, mainShares);
  const comparedTo = before(sides, baseline, SESSION, (evidence) => `${percent(evidence.value ?? 0)} %`);
  const body = `the main thread took a median of ${percent(window.value ?? 0)} % of a session's cost (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var overheadShares = (sessions) => {
  const shares = [];
  for (const session of sessions) {
    if (session.overheadUsd !== null && session.totalUsd !== null && session.totalUsd > 0) {
      shares.push(session.overheadUsd / session.totalUsd);
    }
  }
  return shares;
};
var meanOf = (values) => valueOver(values.length, values.length === 0 ? void 0 : sum(values) / values.length);
var overheadShare = (sides) => {
  const shares = overheadShares(sides.window);
  if (shares.length === 0) {
    return { lacks: NO_OVERHEAD };
  }
  const window = meanOf(shares);
  const baseline = onBaseline(sides, (sessions) => meanOf(overheadShares(sessions)));
  const flag = (window.value ?? 0) > OVERHEAD_STANDING ? "standing" : void 0;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => `${percentTenths(evidence.value ?? 0)} %`);
  const took = `took a mean of ${percentTenths(window.value ?? 0)} % of a session's cost, at most ${percentTenths(Math.max(...shares))} %`;
  return { lines: [{ flag, window, baseline, body: `the Nurselog overhead ${took} (${comparedTo})` }] };
};
var largeOutputs = (sessions) => sessions.map((session) => session.largeOutputs).filter(isNumber);
var mainLargeOutputs = (sides) => {
  const counts = largeOutputs(sides.window);
  if (counts.length === 0) {
    return { lacks: NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, largeOutputs);
  const read = `read ${count(sum(counts), ["response", "responses"])} over 20,000 characters in the last ${count(window.n, SESSION)}`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => String(evidence.value ?? 0));
  const body = `the main thread ${read}, a median of ${window.value ?? 0} per session (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var listed = (sessions) => sessions.flatMap((session) => session.questions === void 0 ? [] : [session.questions]);
var openTimes = (sessions) => listed(sessions).flatMap((questions) => questions.filter(isNumber));
var questionOpenTime = (sides) => {
  const lists = listed(sides.window);
  if (lists.length === 0) {
    return { lacks: NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, openTimes);
  const comparedTo = before(sides, baseline, ANSWERED, (evidence) => duration(evidence.value ?? 0));
  if (window.n === 0) {
    return { lines: [{ window, baseline, body: `no question of the developer was answered in the last ${count(lists.length, SESSION)} (${comparedTo})` }] };
  }
  const body = `the developer's questions were open a median of ${duration(window.value ?? 0)} over ${count(window.n, ANSWERED)} (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var questionCounts = (sessions) => listed(sessions).map((questions) => questions.length);
var questionsPerSession = (sides) => {
  if (listed(sides.window).length === 0) {
    return { lacks: NOT_STORED };
  }
  const window = medianOf(questionCounts(sides.window));
  const baseline = onBaseline(sides, (sessions) => medianOf(questionCounts(sessions)));
  const comparedTo = before(sides, baseline, SESSION, (evidence) => String(evidence.value ?? 0));
  const body = `a median of ${count(window.value ?? 0, ["question", "questions"])} per session (${comparedTo})`;
  return { lines: [{ window, baseline, body }] };
};
var waits = (sessions) => sessions.map((session) => session.waitMs).filter(isNumber);
var developerWait = (sides) => {
  const totals = waits(sides.window);
  if (totals.length === 0) {
    return { lacks: NOT_STORED };
  }
  const { window, baseline, flag } = spreadSides(sides, waits);
  const waited = `waited ${duration(sum(totals))} in the last ${count(window.n, SESSION)}`;
  const comparedTo = before(sides, baseline, SESSION, (evidence) => duration(evidence.value ?? 0));
  const body = `the developer ${waited}, a median of ${duration(window.value ?? 0)} per session (${comparedTo})`;
  return { lines: [{ flag, window, baseline, body }] };
};
var SIGNALS = [
  { id: "budget-first-stop", area: "implementers", of: budgetFirstStop },
  { id: "second-implementer", area: "implementers", of: secondImplementer },
  { id: "second-round", area: "review", of: secondRound },
  { id: "fix-followups", area: "review", of: fixFollowups },
  { id: "quiet-reviewer", area: "review", of: quietReviewer },
  { id: "verify-commands", area: "verification", of: verifyCommands },
  { id: "failed-runs", area: "verification", of: failedRuns },
  { id: "cache-per-output", area: "tokens", of: cachePerOutput },
  { id: "main-peak-context", area: "tokens", of: mainPeakContext },
  { id: "main-cost-share", area: "tokens", of: mainCostShare },
  { id: "overhead-share", area: "tokens", of: overheadShare },
  { id: "main-large-outputs", area: "tokens", of: mainLargeOutputs },
  { id: "question-open-time", area: "questions", of: questionOpenTime },
  { id: "questions-per-session", area: "questions", of: questionsPerSession },
  { id: "developer-wait", area: "questions", of: developerWait }
];
var signalLine = (area, signal, line) => ({
  area,
  signal,
  ...line.role === void 0 ? {} : { role: line.role },
  ...line.flag === void 0 ? {} : { flag: line.flag },
  ...line.window === void 0 ? {} : { window: line.window },
  ...line.baseline === void 0 ? {} : { baseline: line.baseline },
  text: `${AREA_NAMES[area]}: ${line.body}.`
});
var notMeasuredOf = (area, lacks, every, sessions) => {
  const signals = lacks.map((lack) => lack.signal);
  const reasons = [...new Set(lacks.map((lack) => lack.reason))];
  const span = `in the last ${count(sessions, WORK_SESSION)}`;
  let text = `${AREA_NAMES[area]}: not measured: ${reasons[0]} ${span}.`;
  if (!every || reasons.length > 1) {
    const parts = reasons.map((reason) => {
      const names = lacks.filter((lack) => lack.reason === reason).map((lack) => SIGNAL_NAMES[lack.signal]);
      return `${listText(names)} not measured: ${reason}`;
    });
    text = `${AREA_NAMES[area]}: ${parts.join("; ")} ${span}.`;
  }
  return { area, signal: signals[0], notMeasured: { signals, reason: reasons.join("; ") }, text };
};
var reportLines = (sides) => {
  const flagged = [];
  const others = [];
  for (const area of AREAS) {
    const signals = SIGNALS.filter((signal) => signal.area === area);
    const lacks = [];
    for (const signal of signals) {
      const outcome = signal.of(sides);
      if ("lacks" in outcome) {
        lacks.push({ signal: signal.id, reason: outcome.lacks });
        continue;
      }
      for (const line of outcome.lines) {
        const insight = signalLine(area, signal.id, line);
        (insight.flag === void 0 ? others : flagged).push(insight);
      }
    }
    if (lacks.length > 0) {
      others.push(notMeasuredOf(area, lacks, lacks.length === signals.length, sides.window.length));
    }
  }
  return [...flagged, ...others];
};
var selectSessions = (aggregates2, options, now) => {
  const at = time(now);
  const today = new Date(at);
  const oldest = localDay2(new Date(today.getFullYear(), today.getMonth(), today.getDate() - options.keepDays));
  const kept = (finished) => Number.isFinite(finished) && finished <= at && localDay2(new Date(finished)) >= oldest;
  const selected = aggregates2.filter((aggregate) => aggregate.work === true).map((aggregate) => ({ aggregate, finished: timeOf(aggregate.finishedAt) })).filter((entry) => kept(entry.finished)).sort((a, b) => b.finished - a.finished || compareText(a.aggregate.id, b.aggregate.id));
  return selected.slice(0, options.window + options.baseline).map((entry) => readSession(entry.aggregate, entry.finished));
};
var insightsOf = (aggregates2, options, now) => {
  const sessions = selectSessions(aggregates2, options, now);
  const window = sessions.slice(0, options.window);
  const baseline = sessions.slice(options.window, options.window + options.baseline);
  const minimum = Math.min(options.minBaseline, options.baseline);
  const sides = { window, baseline, comparable: baseline.length >= minimum, minimum };
  const read = [...window, ...baseline];
  const basis = { window: window.length, baseline: baseline.length };
  let closing = `Based on ${count(0, WORK_SESSION)}.`;
  if (read.length > 0) {
    basis.from = localDay2(new Date(read[read.length - 1].finished));
    basis.to = localDay2(new Date(read[0].finished));
    closing = `Based on ${count(read.length, WORK_SESSION)} from ${basis.from} to ${basis.to}.`;
  }
  const settings = { window: options.window, baseline: options.baseline, minBaseline: options.minBaseline, keepDays: options.keepDays };
  return { generatedAt: now, options: settings, basis, insights: window.length === 0 ? [] : reportLines(sides), closing };
};

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
import { homedir } from "os";
import { basename as basename2, delimiter, dirname as dirname2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from "path";
import { parseArgs as parseArgs4 } from "util";
var OWNER_LINE = "# Written by nurselog install-cli; remove it with: nurselog install-cli --remove";
var PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';
var CACHE_PARENT = "/plugins/cache/nurselog/nurselog";
var VERSION_DIR = /^\d+\.\d+\.\d+$/;
var HEAD_BYTES = 4096;
var terminalCommandPath = () => join2(homedir(), ".local", "bin", "nurselog");
var cacheDirOf = (root) => {
  const parent = dirname2(root);
  return VERSION_DIR.test(basename2(root)) && parent.endsWith(CACHE_PARENT) ? parent : void 0;
};
var singleQuoted = (text) => `'${text.replaceAll("'", "'\\''")}'`;
var terminalCommandScript = (root) => {
  const cache = cacheDirOf(root);
  const lines = ["#!/bin/sh", OWNER_LINE];
  if (cache === void 0) {
    lines.push(`exec node ${singleQuoted(join2(root, "bin", "nurselog"))} "$@"`);
  } else {
    lines.push(
      "# Runs bin/nurselog of the newest plugin copy in this directory that no update or uninstall has orphaned.",
      `cache=${singleQuoted(cache)}`,
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
  const shown = stripControl(tildeHome(target));
  const stat = lstatOf(target);
  const reason = stat === void 0 ? void 0 : foreignReason(target, stat);
  if (reason !== void 0) {
    const action = values.remove ? "not removed" : "not replaced; move it away first to let Nurselog write that path";
    io.err(`nurselog install-cli: ${shown} ${reason}; ${action}`);
    return 1;
  }
  if (values.remove) {
    if (stat === void 0) {
      io.out(`Nothing to remove: ${shown} does not exist`);
      return 0;
    }
    unlinkSync(target);
    io.out(`Removed ${shown}`);
    return 0;
  }
  const root = deps.packageRoot ?? PACKAGE_ROOT;
  const cache = cacheDirOf(root);
  mkdirSync(dirname2(target), { recursive: true, mode: 493 });
  replaceFile(target, terminalCommandScript(root));
  const cloneBin = stripControl(tildeHome(join2(root, "bin", "nurselog")));
  const newestCopy = `the newest installed plugin copy in ${stripControl(tildeHome(cache ?? root))}`;
  const runs = cache === void 0 ? cloneBin : newestCopy;
  const verb = stat === void 0 ? "Installed" : "Updated";
  io.out(`${verb} ${shown}: it runs ${runs}`);
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
var DEFAULT_DEPS = {
  platform: process.platform,
  launch,
  resolve: (command) => resolveCommand(command),
  exists: (path) => existsSync2(path),
  startBoard: () => startBoardDetached(),
  waitForBoard: (timeoutMs, exited) => waitForBoard(timeoutMs, { exited }),
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
var openDefaultBrowser = async (url, deps) => {
  if (deps.platform === "darwin") {
    return deps.launch(MAC_OPEN, [url], UNTIL_EXIT);
  }
  const xdgOpen = deps.resolve("xdg-open");
  return xdgOpen !== void 0 && await deps.launch(xdgOpen, [url], XDG_OPEN_GRACE_MS);
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
    const browser = await openAppWindow(signIn, deps);
    if (browser !== void 0) {
      io.out(`Opened ${url} in an app window of ${browser}`);
      return 0;
    }
    const tried = deps.platform === "darwin" ? MAC_APP_BROWSERS : LINUX_APP_BROWSERS;
    io.err(`No Chromium browser for an app window (tried ${tried.join(", ")}); opening the default browser.`);
  }
  if (await openDefaultBrowser(signIn, deps)) {
    io.out(`Opened ${url} in the default browser`);
    return 0;
  }
  io.out(`Open the board at ${signIn}`);
  return 0;
};

// src/cli/purge.ts
import { basename as basename3, dirname as dirname3 } from "path";
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
var dayFiles = (count2) => count2 === 1 ? "1 day file" : `${count2} day files`;
var markers = (count2) => count2 === 1 ? "1 notified marker" : `${count2} notified markers`;
var aggregates = (count2) => count2 === 1 ? "1 session aggregate" : `${count2} session aggregates`;
var unreadableFiles = (count2) => count2 === 1 ? "1 unreadable aggregates file" : `${count2} unreadable aggregates files`;
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
  const listed2 = listRepositories().find((repository) => repository.hash === hash);
  return [{ name: listed2?.name ?? basename3(root), root }];
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
  const before2 = values.before;
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
      const files = purgeableDayFiles(dir, before2);
      let stored = "failed";
      try {
        stored = purgeableAggregates(dir, before2) ?? "unreadable";
      } catch (error) {
        io.err(`nurselog purge: ${name}: its session aggregates are left alone: ${stripControl(error.message)}`);
        failed = true;
      }
      const shown = stripControl(tildeHome(dir));
      const none = before2 === void 0 ? "no day files" : `no day files before ${before2}`;
      const days = files.length === 0 ? none : `${dayFiles(files.length)}, ${daySpan(files)},`;
      let listing = days;
      if (stored === "unreadable") {
        listing = `${days} and ${unreadableFiles(1)}`;
      } else if (countOf(stored) > 0) {
        listing = `${days} and ${aggregates(countOf(stored))}`;
      }
      io.out(`${name}: ${listing} in ${shown}`);
      found.push({ name, dir, files, aggregates: stored });
    } catch (error) {
      io.err(`nurselog purge: ${name}: ${stripControl(error.message)}`);
      failed = true;
    }
  }
  const totalFiles = found.reduce((sum2, target) => sum2 + target.files.length, 0);
  const totalAggregates = found.reduce((sum2, target) => sum2 + countOf(target.aggregates), 0);
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
      const deleted = purgeSpool(target.dir, before2, onFailure);
      const files = deleted.filter((path) => dirname3(path) === target.dir).length;
      deletedFiles += files;
      deletedMarkers += deleted.length - files;
      const taken = target.aggregates === "failed" ? 0 : purgeAggregates(target.dir, before2);
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

// src/cli.ts
var defaultIo = () => ({
  cwd: process.cwd(),
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  tty: process.stdout.isTTY === true
});
var fixturePath = (name) => {
  const candidates = [resolve3(name), join3(PACKAGE_ROOT, "fixtures", name), join3(PACKAGE_ROOT, "fixtures", `${name}.ndjson`)];
  return candidates.find((path) => existsSync3(path)) ?? resolve3(name);
};
var fixturePaths = (list) => list.split(",").map((name) => name.trim()).filter(Boolean).map(fixturePath);
var replayConfig = (replay, root) => {
  const beside = join3(dirname4(replay), "nurselog.config.json");
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
  const { values } = parseArgs7({ args, options });
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
    const root = repository ?? resolve3(cwd);
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
