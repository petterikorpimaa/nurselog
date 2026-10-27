import {
  DEFAULT_CONFIG,
  FIELD_NAMES,
  HOOK_DEFAULTS,
  MAIN_AGENT,
  MAX_CONFIG_BYTES,
  MAX_POLL_SECONDS,
  MAX_READ_DAYS,
  MIN_POLL_SECONDS,
  NONCE,
  PACKAGE_ROOT,
  RUNNING_CHECK_MS,
  STREAM_ID,
  TOKEN_CHANGED,
  VERIFY_KINDS,
  appendPrivate,
  appendSpoolLine,
  blockingForYou,
  boardProof,
  boardUrl,
  byStart,
  cdTarget,
  checkBoard,
  compareText,
  configKeepDays,
  createHistoryHandler,
  createLineHandler,
  createSpoolReader,
  createStore,
  defaultRoot,
  displayState,
  ensureBoardToken,
  ensurePrivateDir,
  expandHome,
  findConfig,
  gitCommonDir,
  githubRepoOfRemote,
  isBranchName,
  linearRegExp,
  listSpoolFiles,
  literalWord,
  loadConfig,
  localDay,
  loopbackJson,
  newLineId,
  notSetUpMessage,
  openNoFollow,
  ownEntry,
  ownValue,
  patternInput,
  processedTokens,
  pruneSpool,
  purgeableDayFiles,
  readHookConfig,
  readRepositoryRecord,
  readServerState,
  readSmallFile,
  readWindowStart,
  recordedRootValid,
  redactValue,
  repoHash,
  reportLine,
  repositoryRoot,
  sameText,
  serverStatePath,
  sessionMetrics,
  shellCode,
  spoolDirExists,
  spoolDirFor,
  startCommand,
  stripControl,
  stripControlLines,
  tildeHome,
  time,
  tokenHmac,
  uiConfig,
  userConfigPath,
  validateMarkerInput,
  worktreeAddOfCommand,
  writePrivate
} from "./chunk-WVTBF6C4.js";

// src/spool/writer.ts
var createLine = (src, event, data, envelope = {}) => {
  const line = { v: 1, id: newLineId(), at: (/* @__PURE__ */ new Date()).toISOString(), src, event, sessionId: envelope.sessionId ?? "", cwd: envelope.cwd ?? "" };
  if (envelope.agentId) {
    line.agentId = envelope.agentId;
  }
  line.data = data;
  return line;
};
var appendEvent = (dir, event, maxLineBytes) => appendSpoolLine(dir, event, "data", maxLineBytes);

// src/facts/shared.ts
import { execFile } from "child_process";
var runCommand = (command, args, cwd, env) => new Promise((resolve7, reject) => {
  const childEnv = env ? { ...process.env, ...env } : void 0;
  execFile(command, args, { cwd, env: childEnv, timeout: 15e3, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
    if (error) {
      reject(error);
    } else {
      resolve7(stdout.trim());
    }
  });
});
var stderrLine = (error) => {
  const lines = error.message.split("\n");
  const stderr = lines[0].startsWith("Command failed") ? lines.slice(1) : lines;
  return stderr.find((line) => line.trim() !== "")?.trim() ?? "";
};
var createBashTracker = () => {
  const open = /* @__PURE__ */ new Map();
  return (event) => {
    if (event.event === "tool.pre" && event.data.tool === "Bash" && event.data.input.command) {
      open.set(event.data.toolUseId, { command: event.data.input.command, cwd: event.cwd });
      return void 0;
    }
    if (event.event === "tool.post" || event.event === "tool.fail") {
      const finished = open.get(event.data.toolUseId);
      open.delete(event.data.toolUseId);
      return event.event === "tool.post" && finished ? { ...finished, interrupted: event.data.interrupted, exitCode: event.data.exitCode } : void 0;
    }
    return void 0;
  };
};

// src/facts/git.ts
import { existsSync, readFileSync, realpathSync } from "fs";
import { stat } from "fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "path";
var REMOVAL_SWEEP_MS = 5 * 60 * 1e3;
var CD = /(?:^|&&|;|\|\||\n)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g;
var GIT_C = /\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)/;
var WORD = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;
var WORKTREE_ADD = new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?worktree\s+add\s+([^;&|\n)]+)`);
var CHECKOUT = new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?(?:checkout|switch)\b`);
var COMMIT = new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?commit\b`);
var REMOVES = [
  new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?worktree\s+(?:remove|prune)\b`),
  new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?branch\b[^;&|\n]*\s(?:-[a-zA-Z]*[dD]|--delete)\b`),
  /\brm\b[^;&|\n]*\s(?:-[a-zA-Z]*[rR]|--recursive)/
];
var VALUE_OPTIONS = /* @__PURE__ */ new Set(["-b", "-B", "--orphan", "--reason"]);
var SAFE_GIT = ["-c", "log.showSignature=false", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
var END_OF_OPTIONS = "--end-of-options";
var NOT_A_REPO = 128;
var HEADS = "refs/heads/";
var lastGroup = (command, match) => {
  const group = match?.[match.length - 1];
  const end = match && match.index !== void 0 ? match.index + match[0].length : 0;
  return group === void 0 ? void 0 : command.slice(end - group.length, end);
};
var worktreeAddPath = (command) => {
  const args = lastGroup(command, WORKTREE_ADD.exec(shellCode(command)))?.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  for (let index = 0; index < args.length; index += 1) {
    if (VALUE_OPTIONS.has(args[index])) {
      index += 1;
    } else if (!args[index].startsWith("-")) {
      return literalWord(args[index]);
    }
  }
  return void 0;
};
var realPath = (path) => {
  const full = resolve(expandHome(path));
  const rest = [];
  let existing = full;
  for (; ; ) {
    try {
      return join(realpathSync(existing), ...rest);
    } catch {
      const parent = dirname(existing);
      if (parent === existing) {
        return full;
      }
      rest.unshift(basename(existing));
      existing = parent;
    }
  }
};
var canonical = (path) => tildeHome(realPath(path));
var resolveIn = (base, word) => {
  if (word === void 0) {
    return void 0;
  }
  const path = expandHome(word);
  if (isAbsolute(path)) {
    return resolve(path);
  }
  return base === void 0 ? void 0 : resolve(base, path);
};
var createGitFacts = (options) => {
  const { config, write } = options;
  const run = options.run ?? runCommand;
  const trunk = config.branches.trunk;
  const quietBranches = /* @__PURE__ */ new Set([trunk, ...config.branches.promote]);
  const branches = /* @__PURE__ */ new Map();
  const forks = /* @__PURE__ */ new Set();
  const subjects = /* @__PURE__ */ new Set();
  const resolved = /* @__PURE__ */ new Set();
  const candidates = /* @__PURE__ */ new Set();
  const eventDirs = /* @__PURE__ */ new Set();
  const finishedBash = createBashTracker();
  const common = options.repoCommonDir;
  const mainCheckout = common && basename(common) === ".git" ? dirname(common) : void 0;
  let live = false;
  let stopped = false;
  let queue = Promise.resolve();
  let sweep;
  let checkWaiting = false;
  let refsWarning = "";
  const statWarnings = /* @__PURE__ */ new Set();
  const pendingAdds = /* @__PURE__ */ new Map();
  const emit = (data, worktree) => write(createLine("server", "git.fact", data, { cwd: worktree }));
  const git = (args) => run("git", [...SAFE_GIT, ...args]);
  const quiet = (what) => (error) => {
    if (error.code !== NOT_A_REPO) {
      options.log?.("warning", `${what} failed: ${error.message.split("\n")[0]}`);
    }
    return "";
  };
  const mergeBase = async (top, branch) => {
    try {
      return await git(["-C", top, "merge-base", END_OF_OPTIONS, trunk, branch]);
    } catch {
      return git(["-C", top, "merge-base", END_OF_OPTIONS, `origin/${trunk}`, branch]);
    }
  };
  const repoOf = async (path) => {
    if (!options.repoCommonDir) {
      return "this";
    }
    const common2 = await git(["-C", path, "rev-parse", "--path-format=absolute", "--git-common-dir"]).catch(quiet(`git rev-parse in ${path}`));
    if (common2 === "" || !existsSync(common2)) {
      return "unknown";
    }
    return realpathSync(common2) === options.repoCommonDir ? "this" : "other";
  };
  const inThisRepo = async (path) => await repoOf(path) === "this";
  const branchDetails = async (top, worktree, branch) => {
    if (quietBranches.has(branch)) {
      return;
    }
    if (!forks.has(branch)) {
      const sha = await mergeBase(top, branch).catch(quiet(`git merge-base for ${branch}`));
      if (sha) {
        forks.add(branch);
        emit({ kind: "fork", branch, base: trunk, sha }, worktree);
      }
    }
    if (!subjects.has(branch)) {
      const logArgs = ["-C", top, "log", "--no-show-signature", "--reverse", "--format=%s", END_OF_OPTIONS, `${trunk}..${branch}`];
      const log = await git(logArgs).catch(quiet(`git log of ${branch}`));
      const subject = log.split("\n")[0]?.trim();
      if (subject) {
        subjects.add(branch);
        emit({ kind: "subject", branch, subject }, worktree);
      }
    }
  };
  const lookUp = async (dir, force) => {
    const path = expandHome(dir);
    if (!force && resolved.has(path) || !existsSync(path)) {
      return;
    }
    resolved.add(path);
    if (!await inThisRepo(path)) {
      return;
    }
    const top = await git(["-C", path, "rev-parse", "--show-toplevel"]).catch(quiet(`git rev-parse in ${path}`));
    const branch = top ? await git(["-C", top, "branch", "--show-current"]).catch(quiet(`git branch in ${top}`)) : "";
    if (!branch) {
      return;
    }
    if (!isBranchName(branch)) {
      options.log?.("warning", `ignored the branch name ${JSON.stringify(branch.slice(0, 80))} in ${top}`);
      return;
    }
    const worktree = tildeHome(top);
    resolved.add(top);
    if (branches.get(worktree) !== branch) {
      branches.set(worktree, branch);
      emit({ kind: "worktree", worktree, branch }, worktree);
    }
    await branchDetails(top, worktree, branch);
  };
  const localBranches = async (commonDir) => {
    let output;
    try {
      output = await git(["-C", commonDir, "for-each-ref", "--format=%(refname)", END_OF_OPTIONS, "refs/heads"]);
    } catch (error) {
      const failure = error;
      const reason = `exit ${String(failure.code)}: ${stderrLine(failure)}`;
      const warning = `git for-each-ref of the branches failed (${reason}); no worktree counts as removed until it works`;
      if (warning !== refsWarning) {
        refsWarning = warning;
        options.log?.("warning", warning);
      }
      return void 0;
    }
    refsWarning = "";
    const refs = output.split("\n").filter((ref) => ref.startsWith(HEADS));
    return new Set(refs.map((ref) => ref.slice(HEADS.length)));
  };
  const warnOnce = (warning) => {
    if (!statWarnings.has(warning)) {
      statWarnings.add(warning);
      options.log?.("warning", warning);
    }
  };
  const statEntry = async (path, entry = ".git") => {
    try {
      await stat(join(path, entry));
      return "present";
    } catch (error) {
      const failure = error;
      if (failure.code === "ENOENT") {
        return "gone";
      }
      warnOnce(`could not check whether the worktree ${path} was removed: ${failure.message}`);
      return "failed";
    }
  };
  const isGone = async (path) => await statEntry(path) === "gone";
  const forget = (worktree, branch) => {
    const path = expandHome(worktree);
    branches.delete(worktree);
    if (pendingAdds.size > 0) {
      pendingAdds.delete(canonical(worktree));
    }
    forks.delete(branch);
    subjects.delete(branch);
    for (const dir of [...resolved, ...eventDirs]) {
      const full = expandHome(dir);
      if (full === path || full.startsWith(`${path}/`)) {
        resolved.delete(dir);
        eventDirs.delete(dir);
      }
    }
  };
  const checkRemoved = async () => {
    if (!common) {
      return;
    }
    const gone = [];
    for (const [worktree, branch] of [...branches]) {
      const path = expandHome(worktree);
      if (path !== mainCheckout && await isGone(path)) {
        gone.push([worktree, branch]);
      }
      if (stopped) {
        return;
      }
    }
    const heads = gone.length > 0 ? await localBranches(common) : void 0;
    if (!heads) {
      return;
    }
    for (const [worktree, branch] of gone) {
      if (stopped) {
        return;
      }
      if (heads.has(branch) || branches.get(worktree) !== branch) {
        continue;
      }
      try {
        emit({ kind: "worktree-removed", worktree, branch }, worktree);
        forget(worktree, branch);
      } catch (error) {
        const reason = error.message;
        options.log?.("warning", `writing the worktree-removed fact of ${worktree} failed, checked again next time: ${reason}`);
      }
    }
  };
  const gitdirOf = (path) => {
    try {
      const named = /^gitdir:\s*(.+)$/m.exec(readFileSync(join(path, ".git"), "utf8"))?.[1];
      return named === void 0 ? void 0 : realPath(resolve(path, named.trim()));
    } catch {
      return void 0;
    }
  };
  const namesOtherGitdir = (path) => {
    const gitdir = gitdirOf(path);
    return gitdir !== void 0 && common !== void 0 && gitdir !== common && !gitdir.startsWith(`${common}/`);
  };
  const namesPrunedGitdir = (path) => {
    const gitdir = gitdirOf(path);
    return gitdir !== void 0 && common !== void 0 && gitdir.startsWith(`${common}/`) && !existsSync(gitdir);
  };
  const checkAdd = async (path) => {
    const found = await statEntry(path, "");
    if (found !== "present") {
      return found === "gone" ? "unconfirmed" : "undecided";
    }
    const repo = await repoOf(path);
    if (repo !== "unknown") {
      return repo === "this" ? "confirmed" : "unconfirmed";
    }
    if (await statEntry(path, "") === "gone" || namesOtherGitdir(path) || namesPrunedGitdir(path)) {
      return "unconfirmed";
    }
    warnOnce(`could not tell which repository the worktree ${path} belongs to; checked again by the next sweep`);
    return "undecided";
  };
  const confirmAdds = async (retryParked) => {
    const known = pendingAdds.size > 0 ? new Set([...branches.keys()].map(canonical)) : /* @__PURE__ */ new Set();
    for (const [key, add] of [...pendingAdds]) {
      if (stopped) {
        return;
      }
      if (add.parked && !retryParked) {
        continue;
      }
      let verdict;
      try {
        verdict = known.has(key) ? "confirmed" : await checkAdd(expandHome(add.path));
      } catch (error) {
        warnOnce(`could not check the worktree add of ${add.path}: ${error.message}`);
        continue;
      }
      if (pendingAdds.get(key) !== add) {
        continue;
      }
      if (verdict === "undecided") {
        add.parked = true;
      } else if (verdict === "confirmed") {
        pendingAdds.delete(key);
      } else {
        try {
          emit({ kind: "worktree-removed", worktree: add.path, branch: add.branch }, add.path);
          pendingAdds.delete(key);
        } catch (error) {
          const reason = error.message;
          options.log?.("warning", `writing the worktree-removed fact of ${add.path} failed, checked again next time: ${reason}`);
        }
      }
    }
  };
  const enqueueConfirm = (retryParked = false) => {
    const waiting = [...pendingAdds.values()].some((add) => retryParked || !add.parked);
    if (stopped || !common || !waiting) {
      return;
    }
    queue = queue.then(() => confirmAdds(retryParked)).catch((error) => options.log?.("warning", `worktree add check failed: ${error.message}`));
  };
  const enqueueCheck = () => {
    if (stopped || checkWaiting) {
      return;
    }
    checkWaiting = true;
    const check = () => {
      checkWaiting = false;
      return checkRemoved();
    };
    queue = queue.then(check).catch((error) => options.log?.("warning", `worktree removal check failed: ${error.message}`));
  };
  const enqueue = (dir, force = false) => {
    if (!live) {
      candidates.add(dir);
      return;
    }
    queue = queue.then(() => lookUp(dir, force)).catch((error) => options.log?.("warning", `git lookup in ${dir} failed: ${error.message}`));
  };
  const enqueueOnce = (dir) => {
    if (!eventDirs.has(dir)) {
      eventDirs.add(dir);
      enqueue(dir);
    }
  };
  const noteAdd = ({ command, cwd, interrupted, exitCode }) => {
    const succeeded = !interrupted && (exitCode === void 0 || exitCode === 0);
    if (!command.includes("worktree") || !succeeded || stopped || live && !common) {
      return;
    }
    const add = worktreeAddOfCommand(command, cwd);
    if (add?.branch === void 0) {
      return;
    }
    if (!isBranchName(add.branch)) {
      warnOnce(`ignored the branch name ${JSON.stringify(add.branch.slice(0, 80))} in the worktree add of ${add.path}`);
      return;
    }
    pendingAdds.set(canonical(add.path), { path: add.path, branch: add.branch, parked: false });
  };
  const onBash = ({ command, cwd }) => {
    const start = expandHome(cwd);
    const code = shellCode(command);
    let base = start;
    for (const match of code.matchAll(CD)) {
      base = resolveIn(base, cdTarget(lastGroup(command, match) ?? ""));
    }
    const gitDir = lastGroup(command, GIT_C.exec(code));
    if (gitDir) {
      base = resolveIn(base, literalWord(gitDir));
    }
    const added = resolveIn(base, worktreeAddPath(command));
    if (added) {
      enqueue(added, true);
    }
    enqueueConfirm();
    if (REMOVES.some((pattern) => pattern.test(code))) {
      enqueueCheck();
    }
    if (base === void 0) {
      return;
    }
    if (CHECKOUT.test(code)) {
      enqueue(base, true);
    } else if (COMMIT.test(code)) {
      enqueue(base, true);
    } else if (base !== start) {
      enqueue(base);
    }
  };
  return {
    observe(event) {
      if (event.event === "git.fact") {
        const data = event.data;
        if (data.kind === "worktree") {
          branches.set(data.worktree, data.branch);
          if (pendingAdds.size > 0) {
            pendingAdds.delete(canonical(data.worktree));
          }
        } else if (data.kind === "worktree-removed") {
          forget(data.worktree, data.branch);
        } else if (data.kind === "fork") {
          forks.add(data.branch);
        } else if (data.kind === "subject") {
          subjects.add(data.branch);
        }
        return;
      }
      if (event.src === "hook" && event.cwd) {
        enqueueOnce(event.cwd);
      }
      if (event.event === "cwd" && event.data.to) {
        enqueueOnce(event.data.to);
      }
      const bash = finishedBash(event);
      if (bash) {
        noteAdd(bash);
      }
      if (bash && live) {
        onBash(bash);
      }
    },
    goLive() {
      if (live || stopped) {
        return;
      }
      live = true;
      for (const dir of candidates) {
        enqueue(dir);
      }
      candidates.clear();
      if (!common) {
        options.log?.("info", "the repository's git common directory is unknown, so removed worktrees are not checked");
        pendingAdds.clear();
        return;
      }
      enqueueConfirm();
      enqueueCheck();
      sweep = setInterval(() => {
        enqueueConfirm(true);
        enqueueCheck();
      }, REMOVAL_SWEEP_MS);
      sweep.unref();
    },
    idle: () => queue,
    stop() {
      live = false;
      stopped = true;
      clearInterval(sweep);
    }
  };
};

// src/facts/gh.ts
var pollIntervalMs = (seconds) => {
  const value = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : DEFAULT_CONFIG.github.pollSeconds;
  return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, value)) * 1e3;
};
var PR_FIELDS = "number,title,url,state,headRefName,baseRefName,createdAt,mergedAt,closedAt";
var ACCOUNT_CHECK_MS = 10 * 60 * 1e3;
var NUDGE_MS = 10 * 1e3;
var BODY_CHARS = 4e3;
var PR_COMMAND = /\bgh\s+pr\s+(create|merge)\b/;
var HOST = "github.com";
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var firstLine = (error) => String(error instanceof Error ? error.message : error).split("\n")[0];
var matchesLogin = (pattern, login) => {
  const input = patternInput(login);
  return pattern !== void 0 && (pattern.test(input) || pattern.test(input.toLowerCase()));
};
var hostAccounts = (output) => {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }
  const hosts = isRecord(parsed) && isRecord(parsed.hosts) ? parsed.hosts : {};
  const entries = Array.isArray(hosts[HOST]) ? hosts[HOST].filter(isRecord) : [];
  const accounts = entries.filter((entry) => typeof entry.login === "string").map((entry) => ({
    login: String(entry.login),
    active: entry.active === true,
    state: String(entry.state ?? ""),
    error: typeof entry.error === "string" ? entry.error : void 0
  }));
  return [...accounts.filter((account) => account.active), ...accounts.filter((account) => !account.active)];
};
var parseRemotes = (output) => {
  const urls = /* @__PURE__ */ new Set();
  for (const line of output.split("\n")) {
    const url = /^\S+\s+(\S+)\s+\((?:fetch|push)\)(?:\s+\[[^\]]*\])?$/.exec(line.trim())?.[1];
    if (url !== void 0) {
      urls.add(url);
    }
  }
  const repos = /* @__PURE__ */ new Set();
  for (const url of urls) {
    const repo = githubRepoOfRemote(url);
    if (repo !== void 0) {
      repos.add(repo);
    }
  }
  return { repos: [...repos], urls: urls.size };
};
var createGhFacts = (options) => {
  const { config, write, wanted } = options;
  const run = options.run ?? runCommand;
  const now = options.now ?? Date.now;
  const known = /* @__PURE__ */ new Map();
  const finishedBash = createBashTracker();
  let accountOk = false;
  let account;
  let useToken = false;
  let checkedAt = Number.NEGATIVE_INFINITY;
  let polledAt = Number.NEGATIVE_INFINITY;
  let lastStatus = "";
  let remotesCheckedAt = Number.NEGATIVE_INFINITY;
  let repoMismatch;
  let running;
  let runningCheckOnly = false;
  let timer;
  let live = false;
  const emitStatus = (given) => {
    const status = repoMismatch ? { ...given, repoMismatch } : given;
    const signature = JSON.stringify(status);
    if (signature !== lastStatus) {
      lastStatus = signature;
      write(createLine("server", "gh.fact", { kind: "status", ...status }));
    }
  };
  const shownPattern = stripControl(config.github.accountPattern);
  if (options.root === void 0 && config.github.repo !== "") {
    options.log?.("warning", "github.repo is not compared with the git remotes: the repository root is unknown");
  }
  let accountWarning;
  const warnAccount = (message) => {
    if (message !== void 0 && message !== accountWarning) {
      options.log?.("warning", message);
    }
    accountWarning = message;
  };
  const onceWarning = () => {
    let last;
    return (message) => {
      if (message !== void 0 && message !== last) {
        options.log?.("warning", message);
      }
      last = message;
    };
  };
  const warnRepo = onceWarning();
  const warnRemotesFailure = onceWarning();
  const checkRemotes = async () => {
    if (options.root === void 0 || config.github.repo === "" || now() - remotesCheckedAt <= ACCOUNT_CHECK_MS) {
      return;
    }
    remotesCheckedAt = now();
    let found;
    try {
      found = parseRemotes(await run("git", [...SAFE_GIT, "remote", "-v"], options.root));
    } catch (error) {
      remotesCheckedAt = Number.NEGATIVE_INFINITY;
      const failure = error;
      const cause = stripControl(stderrLine(failure) || `exit ${String(failure.code)}`);
      warnRemotesFailure(`git remote -v failed (${cause}), so github.repo is not compared with the remotes`);
      return;
    }
    warnRemotesFailure(void 0);
    const { repos, urls } = found;
    const named = config.github.repo.toLowerCase();
    repoMismatch = void 0;
    if (repos.some((repo) => repo.toLowerCase() === named) || urls === 0) {
      warnRepo(void 0);
    } else if (repos.length === 0) {
      warnRepo(`git remote -v lists ${urls} ${urls === 1 ? "remote URL" : "remote URLs"}, none a GitHub URL; github.repo is not compared with them`);
    } else {
      repoMismatch = { repo: config.github.repo, remotes: repos };
      warnRepo(`github.repo ${stripControl(config.github.repo)} names none of the git remotes of this repository (${repos.join(", ")}); gh lists the pull requests of github.repo, so the board may show no merges. Fix github.repo or the remote.`);
    }
  };
  const accountPattern = () => {
    try {
      return linearRegExp(config.github.accountPattern);
    } catch (error) {
      options.log?.("warning", `github.accountPattern is not a usable regular expression: ${stripControl(firstLine(error))}`);
      return void 0;
    }
  };
  const checkActiveAccount = async () => {
    useToken = false;
    let login;
    try {
      login = await run("gh", ["api", "user", "--jq", ".login"]);
    } catch (error) {
      accountOk = false;
      emitStatus({ polling: false, accountOk: false, error: `gh api user failed: ${stripControl(firstLine(error))}` });
      return false;
    }
    account = login;
    accountOk = matchesLogin(accountPattern(), login);
    if (accountOk) {
      warnAccount(void 0);
    } else {
      warnAccount(`gh is logged in as ${stripControl(login)}, which does not match github.accountPattern ${shownPattern}; run gh auth switch --user <your account>. Nurselog never switches accounts.`);
    }
    emitStatus({ polling: accountOk, activeAccount: login, accountOk });
    return accountOk;
  };
  const checkAccount = async () => {
    checkedAt = now();
    await checkRemotes();
    if (options.configKind !== "user") {
      return checkActiveAccount();
    }
    let accounts;
    try {
      accounts = hostAccounts(await run("gh", ["auth", "status", "--json", "hosts"]));
    } catch {
      accounts = [];
    }
    if (!accounts.some((entry) => entry.state === "success")) {
      return checkActiveAccount();
    }
    const pattern = accountPattern();
    const matching = accounts.filter((entry) => matchesLogin(pattern, entry.login));
    const picked = matching.find((entry) => entry.state === "success");
    account = picked?.login;
    accountOk = picked !== void 0;
    useToken = accountOk;
    if (picked) {
      warnAccount(void 0);
      emitStatus({ polling: true, activeAccount: picked.login, accountOk: true });
      return true;
    }
    const broken = matching[0];
    if (broken) {
      const error = stripControl(firstLine(broken.error ?? `gh reports the account as ${broken.state}`));
      warnAccount(`gh account ${stripControl(broken.login)} matches github.accountPattern ${shownPattern} but gh reports: ${error}`);
      emitStatus({ polling: false, accountOk: false, error });
      return false;
    }
    if (pattern) {
      warnAccount(`no account logged in to gh matches github.accountPattern ${shownPattern}; run gh auth login for the right account. Nurselog never switches accounts.`);
    }
    emitStatus({ polling: false, accountOk: false });
    return false;
  };
  const tokenEnv = async () => {
    if (!useToken || account === void 0) {
      return void 0;
    }
    let token = "";
    let failure = "it printed no token";
    try {
      token = await run("gh", ["auth", "token", "--hostname", HOST, "--user", account]);
    } catch (error) {
      failure = stripControl(firstLine(error));
    }
    if (token) {
      return { GH_TOKEN: token, GH_HOST: HOST };
    }
    options.log?.("warning", `gh auth token for ${stripControl(account)} failed (${failure}); falling back to the active gh account and its accountPattern check until the next account check`);
    await checkActiveAccount();
    return void 0;
  };
  const list = async (base, withBody, env) => {
    const fields = withBody ? `${PR_FIELDS},body` : PR_FIELDS;
    const output = await run("gh", ["pr", "list", "--repo", config.github.repo, "--base", base, "--state", "all", "--limit", "50", "--json", fields], void 0, env);
    return JSON.parse(output || "[]");
  };
  const record = (pr) => {
    const signature = `${pr.state}|${pr.mergedAt ?? ""}`;
    if (known.get(pr.number) === signature) {
      return;
    }
    known.set(pr.number, signature);
    const kept = { ...pr, title: redactValue(pr.title) };
    if (pr.body !== void 0) {
      kept.body = redactValue(pr.body).slice(0, BODY_CHARS);
    }
    write(createLine("server", "gh.fact", { kind: "pr", pr: kept }));
  };
  const pollOnce = async () => {
    polledAt = now();
    const everyPoll = options.configKind !== "user";
    if (everyPoll || !accountOk || now() - checkedAt > ACCOUNT_CHECK_MS) {
      await checkAccount();
    }
    if (!accountOk) {
      return;
    }
    const env = await tokenEnv();
    if (!accountOk) {
      return;
    }
    try {
      for (const pr of await list(config.branches.trunk, false, env)) {
        record(pr);
      }
      for (const target of config.branches.promote) {
        const prefix = Object.hasOwn(config.github.promoteTitlePrefix, target) ? config.github.promoteTitlePrefix[target] : "";
        for (const pr of await list(target, true, env)) {
          if (pr.title.startsWith(prefix)) {
            record(pr);
          }
        }
      }
      emitStatus({ polling: true, activeAccount: account, accountOk: true });
    } catch (error) {
      const reason = stripControl(firstLine(error));
      const shown = env ? reason.replaceAll(env.GH_TOKEN, "<token>") : reason;
      emitStatus({ polling: false, activeAccount: account, accountOk: true, error: `gh pr list failed: ${shown}` });
    }
  };
  const failed = (error) => options.log?.("warning", `gh poll failed: ${error.message}`);
  const single = (task, checkOnly = false) => {
    if (!running) {
      runningCheckOnly = checkOnly;
      running = task().then(() => void 0).finally(() => {
        running = void 0;
        runningCheckOnly = false;
      });
    }
    return running;
  };
  const poll = async () => {
    while (running && runningCheckOnly) {
      await running.catch(() => void 0);
    }
    return single(pollOnce);
  };
  return {
    observe(event) {
      if (event.event === "gh.fact" && event.data.kind === "pr") {
        known.set(event.data.pr.number, `${event.data.pr.state}|${event.data.pr.mergedAt ?? ""}`);
        return;
      }
      if (event.event === "git.fact" && event.data.kind === "worktree-removed") {
        if (live) {
          poll().catch(failed);
        }
        return;
      }
      const bash = finishedBash(event);
      if (live && bash && PR_COMMAND.test(bash.command) && wanted()) {
        poll().catch(failed);
      }
    },
    checkAccount,
    poll,
    goLive() {
      live = true;
      single(checkAccount, true).catch(failed);
      timer = setInterval(() => {
        if (wanted()) {
          poll().catch(failed);
        }
      }, pollIntervalMs(config.github.pollSeconds));
      timer.unref();
    },
    nudge() {
      if (!live) {
        return;
      }
      if (wanted()) {
        if (now() - polledAt > NUDGE_MS) {
          poll().catch(failed);
        }
      } else if (now() - checkedAt > NUDGE_MS) {
        single(checkAccount, true).catch(failed);
      }
    },
    stop() {
      live = false;
      clearInterval(timer);
    }
  };
};

// src/facts/usage.ts
import { createHash } from "crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "fs";
import { dirname as dirname2, join as join2, resolve as resolve2, sep } from "path";
var SYNTHETIC_MODEL = "<synthetic>";
var CHUNK_BYTES = 1 << 20;
var TOKEN_FIELDS = ["input", "cacheWrite", "cacheWrite1h", "cacheRead", "output"];
var AGENT_ID = /^[\w-]+$/;
var loadPrices = (path, log) => {
  let rows;
  try {
    rows = JSON.parse(readSmallFile(path, MAX_CONFIG_BYTES)).pricesUsdPerMillion;
  } catch (error) {
    log?.("warning", `no prices read from ${path}: ${error.message}; usage costs 0`);
    return {};
  }
  if (typeof rows !== "object" || rows === null) {
    log?.("warning", `${path} has no pricesUsdPerMillion object; usage costs 0`);
    return {};
  }
  const prices = {};
  for (const [model, price] of Object.entries(rows)) {
    const missing = TOKEN_FIELDS.filter((field) => typeof price?.[field] !== "number");
    if (missing.length > 0) {
      log?.("warning", `${path}: ${model} has no price for ${missing.join(", ")}; its requests cost 0`);
    } else if (model === "__proto__") {
      log?.("warning", `${path}: ${model} is a reserved name, not a model; its requests cost 0`);
    } else {
      ownEntry(prices, model, () => price);
    }
  }
  return prices;
};
var priceFor = (prices, model) => {
  const prefixes = Object.keys(prices).filter((prefix) => model.startsWith(prefix));
  const longest = prefixes.sort((a, b) => b.length - a.length)[0];
  return longest ? prices[longest] : void 0;
};
var usdFor = (prices, model, tokens) => {
  const price = priceFor(prices, model);
  if (!price) {
    return 0;
  }
  const total = TOKEN_FIELDS.reduce((sum, field) => sum + tokens[field] * price[field], 0);
  return Math.round(total) / 1e6;
};
var requestOf = (record) => {
  const message = record.message;
  const usage = message?.usage;
  const requestId = record.requestId || message?.id;
  if (record.type !== "assistant" || !usage || message?.model === SYNTHETIC_MODEL || !requestId) {
    return void 0;
  }
  const fiveMinutes = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const split = fiveMinutes + oneHour > 0;
  return {
    requestId,
    model: message?.model || record.requestedModel || "unknown",
    at: record.timestamp ?? "",
    input: usage.input_tokens ?? 0,
    cacheWrite: split ? fiveMinutes : usage.cache_creation_input_tokens ?? 0,
    cacheWrite1h: split ? oneHour : 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    output: usage.output_tokens ?? 0
  };
};
var createUsageFacts = (options) => {
  const { prices, write } = options;
  const delayMs = options.delayMs ?? 1e3;
  const mainTranscripts = /* @__PURE__ */ new Map();
  const files = /* @__PURE__ */ new Map();
  const timers = /* @__PURE__ */ new Map();
  const known = /* @__PURE__ */ new Map();
  const unpriced = /* @__PURE__ */ new Set();
  const reported = /* @__PURE__ */ new Set();
  const projectsDir = resolve2(expandHome(options.projectsDir ?? "~/.claude/projects"));
  let live = false;
  const warnOnce = (path, message) => {
    if (!reported.has(path)) {
      reported.add(path);
      options.log?.("warning", message);
    }
  };
  const emitBatch = (file, records) => {
    const batch = /* @__PURE__ */ new Map();
    for (const record of records) {
      const request = requestOf(record);
      if (request && request.output >= (batch.get(request.requestId)?.output ?? -1)) {
        batch.set(request.requestId, request);
      }
    }
    for (const request of batch.values()) {
      if (request.output <= (known.get(request.requestId) ?? -1)) {
        continue;
      }
      known.set(request.requestId, request.output);
      const price = priceFor(prices, request.model);
      if (!price && !unpriced.has(request.model)) {
        unpriced.add(request.model);
        options.log?.("warning", `no price for model ${request.model}; its requests cost 0`);
      }
      const data = { ...request, usd: usdFor(prices, request.model, request) };
      if (price) {
        data.rates = { cacheRead: price.cacheRead, output: price.output };
      }
      write(createLine("server", "usage.fact", data, { sessionId: file.sessionId, agentId: file.agentId, cwd: file.cwd }));
    }
  };
  const openTranscript = (path) => {
    let fd;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT") {
        warnOnce(path, `transcript ${path} does not exist; its usage is not counted`);
        return void 0;
      }
      if (code === "ELOOP" || code === "EMLINK") {
        warnOnce(path, `transcript ${path} is not a regular file of this user; not read`);
        return void 0;
      }
      throw error;
    }
    try {
      const stat2 = fstatSync(fd);
      const uid = process.getuid?.();
      if (stat2.isFile() && (uid === void 0 || stat2.uid === uid)) {
        return { fd, size: stat2.size };
      }
    } catch (error) {
      closeSync(fd);
      throw error;
    }
    closeSync(fd);
    warnOnce(path, `transcript ${path} is not a regular file of this user; not read`);
    return void 0;
  };
  const read = (path) => {
    const file = files.get(path);
    const opened = file ? openTranscript(path) : void 0;
    if (!file || !opened) {
      return;
    }
    const { fd, size } = opened;
    const records = [];
    try {
      if (size < file.offset) {
        file.offset = 0;
        file.partial = Buffer.alloc(0);
      }
      while (file.offset < size) {
        const chunk = Buffer.alloc(Math.min(CHUNK_BYTES, size - file.offset));
        const count = readSync(fd, chunk, 0, chunk.length, file.offset);
        if (count === 0) {
          break;
        }
        file.offset += count;
        const data = Buffer.concat([file.partial, chunk.subarray(0, count)]);
        const end = data.lastIndexOf(10);
        file.partial = Buffer.from(data.subarray(end + 1));
        for (const line of end === -1 ? [] : data.subarray(0, end).toString("utf8").split("\n")) {
          try {
            const record = JSON.parse(line);
            if (record.type === "assistant" && !record.requestId && !record.message?.id) {
              record.requestId = `anon-${createHash("sha1").update(line).digest("hex").slice(0, 16)}`;
            }
            records.push(record);
          } catch {
          }
        }
      }
    } finally {
      closeSync(fd);
    }
    emitBatch(file, records);
  };
  const readSafely = (path) => {
    try {
      read(path);
    } catch (error) {
      options.log?.("warning", `transcript ${path} not read: ${error.message}`);
    }
  };
  const schedule = (path) => {
    if (!live || timers.has(path)) {
      return;
    }
    timers.set(path, setTimeout(() => {
      timers.delete(path);
      readSafely(path);
    }, delayMs));
  };
  const follow = (path, sessionId, cwd, agentId) => {
    if (!files.has(path) && !(resolve2(path).startsWith(`${projectsDir}${sep}`) && path.endsWith(".jsonl"))) {
      warnOnce(path, `transcript ${path} is outside ${projectsDir}; not read`);
      return;
    }
    if (!files.has(path)) {
      files.set(path, { sessionId, agentId, cwd, offset: 0, partial: Buffer.alloc(0) });
    }
    schedule(path);
  };
  const text = (value) => typeof value === "string" && value ? value : void 0;
  return {
    observe(event, payload) {
      if (event.event === "usage.fact") {
        known.set(event.data.requestId, Math.max(event.data.output, known.get(event.data.requestId) ?? -1));
        return;
      }
      if (event.src !== "hook" || !event.sessionId) {
        return;
      }
      const named = event.event === "session.start" ? event.data.transcriptPath : void 0;
      const mainPath = named ?? (event.agentId ? void 0 : text(payload?.transcript_path));
      if (mainPath) {
        mainTranscripts.set(event.sessionId, expandHome(mainPath));
      }
      const main = mainTranscripts.get(event.sessionId);
      if (main) {
        follow(main, event.sessionId, event.cwd);
      }
      if (!event.agentId) {
        return;
      }
      const stopped = event.event === "agent.stop" ? event.data.transcriptPath : void 0;
      const agentPath = stopped ?? text(payload?.agent_transcript_path);
      if (agentPath) {
        follow(expandHome(agentPath), event.sessionId, event.cwd, event.agentId);
      } else if (main && AGENT_ID.test(event.agentId)) {
        follow(join2(dirname2(main), event.sessionId, "subagents", `agent-${event.agentId}.jsonl`), event.sessionId, event.cwd, event.agentId);
      }
    },
    goLive() {
      live = true;
      for (const path of files.keys()) {
        schedule(path);
      }
    },
    flush() {
      for (const [path, timer] of timers) {
        clearTimeout(timer);
        timers.delete(path);
        readSafely(path);
      }
    },
    stop() {
      live = false;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    }
  };
};

// src/server/http.ts
import { randomBytes } from "crypto";
import { readFileSync as readFileSync2 } from "fs";
import { createServer } from "http";
import { join as join3 } from "path";

// src/spool/fixture-job.ts
import { existsSync as existsSync2 } from "fs";
import { Worker } from "worker_threads";
var FixtureWorkerMissingError = class extends Error {
};
var FixtureTimeoutError = class extends Error {
};
var FIXTURE_TIMEOUT_MS = 120 * 1e3;
var runFixtureJob = (workerFile, job, options = {}) => new Promise((resolve7, reject) => {
  if (!existsSync2(workerFile)) {
    reject(new FixtureWorkerMissingError(`${workerFile} is not built yet; run pnpm build in the Nurselog package`));
    return;
  }
  if (options.signal?.aborted) {
    reject(new Error("the fixture was cancelled"));
    return;
  }
  const worker = new Worker(workerFile, { workerData: job });
  const timeoutMs = options.timeoutMs ?? FIXTURE_TIMEOUT_MS;
  let settled = false;
  const finish = (outcome) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    outcome();
    void worker.terminate();
  };
  const timer = setTimeout(() => finish(() => reject(new FixtureTimeoutError(`the fixture worker timed out after ${timeoutMs / 1e3} s`))), timeoutMs);
  const cancel = () => finish(() => reject(new Error("the fixture was cancelled")));
  options.signal?.addEventListener("abort", cancel, { once: true });
  worker.once("message", (answer) => finish(() => resolve7(answer)));
  worker.once("error", (error) => finish(() => reject(error)));
  worker.once("exit", (code) => finish(() => reject(new Error(`the fixture worker exited with code ${code} before it answered`))));
});

// src/server/http.ts
var THROTTLE_MS = 100;
var KEEP_ALIVE_MS = 15e3;
var MAX_CLIENTS = 32;
var MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
var UNAUTHORIZED = { error: "unauthorized", message: "Open the board with nurselog open to sign this browser in." };
var COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
var TICKET_MS = 60 * 1e3;
var MAX_TICKETS = 64;
var BEARER = /^Bearer (\S+)$/i;
var NOT_AVAILABLE = { error: "not-available", message: "Answering a waiting agent from the board is not available yet (features.answerFromUi, design section 11)." };
var SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin"
};
var UNAUTHORIZED_HEADERS = { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "WWW-Authenticate": 'Bearer realm="nurselog"' };
var mostRecentlyActive = (repositories) => {
  let newest;
  for (const repository of repositories) {
    if (!newest || (repository.lastLineAt() ?? "") > (newest.lastLineAt() ?? "")) {
      newest = repository;
    }
  }
  return newest;
};
var countsOf = (board) => {
  let running = 0;
  let waiting = 0;
  for (const id of board.order) {
    const run = board.runs[id];
    if (!run) {
      continue;
    }
    running += Object.values(run.agents).filter((agent) => displayState(run, agent) === "running").length;
    const open = run.questions.filter((question) => question.state === "open" && question.audience === "user");
    const asked = new Set(open.filter((question) => question.node.kind === "gate").map((question) => question.node.id));
    const gates = Object.entries(run.gates).filter(([gate, entry]) => entry.state === "waiting" && !asked.has(gate));
    waiting += open.length + gates.length;
  }
  return { running, waiting };
};
var SUMMARY_AFTER_MS = 30 * 60 * 1e3;
var sessionSummary = (session) => {
  const { id, key, title, kind, startedAt, endedAt, finishedAt, lastActiveAt, outcome, costUsd } = session;
  const branches = session.rows.map((row) => row.branch);
  return { id, key, title, kind, startedAt, endedAt, finishedAt, lastActiveAt, outcome, branches, tokens: processedTokens(session.tokens.total), costUsd };
};
var rowCalls = (agent) => {
  const last = agent.recent.length - 1;
  return agent.recent.filter((call, index) => index === last || call.permission === "waiting" && !call.endedAt);
};
var trimAgent = (agent) => {
  const { report, ...rest } = agent;
  const trimmed = { ...rest, recent: rowCalls(agent), trimmed: true };
  if (report) {
    trimmed.report = { text: reportLine(report.text), via: report.via };
  }
  return trimmed;
};
var trimSession = (session) => {
  const agents = Object.fromEntries(Object.entries(session.agents).map(([id, agent]) => [id, trimAgent(agent)]));
  return { ...session, agents };
};
var sessionView = (view, now) => {
  const nowMs = Date.parse(now ?? "");
  const gateWaits = (session) => session.promote?.state === "waiting" || session.docs?.state === "waiting";
  const waits = (session) => session.chip.tone === "you" || gateWaits(session) || session.questions.some(blockingForYou);
  const past = (session) => session.finishedAt !== void 0 && nowMs - Date.parse(session.finishedAt) > SUMMARY_AFTER_MS;
  const entries = Object.entries(view.sessions);
  const summarised = new Set(entries.filter(([, session]) => past(session) && !waits(session)).map(([id]) => id));
  const sessions = Object.fromEntries(entries.filter(([id]) => !summarised.has(id)).map(([id, session]) => [id, trimSession(session)]));
  const summaries = view.sessionOrder.filter((id) => summarised.has(id)).map((id) => sessionSummary(view.sessions[id]));
  summaries.sort((a, b) => Date.parse(b.finishedAt ?? "") - Date.parse(a.finishedAt ?? "") || compareText(a.id, b.id));
  return { ...view, sessions, sessionOrder: view.sessionOrder.filter((id) => !summarised.has(id)), summaries };
};
var REPOSITORY_ROUTES = /* @__PURE__ */ new Set(["GET /api/state", "GET /api/config", "GET /api/events", "GET /api/session", "GET /api/fixture"]);
var VIEW_ROUTES = /* @__PURE__ */ new Set(["GET /api/state", "GET /api/events"]);
var VIEWS = /* @__PURE__ */ new Set(["runs", "sessions"]);
var MAX_SESSION_ID = 256;
var sessionIdValid = (id) => id.length >= 1 && id.length <= MAX_SESSION_ID && stripControl(id) === id;
var HTML = "text/html; charset=utf-8";
var CSS = "text/css; charset=utf-8";
var SCRIPT = "text/javascript; charset=utf-8";
var MANIFEST = "application/manifest+json; charset=utf-8";
var PNG = "image/png";
var SVG = "image/svg+xml";
var UI_ASSETS = /* @__PURE__ */ new Map([
  ["/", { file: "index.html", type: HTML }],
  ["/manifest.webmanifest", { file: "manifest.webmanifest", type: MANIFEST }],
  ["/ui/board.css", { file: "board.css", type: CSS }],
  ["/ui/graph.css", { file: "graph.css", type: CSS }],
  ["/ui/table.css", { file: "table.css", type: CSS }],
  ["/ui/messages.css", { file: "messages.css", type: CSS }],
  ["/ui/overview.css", { file: "overview.css", type: CSS }],
  ["/ui/branches.css", { file: "branches.css", type: CSS }],
  ["/ui/board.js", { file: "board.js", type: SCRIPT, built: true }],
  ["/ui/icon.svg", { file: "icon.svg", type: SVG }],
  ["/ui/icon-192.png", { file: "icon-192.png", type: PNG }],
  ["/ui/icon-512.png", { file: "icon-512.png", type: PNG }],
  ["/ui/icon-maskable-512.png", { file: "icon-maskable-512.png", type: PNG }],
  ["/ui/apple-touch-icon.png", { file: "apple-touch-icon.png", type: PNG }]
]);
var readAsset = (path) => {
  try {
    return readFileSync2(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return void 0;
    }
    throw error;
  }
};
var sendJsonText = (response, status, text) => {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(text);
};
var sendJson = (response, status, body) => sendJsonText(response, status, JSON.stringify(body));
var sendText = (response, status, text) => {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(text);
};
var targetOf = (target) => {
  if (!target.startsWith("/") || target.startsWith("//")) {
    return void 0;
  }
  try {
    const url = new URL(target, "http://127.0.0.1");
    const { searchParams } = url;
    const get = (name) => searchParams.get(name);
    return { path: url.pathname, repo: get("repo"), view: get("view"), id: get("id"), agent: get("agent"), session: get("session"), ticket: get("ticket"), nonce: get("nonce") };
  } catch {
    return void 0;
  }
};
var inputProblem = (key, target) => {
  if (VIEW_ROUTES.has(key) && target.view !== null && !VIEWS.has(target.view)) {
    return "The view parameter must be runs or sessions.";
  }
  if (key === "GET /api/session" && !sessionIdValid(target.id ?? "")) {
    return "The id parameter must be a session id: 1 to 256 characters without control characters.";
  }
  if (key === "GET /api/session" && target.agent !== null && !sessionIdValid(target.agent)) {
    return "The agent parameter must be an agent id: 1 to 256 characters without control characters.";
  }
  if (key === "GET /api/health" && target.nonce !== null && !NONCE.test(target.nonce)) {
    return "The nonce parameter must be 16 to 64 base64url characters.";
  }
  if (key === "GET /api/fixture" && !sessionIdValid(target.session ?? "")) {
    return "The session parameter must be a session id: 1 to 256 characters without control characters.";
  }
  return void 0;
};
var cookieValues = (header, name) => {
  const values = [];
  for (const pair of (header ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at > 0 && pair.slice(0, at).trim() === name) {
      values.push(pair.slice(at + 1).trim());
    }
  }
  return values;
};
var withoutTicket = (target) => {
  const url = new URL(target, "http://127.0.0.1");
  url.searchParams.delete("ticket");
  return `${url.pathname}${url.search}`;
};
var withList = (body, listText) => `${body.slice(0, -1)},"repositories":${listText}}`;
var createBoardServer = (options) => {
  const uiDir = options.uiDir ?? join3(PACKAGE_ROOT, "src", "ui");
  const builtUiDir = options.builtUiDir ?? join3(PACKAGE_ROOT, "dist", "ui");
  const maxClients = options.maxClients ?? MAX_CLIENTS;
  const maxBuffered = options.maxBufferedBytes ?? MAX_BUFFERED_BYTES;
  const log = options.log ?? (() => void 0);
  const empty = { id: "", name: "", store: createStore(structuredClone(DEFAULT_CONFIG)), uiConfig: () => uiConfig(DEFAULT_CONFIG, void 0), lastLineAt: () => void 0 };
  const streams = /* @__PURE__ */ new Map();
  const followed = /* @__PURE__ */ new Map();
  const counts = /* @__PURE__ */ new Map();
  const bodies = /* @__PURE__ */ new Map();
  const dirty = /* @__PURE__ */ new Set();
  let sentList = "[]";
  let pending;
  let sentAt = 0;
  let boundPort = options.port;
  const send = (stream, message) => {
    if (stream.writableLength > maxBuffered) {
      streams.delete(stream);
      stream.destroy();
      log("warning", "dropped an event stream that stopped reading");
      return;
    }
    stream.write(message);
  };
  const repositoryById = (id) => id === "" ? empty : options.repositories().find((repository) => repository.id === id);
  const countsFor = (repository) => {
    const cached = counts.get(repository.id);
    if (cached) {
      return cached;
    }
    const fresh = countsOf(repository.store.state().board);
    if (followed.get(repository.id)?.store === repository.store) {
      counts.set(repository.id, fresh);
    }
    return fresh;
  };
  const summaryOf = (repository) => {
    const { id, name } = repository;
    return { id, name, lastLineAt: repository.lastLineAt(), ...countsFor(repository) };
  };
  const summaries = () => options.repositories().map(summaryOf);
  const bodyOf = (repository, view) => {
    const cached = bodies.get(repository.id)?.[view];
    if (cached !== void 0) {
      return cached;
    }
    const { store } = repository;
    const fresh = view === "runs" ? JSON.stringify(store.snapshot()) : JSON.stringify(sessionView(store.sessions(), store.state().index.now));
    if (followed.get(repository.id)?.store === store) {
      bodies.set(repository.id, { ...bodies.get(repository.id), [view]: fresh });
    }
    return fresh;
  };
  const snapshotText = (repository, view, listText = JSON.stringify(summaries())) => withList(bodyOf(repository, view), listText);
  const broadcast = () => {
    pending = void 0;
    sentAt = Date.now();
    try {
      const list = summaries();
      const listText = JSON.stringify(list);
      const listChanged = listText !== sentList;
      sentList = listText;
      const messages = /* @__PURE__ */ new Map();
      for (const [stream, shown] of streams) {
        const repository = listChanged || dirty.has(shown.id) ? repositoryById(shown.id) : void 0;
        if (!repository) {
          continue;
        }
        const name = `${shown.view} ${shown.id}`;
        const message = messages.get(name) ?? `data: ${snapshotText(repository, shown.view, listText)}

`;
        messages.set(name, message);
        if (message !== shown.sent) {
          shown.sent = message;
          send(stream, message);
        }
      }
    } catch (error) {
      log("warning", `event stream update failed: ${error.message}`);
    }
    dirty.clear();
  };
  const schedule = () => {
    if (!pending && streams.size > 0) {
      pending = setTimeout(broadcast, Math.max(0, THROTTLE_MS - (Date.now() - sentAt)));
    }
  };
  const update = () => {
    const listed = new Map(options.repositories().map((repository) => [repository.id, repository]));
    for (const [id, follow] of followed) {
      if (listed.get(id)?.store !== follow.store) {
        follow.unsubscribe();
        followed.delete(id);
        counts.delete(id);
        bodies.delete(id);
      }
    }
    for (const [id, repository] of listed) {
      if (!followed.has(id)) {
        const unsubscribe = repository.store.subscribe(() => {
          counts.delete(id);
          bodies.delete(id);
          dirty.add(id);
          schedule();
        });
        followed.set(id, { store: repository.store, unsubscribe });
      }
    }
    schedule();
    for (const [stream, { id }] of streams) {
      if (id !== "" && !listed.has(id)) {
        streams.delete(stream);
        stream.end();
      }
    }
  };
  const keepAlive = setInterval(() => {
    for (const stream of streams.keys()) {
      send(stream, ": keep-alive\n\n");
    }
  }, KEEP_ALIVE_MS);
  keepAlive.unref();
  const repositoryOf = (repo) => {
    const listed = options.repositories();
    if (repo === null) {
      return mostRecentlyActive(listed) ?? empty;
    }
    return listed.find((repository) => repository.id === repo);
  };
  const openStream = (request, response, repository, view) => {
    if (streams.size >= maxClients) {
      sendJson(response, 503, { error: "too-many-clients", message: `Nurselog serves at most ${maxClients} event streams.` });
      return;
    }
    const message = `data: ${snapshotText(repository, view)}

`;
    response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
    response.write(`retry: 2000

${message}`);
    streams.set(response, { id: repository.id, view, sent: message });
    request.on("close", () => streams.delete(response));
    options.onClient?.();
  };
  const sendSession = (response, repository, id, agentId) => {
    const unknownSession = { error: "unknown-session", message: "This repository has no session with this id." };
    if (agentId === null) {
      const session = repository.store.session(id);
      sendJson(response, session === void 0 ? 404 : 200, session ?? unknownSession);
      return;
    }
    const found = repository.store.sessionAgent(id, agentId);
    if ("agent" in found) {
      sendJson(response, 200, found.agent);
    } else if (found.missing === "session") {
      sendJson(response, 404, unknownSession);
    } else {
      sendJson(response, 404, { error: "unknown-agent", message: "This session has no agent with this id." });
    }
  };
  let slicing;
  const sliceFailure = (error) => {
    if (error instanceof FixtureWorkerMissingError) {
      return { status: 503, body: { error: "not-built", message: "The fixture worker is not built yet; run pnpm build in the Nurselog package." } };
    }
    if (error instanceof FixtureTimeoutError) {
      return { status: 500, body: { error: "timed-out", message: "The fixture timed out." } };
    }
    return { status: 500, body: { error: "internal", message: "The fixture could not be sliced." } };
  };
  const sendFixture = async (response, repository, id) => {
    const unknownSession = { error: "unknown-session", message: "This repository has no session with this id." };
    if (!repository.fixture) {
      sendJson(response, 404, { error: "no-spool", message: "This repository reads no spool (a replay), so it has no session fixtures." });
      return;
    }
    if (repository.store.session(id) === void 0) {
      sendJson(response, 404, unknownSession);
      return;
    }
    if (slicing) {
      sendJson(response, 429, { error: "busy", message: "A fixture is being saved; try again when it is done." });
      return;
    }
    const controller = new AbortController();
    slicing = controller;
    const leave = () => controller.abort();
    response.once("close", leave);
    let fixture;
    try {
      fixture = await repository.fixture(id, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      log("warning", `the fixture of session ${stripControl(id)} failed: ${stripControl(error.message)}`);
      const failure = sliceFailure(error);
      sendJson(response, failure.status, failure.body);
      return;
    } finally {
      response.off("close", leave);
      slicing = void 0;
    }
    if (!fixture) {
      sendJson(response, 404, unknownSession);
      return;
    }
    const disposition = `attachment; filename="${fixture.name}"`;
    response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/x-ndjson", "Content-Disposition": disposition, "Cache-Control": "no-store" });
    response.end(`${fixture.lines.join("\n")}
`);
  };
  const sendUi = (response, asset) => {
    const body = readAsset(join3(asset.built ? builtUiDir : uiDir, asset.file));
    if (body === void 0 && asset.built) {
      sendText(response, 404, `The board script dist/ui/${asset.file} is not built yet; run pnpm build in the Nurselog package.
`);
    } else if (body === void 0) {
      sendJson(response, 404, { error: "not-found", message: `src/ui/${asset.file} is missing` });
    } else {
      response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": asset.type, "Cache-Control": "no-store" });
      response.end(body);
    }
  };
  const bearerMatches = (request) => {
    const bearer = BEARER.exec(request.headers.authorization ?? "")?.[1];
    return bearer !== void 0 && sameText(bearer, options.token);
  };
  const cookieName = () => `nurselog-${boundPort}`;
  const cookieValue = () => tokenHmac(options.token, `cookie:${boundPort}`);
  const signedIn = (request) => {
    const value = cookieValue();
    return bearerMatches(request) || cookieValues(request.headers.cookie, cookieName()).some((given) => sameText(given, value));
  };
  const tickets = /* @__PURE__ */ new Map();
  const issueTicket = (ttlMs = TICKET_MS) => {
    const now = Date.now();
    for (const [ticket2, expires] of tickets) {
      if (expires <= now) {
        tickets.delete(ticket2);
      }
    }
    if (tickets.size >= MAX_TICKETS) {
      tickets.delete(tickets.keys().next().value);
    }
    const ticket = randomBytes(32).toString("base64url");
    tickets.set(ticket, now + ttlMs);
    return ticket;
  };
  const redeem = (given) => {
    for (const [ticket, expires] of tickets) {
      if (sameText(given, ticket)) {
        tickets.delete(ticket);
        return expires > Date.now();
      }
    }
    return false;
  };
  const signIn = (request, response) => {
    const cookie = `${cookieName()}=${cookieValue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_S}`;
    response.writeHead(303, { ...SECURITY_HEADERS, "Set-Cookie": cookie, Location: withoutTicket(request.url ?? "/"), "Cache-Control": "no-store" });
    response.end();
  };
  const sendUnauthorized = (response) => {
    response.writeHead(401, UNAUTHORIZED_HEADERS);
    response.end(JSON.stringify(UNAUTHORIZED));
  };
  const sendHealth = (request, response, nonce) => {
    const proof = nonce === null ? {} : { proof: boardProof(options.token, boundPort, process.pid, nonce) };
    if (!signedIn(request)) {
      sendJson(response, 200, { ok: true, pid: process.pid, ...proof });
      return;
    }
    sendJson(response, 200, { ok: true, pid: process.pid, ...proof, clients: streams.size, repositories: options.repositories().length, ...options.health?.() });
  };
  const ownOrigin = (origin) => origin === `http://127.0.0.1:${boundPort}` || origin === `http://localhost:${boundPort}`;
  const foreignRead = (request) => {
    const { origin } = request.headers;
    return request.headers["sec-fetch-site"] === "cross-site" || origin !== void 0 && !ownOrigin(origin);
  };
  const answer = (request, response) => {
    request.resume();
    const origin = request.headers.origin;
    const sameOrigin = ownOrigin(origin);
    const fetchSite = request.headers["sec-fetch-site"];
    if (!sameOrigin && !(origin === void 0 && fetchSite === "same-origin")) {
      sendJson(response, 403, { error: "forbidden", message: "POST /api/answer is accepted only from the Nurselog board." });
      return;
    }
    if (!/^application\/json\b/i.test(request.headers["content-type"] ?? "")) {
      sendJson(response, 415, { error: "unsupported-media-type", message: "POST /api/answer needs Content-Type: application/json." });
      return;
    }
    sendJson(response, 501, NOT_AVAILABLE);
  };
  const route = (request, response) => {
    const host = request.headers.host ?? "";
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) {
      sendJson(response, 403, { error: "forbidden", message: "Nurselog answers only on 127.0.0.1 and localhost." });
      return;
    }
    const target = targetOf(request.url ?? "/");
    if (target === void 0) {
      sendJson(response, 400, { error: "bad-request", message: "The request target is not a path." });
      return;
    }
    if (request.method === "GET" && target.path === "/" && target.ticket !== null && redeem(target.ticket)) {
      signIn(request, response);
      return;
    }
    const openRoute = request.method === "GET" && target.path === "/api/health";
    const allowed = target.path === "/api/signin" ? bearerMatches(request) : signedIn(request);
    if (target.path.startsWith("/api/") && !openRoute && !allowed) {
      sendUnauthorized(response);
      return;
    }
    const fetchSite = request.headers["sec-fetch-site"];
    const fixtureFromAnotherPage = target.path === "/api/fixture" && fetchSite !== void 0 && fetchSite !== "same-origin" && fetchSite !== "none";
    if (request.method === "GET" && target.path.startsWith("/api/") && (foreignRead(request) || fixtureFromAnotherPage)) {
      sendJson(response, 403, { error: "forbidden", message: "The Nurselog API is read only by the Nurselog board." });
      return;
    }
    const key = `${request.method ?? "GET"} ${target.path}`;
    const problem = inputProblem(key, target);
    if (problem !== void 0) {
      sendJson(response, 400, { error: "bad-request", message: problem });
      return;
    }
    const view = target.view === "runs" ? "runs" : "sessions";
    const asset = request.method === "GET" ? UI_ASSETS.get(target.path) : void 0;
    const repository = REPOSITORY_ROUTES.has(key) ? repositoryOf(target.repo) : void 0;
    if (asset) {
      sendUi(response, asset);
    } else if (REPOSITORY_ROUTES.has(key) && !repository) {
      sendJson(response, 404, { error: "unknown-repository", message: "No served repository has this id; GET /api/repositories lists them." });
    } else if (key === "GET /api/repositories") {
      sendJson(response, 200, summaries());
    } else if (key === "GET /api/state" && repository) {
      sendJsonText(response, 200, snapshotText(repository, view));
    } else if (key === "GET /api/session" && repository) {
      sendSession(response, repository, target.id ?? "", target.agent);
    } else if (key === "GET /api/fixture" && repository) {
      sendFixture(response, repository, target.session ?? "").catch((error) => log("warning", `GET /api/fixture failed: ${error.message}`));
    } else if (key === "GET /api/config" && repository) {
      sendJson(response, 200, repository.uiConfig());
    } else if (key === "GET /api/events" && repository) {
      openStream(request, response, repository, view);
    } else if (key === "GET /api/health") {
      sendHealth(request, response, target.nonce);
    } else if (key === "POST /api/signin") {
      request.resume();
      sendJson(response, 200, { ticket: issueTicket() });
    } else if (key === "POST /api/answer") {
      answer(request, response);
    } else {
      sendJson(response, 404, { error: "not-found", message: `${key} is not a Nurselog route` });
    }
  };
  const handle = (request, response) => {
    try {
      route(request, response);
    } catch (error) {
      log("warning", `${request.method} request failed: ${error.message}`);
      if (!response.headersSent) {
        sendJson(response, 500, { error: "internal", message: "Nurselog could not answer this request." });
      } else {
        response.destroy();
      }
    }
  };
  const server = createServer(handle);
  server.on("clientError", (_error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    } else {
      socket.destroy();
    }
  });
  return {
    listen: () => new Promise((resolve7, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.host, () => {
        server.off("error", reject);
        boundPort = server.address().port;
        resolve7(boundPort);
      });
    }),
    close: () => new Promise((resolve7) => {
      slicing?.abort();
      for (const follow of followed.values()) {
        follow.unsubscribe();
      }
      followed.clear();
      clearInterval(keepAlive);
      clearTimeout(pending);
      for (const stream of streams.keys()) {
        stream.end();
      }
      streams.clear();
      if (!server.listening) {
        resolve7();
        return;
      }
      server.close(() => resolve7());
      server.closeAllConnections();
    }),
    clients: () => streams.size,
    update,
    issueTicket
  };
};

// src/server/replay.ts
import { readFileSync as readFileSync3 } from "fs";
var ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
var readLines = (path) => readFileSync3(path, "utf8").split("\n").filter((line) => line.trim());
var parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
};
var recordTime = (record) => {
  if (record === null || typeof record !== "object") {
    return void 0;
  }
  const { at, receivedAt } = record;
  const time2 = Date.parse(String(at ?? receivedAt));
  return Number.isNaN(time2) ? void 0 : time2;
};
var timeOf = (text) => recordTime(parse(text));
var shiftTimes = (value, offset) => {
  if (typeof value === "string") {
    const time2 = ISO_UTC.test(value) ? Date.parse(value) : Number.NaN;
    return Number.isNaN(time2) ? value : new Date(time2 + offset).toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => shiftTimes(item, offset));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shiftTimes(item, offset)]));
  }
  return value;
};
var shiftFixture = (lines, offset, start) => {
  let previous = start;
  return lines.map((text) => {
    const record = parse(text);
    const own = recordTime(record);
    const time2 = own === void 0 ? previous : own + offset;
    previous = time2;
    const shifted = record === void 0 || offset === 0 ? text : JSON.stringify(shiftTimes(record, offset));
    return { text: shifted, time: time2 };
  });
};
var mergeFixtures = (fixtures) => {
  const starts = fixtures.map((lines) => lines.map(timeOf).find((time2) => time2 !== void 0));
  const known = starts.filter((time2) => time2 !== void 0);
  const earliest = known.length > 0 ? Math.min(...known) : 0;
  const shifted = fixtures.map((lines, index) => {
    const start = starts[index];
    return shiftFixture(lines, start === void 0 ? 0 : earliest - start, earliest);
  });
  const next = shifted.map(() => 0);
  const merged = [];
  for (; ; ) {
    let pick = -1;
    for (const [index, lines] of shifted.entries()) {
      const line = lines[next[index]];
      if (line && (pick === -1 || line.time < shifted[pick][next[pick]].time)) {
        pick = index;
      }
    }
    if (pick === -1) {
      return merged;
    }
    merged.push(shifted[pick][next[pick]]);
    next[pick] += 1;
  }
};
var replayFixtures = (paths, speed, onLine) => {
  const contents = paths.map(readLines);
  const lines = contents.length === 1 ? contents[0].map((text) => ({ text, time: timeOf(text) })) : mergeFixtures(contents);
  let timer;
  let finish = () => {
  };
  const done = new Promise((resolve7) => {
    finish = resolve7;
  });
  let index = 0;
  let previous;
  const next = () => {
    if (index >= lines.length) {
      finish();
      return;
    }
    const { text, time: time2 } = lines[index];
    const gap = previous !== void 0 && time2 !== void 0 ? Math.max(0, time2 - previous) / speed : 0;
    previous = time2 ?? previous;
    timer = setTimeout(() => {
      index += 1;
      onLine(text);
      next();
    }, gap);
  };
  next();
  return {
    done,
    stop() {
      clearTimeout(timer);
      finish();
    }
  };
};

// src/server/start.ts
import { randomBytes as randomBytes2 } from "crypto";
import { existsSync as existsSync3, linkSync, lstatSync as lstatSync3, mkdirSync, renameSync as renameSync2, rmSync as rmSync2, statSync, writeFileSync } from "fs";
import { dirname as dirname3, join as join7, resolve as resolve5 } from "path";
import { setTimeout as delay } from "timers/promises";

// src/server/context.ts
import { join as join6, resolve as resolve4 } from "path";

// src/spool/aggregates.ts
import { closeSync as closeSync2, lstatSync, readdirSync, readFileSync as readFileSync4, readSync as readSync2, renameSync, rmSync, unlinkSync } from "fs";
import { join as join4 } from "path";

// src/model/aggregate.ts
var WORK_SESSION_CALLS = 5;
var DIALOG_ORIGINS = /* @__PURE__ */ new Set(["marker", "ask-tool", "permission"]);
var isDialog = (question) => question.audience === "user" && DIALOG_ORIGINS.has(question.origin);
var subagentsOf = (session, stage) => {
  const subagents = Object.values(session.agents).filter((agent) => agent.id !== MAIN_AGENT && agent.stage === stage);
  return subagents.sort(byStart);
};
var buildOf = (agent) => {
  const { toolCalls, verifyRounds } = agent.budget;
  const commands = VERIFY_KINDS.reduce((sum, kind) => sum + verifyRounds.commands[kind], 0);
  const failed = VERIFY_KINDS.reduce((sum, kind) => sum + verifyRounds.results[kind].filter((result) => result === "fail").length, 0);
  const callLimit = toolCalls.limit > 0 ? toolCalls.limit : null;
  return { role: agent.role, startedAt: agent.startedAt, callsAtFirstStop: agent.budget.toolCallsAtFirstStop ?? null, callLimit, commands, failed };
};
var reviewOf = (agent) => {
  const block = agent.report?.block;
  const fixItems = block ? block.followups.filter((item) => item.type === "fix").length : null;
  return { role: agent.role, startedAt: agent.startedAt, fixItems, usd: agent.budget.costUsd };
};
var branchOf = (row) => row.runIds.includes(row.branch) ? "?" : row.branch;
var metricsBranchOf = (branch) => branch.includes(":") ? "?" : branch;
var rowOf = (row) => {
  const rounds = row.reviewers.map((reviewer) => reviewer.round);
  const reviewRound = rounds.length > 0 ? Math.max(...rounds) : null;
  const streamRuns = row.streams.filter((stream) => stream.runs.length > 0).map((stream) => stream.runs.length);
  return { branch: branchOf(row), owner: row.owner, prNumber: row.pr?.pr?.number ?? null, reviewRound, streamRuns };
};
var sameCall = (head, question) => question.origin === "ask-tool" && head.origin === "ask-tool" && question.id.startsWith(`${head.id}-`) && question.createdAt === head.createdAt && question.source.agentId === head.source.agentId;
var questionsOf = (session) => {
  const dialogs = session.questions.filter(isDialog);
  const heads = [];
  for (const question of [...dialogs].sort((a, b) => compareText(a.id, b.id))) {
    if (!heads.some((head) => sameCall(head, question))) {
      heads.push(question);
    }
  }
  heads.sort((a, b) => time(a.createdAt) - time(b.createdAt) || compareText(a.id, b.id));
  return heads.map((question) => {
    const answeredAt = question.state === "answered" && question.resolvedAt !== void 0 ? question.resolvedAt : null;
    return { origin: question.origin, askedAt: question.createdAt, answeredAt };
  });
};
var sessionAggregate = (session) => {
  const { endedAt, finishedAt } = session;
  if (endedAt === void 0 || finishedAt === void 0 || Object.values(session.agents).some((agent) => agent.trimmed)) {
    return void 0;
  }
  const main = Object.hasOwn(session.agents, MAIN_AGENT) ? session.agents[MAIN_AGENT] : void 0;
  const limit = main?.budget.context.limit;
  const contextLimit = limit !== void 0 && limit > 0 ? limit : null;
  const toolCalls = main?.budget.toolCalls.used ?? 0;
  const { waits, totalMs, breaks } = session.developerWait;
  const metrics = sessionMetrics(session);
  const branches = metrics.branches.map((entry) => ({ ...entry, branch: metricsBranchOf(entry.branch) }));
  const { count, expired, cacheWriteUsd } = metrics.resumes;
  return {
    v: 1,
    id: session.id,
    ...session.key === void 0 ? {} : { key: session.key },
    ...session.title === void 0 ? {} : { title: session.title },
    kind: session.kind,
    startedAt: session.startedAt,
    endedAt,
    finishedAt,
    work: session.kind === "card" && toolCalls >= WORK_SESSION_CALLS,
    metrics: { ...metrics, branches, resumes: { count, expired, cacheWriteUsd } },
    main: { toolCalls, largeOutputs: main?.budget.largeOutputs ?? 0, contextLimit },
    builds: subagentsOf(session, "build").map(buildOf),
    reviews: subagentsOf(session, "review").map(reviewOf),
    rows: session.rows.map(rowOf),
    questions: questionsOf(session),
    developerWait: { waits, totalMs, breaks }
  };
};

// src/spool/aggregates.ts
var AGGREGATES_FILE = "aggregates.ndjson";
var MAX_AGGREGATES_BYTES = 64 * 1024 * 1024;
var NEWLINE = 10;
var CHUNK_BYTES2 = 1024 * 1024;
var TEMP_FILE = /^aggregates\.ndjson(?:\.(\d+))?\.tmp$/;
var LEFT_OVER_TEMP_MS = 10 * 60 * 1e3;
var MAX_LINE_BYTES = 4 * 1024 * 1024;
var OVERLONG_LINE = "(a line over 4 MiB)";
var isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isString = (value) => typeof value === "string";
var isDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
var OPTIONAL_FIELDS = [
  ["key", isString],
  ["title", isString],
  ["kind", isString],
  ["endedAt", isString],
  ["metrics", isPlainObject],
  ["main", isPlainObject],
  ["developerWait", isPlainObject],
  ["builds", Array.isArray],
  ["reviews", Array.isArray],
  ["rows", Array.isArray],
  ["questions", Array.isArray]
];
var lineCount = (count) => count === 1 ? "1 line" : `${count} lines`;
var completeLines = (text) => text.split("\n").slice(0, -1).filter((line) => line.trim() !== "");
var parseObject = (line) => {
  try {
    const value = JSON.parse(line);
    return isPlainObject(value) ? value : void 0;
  } catch {
    return void 0;
  }
};
var storedAggregate = (line) => {
  const entry = parseObject(line);
  if (entry === void 0 || entry.v !== 1 || typeof entry.id !== "string" || typeof entry.work !== "boolean") {
    return void 0;
  }
  if (!isDate(entry.startedAt) || !isDate(entry.finishedAt)) {
    return void 0;
  }
  let repaired = false;
  for (const [field, valid] of OPTIONAL_FIELDS) {
    if (Object.hasOwn(entry, field) && !valid(entry[field])) {
      delete entry[field];
      repaired = true;
    }
  }
  return { aggregate: entry, repaired };
};
var parseAggregates = (text) => {
  const newest = /* @__PURE__ */ new Map();
  let skipped = 0;
  let repaired = 0;
  for (const line of completeLines(text)) {
    const stored = storedAggregate(line);
    if (stored === void 0) {
      skipped += 1;
      continue;
    }
    repaired += stored.repaired ? 1 : 0;
    newest.delete(stored.aggregate.id);
    newest.set(stored.aggregate.id, stored.aggregate);
  }
  return { aggregates: [...newest.values()], skipped, repaired };
};
var withOpened = (path, read) => {
  const opened = openNoFollow(path);
  if (opened === void 0) {
    return void 0;
  }
  if ("refused" in opened) {
    throw new Error(opened.refused);
  }
  try {
    return read(opened);
  } finally {
    closeSync2(opened.fd);
  }
};
var eachLine = (fd, onLine) => {
  const chunk = Buffer.alloc(CHUNK_BYTES2);
  const parts = [];
  let held = 0;
  let overlong = false;
  let position = 0;
  for (; ; ) {
    const read = readSync2(fd, chunk, 0, CHUNK_BYTES2, position);
    if (read === 0) {
      return;
    }
    position += read;
    const data = chunk.subarray(0, read);
    let start = 0;
    for (let end = data.indexOf(NEWLINE); end !== -1; end = data.indexOf(NEWLINE, start)) {
      if (overlong || held + end - start > MAX_LINE_BYTES) {
        onLine(OVERLONG_LINE);
      } else {
        parts.push(data.subarray(start, end));
        const line = Buffer.concat(parts).toString("utf8");
        if (line.trim() !== "") {
          onLine(line);
        }
      }
      parts.length = 0;
      held = 0;
      overlong = false;
      start = end + 1;
    }
    if (!overlong && held + read - start > MAX_LINE_BYTES) {
      parts.length = 0;
      held = 0;
      overlong = true;
    }
    if (!overlong) {
      parts.push(Buffer.from(data.subarray(start)));
      held += read - start;
    }
  }
};
var countLines = (path, counted = () => true) => {
  let count = 0;
  withOpened(path, ({ fd }) => eachLine(fd, (line) => count += counted(line) ? 1 : 0));
  return count;
};
var readText = (path) => withOpened(path, ({ fd, stat: stat2 }) => {
  if (stat2.size > MAX_AGGREGATES_BYTES) {
    throw new Error(`${path}: larger than ${MAX_AGGREGATES_BYTES} bytes`);
  }
  try {
    return readFileSync4(fd, "utf8");
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
});
var readAggregates = (dir, onError) => {
  const path = join4(dir, AGGREGATES_FILE);
  let text;
  try {
    text = readText(path);
  } catch (error) {
    onError(`skipped ${error.message}`, true);
    return [];
  }
  if (text === void 0) {
    return [];
  }
  const { aggregates, skipped, repaired } = parseAggregates(text);
  const skippedPart = skipped > 0 ? [`${lineCount(skipped)} skipped, broken, of another format version or without a date`] : [];
  const repairedPart = repaired > 0 ? [`${lineCount(repaired)} repaired, a field of a wrong type dropped`] : [];
  const problems = [...skippedPart, ...repairedPart];
  if (problems.length > 0) {
    onError(`${path}: ${problems.join("; ")}`, false);
  }
  return aggregates;
};
var appendText = (path, line) => withOpened(path, ({ fd, stat: stat2 }) => {
  if (stat2.size + Buffer.byteLength(line) + 1 > MAX_AGGREGATES_BYTES) {
    throw new Error(`${path}: would grow over ${MAX_AGGREGATES_BYTES} bytes, nothing appended until a prune brings it under`);
  }
  if (stat2.size === 0) {
    return line;
  }
  const last = Buffer.alloc(1);
  readSync2(fd, last, 0, 1, stat2.size - 1);
  return last[0] === NEWLINE ? line : `
${line}`;
}) ?? line;
var appendAggregate = (dir, aggregate) => {
  ensurePrivateDir(dir);
  const path = join4(dir, AGGREGATES_FILE);
  appendPrivate(path, appendText(path, `${JSON.stringify(aggregate)}
`));
};
var localMidnight = (year, monthIndex, day) => {
  const date = /* @__PURE__ */ new Date(0);
  date.setFullYear(year, monthIndex, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};
var dayStart = (day) => {
  const [year, month, date] = day.split("-").map(Number);
  return localMidnight(year, month - 1, date);
};
var pruneCutoff = (keepDays, now) => localMidnight(now.getFullYear(), now.getMonth(), now.getDate() - keepDays);
var finishedFrom = (cutoff) => (line) => {
  const finishedAt = parseObject(line)?.finishedAt;
  const time2 = typeof finishedAt === "string" ? Date.parse(finishedAt) : Number.NaN;
  return !Number.isNaN(time2) && time2 >= cutoff;
};
var processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
};
var leftOver = (name, stat2) => {
  const pid = TEMP_FILE.exec(name)?.[1];
  if (pid === void 0 || Number(pid) === process.pid) {
    return true;
  }
  return !processAlive(Number(pid)) || Date.now() - stat2.mtimeMs > LEFT_OVER_TEMP_MS;
};
var removeTemps = (dir) => {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const name of names.filter((entry) => TEMP_FILE.test(entry))) {
    const stat2 = lstatSync(join4(dir, name), { throwIfNoEntry: false });
    if ((stat2?.isFile() || stat2?.isSymbolicLink()) && leftOver(name, stat2)) {
      rmSync(join4(dir, name), { force: true });
    }
  }
};
var rewrite = (dir, keep) => {
  removeTemps(dir);
  const path = join4(dir, AGGREGATES_FILE);
  if (countLines(path, (line) => !keep(line)) === 0) {
    return 0;
  }
  const temp = `${path}.${process.pid}.tmp`;
  let dropped = 0;
  try {
    writePrivate(temp, "");
    let batch = "";
    withOpened(
      path,
      ({ fd }) => eachLine(fd, (line) => {
        if (!keep(line)) {
          dropped += 1;
          return;
        }
        batch += `${line}
`;
        if (batch.length >= CHUNK_BYTES2) {
          appendPrivate(temp, batch);
          batch = "";
        }
      })
    );
    appendPrivate(temp, batch);
    renameSync(temp, path);
  } catch (error) {
    try {
      rmSync(temp, { force: true });
    } catch {
    }
    throw error;
  }
  return dropped;
};
var pruneAggregates = (dir, keepDays, now) => rewrite(dir, finishedFrom(pruneCutoff(keepDays, now)));
var ownedByMe = (stat2) => typeof process.getuid !== "function" || stat2.uid === process.getuid();
var countForPurge = (path, stat2) => {
  if (!ownedByMe(stat2)) {
    throw new Error(`${path} belongs to another user`);
  }
  try {
    return countLines(path);
  } catch {
    return void 0;
  }
};
var purgeableAggregates = (dir, before) => {
  const path = join4(dir, AGGREGATES_FILE);
  if (!spoolDirExists(dir)) {
    return 0;
  }
  const stat2 = lstatSync(path, { throwIfNoEntry: false });
  if (stat2?.isFile() !== true) {
    return 0;
  }
  if (before === void 0) {
    return countForPurge(path, stat2);
  }
  const kept = finishedFrom(dayStart(before));
  return countLines(path, (line) => !kept(line));
};
var purgeAggregates = (dir, before) => {
  if (!spoolDirExists(dir)) {
    return 0;
  }
  const path = join4(dir, AGGREGATES_FILE);
  const stat2 = lstatSync(path, { throwIfNoEntry: false });
  if (before !== void 0) {
    const taken = stat2?.isFile() ? rewrite(dir, finishedFrom(dayStart(before))) : 0;
    removeTemps(dir);
    return taken;
  }
  let count = 0;
  if (stat2?.isFile()) {
    count = countForPurge(path, stat2);
    unlinkSync(path);
  } else if (stat2?.isSymbolicLink()) {
    unlinkSync(path);
  }
  removeTemps(dir);
  return count;
};
var AGGREGATE_SETTLE_MS = 2 * 60 * 1e3;
var CONTINUING_SOURCES = /* @__PURE__ */ new Set(["resume", "compact"]);
var begunInWindow = (store, session, windowStartMs) => {
  const record = ownValue(store.state().index.sessions, session.id);
  const opened = record?.sourceAt !== void 0 && (record.source === void 0 || !CONTINUING_SOURCES.has(record.source));
  return opened && Date.parse(session.startedAt) >= windowStartMs;
};
var createAggregateLog = (options) => {
  const { dir, keepDays, windowStartMs, onError } = options;
  const settleMs = options.settleMs ?? AGGREGATE_SETTLE_MS;
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const onInfo = options.onInfo ?? (() => void 0);
  const path = join4(dir, AGGREGATES_FILE);
  const written = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  let appendFailure;
  const load = (report) => {
    let refused = false;
    const stored = readAggregates(dir, (message, isRefused) => {
      if (!isRefused) {
        onError(message);
        return;
      }
      refused = true;
      if (report) {
        onError(`${message}; no session aggregate is written to it until it can be read`);
      }
    });
    if (refused) {
      return false;
    }
    for (const aggregate of stored) {
      written.set(aggregate.id, aggregate.finishedAt);
    }
    return true;
  };
  let loaded = load(true);
  const write = (store, sessionId) => {
    const session = store.session(sessionId);
    const finishedAt = session?.finishedAt;
    if (session === void 0 || finishedAt === void 0 || written.get(sessionId) === finishedAt || !begunInWindow(store, session, windowStartMs)) {
      return true;
    }
    if (Date.parse(finishedAt) < pruneCutoff(keepDays, now())) {
      return true;
    }
    let aggregate;
    try {
      aggregate = sessionAggregate(session);
    } catch (error) {
      onError(`session aggregate of ${sessionId} not built: ${error.message}`);
      return true;
    }
    if (aggregate === void 0) {
      onError(`session aggregate of ${sessionId} not built: the session gave no aggregate`);
      return true;
    }
    try {
      appendAggregate(dir, aggregate);
    } catch (error) {
      const message = error.message;
      if (message !== appendFailure) {
        onError(`session aggregate of ${sessionId} not written, tried again at the next check: ${message}`);
      }
      appendFailure = message;
      return false;
    }
    if (appendFailure !== void 0) {
      appendFailure = void 0;
      onInfo(`session aggregates written to ${path} again`);
    }
    written.set(sessionId, finishedAt);
    return true;
  };
  const flush = (store) => {
    if (!loaded) {
      return;
    }
    let dueBy;
    try {
      const at = store.state().index.now;
      dueBy = at === void 0 ? Number.NaN : Date.parse(at) - settleMs;
    } catch (error) {
      onError(`session aggregates not checked: ${error.message}`);
      return;
    }
    for (const [sessionId, finishedAt] of [...pending].filter(([, at]) => Date.parse(at) <= dueBy)) {
      let done;
      try {
        done = write(store, sessionId);
      } catch (error) {
        onError(`session aggregate of ${sessionId} not checked, the session dropped: ${error.message}`);
        done = true;
      }
      if (!done) {
        return;
      }
      if (pending.get(sessionId) === finishedAt) {
        pending.delete(sessionId);
      }
    }
  };
  return {
    noteFinish(sessionId, finishedAt) {
      pending.set(sessionId, finishedAt);
    },
    flush,
    prune(at) {
      try {
        pruneAggregates(dir, keepDays, at);
      } catch (error) {
        onError(`${AGGREGATES_FILE} not pruned: ${error.message}`);
        return;
      }
      if (!loaded && load(false)) {
        loaded = true;
        onInfo(`${path} read after the prune; session aggregates are written to it again`);
      }
    },
    close(store) {
      flush(store);
      if (pending.size > 0) {
        const count = pending.size === 1 ? "1 session aggregate" : `${pending.size} session aggregates`;
        onInfo(`${count} not written yet at close; the next start writes them from its replay`);
      }
    }
  };
};

// src/server/repositories.ts
import { closeSync as closeSync3, constants as constants2, lstatSync as lstatSync2, openSync as openSync2, readdirSync as readdirSync2, readSync as readSync3 } from "fs";
import { join as join5, resolve as resolve3, sep as sep2 } from "path";
var HASH_DIRECTORY = /^[0-9a-f]{12}$/;
var RECORD_FILE = "repository.json";
var CONFIG_FILE = "nurselog.config.json";
var hashDirectories = (base) => {
  let entries;
  try {
    entries = readdirSync2(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.isDirectory() && HASH_DIRECTORY.test(entry.name)).map((entry) => entry.name);
};
var recordedRoot = (base, hash) => {
  const root = readRepositoryRecord(join5(base, hash, RECORD_FILE))?.root;
  return root !== void 0 && recordedRootValid(root, hash) ? root : void 0;
};
var NEWLINE2 = 10;
var TAIL_CHUNK_BYTES = 64 * 1024;
var READ_NO_FOLLOW = constants2.O_RDONLY | (constants2.O_NOFOLLOW ?? 0) | (constants2.O_NONBLOCK ?? 0);
var activityAt = (text) => {
  let line;
  try {
    line = JSON.parse(text);
  } catch {
    return void 0;
  }
  const { src, at } = line ?? {};
  const time2 = typeof at === "string" && src !== "server" ? Date.parse(at) : Number.NaN;
  return Number.isNaN(time2) ? void 0 : new Date(time2).toISOString();
};
var newestActivityIn = (path, from, to) => {
  const fd = openSync2(path, READ_NO_FOLLOW);
  try {
    let end = to;
    let carry = Buffer.alloc(0);
    while (end > from) {
      const start = Math.max(from, end - TAIL_CHUNK_BYTES);
      const chunk = Buffer.alloc(end - start);
      readSync3(fd, chunk, 0, chunk.length, start);
      const data = Buffer.concat([chunk, carry]);
      const cut = start > from ? data.indexOf(NEWLINE2) + 1 : 0;
      carry = cut > 0 ? Buffer.from(data.subarray(0, cut - 1)) : start > from ? data : Buffer.alloc(0);
      const lines = cut > 0 || start === from ? data.subarray(cut).toString("utf8").split("\n") : [];
      for (const text of lines.reverse()) {
        const at = text.trim() ? activityAt(text) : void 0;
        if (at !== void 0) {
          return at;
        }
      }
      end = start;
    }
    return void 0;
  } finally {
    closeSync3(fd);
  }
};
var scanned = /* @__PURE__ */ new Map();
var newestActivityOf = (path) => {
  const stat2 = lstatSync2(path);
  if (!stat2.isFile() || typeof process.getuid === "function" && stat2.uid !== process.getuid()) {
    return void 0;
  }
  const size = stat2.size;
  const known = scanned.get(path);
  const from = known && known.size <= size ? known.size : 0;
  const fd = openSync2(path, READ_NO_FOLLOW);
  let to = size;
  try {
    const tail = Buffer.alloc(Math.min(size - from, TAIL_CHUNK_BYTES));
    readSync3(fd, tail, 0, tail.length, size - tail.length);
    const last = tail.lastIndexOf(NEWLINE2);
    to = last === -1 ? from : size - tail.length + last + 1;
  } finally {
    closeSync3(fd);
  }
  const found = to > from ? newestActivityIn(path, from, to) : void 0;
  const at = found ?? (from > 0 ? known?.at : void 0);
  scanned.set(path, { size: Math.max(from, to), at });
  return at;
};
var failedLookup = (error) => typeof error.code === "string";
var lastLineAt = (root, onError) => {
  let dir;
  try {
    dir = spoolDirFor(readHookConfig(root), root);
  } catch (error) {
    onError(`its config cannot be read: ${error.message}`);
    return void 0;
  }
  let files;
  try {
    files = listSpoolFiles(dir);
  } catch (error) {
    onError(`its spool directory ${tildeHome(dir)} cannot be listed: ${error.message}`);
    return void 0;
  }
  try {
    for (const file of files.reverse()) {
      const at = newestActivityOf(file.path);
      if (at !== void 0) {
        return at;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      onError(`its spool directory ${tildeHome(dir)} cannot be read: ${error.message}`);
    }
  }
  return void 0;
};
var withinReadDays = (at, readDays, now) => {
  if (at === void 0) {
    return false;
  }
  const first = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (readDays - 1)));
  return localDay(new Date(at)) >= first;
};
var segmentsOf = (root) => root.split(sep2).filter(Boolean);
var tabNames = (roots) => {
  const segments = roots.map(segmentsOf);
  const depths = roots.map(() => 1);
  for (; ; ) {
    const names = segments.map((parts, index) => parts.slice(-depths[index]).join("/"));
    const grows = names.map((name, index) => depths[index] < segments[index].length && names.some((other, at) => at !== index && other === name));
    if (!grows.includes(true)) {
      return names;
    }
    for (const [index, grow] of grows.entries()) {
      if (grow) {
        depths[index] += 1;
      }
    }
  }
};
var listRepositories = (onError = () => void 0) => {
  const base = defaultRoot();
  const found = [];
  for (const hash of hashDirectories(base)) {
    const root = recordedRoot(base, hash);
    if (root !== void 0) {
      found.push({ hash, root });
    }
  }
  const names = tabNames(found.map((repository) => repository.root));
  const repositories = found.map((repository, index) => {
    const named = { hash: repository.hash, name: names[index] };
    return { ...repository, name: names[index], lastLineAt: lastLineAt(repository.root, (message) => onError(named, message)) };
  });
  return repositories.sort((a, b) => a.name.localeCompare(b.name));
};
var reportLookup = (dir, error, onError) => {
  if (failedLookup(error)) {
    onError?.(`orphaned spool ${tildeHome(dir)} not listed: ${error.message}`);
  }
};
var newestDayIn = (dir, onError) => {
  try {
    return { newest: purgeableDayFiles(dir).at(-1)?.day };
  } catch (error) {
    reportLookup(dir, error, onError);
    return void 0;
  }
};
var holdsAggregates = (dir, onError) => {
  try {
    return spoolDirExists(dir) && lstatSync2(join5(dir, AGGREGATES_FILE), { throwIfNoEntry: false })?.isFile() === true;
  } catch (error) {
    reportLookup(dir, error, onError);
    return false;
  }
};
var listOrphanedSpools = (now = /* @__PURE__ */ new Date(), onError) => {
  const base = defaultRoot();
  const today = localDay(now);
  const orphans = [];
  for (const hash of hashDirectories(base).sort()) {
    const dir = join5(base, hash);
    const root = readRepositoryRecord(join5(dir, RECORD_FILE))?.root;
    if (root !== void 0 && recordedRootValid(root, hash)) {
      continue;
    }
    const listed = newestDayIn(dir, onError);
    if (listed === void 0) {
      continue;
    }
    const orphaned = listed.newest === void 0 ? holdsAggregates(dir, onError) : listed.newest < today;
    if (!orphaned) {
      continue;
    }
    orphans.push(root === void 0 ? { hash, dir } : { hash, dir, root });
  }
  return orphans;
};
var pruneOrphanedSpools = (now, onError) => {
  const deleted = [];
  for (const orphan of listOrphanedSpools(now, onError)) {
    const config = join5(orphan.dir, CONFIG_FILE);
    const shown = tildeHome(orphan.dir);
    try {
      const keepDays = configKeepDays(config) ?? HOOK_DEFAULTS.spool.keepDays;
      if (spoolDirExists(orphan.dir)) {
        deleted.push(...pruneSpool(orphan.dir, keepDays, now));
      }
    } catch (error) {
      onError(`orphaned spool ${shown} not pruned: ${error.message}`);
    }
    try {
      const keepDays = configKeepDays(config, "insights") ?? DEFAULT_CONFIG.insights.keepDays;
      if (spoolDirExists(orphan.dir)) {
        pruneAggregates(orphan.dir, keepDays, now);
      }
    } catch (error) {
      onError(`session aggregates of orphaned spool ${shown} not pruned: ${error.message}`);
    }
  }
  return deleted;
};
var pruneAggregatesIn = (dir, keepDays, now, onError) => {
  try {
    if (spoolDirExists(dir)) {
      pruneAggregates(dir, keepDays, now);
    }
  } catch (error) {
    onError(`session aggregates of ${tildeHome(dir)} not pruned: ${error.message}`);
  }
};
var pruneRecordedAggregates = (now, onError) => {
  const base = defaultRoot();
  for (const hash of hashDirectories(base).sort()) {
    const root = recordedRoot(base, hash);
    if (root === void 0) {
      continue;
    }
    const dir = join5(base, hash);
    let keepDays = DEFAULT_CONFIG.insights.keepDays;
    try {
      keepDays = configKeepDays(userConfigPath(root), "insights") ?? keepDays;
    } catch (error) {
      onError(`session aggregates of ${tildeHome(dir)} not pruned: ${error.message}`);
      continue;
    }
    pruneAggregatesIn(dir, keepDays, now, onError);
    try {
      const configured = spoolDirFor(readHookConfig(root), root);
      if (resolve3(configured) !== resolve3(dir)) {
        pruneAggregatesIn(configured, keepDays, now, onError);
      }
    } catch (error) {
      onError(`session aggregates of ${tildeHome(dir)} not pruned under its configured spool.dir: ${error.message}`);
    }
  }
};
var dailyOrphanPrune = (onError, now = () => /* @__PURE__ */ new Date()) => {
  let prunedDay = "";
  return () => {
    const at = now();
    const today = localDay(at);
    if (today === prunedDay) {
      return;
    }
    prunedDay = today;
    try {
      pruneOrphanedSpools(at, onError);
    } catch (error) {
      onError(`the orphaned spool directories were not pruned: ${error.message}`);
    }
    try {
      pruneRecordedAggregates(at, onError);
    } catch (error) {
      onError(`the session aggregates of the recorded repositories were not pruned: ${error.message}`);
    }
  };
};

// src/server/context.ts
var TICK_MS = 60 * 1e3;
var AGGREGATE_CHECK_MS = 60 * 1e3;
var hasOpenRun = (state) => Object.values(state.runs).some((run) => run.branch !== "" && run.branch !== "?" && run.chip.tone !== "done");
var stopEach = (stops, log) => {
  for (const stop of stops.splice(0)) {
    try {
      stop();
    } catch (error) {
      log("warning", `stopping failed: ${error.message}`);
    }
  }
};
var createSpoolContext = (options) => {
  const { config, root, spoolDir, log } = options;
  let name = options.name;
  const warn = (message) => log("warning", stripControlLines(`${name}: ${message}`));
  const windowStartMs = readWindowStart(/* @__PURE__ */ new Date(), config.spool.readDays).getTime();
  const info = (message) => log("info", stripControlLines(`${name}: ${message}`));
  const aggregates = createAggregateLog({ dir: spoolDir, keepDays: config.insights.keepDays, windowStartMs, onError: warn, onInfo: info });
  const store = createStore(config, { onFinish: (sessionId, finishedAt) => aggregates.noteFinish(sessionId, finishedAt) });
  const write = (line) => appendEvent(spoolDir, line, config.spool.maxLineBytes);
  const fixtureWorker = options.fixtureWorker ?? join6(PACKAGE_ROOT, "dist", "fixture-worker.js");
  const stops = [];
  const observers = [];
  let lastLineAt2 = options.lastLineAt;
  const ghWanted = options.facts && config.github.repo !== "";
  const ghLog = (level, message) => level === "warning" ? warn(message) : info(message);
  const pollWanted = () => options.clients() > 0 && hasOpenRun(store.state().board);
  const gh = ghWanted ? createGhFacts({ config, configKind: options.configKind, root, write, log: ghLog, wanted: pollWanted }) : void 0;
  let lines = () => 0;
  try {
    const git = options.facts ? createGitFacts({ config, write, log, repoCommonDir: gitCommonDir(root) }) : void 0;
    const usage = options.facts ? createUsageFacts({ prices: loadPrices(resolve4(root, expandHome(config.pricesFrom)), log), write, log }) : void 0;
    if (git && usage) {
      observers.push((event) => git.observe(event), (event, payload) => usage.observe(event, payload));
      stops.push(() => git.stop(), () => usage.stop());
    }
    if (gh) {
      observers.push((event) => gh.observe(event));
      stops.push(() => gh.stop());
    }
    const onLine = createLineHandler(store, config, observers);
    const onHistory = createHistoryHandler(store, config, observers, warn);
    const onCleanUp = (now) => aggregates.prune(now);
    const reader = createSpoolReader({ dir: spoolDir, readDays: config.spool.readDays, keepDays: config.spool.keepDays, onError: warn, onLine, onHistory, onCleanUp });
    reader.start();
    stops.push(() => reader.stop());
    lines = reader.lines;
    store.state();
    const check = setInterval(() => aggregates.flush(store), options.aggregateCheckMs ?? AGGREGATE_CHECK_MS);
    stops.push(() => {
      clearInterval(check);
      aggregates.close(store);
    });
    git?.goLive();
    usage?.goLive();
    gh?.goLive();
    if (options.facts) {
      const tick = setInterval(() => {
        try {
          write(createLine("server", "tick", { now: (/* @__PURE__ */ new Date()).toISOString() }));
        } catch (error) {
          warn(`tick line not written: ${error.message}`);
        }
      }, TICK_MS);
      stops.push(() => clearInterval(tick));
    }
  } catch (error) {
    stopEach(stops, log);
    throw error;
  }
  return {
    id: options.id,
    get name() {
      return name;
    },
    root,
    store,
    spoolDir,
    async fixture(sessionId, signal) {
      const answer = await runFixtureJob(fixtureWorker, { dir: spoolDir, sessionId, config }, { signal });
      for (const message of answer.warnings) {
        warn(message);
      }
      if (answer.error !== void 0) {
        throw new Error(answer.error);
      }
      return answer.fixture;
    },
    uiConfig: () => ({ ...uiConfig(config, root), repo: name, sessionFixtures: true }),
    lastLineAt: () => lastLineAt2,
    seen(nextName, at) {
      name = nextName;
      lastLineAt2 = at;
    },
    lines: () => lines(),
    nudge: () => gh?.nudge(),
    close: () => stopEach(stops, log)
  };
};
var createReplayContext = (options) => {
  const store = createStore(options.config);
  const handle = createLineHandler(store, options.config);
  let count = 0;
  let lastLineAt2;
  const replay = replayFixtures(options.fixtures, options.speed, (text) => {
    count += 1;
    handle(text);
    lastLineAt2 = activityAt(text) ?? lastLineAt2;
  });
  return {
    id: options.id,
    name: options.name,
    root: options.root,
    store,
    uiConfig: () => options.ui,
    lastLineAt: () => lastLineAt2,
    seen: () => void 0,
    lines: () => count,
    nudge: () => void 0,
    close: () => replay.stop()
  };
};

// src/server/start.ts
var DEFAULT_PORT = 6767;
var alreadyRunningMessage = (state, url) => {
  if (!state) {
    return "Nurselog is already running.";
  }
  return `Nurselog is already running (pid ${state.pid}): ${url ?? `http://127.0.0.1:${state.port}/`}`;
};
var BoardRunningError = class extends Error {
  state;
  constructor(state) {
    super(alreadyRunningMessage(state));
    this.name = "BoardRunningError";
    this.state = state;
  }
};
var OrphanedCopyError = class extends Error {
  constructor(marker) {
    super(`Nurselog does not start from this plugin copy: ${tildeHome(marker)} marks it as replaced or uninstalled`);
    this.name = "OrphanedCopyError";
  }
};
var PORT_TRIES = 20;
var stderrLog = (level, message) => console.error(`[nurselog] ${level}: ${stripControlLines(message)}`);
var keepRunning = (log) => {
  const onException = (error) => log("warning", `uncaught exception: ${error.stack ?? error.message}`);
  const onRejection = (reason) => log("warning", `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);
  return () => {
    process.off("uncaughtException", onException);
    process.off("unhandledRejection", onRejection);
  };
};
var listenOnFreePort = async (create, first, tries) => {
  for (let offset = 0; ; offset += 1) {
    const server = create(first + offset);
    try {
      return { server, port: await server.listen() };
    } catch (error) {
      await server.close();
      if (error.code !== "EADDRINUSE" || offset + 1 >= tries) {
        throw error;
      }
    }
  }
};
var CLAIM_CHECK_MS = 4e3;
var START_TICKET_MS = 10 * 60 * 1e3;
var LOCK_STALE_MS = 10 * 1e3;
var LOCK_RETRY_MS = 25;
var SCAN_MS = 10 * 1e3;
var PACKAGE_FILE = join7(PACKAGE_ROOT, "src", "ui", "index.html");
var ORPHAN_MARKER = join7(PACKAGE_ROOT, ".orphaned_at");
var packageGone = (path) => {
  try {
    statSync(path);
    return false;
  } catch (error) {
    const code = error.code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
};
var linkNew = (temp, target) => {
  try {
    linkSync(temp, target);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }
    throw error;
  }
};
var lockAge = (lock) => {
  try {
    return Date.now() - lstatSync3(lock).mtimeMs;
  } catch {
    return 0;
  }
};
var takeStaleLock = (lock) => {
  const aside = `${lock}.${process.pid}-${randomBytes2(4).toString("hex")}.stale`;
  try {
    renameSync2(lock, aside);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  rmSync2(aside, { recursive: true, force: true });
};
var withLock = async (lock, work) => {
  for (; ; ) {
    try {
      mkdirSync(lock, { mode: 448 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
    if (lockAge(lock) > LOCK_STALE_MS) {
      takeStaleLock(lock);
    } else {
      await delay(LOCK_RETRY_MS);
    }
  }
  try {
    return await work();
  } finally {
    rmSync2(lock, { recursive: true, force: true });
  }
};
var claimStateFile = async (stateFile, text) => {
  ensurePrivateDir(dirname3(stateFile));
  const temp = `${stateFile}.${process.pid}-${randomBytes2(4).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, text, { mode: 384, flag: "wx" });
    if (linkNew(temp, stateFile)) {
      return;
    }
    await withLock(`${stateFile}.lock`, async () => {
      if (linkNew(temp, stateFile)) {
        return;
      }
      if ((await checkBoard(stateFile, CLAIM_CHECK_MS)).status === "proven") {
        throw new BoardRunningError(readServerState(stateFile));
      }
      rmSync2(stateFile, { force: true });
      if (!linkNew(temp, stateFile)) {
        throw new BoardRunningError(readServerState(stateFile));
      }
    });
  } finally {
    rmSync2(temp, { force: true });
  }
};
var nameOf = (repository) => stripControl(repository.name);
var startNurselog = async (options = {}) => {
  const log = options.log ?? stderrLog;
  const warn = (message) => log("warning", message);
  const stateFile = options.stateFile ?? serverStatePath();
  const packageFile = options.packageFile ?? PACKAGE_FILE;
  const orphanMarker = options.orphanMarker ?? ORPHAN_MARKER;
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const live = !options.replay;
  if (live && existsSync3(orphanMarker)) {
    throw new OrphanedCopyError(orphanMarker);
  }
  const token = live ? ensureBoardToken(join7(dirname3(stateFile), "token")) : randomBytes2(32).toString("base64url");
  const speed = options.replay?.speed ?? 1;
  const contexts = /* @__PURE__ */ new Map();
  const setups = /* @__PURE__ */ new Map();
  const failures = /* @__PURE__ */ new Map();
  const stops = [];
  const repositories = () => [...contexts.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lines = () => [...contexts.values()].reduce((sum, context) => sum + context.lines(), 0);
  const create = (port2) => createBoardServer({
    host: "127.0.0.1",
    port: port2,
    token,
    repositories,
    health: () => ({ startedAt, mode: live ? "spool" : "replay", lines: lines(), ...live ? {} : { speed } }),
    onClient: () => {
      for (const context of contexts.values()) {
        context.nudge();
      }
    },
    log
  });
  const tries = options.port === void 0 ? PORT_TRIES : 1;
  const { server, port } = await listenOnFreePort(create, options.port ?? options.defaultPort ?? DEFAULT_PORT, tries);
  const release = () => {
    if (live && readServerState(stateFile)?.pid === process.pid) {
      rmSync2(stateFile, { force: true });
    }
  };
  if (live) {
    try {
      await claimStateFile(stateFile, `${JSON.stringify({ pid: process.pid, port, startedAt })}
`);
    } catch (error) {
      await server.close();
      throw error;
    }
  }
  stops.push(keepRunning(log));
  const setupOf = (repository) => {
    const found = findConfig(repository.root);
    if (!found) {
      setups.delete(repository.hash);
      return void 0;
    }
    const known = setups.get(repository.hash);
    if (known?.path === found.path && known.kind === found.kind) {
      return known;
    }
    const setup = { path: found.path, kind: found.kind };
    try {
      setup.config = loadConfig(found, repository.root, warn);
    } catch (error) {
      warn(`${nameOf(repository)} is not served: ${error.message}`);
    }
    setups.set(repository.hash, setup);
    return setup;
  };
  const failed = (id, message) => {
    if (failures.get(id) !== message) {
      failures.set(id, message);
      warn(message);
    }
  };
  const pruneOrphans = dailyOrphanPrune(warn);
  let unlisted = /* @__PURE__ */ new Map();
  const scan = () => {
    pruneOrphans();
    let listed;
    const reasons = /* @__PURE__ */ new Map();
    try {
      listed = listRepositories((repository, message) => reasons.set(repository.hash, `${nameOf(repository)} is not served: ${message}`));
    } catch (error) {
      warn(`the repositories were not listed: ${error.message}`);
      return;
    }
    for (const [hash, reason] of reasons) {
      if (unlisted.get(hash) !== reason) {
        warn(reason);
      }
    }
    unlisted = reasons;
    const now = /* @__PURE__ */ new Date();
    const served = /* @__PURE__ */ new Map();
    for (const repository of listed) {
      if (!withinReadDays(repository.lastLineAt, MAX_READ_DAYS, now)) {
        continue;
      }
      try {
        const setup = setupOf(repository);
        if (setup?.config && withinReadDays(repository.lastLineAt, setup.config.spool.readDays, now)) {
          served.set(repository.hash, { repository, setup, config: setup.config });
        }
      } catch (error) {
        failed(repository.hash, `${nameOf(repository)} is not served: ${error.message}`);
      }
    }
    const names = tabNames([...served.values()].map(({ repository }) => repository.root));
    for (const [index, entry] of [...served.values()].entries()) {
      entry.repository = { ...entry.repository, name: names[index] };
    }
    for (const [id, context] of contexts) {
      if (!served.has(id)) {
        contexts.delete(id);
        context.close();
      }
    }
    for (const [id, { repository, setup, config }] of served) {
      const context = contexts.get(id);
      if (context) {
        context.seen(repository.name, repository.lastLineAt);
        continue;
      }
      try {
        const { name, root, lastLineAt: lastLineAt2 } = repository;
        const spoolDir = spoolDirFor(config, root);
        const facts = options.facts !== false;
        const clients = () => server.clients();
        const fixtureWorker = options.fixtureWorker;
        contexts.set(id, createSpoolContext({ id, name, root, config, configKind: setup.kind, spoolDir, lastLineAt: lastLineAt2, facts, clients, log, fixtureWorker }));
        failures.delete(id);
      } catch (error) {
        failed(id, `${nameOf(repository)} is not served: ${error.message}`);
      }
    }
    for (const id of failures.keys()) {
      if (!served.has(id)) {
        failures.delete(id);
      }
    }
    server.update();
  };
  let closing;
  const close = () => {
    closing ??= (async () => {
      stopAll();
      await server.close();
      release();
    })();
    return closing;
  };
  const closeReason = () => {
    if (packageGone(packageFile)) {
      return `${tildeHome(packageFile)} is gone, so the package it runs from was removed`;
    }
    if (existsSync3(orphanMarker)) {
      return `${tildeHome(orphanMarker)} marks the plugin copy it runs from as replaced or uninstalled`;
    }
    return void 0;
  };
  const tick = () => {
    if (closing) {
      return;
    }
    const reason = closeReason();
    if (reason === void 0) {
      scan();
      return;
    }
    log("info", `the board closes: ${reason}`);
    close().then(() => options.onSelfClose?.(), (error) => warn(`closing failed: ${error.message}`));
  };
  const stopAll = () => {
    for (const context of contexts.values()) {
      try {
        context.close();
      } catch (error) {
        warn(`stopping failed: ${error.message}`);
      }
    }
    contexts.clear();
    for (const stop of stops) {
      try {
        stop();
      } catch (error) {
        warn(`stopping failed: ${error.message}`);
      }
    }
  };
  try {
    if (options.replay) {
      const { fixtures, config } = options.replay;
      const root = resolve5(options.replay.root);
      const ui = uiConfig(config, repositoryRoot(root));
      const id = repoHash(root);
      contexts.set(id, createReplayContext({ id, name: ui.repo || "replay", root, config, ui, fixtures, speed }));
      server.update();
    } else {
      scan();
      const timer = setInterval(tick, options.scanMs ?? SCAN_MS);
      stops.push(() => clearInterval(timer));
    }
  } catch (error) {
    stopAll();
    await server.close();
    release();
    throw error;
  }
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    token,
    ticketUrl: () => `${boardUrl(port)}?ticket=${server.issueTicket(START_TICKET_MS)}`,
    repositories,
    scan: () => live ? scan() : void 0,
    close
  };
};

// hooks/markers.mjs
import { randomBytes as randomBytes3 } from "crypto";
import { closeSync as closeSync4, constants as constants3, existsSync as existsSync4, fstatSync as fstatSync2, openSync as openSync3, readFileSync as readFileSync5, readSync as readSync4 } from "fs";
import { join as join8, resolve as resolve6 } from "path";
import { parseArgs } from "util";
var USAGE = `Usage: nurselog <command> [--repo <path>]
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
  insights [--json]                                      workflow health: the last 5 work sessions against the 20 before them, per area, flagged lines first; --json prints the data
  install-cli [--remove]                                 write the terminal command ~/.local/bin/nurselog, which runs the newest installed plugin copy (from a clone, the clone); --remove deletes it; a file Nurselog did not write is never touched
--repo <path> names the repository; the default is the git worktree of the current directory.
Quote free text in single quotes; a value that starts with - needs the = form: --text='-5 files'.`;
var FLAG_NAMES = {
  ...FIELD_NAMES,
  run: "--run",
  streams: "--stream",
  stream: "--stream",
  after: "after=",
  gate: "--gate",
  state: "--state",
  text: "--text (or --stdin)",
  answer: "--answer",
  note: "--note",
  context: "--context",
  options: "--option",
  node: "--node",
  relays: "--relays"
};
var newQuestionId = () => `q-${randomBytes3(4).readUInt32BE(0).toString(36).padStart(6, "0").slice(-6)}`;
var parseStream = (spec) => {
  const [id, ...options] = spec.split(":");
  if (!STREAM_ID.test(id)) {
    return `stream "${spec}" needs an id such as api or web`;
  }
  const stream = { id, package: id, after: [] };
  for (const option of options) {
    const [key, value = ""] = option.split("=");
    if (key === "after") {
      stream.after = value.split(",").filter(Boolean);
    } else if (key === "model" && value) {
      stream.model = value;
    } else if (key === "package" && value) {
      stream.package = value;
    } else {
      return `stream "${spec}": unknown option "${option}" (after=, model=, package=)`;
    }
  }
  return stream;
};
var parseStdinText = (input, mainField) => {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    parsed = void 0;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { [mainField]: input.trim() };
  }
  const fields = {};
  for (const name of ["text", "note", "context"]) {
    if (typeof parsed[name] === "string") {
      fields[name] = parsed[name];
    }
  }
  const options = parsed.options ?? parsed.option;
  if (Array.isArray(options) && options.every((option) => typeof option === "string")) {
    fields.option = options;
  }
  return fields;
};
var withStdin = (values, readStdin, mainField) => values.stdin ? { ...values, ...parseStdinText(readStdin(), mainField) } : values;
var planMarker = (args, readStdin) => {
  const options = {
    run: { type: "string" },
    stream: { type: "string", multiple: true },
    note: { type: "string" },
    stdin: { type: "boolean" }
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, "note");
  const streams = [];
  for (const spec of values.stream ?? []) {
    const stream = parseStream(spec);
    if (typeof stream === "string") {
      return { error: stream };
    }
    streams.push(stream);
  }
  return validateMarkerInput("plan", { run: values.run, streams, note: values.note }, FLAG_NAMES);
};
var gateMarker = (args, readStdin) => {
  const options = {
    run: { type: "string" },
    gate: { type: "string" },
    state: { type: "string" },
    note: { type: "string" },
    stdin: { type: "boolean" }
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, "note");
  return validateMarkerInput("gate", { run: values.run, gate: values.gate, state: values.state, note: values.note }, FLAG_NAMES);
};
var questionMarker = (args, readStdin) => {
  const options = {
    run: { type: "string" },
    text: { type: "string" },
    blocking: { type: "boolean" },
    option: { type: "string", multiple: true },
    context: { type: "string" },
    node: { type: "string" },
    answer: { type: "string" },
    relays: { type: "string" },
    stdin: { type: "boolean" }
  };
  const values = withStdin(parseArgs({ args, options }).values, readStdin, "text");
  const input = { run: values.run, text: values.text, blocking: values.blocking, options: values.option, context: values.context, node: values.node, answer: values.answer, relays: values.relays };
  const result = validateMarkerInput("question", input, FLAG_NAMES);
  if ("error" in result || "answers" in result.data) {
    return result;
  }
  const id = newQuestionId();
  return { ...result, data: { ...result.data, id }, output: id };
};
var MARKERS = { plan: planMarker, gate: gateMarker, question: questionMarker };
var readStandardInput = () => readFileSync5(0, "utf8");
var parseMarker = (kind, args, readStdin = readStandardInput) => {
  const marker = Object.hasOwn(MARKERS, kind) ? MARKERS[kind] : void 0;
  if (!marker) {
    return { error: "emit needs plan, gate or question" };
  }
  let result;
  try {
    result = marker(args, readStdin);
  } catch (error) {
    return { error: error.message };
  }
  if ("error" in result) {
    return result;
  }
  if (!result.data.run) {
    return { error: `${kind} needs --run <run id or worktree name>` };
  }
  const data = JSON.parse(JSON.stringify(result.data));
  return { ...result, data: redactValue(data, "", kind === "plan" ? "input" : "none") };
};
var takeRepo = (args) => {
  const rest = [];
  let repo;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repo") {
      repo = args[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--repo=")) {
      repo = arg.slice("--repo=".length);
    } else {
      rest.push(arg);
    }
  }
  return { repo, rest };
};
var resolveRepository = (repo, cwd = process.cwd()) => {
  if (repo === "") {
    throw new Error("--repo needs a path");
  }
  const start = resolve6(cwd, repo ?? ".");
  if (!existsSync4(start)) {
    throw new Error(`${stripControl(start)} does not exist`);
  }
  const root = repositoryRoot(start);
  if (!root) {
    throw new Error("not inside a git repository; use --repo <path>");
  }
  return root;
};
var configOf = (io, root) => {
  const config = readHookConfig(root);
  const path = stripControl(tildeHome(config.found?.path ?? ""));
  if (config.problems?.length) {
    io.err(`nurselog: ${path}: ${stripControl(config.problems.join("; "))}; using the default spool settings`);
  }
  for (const warning of config.warnings) {
    io.err(`nurselog: ${path}: ${warning}`);
  }
  return config;
};
var runEmit = (args, io) => {
  const { repo, rest } = takeRepo(args);
  const root = resolveRepository(repo, io.cwd);
  const config = configOf(io, root);
  if (!config.found) {
    io.err(notSetUpMessage());
    return 1;
  }
  const [kind, ...markerArgs] = rest;
  const result = parseMarker(kind, markerArgs, io.stdin);
  if ("error" in result) {
    io.err(`nurselog emit: ${result.error}
${USAGE}`);
    return 2;
  }
  const line = { v: 1, id: newLineId(), at: (/* @__PURE__ */ new Date()).toISOString(), src: "cli", event: result.event, sessionId: "", cwd: tildeHome(process.cwd()), data: result.data };
  appendSpoolLine(spoolDirFor(config, root), line, "data", config.spool.maxLineBytes);
  if (result.output) {
    io.out(result.output);
  }
  return 0;
};
var BOARD_TIMEOUT_MS = 1e3;
var MAX_TAB_NAME = 1024;
var tabOf = (list, hash) => {
  if (!Array.isArray(list)) {
    return void 0;
  }
  const tab = list.find((repository) => typeof repository === "object" && repository !== null && repository.id === hash);
  const named = typeof tab?.name === "string" && tab.name !== "" && tab.name.length <= MAX_TAB_NAME;
  return named ? tab : void 0;
};
var boardTab = async (board, root, timeoutMs = BOARD_TIMEOUT_MS) => {
  if (root === void 0 || board.status !== "proven") {
    return void 0;
  }
  const { port } = board;
  const list = await loopbackJson(port, "/api/repositories", timeoutMs, board.token);
  const tab = tabOf(list, repoHash(root));
  if (tab === void 0) {
    return void 0;
  }
  return { name: stripControl(tab.name), url: `http://127.0.0.1:${port}/?repo=${encodeURIComponent(tab.name)}` };
};
var linesToday = (path) => {
  let fd;
  try {
    fd = openSync3(path, constants3.O_RDONLY | constants3.O_NOFOLLOW | constants3.O_NONBLOCK);
  } catch {
    return 0;
  }
  try {
    const stat2 = fstatSync2(fd);
    const otherUser = typeof process.getuid === "function" && stat2.uid !== process.getuid();
    if (!stat2.isFile() || otherUser) {
      return 0;
    }
    const buffer = Buffer.alloc(stat2.size);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync4(fd, buffer, length, buffer.length - length, length);
      if (read === 0) {
        break;
      }
      length += read;
    }
    return buffer.toString("utf8", 0, length).split("\n").filter(Boolean).length;
  } finally {
    closeSync4(fd);
  }
};
var runStatus = async (args, io) => {
  const { repo, rest } = takeRepo(args);
  if (rest.length > 0) {
    io.err(`nurselog status: unknown argument ${stripControl(rest[0])}
${USAGE}`);
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
  const today = join8(dir, `events-${localDay(/* @__PURE__ */ new Date())}.ndjson`);
  const lines = linesToday(today);
  const board = await checkBoard(stateFile, RUNNING_CHECK_MS);
  const running = state !== void 0 && board.status !== "none";
  if (running) {
    io.out(`Server: running on http://127.0.0.1:${state.port} (pid ${state.pid}, since ${state.startedAt})`);
  } else {
    io.out(`Server: not running; start it with: ${startCommand()}`);
  }
  io.out(`Spool: ${stripControl(tildeHome(dir))}`);
  io.out(`Lines today: ${lines}`);
  if (board.status === "unproven") {
    io.out(`Tab: unknown; ${TOKEN_CHANGED}`);
  } else if (running) {
    const tab = await boardTab(board, root);
    io.out(tab ? `Tab: ${tab.name} on ${tab.url}` : "Tab: none; the board serves this repository once its spool has lines within spool.readDays");
  }
  return 0;
};
var LINK_TIMEOUT_MS = 400;
var withSession = (url, session) => {
  const parsed = new URL(url);
  const query = `session=${encodeURIComponent(session)}`;
  parsed.search = parsed.search === "" ? query : `${parsed.search.slice(1)}&${query}`;
  return parsed.href;
};
var parseLinkArgs = (args) => {
  const options = { osc8: false, session: void 0 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--osc8") {
      options.osc8 = true;
    } else if (arg === "--session") {
      const value = args[index + 1];
      if (value === void 0 || value === "" || value.startsWith("-")) {
        return "--session needs a session id";
      }
      options.session = value;
      index += 1;
    } else if (arg.startsWith("--session=")) {
      options.session = arg.slice("--session=".length);
      if (options.session === "") {
        return "--session needs a session id";
      }
    } else {
      return `unknown argument ${stripControl(arg)}`;
    }
  }
  return options;
};
var hyperlink = (url) => `\x1B]8;;${url}\x1B\\Nurselog\x1B]8;;\x1B\\`;
var runLink = async (args, io) => {
  const { repo, rest } = takeRepo(args);
  const options = parseLinkArgs(rest);
  if (typeof options === "string") {
    io.err(`nurselog link: ${options}
${USAGE}`);
    return 2;
  }
  const root = resolveRepository(repo, io.cwd);
  const board = await checkBoard(serverStatePath(), LINK_TIMEOUT_MS);
  if (board.status === "none") {
    io.err("nurselog link: the board is not running");
    return 1;
  }
  if (board.status === "unproven") {
    io.err(`nurselog link: ${TOKEN_CHANGED}`);
    return 1;
  }
  const tab = await boardTab(board, root, LINK_TIMEOUT_MS);
  if (tab === void 0) {
    io.err("nurselog link: the board named no tab for this repository");
    return 1;
  }
  const url = options.session === void 0 ? tab.url : withSession(tab.url, options.session);
  io.out(options.osc8 ? hyperlink(url) : url);
  return 0;
};

export {
  createLine,
  appendEvent,
  runCommand,
  createBashTracker,
  SAFE_GIT,
  worktreeAddPath,
  createGitFacts,
  PR_FIELDS,
  createGhFacts,
  loadPrices,
  priceFor,
  usdFor,
  requestOf,
  createUsageFacts,
  createBoardServer,
  shiftTimes,
  mergeFixtures,
  replayFixtures,
  readAggregates,
  purgeableAggregates,
  purgeAggregates,
  listRepositories,
  listOrphanedSpools,
  DEFAULT_PORT,
  alreadyRunningMessage,
  BoardRunningError,
  OrphanedCopyError,
  startNurselog,
  USAGE,
  parseStream,
  parseMarker,
  resolveRepository,
  runEmit,
  boardTab,
  runStatus,
  runLink
};
