import {
  DEFAULT_CONFIG,
  MAX_CONFIG_BYTES,
  MAX_POLL_SECONDS,
  MIN_POLL_SECONDS,
  PROGRESS_ITEMS_CAP,
  STALE_AGENT_MS,
  appendSpoolLine,
  cdTarget,
  createHistoryHandler,
  createSpoolReader,
  createStore,
  expandHome,
  firstWorkedCopy,
  githubRepoOfRemote,
  isBranchName,
  linearRegExp,
  literalWord,
  newLineId,
  normalizePath,
  ownEntry,
  ownValue,
  patternInput,
  readSmallFile,
  redactValue,
  roleConfig,
  shellCode,
  stripControl,
  tildeHome,
  time,
  worktreeAddOfCommand
} from "./chunk-OHFJPS3R.js";

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
var COMMAND_TIMEOUT_MS = 15e3;
var runCommand = (command, args, cwd, env) => new Promise((resolve3, reject) => {
  const childEnv = env ? { ...process.env, ...env } : void 0;
  execFile(command, args, { cwd, env: childEnv, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
    if (error) {
      reject(error);
    } else {
      resolve3(stdout.trim());
    }
  });
});
var stderrLine = (error) => {
  const lines = error.message.split("\n");
  const stderr = lines[0].startsWith("Command failed") ? lines.slice(1) : lines;
  return stderr.find((line) => line.trim() !== "")?.trim() ?? "";
};
var failureCause = (failure) => {
  if (!(failure instanceof Error)) {
    return String(failure);
  }
  const { code, killed, signal } = failure;
  if (typeof code === "number") {
    const line = stderrLine(failure);
    return line ? `exit ${code}: ${line}` : `exit ${code}`;
  }
  if (typeof signal === "string") {
    return killed === true ? `timed out after ${COMMAND_TIMEOUT_MS / 1e3} s` : `killed by ${signal}`;
  }
  return stderrLine(failure) || failure.message.split("\n")[0];
};
var refillMap = (target, source) => {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
};
var refillSet = (target, source) => {
  target.clear();
  for (const value of source) {
    target.add(value);
  }
};
var copyCalls = (calls) => new Map([...calls].map(([id, { command, cwd }]) => [id, { command, cwd }]));
var createBashTracker = () => {
  let open = /* @__PURE__ */ new Map();
  return {
    track(event) {
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
    },
    view: () => copyCalls(open),
    restore(view) {
      open = copyCalls(view);
    }
  };
};

// src/facts/git.ts
import { existsSync, readFileSync, realpathSync } from "fs";
import { realpath, stat } from "fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "path";
var REMOVAL_SWEEP_MS = 5 * 60 * 1e3;
var STAT_TIMEOUT_MS = 5e3;
var MAX_HUNG_STATS = 2;
var MAX_HUNG_OUTSIDE = 1;
var MAX_WARNINGS = 256;
var copyAdds = (adds) => {
  const copies = [...adds].map(([key, add]) => [key, { ...add, seen: new Set(add.seen) }]);
  return new Map(copies);
};
var TIMED_OUT = /* @__PURE__ */ Symbol("timed out");
var HUNG_CAPS = { worktree: MAX_HUNG_STATS, outside: MAX_HUNG_OUTSIDE };
var CD = /(?:^|&&|;|\|\||\n)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g;
var GIT_C = /\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)/;
var WORD = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;
var CHECKOUT = new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?(?:checkout|switch)\b`);
var COMMIT = new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?commit\b`);
var REMOVES = [
  new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?worktree\s+(?:remove|prune)\b`),
  new RegExp(String.raw`\bgit\s+(?:-C\s+${WORD}\s+)?branch\b[^;&|\n]*\s(?:-[a-zA-Z]*[dD]|--delete)\b`),
  /\brm\b[^;&|\n]*\s(?:-[a-zA-Z]*[rR]|--recursive)/
];
var SAFE_GIT = ["-c", "log.showSignature=false", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
var SAFE_GIT_ENV = Object.freeze({ GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "none", GIT_TERMINAL_PROMPT: "0" });
var END_OF_OPTIONS = "--end-of-options";
var NOT_A_REPO = 128;
var HEADS = "refs/heads/";
var DIFF_OPTIONS = ["--cached", "--name-only", "-z", "--no-renames", "--diff-filter=d", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all"];
var NEUTRAL_CWD = "/";
var lastGroup = (command, match) => {
  const group = match?.[match.length - 1];
  const end = match && match.index !== void 0 ? match.index + match[0].length : 0;
  return group === void 0 ? void 0 : command.slice(end - group.length, end);
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
var fullPath = (path) => resolve(expandHome(path));
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
  const statPath = options.stat ?? stat;
  const realpathOf = options.realpath ?? realpath;
  const trunk = config.branches.trunk;
  const quietBranches = /* @__PURE__ */ new Set([trunk, ...config.branches.promote]);
  const branches = /* @__PURE__ */ new Map();
  const forks = /* @__PURE__ */ new Set();
  const subjects = /* @__PURE__ */ new Set();
  const resolved = /* @__PURE__ */ new Set();
  const candidates = /* @__PURE__ */ new Set();
  const eventDirs = /* @__PURE__ */ new Set();
  const bashCalls = createBashTracker();
  const common = options.repoCommonDir;
  const mainCheckout = common && basename(common) === ".git" ? dirname(common) : void 0;
  let live = false;
  let stopped = false;
  let queue = Promise.resolve();
  let sweep;
  let checkWaiting = false;
  let refsWarning = "";
  const statWarnings = /* @__PURE__ */ new Map();
  const pendingAdds = /* @__PURE__ */ new Map();
  const attempts = /* @__PURE__ */ new Map();
  const historyReviewers = /* @__PURE__ */ new Map();
  const historyDiffs = /* @__PURE__ */ new Map();
  const emit = (data, worktree) => write(createLine("server", "git.fact", data, { cwd: worktree }));
  const git = (args, cwd) => run("git", [...SAFE_GIT, ...args], cwd, SAFE_GIT_ENV);
  const quiet = (what) => (error) => {
    if (error.code !== NOT_A_REPO) {
      options.log?.("warning", `${what} failed: ${failureCause(error)}`);
    }
    return "";
  };
  const mergeBase = async (where, branch, cwd) => {
    try {
      return await git([...where, "merge-base", END_OF_OPTIONS, trunk, branch], cwd);
    } catch {
      return git([...where, "merge-base", END_OF_OPTIONS, `origin/${trunk}`, branch], cwd);
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
      const sha = await mergeBase(["-C", top], branch).catch(quiet(`git merge-base for ${branch}`));
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
  const lookUp = async (dir, force, counted, spelled) => {
    const path = expandHome(dir);
    if (!force && resolved.has(path)) {
      return;
    }
    const found = await statEntry(path, "lookup", counted);
    if (found !== "present") {
      if (found !== "gone") {
        eventDirs.delete(dir);
      }
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
      const alias = spelled !== void 0 && normalizePath(spelled) !== normalizePath(worktree) ? spelled : void 0;
      emit({ kind: "worktree", worktree, branch, ...alias === void 0 ? {} : { alias } }, worktree);
    }
    await branchDetails(top, worktree, branch);
  };
  const localBranches = async (commonDir) => {
    let output;
    try {
      output = await git(["-C", commonDir, "for-each-ref", "--format=%(refname)", END_OF_OPTIONS, "refs/heads"]);
    } catch (error) {
      const cause = failureCause(error);
      const warning = `git for-each-ref of the branches failed (${cause}); no worktree counts as removed until it works`;
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
  const warnOnce = (warning, about) => {
    if (statWarnings.has(warning)) {
      return;
    }
    if (statWarnings.size >= MAX_WARNINGS) {
      const oldest = statWarnings.keys().next().value;
      if (oldest !== void 0) {
        statWarnings.delete(oldest);
      }
    }
    statWarnings.set(warning, about);
    options.log?.("warning", warning);
  };
  const clearWarnings = (about) => {
    for (const [warning, subject] of statWarnings) {
      if (subject === about) {
        statWarnings.delete(warning);
      }
    }
  };
  const addCheck = (path) => `add check of ${fullPath(path)}`;
  const hungStats = /* @__PURE__ */ new Map();
  const capsLogged = /* @__PURE__ */ new Set();
  const logStat = (level, message) => {
    if (!stopped) {
      options.log?.(level, message);
    }
  };
  const inWorktrees = (path) => {
    const full = fullPath(path);
    const roots = [...branches.keys()].map(fullPath);
    if (mainCheckout !== void 0) {
      roots.push(mainCheckout);
    }
    return roots.some((root) => full === root || full.startsWith(`${root}/`));
  };
  const mayStart = (target, kind) => {
    if (hungStats.has(target)) {
      return false;
    }
    const hung = [...hungStats.values()].filter((call) => call.kind === kind).length;
    if (hung < HUNG_CAPS[kind]) {
      return true;
    }
    if (!capsLogged.has(kind)) {
      capsLogged.add(kind);
      const calls = kind === "outside" ? "stats of outside directories" : "stats and realpaths of worktree paths";
      const skipped = kind === "outside" ? "no further outside directory is looked up" : "no further worktree path is checked";
      logStat("warning", `${calls} that have not answered reached the cap of ${hung}, so ${skipped} until one does`);
    }
    return false;
  };
  const within = (call) => new Promise((resolve3, reject) => {
    const { operation, kind, target, what } = call;
    const started = Date.now();
    const pending = call.run();
    const timer = setTimeout(() => {
      hungStats.set(target, { started, kind });
      logStat("warning", `${what}: ${operation} did not answer within ${STAT_TIMEOUT_MS / 1e3} s`);
      resolve3(TIMED_OUT);
    }, STAT_TIMEOUT_MS);
    timer.unref();
    const settled = (outcome) => {
      clearTimeout(timer);
      if (hungStats.delete(target)) {
        capsLogged.delete(kind);
        const seconds = Math.round((Date.now() - started) / 1e3);
        logStat("info", `the ${operation} of ${target} that did not answer in time answered after ${seconds} s: ${outcome}`);
      }
    };
    pending.then((value) => {
      settled(operation === "stat" ? "present" : "resolved");
      resolve3(value);
    }, (error) => {
      settled(error.code === "ENOENT" ? "gone" : error.message);
      reject(error);
    });
  });
  const statEntry = async (path, check, counted) => {
    const target = check === "removal" ? join(path, ".git") : path;
    const subjects2 = { removal: `whether the worktree ${path} was removed`, add: `the worktree add at ${path}`, lookup: `the directory ${path}` };
    const what = `could not check ${subjects2[check]}`;
    const outside = check === "lookup" && !inWorktrees(path);
    const kind = counted ?? (outside ? "outside" : "worktree");
    if (!mayStart(target, kind)) {
      return "refused";
    }
    try {
      if (await within({ operation: "stat", kind, target, what, run: () => statPath(target) }) === TIMED_OUT) {
        return "failed";
      }
      clearWarnings(target);
      return "present";
    } catch (error) {
      const failure = error;
      if (failure.code === "ENOENT") {
        clearWarnings(target);
        return "gone";
      }
      if (!stopped) {
        warnOnce(`${what}: ${failure.message}`, target);
      }
      return "failed";
    }
  };
  const realPathWithin = async (path) => {
    const what = `could not resolve the worktree add at ${path}`;
    const rest = [];
    let existing = fullPath(path);
    for (; ; ) {
      if (!mayStart(existing, "worktree")) {
        return void 0;
      }
      const target = existing;
      try {
        const real = await within({ operation: "realpath", kind: "worktree", target, what, run: () => realpathOf(target) });
        return real === TIMED_OUT ? void 0 : join(real, ...rest);
      } catch (error) {
        const failure = error;
        const parent = dirname(existing);
        if (failure.code !== "ENOENT" && failure.code !== "ENOTDIR") {
          if (!stopped) {
            warnOnce(`${what}: ${failure.message}`, addCheck(path));
          }
          return void 0;
        }
        if (parent === existing) {
          return void 0;
        }
        rest.unshift(basename(existing));
        existing = parent;
      }
    }
  };
  const isGone = async (path) => await statEntry(path, "removal") === "gone";
  const settleAdds = (worktree, branch) => {
    const path = fullPath(worktree);
    for (const [key, add] of pendingAdds) {
      if (add.branch !== branch) {
        continue;
      }
      if (key === path || add.real === path) {
        pendingAdds.delete(key);
      } else if (add.real === void 0) {
        add.seen.add(path);
      }
    }
  };
  const forget = (worktree, branch) => {
    const path = expandHome(worktree);
    branches.delete(worktree);
    settleAdds(worktree, branch);
    clearWarnings(fullPath(worktree));
    clearWarnings(join(fullPath(worktree), ".git"));
    clearWarnings(addCheck(worktree));
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
    const found = await statEntry(path, "add");
    if (found === "refused") {
      const waiting = "no stat started while earlier ones have not answered";
      warnOnce(`could not check the worktree add at ${path}: ${waiting}; checked again by the next sweep`, addCheck(path));
      return "undecided";
    }
    if (found !== "present") {
      return found === "gone" ? "unconfirmed" : "undecided";
    }
    const repo = await repoOf(path);
    if (repo !== "unknown") {
      return repo === "this" ? "confirmed" : "unconfirmed";
    }
    if (await statEntry(path, "add") === "gone" || namesOtherGitdir(path) || namesPrunedGitdir(path)) {
      return "unconfirmed";
    }
    warnOnce(`could not tell which repository the worktree ${path} belongs to; checked again by the next sweep`, addCheck(path));
    return "undecided";
  };
  const confirmAdds = async (retryParked) => {
    for (const [key, add] of [...pendingAdds]) {
      if (stopped) {
        return;
      }
      if (add.parked && !retryParked) {
        continue;
      }
      let verdict;
      try {
        add.real ??= await realPathWithin(add.path);
        const real = add.real ?? key;
        const known = [...branches].some(([worktree, branch]) => branch === add.branch && fullPath(worktree) === real);
        const settled = known || add.seen.has(real);
        if (add.real !== void 0) {
          add.seen.clear();
        }
        verdict = settled ? "confirmed" : await checkAdd(expandHome(add.path));
      } catch (error) {
        warnOnce(`could not check the worktree add of ${add.path}: ${error.message}`, addCheck(add.path));
        continue;
      }
      if (pendingAdds.get(key) !== add) {
        continue;
      }
      if (verdict === "undecided") {
        add.parked = true;
        continue;
      }
      if (verdict === "confirmed") {
        clearWarnings(addCheck(add.path));
        pendingAdds.delete(key);
      } else {
        try {
          emit({ kind: "worktree-removed", worktree: add.path, branch: add.branch }, add.path);
          clearWarnings(addCheck(add.path));
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
  const knownWorktree = (target) => {
    if (branches.get(target.worktree) === target.branch) {
      return target.worktree;
    }
    return [...branches].find(([, branch]) => branch === target.branch)?.[0];
  };
  const worktreeGitDir = async (top) => {
    const named = await git(["-C", top, "rev-parse", "--absolute-git-dir"]).catch(quiet(`git rev-parse in ${top}`));
    const gitDir = named === "" ? void 0 : realPath(named);
    const inside = common !== void 0 && gitDir !== void 0 && (gitDir === common || gitDir.startsWith(`${common}/worktrees/`));
    return inside ? gitDir : void 0;
  };
  const lookUpDiff = async (agentId, worktree, branch, key) => {
    const top = expandHome(worktree);
    if (!common) {
      return;
    }
    const found = await statEntry(top, "lookup");
    if (found !== "present") {
      if (found !== "gone" && attempts.get(agentId) === key) {
        attempts.delete(agentId);
      }
      return;
    }
    if (!await inThisRepo(top)) {
      return;
    }
    const gitDir = await worktreeGitDir(top);
    if (gitDir === void 0) {
      return;
    }
    const where = [`--git-dir=${gitDir}`];
    const current = await git([...where, "branch", "--show-current"], NEUTRAL_CWD).catch(quiet(`git branch in ${top}`));
    if (current !== branch) {
      return;
    }
    const base = await mergeBase(where, branch, NEUTRAL_CWD).catch(quiet(`git merge-base for ${branch}`));
    if (!base) {
      return;
    }
    let output;
    try {
      output = await git([...where, "diff", ...DIFF_OPTIONS, END_OF_OPTIONS, base, "--"], NEUTRAL_CWD);
    } catch (error) {
      quiet(`git diff of ${branch}`)(error);
      return;
    }
    if (stopped) {
      return;
    }
    const files = output.split("\0").filter((file) => file !== "");
    const total = files.length;
    const diffLine = (listed) => {
      const data = { kind: "diff", agentId, worktree, branch, files: listed, total };
      return createLine("server", "git.fact", data, { cwd: worktree, agentId });
    };
    const full = total <= PROGRESS_ITEMS_CAP ? diffLine(files) : void 0;
    const fits = full !== void 0 && Buffer.byteLength(JSON.stringify(redactValue(full))) < config.spool.maxLineBytes;
    write(fits ? full : diffLine([]));
  };
  const askDiff = (agentId, diffAt, attempt = true) => {
    if (options.diffTarget === void 0 || !common || attempts.has(agentId)) {
      return;
    }
    let target;
    try {
      target = options.diffTarget(agentId);
    } catch (error) {
      warnOnce(`the diff target of an agent could not be read: ${error.message}`);
      return;
    }
    if (target === void 0 || !isBranchName(target.branch)) {
      return;
    }
    const key = `${agentId}@${target.legAt}`;
    if (diffAt !== void 0 && diffAt >= time(target.legAt)) {
      attempts.set(agentId, key);
      return;
    }
    const worktree = attempt ? knownWorktree(target) : void 0;
    if (worktree === void 0) {
      return;
    }
    attempts.set(agentId, key);
    const { branch } = target;
    const failed = (error) => options.log?.("warning", `git diff lookup of ${branch} failed: ${error.message}`);
    queue = queue.then(() => lookUpDiff(agentId, worktree, branch, key)).catch(failed);
  };
  const observeAgent = (event) => {
    const agentId = event.agentId;
    if (agentId === void 0) {
      return;
    }
    if (event.event === "agent.start" || event.event === "agent.stop") {
      attempts.delete(agentId);
    }
    const review = event.agentType !== void 0 && roleConfig(event.agentType, config).stage === "review";
    if (!review) {
      return;
    }
    if (!live) {
      const at = time(event.at);
      historyReviewers.set(agentId, Math.max(historyReviewers.get(agentId) ?? at, at));
    } else if (event.event !== "agent.stop") {
      askDiff(agentId);
    }
  };
  const catchUpDiffs = () => {
    const now = Date.now();
    for (const [agentId, newestAt] of historyReviewers) {
      const diffAt = historyDiffs.get(agentId);
      const fresh = now - newestAt < STALE_AGENT_MS;
      if (fresh || diffAt !== void 0) {
        askDiff(agentId, diffAt, fresh);
      }
    }
    historyReviewers.clear();
    historyDiffs.clear();
  };
  const enqueue = (dir, force = false, counted, spelled) => {
    if (!live) {
      candidates.add(dir);
      return;
    }
    queue = queue.then(() => lookUp(dir, force, counted, spelled)).catch((error) => options.log?.("warning", `git lookup in ${dir} failed: ${error.message}`));
  };
  const enqueueOnce = (dir) => {
    if (!eventDirs.has(dir)) {
      eventDirs.add(dir);
      enqueue(dir);
    }
  };
  const succeeded = ({ interrupted, exitCode }) => !interrupted && (exitCode === void 0 || exitCode === 0);
  const noteAdd = (bash) => {
    const { command, cwd } = bash;
    if (!command.includes("worktree") || !succeeded(bash) || stopped || live && !common) {
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
    pendingAdds.set(fullPath(add.path), { path: add.path, branch: add.branch, parked: false, seen: /* @__PURE__ */ new Set() });
  };
  const onBash = (bash) => {
    const { command, cwd } = bash;
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
    const add = command.includes("worktree") ? worktreeAddOfCommand(command, cwd) : void 0;
    if (add) {
      const success = succeeded(bash);
      enqueue(fullPath(add.path), true, success ? "worktree" : void 0, success ? add.path : void 0);
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
          settleAdds(data.worktree, data.branch);
          if (data.alias !== void 0) {
            settleAdds(data.alias, data.branch);
          }
        } else if (data.kind === "worktree-removed") {
          forget(data.worktree, data.branch);
        } else if (data.kind === "fork") {
          forks.add(data.branch);
        } else if (data.kind === "subject") {
          subjects.add(data.branch);
        } else if (data.kind === "diff" && !live) {
          const at = time(event.at);
          historyDiffs.set(data.agentId, Math.max(historyDiffs.get(data.agentId) ?? at, at));
        }
        return;
      }
      observeAgent(event);
      if (event.src === "hook" && event.cwd) {
        enqueueOnce(event.cwd);
      }
      if (event.event === "cwd" && event.data.to) {
        enqueueOnce(event.data.to);
      }
      const bash = bashCalls.track(event);
      if (bash) {
        noteAdd(bash);
      }
      if (bash && live) {
        onBash(bash);
      }
    },
    historyView: () => ({
      branches: new Map(branches),
      forks: new Set(forks),
      subjects: new Set(subjects),
      candidates: new Set(candidates),
      eventDirs: new Set(eventDirs),
      pendingAdds: copyAdds(pendingAdds),
      statWarnings: new Map(statWarnings),
      historyReviewers: new Map(historyReviewers),
      historyDiffs: new Map(historyDiffs),
      openBash: bashCalls.view()
    }),
    restoreHistory(view) {
      refillMap(branches, view.branches);
      refillSet(forks, view.forks);
      refillSet(subjects, view.subjects);
      refillSet(candidates, view.candidates);
      refillSet(eventDirs, view.eventDirs);
      refillMap(pendingAdds, copyAdds(view.pendingAdds));
      refillMap(statWarnings, view.statWarnings);
      refillMap(historyReviewers, view.historyReviewers);
      refillMap(historyDiffs, view.historyDiffs);
      bashCalls.restore(view.openBash);
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
      catchUpDiffs();
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
  const bashCalls = createBashTracker();
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
      found = parseRemotes(await run("git", [...SAFE_GIT, "remote", "-v"], options.root, SAFE_GIT_ENV));
    } catch (error) {
      remotesCheckedAt = Number.NEGATIVE_INFINITY;
      const cause = stripControl(failureCause(error));
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
      emitStatus({ polling: false, accountOk: false, error: redactValue(`gh api user failed: ${stripControl(failureCause(error))}`) });
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
      const error = redactValue(stripControl(firstLine(broken.error ?? `gh reports the account as ${broken.state}`)));
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
      failure = stripControl(failureCause(error));
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
      const reason = stripControl(failureCause(error));
      const shown = env ? reason.replaceAll(env.GH_TOKEN, "<token>") : reason;
      emitStatus({ polling: false, activeAccount: account, accountOk: true, error: redactValue(`gh pr list failed: ${shown}`) });
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
      const bash = bashCalls.track(event);
      if (live && bash && PR_COMMAND.test(bash.command) && wanted()) {
        poll().catch(failed);
      }
    },
    historyView: () => ({ known: new Map(known), openBash: bashCalls.view() }),
    restoreHistory(view) {
      refillMap(known, view.known);
      bashCalls.restore(view.openBash);
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
var copyFiles = (files) => {
  const copies = [...files].map(([path, file]) => [path, { ...file, partial: Buffer.from(file.partial) }]);
  return new Map(copies);
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
    historyView: () => ({
      mainTranscripts: new Map(mainTranscripts),
      files: copyFiles(files),
      known: new Map(known),
      reported: new Set(reported)
    }),
    restoreHistory(view) {
      refillMap(mainTranscripts, view.mainTranscripts);
      refillMap(files, copyFiles(view.files));
      refillMap(known, view.known);
      refillSet(reported, view.reported);
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

// src/spool/replay-job.ts
import { deserialize, serialize } from "v8";

// src/facts/diff-target.ts
var diffTargetOf = (state, agentId) => {
  const homeId = ownValue(state.index.agentRuns, agentId);
  const homeRun = homeId === void 0 ? void 0 : ownValue(state.board.runs, homeId);
  const home = homeRun === void 0 ? void 0 : ownValue(homeRun.agents, agentId);
  if (home === void 0 || home.endedAt !== void 0 || home.stage !== "review") {
    return void 0;
  }
  const copies = [];
  for (const run of Object.values(state.board.runs)) {
    const agent = ownValue(run.agents, agentId);
    if (agent !== void 0) {
      copies.push({ run, agent });
    }
  }
  const first = firstWorkedCopy(state, copies);
  if (first === void 0 || first.run.branch === "" || first.run.branch === "?" || first.run.worktree === "") {
    return void 0;
  }
  return { branch: first.run.branch, worktree: first.run.worktree, legAt: home.resumedAt ?? home.startedAt };
};

// src/spool/worker-job.ts
import { existsSync as existsSync2 } from "fs";
import { Worker } from "worker_threads";
var WorkerMissingError = class extends Error {
};
var WorkerTimeoutError = class extends Error {
};
var runWorkerJob = (workerFile, job, what, options = {}) => new Promise((resolve3, reject) => {
  if (!existsSync2(workerFile)) {
    reject(new WorkerMissingError(`${workerFile} is not built yet; run pnpm build in the Nurselog package`));
    return;
  }
  if (options.signal?.aborted) {
    reject(new Error(`the ${what} was cancelled`));
    return;
  }
  const worker = new Worker(workerFile, { workerData: job });
  const { timeoutMs } = options;
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
  const timedOut = (ms) => finish(() => reject(new WorkerTimeoutError(`the ${what} worker timed out after ${ms / 1e3} s`)));
  const timer = timeoutMs === void 0 ? void 0 : setTimeout(() => timedOut(timeoutMs), timeoutMs);
  const cancel = () => finish(() => reject(new Error(`the ${what} was cancelled`)));
  options.signal?.addEventListener("abort", cancel, { once: true });
  worker.once("message", (answer) => finish(() => resolve3(answer)));
  worker.once("error", (error) => finish(() => reject(error)));
  worker.once("messageerror", (error) => finish(() => reject(error)));
  worker.once("exit", (code) => finish(() => reject(new Error(`the ${what} worker exited with code ${code} before it answered`))));
});
var describeError = (error) => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = error.code;
  return code === void 0 ? `${error.name}: ${error.message}` : `${error.name}: ${error.message} (${code})`;
};

// src/spool/replay-job.ts
var refuse = (what) => () => {
  throw new Error(`${what} is not allowed while the history is replayed`);
};
var ownBuffer = (bytes) => {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer;
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
};
var replayHistory = async (job) => {
  const { config, facts } = job;
  const logs = [];
  const named = (level, message) => logs.push({ level, message, named: true });
  const plain = (level, message) => logs.push({ level, message, named: false });
  const warn = (message) => named("warning", message);
  const store = createStore(config);
  const observers = [];
  const write = refuse("a spool write");
  const run = refuse("a command");
  const diffTarget = (agentId) => diffTargetOf(store.peek(), agentId);
  const git = facts ? createGitFacts({ config, write, run, log: plain, repoCommonDir: facts.repoCommonDir, diffTarget }) : void 0;
  const usage = facts ? createUsageFacts({ prices: facts.prices, write, log: plain }) : void 0;
  const ghWanted = facts !== void 0 && config.github.repo !== "";
  const gh = ghWanted ? createGhFacts({ config, configKind: facts.configKind, root: facts.root, write, run, log: named, wanted: () => false }) : void 0;
  if (git && usage) {
    observers.push((event) => git.observe(event), (event, payload) => usage.observe(event, payload));
  }
  if (gh) {
    observers.push((event) => gh.observe(event));
  }
  const onHistory = createHistoryHandler(store, config, observers, warn);
  const reader = createSpoolReader({ dir: job.dir, readDays: config.spool.readDays, keepDays: config.spool.keepDays, onError: warn, onLine: () => void 0, onHistory, watch: false });
  reader.readHistory(job.first);
  await git?.idle();
  const image = ownBuffer(serialize(store.image()));
  const views = git && usage ? { git: git.historyView(), usage: usage.historyView(), ...gh ? { gh: gh.historyView() } : {} } : void 0;
  return { image, handover: reader.handover(), ...views ? { views } : {}, logs };
};
var isObject = (value) => typeof value === "object" && value !== null;
var isNumber = (value) => typeof value === "number";
var isString = (value) => typeof value === "string";
var isOptionalNumber = (value) => value === void 0 || typeof value === "number";
var isSet = (value) => value instanceof Set;
var isBytes = (value) => value instanceof Uint8Array;
var isMap = (values = () => true) => (value) => value instanceof Map && [...value.values()].every(values);
var isRecord2 = (shape) => (value) => isObject(value) && Object.entries(shape).every(([key, check]) => check(value[key]));
var isPairs = (value) => Array.isArray(value) && value.every((entry) => Array.isArray(entry) && entry.length === 2);
var IMAGE = isRecord2({ committed: isObject, committedAt: isOptionalNumber, pending: Array.isArray, seen: isMap(isNumber), newestAt: isOptionalNumber, rebuiltAt: isOptionalNumber, prunedAt: isOptionalNumber, dirty: (value) => typeof value === "boolean", affectedFailures: isPairs });
var HANDOVER = isRecord2({ offsets: isMap(isNumber), identities: isMap(isString), partial: isMap(isBytes), refused: isSet, delivered: isNumber, cleanedDay: isString, failures: isMap(isString) });
var OPEN_BASH = isMap(isObject);
var VIEWS = {
  git: isRecord2({ branches: isMap(), forks: isSet, subjects: isSet, candidates: isSet, eventDirs: isSet, pendingAdds: isMap(isRecord2({ seen: isSet })), statWarnings: isMap(), historyReviewers: isMap(), historyDiffs: isMap(), openBash: OPEN_BASH }),
  usage: isRecord2({ mainTranscripts: isMap(), files: isMap(isRecord2({ partial: isBytes })), known: isMap(), reported: isSet }),
  gh: isRecord2({ known: isMap(), openBash: OPEN_BASH })
};
var LOG = isRecord2({ level: isString, message: isString, named: (value) => typeof value === "boolean" });
var readReplayAnswer = (value, producers) => {
  if (!isObject(value) || !(value.image instanceof ArrayBuffer) || !Array.isArray(value.logs) || !value.logs.every(LOG)) {
    return { problem: "its answer was malformed" };
  }
  if (!HANDOVER(value.handover)) {
    return { problem: "its reader handover was malformed" };
  }
  const views = isObject(value.views) ? value.views : {};
  const missing = Object.keys(VIEWS).filter((producer) => producers[producer] && !VIEWS[producer](views[producer]));
  if (missing.length > 0) {
    return { problem: `its ${missing.join(", ")} history view was malformed or missing` };
  }
  let image;
  try {
    image = deserialize(Buffer.from(value.image));
  } catch (error) {
    return { problem: `its store image did not deserialize (${describeError(error)})` };
  }
  if (!IMAGE(image)) {
    return { problem: "its store image was malformed" };
  }
  return { answer: value, image };
};
var runReplayJob = (workerFile, job, signal) => runWorkerJob(workerFile, job, "replay", { signal });

export {
  createLine,
  appendEvent,
  runCommand,
  createBashTracker,
  SAFE_GIT,
  SAFE_GIT_ENV,
  createGitFacts,
  PR_FIELDS,
  createGhFacts,
  loadPrices,
  priceFor,
  usdFor,
  requestOf,
  createUsageFacts,
  WorkerMissingError,
  WorkerTimeoutError,
  runWorkerJob,
  describeError,
  diffTargetOf,
  replayHistory,
  readReplayAnswer,
  runReplayJob
};
