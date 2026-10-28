// Spool helpers shared by the hook script, the CLI and the server (design sections 2.3 and 3). Plain ESM
// with Node built-ins only, so the hook works right after a clone without a build; tsup bundles this file
// into dist for the CLI and the server, and `lib.d.mts` types it for TypeScript.
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { accessSync, chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, ftruncateSync, linkSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { Agent, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FAILURE_ERROR_CHARS, keptStdout } from './verification.mjs';

export const HOOK_DEFAULTS = { spool: { dir: '~/.local/share/nurselog', maxLineBytes: 65536, keepDays: 14 } };

/** The default roles (design section 8), the one copy: `DEFAULT_CONFIG.roles` of `src/config.ts` is built from it. */
export const DEFAULT_ROLES = {
  implementer: { stage: 'build' },
  'conventions-checker': { stage: 'review', short: 'conv' },
  'code-reviewer': { stage: 'review', short: 'code' },
  'spec-reviewer': { stage: 'review', short: 'spec' },
  'typescript-reviewer': { stage: 'review', short: 'ts' },
  'silent-failure-hunter': { stage: 'review', short: 'silent' },
  'security-reviewer': { stage: 'review', short: 'security' },
  'design-reviewer': { stage: 'review', short: 'design' },
  'database-reviewer': { stage: 'review', short: 'db' },
  'pr-test-analyzer': { stage: 'review', short: 'tests' },
  'pr-shepherd': { stage: 'pr' },
  '*': { stage: 'other' },
};

/** The CLI of this package: `hooks/` and `dist/` both sit one level below the package root. */
export const CLI_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'nurselog');

/** A path the board prints no command for: a control character or a backslash could rewrite the line in a terminal. */
const UNSAFE_PATH = /[\u0000-\u001f\u007f-\u009f\\]/;
const HIDDEN_PATH = 'path hidden: it holds a control character or a backslash';

/** A shell word in single quotes, a `'` inside written as `'\''`. */
const singleQuoted = (text) => `'${text.replaceAll("'", "'\\''")}'`;

/** One POSIX shell word: bare when it holds only `[\w@%+=:,./-]`, else single-quoted with `'` as `'\''`. */
export const shellWord = (text) => (/^[\w@%+=:,./-]+$/.test(text) ? text : singleQuoted(text));

/** Line 2 of the terminal command: `nurselog install-cli` replaces or removes only a file that carries it. */
export const OWNER_LINE = '# Written by nurselog install-cli; remove it with: nurselog install-cli --remove';

/** The parent of a cache copy: a marketplace install runs from `<dir>/plugins/cache/nurselog/nurselog/<x.y.z>/`. */
const CACHE_PARENT = '/plugins/cache/nurselog/nurselog';
const VERSION_DIR = /^\d+\.\d+\.\d+$/;
/** Enough of the terminal command to hold every line of the script `install-cli` writes, its paths included. */
const TERMINAL_COMMAND_BYTES = 16 * 1024;

/** The terminal command, `~/.local/bin/nurselog` under the home directory `home` (design section 13). */
export const terminalCommandPath = (home = homedir()) => join(home, '.local', 'bin', 'nurselog');

/** The directory of the cache copies when `root` is one (`.../plugins/cache/nurselog/nurselog/<x.y.z>`), else undefined. */
export const cacheDirOf = (root) => {
  const parent = dirname(root);
  return VERSION_DIR.test(basename(root)) && parent.endsWith(CACHE_PARENT) ? parent : undefined;
};

/**
 * The line of the terminal command that names the package at `root`: from a clone `exec node '<root>/bin/nurselog' "$@"`,
 * from a cache copy `cache='<cache dir>'`, which every version directory of that cache directory shares. The script of
 * `install-cli` and `shortCommandWorks` both build it here, so they cannot drift.
 */
export const terminalCommandLine = (root) => {
  const cache = cacheDirOf(root);
  return cache === undefined ? `exec node ${singleQuoted(join(root, 'bin', 'nurselog'))} "$@"` : `cache=${singleQuoted(cache)}`;
};

/**
 * Whether a message may print the short command `nurselog <subcommand>` for the CLI at `cli` (`<root>/bin/nurselog`;
 * design section 13, "Short command"): the terminal command under `deps.home` (default the home directory) is a
 * regular file, no symbolic link, whose line 2 is the owner line and which holds the line of `root`
 * (`terminalCommandLine`) as a whole line, and it is the first `nurselog` that `deps.path` (default `PATH`) finds,
 * leaving out the package's own `bin/`, which is on the Bash tool's PATH only. A home that is no absolute path (an
 * empty or relative HOME) and any failure of the look-up give false, the long form; it never throws.
 */
export const shortCommandWorks = (cli, deps = {}) => {
  try {
    const home = deps.home ?? homedir();
    if (!isAbsolute(home)) {
      return false;
    }
    const target = resolve(terminalCommandPath(home));
    const lines = readSmallFile(target, TERMINAL_COMMAND_BYTES, { head: true }).split('\n');
    if (lines[1] !== OWNER_LINE || !lines.includes(terminalCommandLine(dirname(dirname(cli))))) {
      return false;
    }
    const ownBin = resolve(dirname(cli));
    const entries = (deps.path ?? process.env.PATH ?? '').split(delimiter).filter((entry) => isAbsolute(entry) && resolve(entry) !== ownBin);
    const found = resolveCommand('nurselog', entries.join(delimiter));
    return found !== undefined && resolve(found) === target;
  } catch {
    return false;
  }
};

/**
 * `node <cli> <subcommand> --repo <root>`, or without `--repo` when `root` is undefined, as shell words that run from
 * any directory (design section 9); when `short` (by default `shortCommandWorks(cli)`) the short command
 * `nurselog <subcommand>`, which holds no plugin path. When a printed path holds a control character or a backslash it
 * never echoes that path: it says, as a sentence, to run the subcommand (in the repository directory, when there is a
 * root) instead.
 */
export const cliCommand = (root, subcommand, cli = CLI_PATH, short = shortCommandWorks(cli)) => {
  const where = root === undefined ? '' : ' in the repository directory';
  if (!short && UNSAFE_PATH.test(cli)) {
    return `run node with bin/nurselog of the Nurselog plugin: ${subcommand}${where} (${HIDDEN_PATH})`;
  }
  const program = short ? 'nurselog' : `node ${shellWord(cli)}`;
  if (root === undefined) {
    return `${program} ${subcommand}`;
  }
  if (UNSAFE_PATH.test(root)) {
    return `run ${program} ${subcommand}${where} (${HIDDEN_PATH})`;
  }
  return `${program} ${subcommand} --repo ${shellWord(root)}`;
};

/** The command that starts the one board from any directory; it needs no `--repo` (design section 9). */
export const startCommand = (cli = CLI_PATH, short = shortCommandWorks(cli)) => cliCommand(undefined, 'start', cli, short);

/** The line `emit`, a live `start` and `status` print in a repository without a config (design section 8). */
export const notSetUpMessage = (cli = CLI_PATH, short = shortCommandWorks(cli)) => {
  if (!short && UNSAFE_PATH.test(cli)) {
    return `Nurselog is not set up for this repository; run init of bin/nurselog in the Nurselog plugin with node (${HIDDEN_PATH})`;
  }
  return `Nurselog is not set up for this repository; run: ${cliCommand(undefined, 'init', cli, short)}`;
};

/** Removes control characters from a text built from config or repository values before it is printed. */
export const stripControl = (text) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

/**
 * `stripControl` per line, the lines kept apart by `\n` and the later ones indented, so `fatal: x\nhint: y` stays two
 * lines and no message can start a line of its own that looks like a log entry; a `\r` is still removed.
 */
export const stripControlLines = (text) => text.split('\n').map(stripControl).join('\n  ');

export const STATE_FILE_WARNING = 'server.stateFile is no longer used and is ignored; the board writes ~/.local/share/nurselog/server.json';
/** A config no longer chooses the port (design section 9). */
export const SERVER_PORT_WARNING = 'server.port is ignored: one board serves every repository, on 6767 or --port';

export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const expandHome = (path) => (path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path);

/** Replaces the home directory with `~` wherever it appears in a text. */
export const tildeHome = (text) => {
  const home = homedir();
  if (!home || home === '/' || !text.includes(home)) {
    return text;
  }
  return text.replace(new RegExp(`${escapeRegExp(home)}(?![\\w.-])`, 'g'), '~');
};

const findDotGit = (start) => {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, '.git');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
};

/** The worktree top level that holds `start`: the directory of the first `.git` found walking up, without running git. */
export const repositoryRoot = (start) => {
  const dotGit = findDotGit(start);
  return dotGit ? dirname(dotGit) : undefined;
};

/** The size cap of a config, `prices.json` and a workspace file (design section 8). */
export const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_GIT_FILE_BYTES = 4096;

/**
 * Reads a small regular file (design section 8): the open follows no final symlink and never blocks on a FIFO, and
 * the file must be a regular file of at most `maxBytes`, else it throws. With `head` a longer file is not refused;
 * only its first `maxBytes` are read. A config linked to `/dev/zero` costs one `open`, not a read without end.
 */
export const readSmallFile = (path, maxBytes, { head = false } = {}) => {
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
    return buffer.toString('utf8', 0, length);
  } finally {
    closeSync(fd);
  }
};

const readGitFile = (path) => {
  try {
    return readSmallFile(path, MAX_GIT_FILE_BYTES);
  } catch {
    return undefined;
  }
};

/**
 * The git common directory without running git: `.git` is the directory itself or a `gitdir:` file. The git dir
 * of a `gitdir:` file is the common directory unless it holds a `commondir` file (a linked worktree), so a
 * `--separate-git-dir` clone and a submodule get a hash of their own.
 */
export const gitCommonDir = (start) => {
  const dotGit = findDotGit(start);
  if (!dotGit) {
    return undefined;
  }
  if (statSync(dotGit).isDirectory()) {
    return realpathSync(dotGit);
  }
  const match = /^gitdir:\s*(.+)$/m.exec(readGitFile(dotGit) ?? '');
  if (!match) {
    return undefined;
  }
  const gitDir = resolve(dirname(dotGit), match[1].trim());
  const commonDir = readGitFile(join(gitDir, 'commondir'))?.trim();
  const common = commonDir ? resolve(gitDir, commonDir) : gitDir;
  return existsSync(common) ? realpathSync(common) : common;
};

/** First 12 hex characters of the SHA-256 of the git common directory, so all worktrees of a clone share one spool. */
export const repoHash = (start) => createHash('sha256').update(gitCommonDir(start) ?? resolve(start)).digest('hex').slice(0, 12);

const DEFAULT_SPOOL_ROOT = HOOK_DEFAULTS.spool.dir;

/** `~/.local/share/nurselog`: the default root, which holds `server.json` and one `<repo-hash>` directory per repository. */
export const defaultRoot = () => expandHome(DEFAULT_SPOOL_ROOT);

/** `~/.local/share/nurselog/<repo-hash>`: the user config and the repository record, also when `spool.dir` moves the day files. */
const userDirFor = (root) => join(defaultRoot(), repoHash(root));

/** The user config of a repository (design section 8). */
export const userConfigPath = (root) => join(userDirFor(root), 'nurselog.config.json');

/** `~/.local/share/nurselog/server.json`: the state file of the one board of all repositories (design section 9). */
export const serverStatePath = () => join(defaultRoot(), 'server.json');

const lstatOrUndefined = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
};

/** The entry at `path`, undefined only when it is missing: a path that cannot be read (EACCES, ELOOP, ENOTDIR) throws. */
const lstatIfPresent = (path) => lstatSync(path, { throwIfNoEntry: false });

/**
 * A file of a `<repo-hash>` directory (the user config, the repository record) and that directory are refused when
 * they are a symlink or belong to another user (design section 3).
 */
const checkOwnedFile = (path) => {
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

/** The worktree that holds `start` and the main checkout of its repository, found without running git. */
const repositoryRoots = (start) => {
  const dotGit = findDotGit(start);
  if (!dotGit) {
    return [];
  }
  const common = gitCommonDir(start);
  const main = common && basename(common) === '.git' ? [dirname(common)] : [];
  return [dirname(dotGit), ...main];
};

/**
 * The config of a repository (design section 8): the user config when it exists, else the repository config
 * `nurselog.config.json` of the worktree, else that of the main checkout of the same clone, else undefined. The
 * first repository config found must be a regular file (no symlink) within `MAX_CONFIG_BYTES`; any other file
 * leaves the repository inactive. Throws when the user config cannot be looked up (EACCES on a parent, for one; only a
 * missing file is no user config) or fails the path checks.
 */
export const findConfig = (root) => {
  const user = userConfigPath(root);
  if (lstatIfPresent(user)) {
    checkOwnedFile(user);
    return { path: user, kind: 'user' };
  }
  const roots = repositoryRoots(root);
  const candidates = (roots.length > 0 ? roots : [resolve(root)]).map((dir) => join(dir, 'nurselog.config.json'));
  for (const path of candidates) {
    const stat = lstatOrUndefined(path);
    if (stat) {
      return stat.isFile() && stat.size <= MAX_CONFIG_BYTES ? { path, kind: 'repository' } : undefined;
    }
  }
  return undefined;
};

/** Keys honoured only from the user config (design section 8): a repository config may not set the spool or the prices. */
export const userOnlyWarning = (key) => `${stripControl(key)} is honoured only in the user config and is ignored here; the default is used`;

/**
 * Removes the keys only a user config may set (decision C11: the whole `spool` section and `pricesFrom`; ADR-0010:
 * `insights.keepDays`, the other `insights` keys stay) from a parsed repository config and returns their names,
 * `spool.<key>` for each key of the section.
 */
export const dropUserOnlyKeys = (file) => {
  const dropped = [];
  if ('spool' in file) {
    const keys = isObject(file.spool) ? Object.keys(file.spool).map((key) => `spool.${key}`) : ['spool'];
    dropped.push(...keys);
    delete file.spool;
  }
  if ('pricesFrom' in file) {
    delete file.pricesFrom;
    dropped.push('pricesFrom');
  }
  if (isObject(file.insights) && 'keepDays' in file.insights) {
    delete file.insights.keepDays;
    dropped.push('insights.keepDays');
  }
  return dropped;
};

const isInside = (path, dir) => path === dir || path.startsWith(`${dir}${sep}`);

/** The largest `spool.readDays` a config may set. */
export const MAX_READ_DAYS = 365;

/** Integer ranges of the spool settings (decision C10); an absent key is not checked. */
const SPOOL_RANGES = [
  ['keepDays', 1, 3650],
  ['readDays', 1, MAX_READ_DAYS],
  ['maxLineBytes', 1024, 1048576],
];

/** Problems of `spool.dir`: absolute or `~/`, not the home or root directory and not inside the repository. */
const spoolDirProblems = (dir, projectDir) => {
  if (typeof dir !== 'string' || !(isAbsolute(dir) || dir === '~' || dir.startsWith('~/'))) {
    return ['spool.dir must be an absolute or ~/ path'];
  }
  const problems = [];
  const root = resolve(expandHome(dir));
  if (root === resolve(homedir()) || root === parse(root).root) {
    problems.push('spool.dir must not be the home or root directory');
  }
  if (projectDir && repositoryRoots(projectDir).some((repo) => isInside(root, resolve(repo)))) {
    problems.push('spool.dir must not be inside the repository');
  }
  return problems;
};

/**
 * Problems of the spool settings of a config (design section 8), shared by the hook, the CLI and the server:
 * the `spool.dir` path rules and the integer ranges of `keepDays`, `readDays` and `maxLineBytes`.
 */
export const hookConfigProblems = (config, projectDir) => {
  const problems = spoolDirProblems(config.spool?.dir, projectDir);
  for (const [key, min, max] of SPOOL_RANGES) {
    const value = config.spool?.[key];
    if (value !== undefined && !(Number.isInteger(value) && value >= min && value <= max)) {
      problems.push(`spool.${key} must be an integer from ${min} to ${max}`);
    }
  }
  return problems;
};

/** The text of a config found by `findConfig`; a repository config that fails the read is no config, a user config throws. */
const readConfigText = (found) => {
  try {
    return readSmallFile(found.path, MAX_CONFIG_BYTES);
  } catch (error) {
    if (found.kind === 'user') {
      throw error;
    }
    return undefined;
  }
};

const parseObject = (text) => {
  try {
    const value = JSON.parse(text);
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
};

/**
 * The roles of a config file merged over `DEFAULT_ROLES` the way `loadConfig` merges them (role by role, key by key),
 * in an object without a prototype, so an agent type such as `constructor` names no role. A `roles` that is not an
 * object is ignored.
 */
const mergeRoles = (roles) => {
  const merged = Object.assign(Object.create(null), DEFAULT_ROLES);
  for (const [type, role] of Object.entries(isObject(roles) ? roles : {})) {
    merged[type] = isObject(role) && isObject(merged[type]) ? { ...merged[type], ...role } : role;
  }
  return merged;
};

/**
 * The spool settings and the roles of the config `findConfig` finds for the repository at `root`, over the defaults,
 * and `found` (undefined: the repository is inactive). A repository config that cannot be read within the size cap
 * leaves the repository inactive, and its `spool` section and `pricesFrom` are ignored with a warning (decisions
 * C10 and C11). When `hookConfigProblems` finds a problem, the spool settings fall back to the defaults, so a config
 * never makes the hook write elsewhere, and `problems` lists why. `warnings` names keys that are ignored. Throws
 * when the user config fails the path checks or the read.
 */
export const readHookConfig = (root) => {
  const located = findConfig(root);
  const text = located ? readConfigText(located) : undefined;
  const found = text === undefined ? undefined : located;
  const file = text === undefined ? {} : parseObject(text);
  const dropped = found?.kind === 'repository' ? dropUserOnlyKeys(file) : [];
  const stateFile = isObject(file.server) && file.server.stateFile !== undefined ? [STATE_FILE_WARNING] : [];
  const port = isObject(file.server) && file.server.port !== undefined ? [SERVER_PORT_WARNING] : [];
  const warnings = [...stateFile, ...port, ...dropped.map(userOnlyWarning)];
  const spool = { ...HOOK_DEFAULTS.spool, ...(isObject(file.spool) ? file.spool : {}) };
  const roles = mergeRoles(file.roles);
  const problems = hookConfigProblems({ spool }, root);
  if (problems.length === 0) {
    return { spool, roles, found, warnings };
  }
  return { spool: { ...HOOK_DEFAULTS.spool }, roles, found, warnings, problems };
};

/**
 * The `keepDays` of `section` (`spool`, else `insights` for the session aggregates) in the config file at `path` (an
 * integer from 1 to 3650 for both), or undefined when the file is missing or sets none. The board reads an orphaned
 * spool directory's own `nurselog.config.json` this way (design section 3, "Retention"), and fails closed: it throws
 * when the file cannot be looked up (EACCES on a parent, for one; only a missing file gives undefined), the file or
 * its directory is a symlink or another user's, the file cannot be read within `MAX_CONFIG_BYTES`, it is no JSON
 * object, or its `keepDays` is out of range.
 */
export const configKeepDays = (path, section = 'spool') => {
  if (lstatIfPresent(path) === undefined) {
    return undefined;
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
  const keepDays = Object.hasOwn(file, section) && isObject(file[section]) ? file[section].keepDays : undefined;
  if (keepDays === undefined) {
    return undefined;
  }
  const [, min, max] = SPOOL_RANGES.find(([key]) => key === 'keepDays');
  if (!(Number.isInteger(keepDays) && keepDays >= min && keepDays <= max)) {
    throw new Error(`${path}: ${section}.keepDays must be an integer from ${min} to ${max}`);
  }
  return keepDays;
};

/** The stage of an agent type (design section 8): its own role in `config.roles`, else the `*` fallback, else `other`. */
export const roleStage = (config, agentType) => {
  const role = Object.hasOwn(config.roles, agentType) ? config.roles[agentType] : config.roles['*'];
  return isObject(role) && typeof role.stage === 'string' ? role.stage : 'other';
};

/** `<spool.dir>/<repo-hash>`. */
export const spoolDirFor = (config, projectDir) => join(resolve(projectDir, expandHome(config.spool.dir)), repoHash(projectDir));

const pad = (value) => String(value).padStart(2, '0');

/** Local calendar day `YYYY-MM-DD`. */
export const localDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const spoolFileFor = (dir, at) => join(dir, `events-${localDay(new Date(at))}.ndjson`);

export const newLineId = () => `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;

/* ---------- redaction (design section 2.3) ---------- */

const REDACTED = '[redacted]';
/** Object keys whose value is a secret; `*_id`, `*tokens` and `*Chars` (counts) are not. */
const SECRET_KEY = /(token|secret|passw|passphrase|api[_-]?key|private[_-]?key|access[_-]?key|authorization|cookie|credential|signature|bearer|(^|[_-])(pass|pwd|auth|session|salt|jwt|dsn|pat)$|^x-auth|(database|redis|smtp|mongo(db)?|amqp)[_-]?ur[il]$)/i;
const SAFE_KEY = /(_id|tokens|chars)$/i;
/** Names in `NAME=value` text, env-style `NAME: value` labels, and pair names under `headers` or `env`. */
const SECRET_NAME = /(TOKEN|SECRET|KEY|PASS|PWD|AUTH|COOKIE|CREDENTIAL|PRIVATE|DSN|SALT|SESSION|SIGNATURE|SIGNING|JWT|BEARER|[_-]UR[LI]$)/i;
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
/** Last word of a `name: value` label or a pair name that makes it secret; `key`, `pass`, `auth` and `session` alone are prose. */
const SECRET_WORDS = new Set(['password', 'passwd', 'passphrase', 'pwd', 'secret', 'token', 'apikey', 'credential', 'credentials', 'cookie', 'authorization', 'bearer', 'dsn', 'jwt']);
const SECRET_WORD_PAIRS = new Set(['api key', 'private key', 'access key', 'secret key', 'signing key', 'encryption key']);
const PASSWORD_WORDS = new Set(['password', 'passwd', 'passphrase', 'pwd']);
const ENV_LABEL = /^[A-Z][A-Z0-9_]+$/;
const PAIR_TOKEN = /^[A-Za-z0-9_-]+$/;
const PAIR_PARENT = /^(?:headers|env)$/i;
const GIT_SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const TOKEN_PATTERNS = [
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
  /\bdiscord(?:app)?\.com\/api\/(?:v\d{1,2}\/)?webhooks\/\d{6,}\/[A-Za-z0-9_-]{20,}/g,
];
/* Every open-ended run before a fixed part is bounded ({0,256}): unbounded, a long run of near matches is quadratic. */
const URL_USERINFO = /\b([a-z][a-z0-9+.-]{0,31}:\/\/)([^\s/@:"'<>]*):([^\s/@"'<>]+)@/gi;
/** `https://<token>@host`, the form of a Sentry DSN and of a token in a clone URL: 20+ word characters before the `@`, no colon. */
const URL_TOKEN_USERINFO = /\b([a-z][a-z0-9+.-]{0,31}:\/\/)([A-Za-z0-9_-]{20,})(?=@)/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const HEADER = /\b((?:proxy-)?authorization|set-cookie|cookie|(?<![\w-])x-[\w-]{0,256}?(?:key|token|auth|secret|session)[\w-]{0,256})(\s*:\s*)(?!\s*(?:Bearer|Basic)\s|\s*\[redacted\])[^\r\n"']+/gi;
/** A flag whose value names a file, a mode or an identifier, not the secret itself: `--password-file path`, `--auth-type oauth`. */
const SAFE_FLAG = /-(?:stdin|file|path|env|prompt|type|mode|method|provider|scheme|flow|strategy|url|uri|id|name|arn)$/i;
const CLI_CREDENTIALS = [
  [/(\bcurl\b[^\n;&|]{0,256}?\s(?:-u|--user)[\s=]*["']?)([^\s:"']*):([^\s"']+)/g, `$1$2:${REDACTED}`],
  [/(\bcurl\b[^\n;&|]{0,256}?\s(?:-b|--cookie)[\s=]+)("[^"]*"|'[^']*'|\S+)/g, `$1${REDACTED}`],
  [/(\bmysql(?:dump|admin)?\b[^\n;&|]{0,256}?\s-p)[^\s-]\S*/g, `$1${REDACTED}`],
  [/(--[\w-]{0,40}(?:password|passwd|passphrase|pwd|secret|token(?!s|iz)|api-?key|access-?key|auth(?!or)|credential)[\w-]{0,40}|--pass)([ \t]+)(?![-|;&<>=:])("[^"]*"|'[^']*'|\S+)/gi, (match, flag, space) => (SAFE_FLAG.test(flag) ? match : `${flag}${space}${REDACTED}`)],
  [/(\b(?:docker|az)\s+login\b[^\n;&|]{0,256}?\s-p[ \t]+|\bsshpass\b[^\n;&|]{0,256}?\s-p[ \t]*|\bredis-cli\b[^\n;&|]{0,256}?\s-a[ \t]+|\bsecurity\b[^\n;&|]{0,256}?\s-w[ \t]+|\bsecurity\s+unlock-keychain\b[^\n;&|]{0,256}?\s-p[ \t]+)(?![-|;&<>])("[^"]*"|'[^']*'|\S+)/g, `$1${REDACTED}`],
  [/(\baws\s+configure\s+set\s+)([\w.-]{1,256})([ \t]+)(?![-|;&<>])("[^"]*"|'[^']*'|\S+)/gi, (match, lead, name, space) => (/secret|token|passw/i.test(name) ? `${lead}${name}${space}${REDACTED}` : match)],
  [/(\b(?:npm|pnpm|yarn)\s+config\s+set\s+(?:-\S+\s+){0,8})(\S{1,256})([ \t]+)(?![-|;&<>])("[^"]*"|'[^']*'|\S+)/gi, (match, lead, name, space) => (/auth|token|passw|secret/i.test(name) ? `${lead}${name}${space}${REDACTED}` : match)],
];
const LONG_RUN = /(?<![\w+/.~-])[A-Za-z0-9+/]{40,}={0,2}(?![\w+/=.~-])/g;
/*
 * The separator takes horizontal whitespace only, so a label at the end of a line never swallows the next line's label.
 * A name (or the dashes of a flag before it) follows no word character, dot or dash, whatever else leads it (`#`, `[`,
 * `/`, `<`, `$`), so `x-x-x-` is not rescanned at every dash.
 */
const ASSIGNMENT = /(?<![\w.-])(-{0,2})([A-Za-z_][\w.-]{0,256})(["']?[ \t]*[:=][ \t]*)(?!\[redacted\]|(?:Bearer|Basic)\s)("[^"]*"|'[^']*'|[^\s;&|)`,"'}?]{1,256})/g;
const VALUE_REST = /[^\s;&|)`,"'}?]*/y;
/** Exactly 40 base64 characters without padding (an AWS secret access key), redacted whatever its slash count. */
const SECRET_KEY_RUN = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])/g;
/** A YAML label line whose value is empty or a block indicator (`|`, `>`, with `-`, `+` or digit modifiers), a comment allowed. */
const YAML_BLOCK_LABEL = /^([ \t]*)((?:-[ \t]+)?)(["']?)([A-Za-z_][\w.-]{0,256})(["']?[ \t]*:)[ \t]*(?:[|>][-+0-9]{0,2}[ \t]*)?(?:#[^\r\n]*)?(\r?)$/;
const BLANK_LINE = /^[ \t]*\r?$/;
/** What leads a shell assignment `NAME=value` in a command: the start, whitespace, a separator, a quote or a brace. */
const SHELL_LEAD = /[\s;&|(`:"'?,{=]/;
const VENDOR_RUN = /\b[a-z]{2,10}(?:_[a-z0-9]{1,8})?[_-]([A-Za-z0-9]{30,})\b/g;
const BASE64_LINE = /^[A-Za-z0-9+/]{60,76}={0,2}[ \t]*\r?$/;
const HEX_RUN = /^[0-9a-f]+$/;
/** The longest string the regexes see (a longer one is cut first) and the deepest nesting `redactValue` and `capStrings` keep. */
export const MAX_REDACT_CHARS = 256 * 1024;
/** The string characters of one payload or line the regexes see in total (`budgetStrings`), so both redaction passes are bounded. */
export const MAX_PAYLOAD_CHARS = 1024 * 1024;
export const MAX_DEPTH = 32;
const TRUNCATED = '[truncated]';

const isTokenRun = (run) => /[A-Za-z]/.test(run) && /\d/.test(run) && (run.match(/\//g) ?? []).length < 2;

/**
 * A 40-character run that is a key, not a path: an upper-case letter, a lower-case letter and a digit, and a part
 * between slashes with a digit before a letter, which `packages/App/src/Button2024` lacks and a random key almost
 * always has (all but about 0.03 % of them).
 */
const isSecretKeyRun = (run) => {
  const mixed = /[A-Z]/.test(run) && /[a-z]/.test(run) && /\d/.test(run);
  return mixed && !run.split('/').every((part) => /^[A-Za-z]*\d*$/.test(part));
};

/** Cuts a string over `MAX_REDACT_CHARS` at the last whitespace of its final KiB (else at the limit) before the regexes run. */
const boundText = (text) => {
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

/** Two or more consecutive base64 lines of 60 to 76 characters (the body of a PEM block whose BEGIN line is missing) become one `[redacted]`. */
const redactBase64Lines = (text) => {
  if (!text.includes('\n')) {
    return text;
  }
  const lines = text.split('\n');
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
  return kept.join('\n');
};

const indentOf = (line) => /^[ \t]*/.exec(line)[0].length;

/**
 * The value of a secret YAML label that is empty or a block indicator (`password: |`, `token: >-`, `password:` with
 * the value on the next line) becomes `[redacted]` on the label's line, and the more-indented lines after it (blank
 * lines between them included) are dropped. A label that names no secret (`stringData:`, `env:`) keeps its nesting.
 */
const redactYamlBlocks = (text) => {
  if (!text.includes('\n')) {
    return text;
  }
  const lines = text.split('\n');
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
  return kept.join('\n');
};

/** `apiKey`, `api_key`, `X-Api-Key` and `db.password` as lower-case words. */
const labelWords = (name) => name.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_.-]+/).filter(Boolean);

/** A label naming a secret: an env-style name with a secret part, or a name whose last word (or last two) is a secret word. */
const isSecretLabel = (name) => {
  if (ENV_LABEL.test(name)) {
    return SECRET_NAME.test(name);
  }
  const words = labelWords(name);
  return SECRET_WORDS.has(words.at(-1)) || SECRET_WORD_PAIRS.has(words.slice(-2).join(' '));
};

/**
 * `NAME=value`: a secret name part, `sig=` (an Azure SAS signature, never `sig = x` of code), or any upper-case name in a
 * shell command. `name: value`: a secret label
 * and a value shaped like one (quoted, 8+ characters, or any word after a password label), so prose such as
 * `Issue key: PROJ-1`, `Passed: 143 tests` or `Pass: all` stays.
 */
const isSecretAssignment = (name, separator, value, command) => {
  if (separator.includes('=')) {
    return (command && ENV_NAME.test(name)) || SECRET_NAME.test(name) || (separator === '=' && /^sig$/i.test(name));
  }
  const shaped = /^["']/.test(value) || value.length >= 8 || PASSWORD_WORDS.has(labelWords(name).at(-1));
  return shaped && isSecretLabel(name);
};

/** The name of a `[name, value]` or `{ name, value }` pair: any secret part under `headers` or `env`, elsewhere one secret token. */
const isSecretPairName = (name, parent) => {
  if (PAIR_PARENT.test(parent)) {
    return SECRET_NAME.test(name);
  }
  return PAIR_TOKEN.test(name) && isSecretLabel(name);
};

/**
 * Redacts the value of every secret `name=value` and `name: value` pair. After a pair whose name is not a secret and whose
 * value holds a `:` or `=` the scan resumes at the start of that value, so `name: password: x` is seen too; a secret value cut by the 256-character bound of
 * the pattern is redacted to its end. A pair inside the value of another is not a shell assignment, nor is a name led by
 * anything but a flag's dashes or `SHELL_LEAD` (`$_ = x`, `'^HOME='`), so the upper-case `NAME=value` rule of a command
 * does not apply to them.
 */
const redactAssignments = (text, command) => {
  let result = '';
  let copied = 0;
  let inside = 0;
  ASSIGNMENT.lastIndex = 0;
  for (let match = ASSIGNMENT.exec(text); match !== null; match = ASSIGNMENT.exec(text)) {
    const [whole, lead, name, separator, value] = match;
    let end = match.index + whole.length;
    const shellName = lead !== '' || match.index === 0 || SHELL_LEAD.test(text[match.index - 1]);
    if (!isSecretAssignment(name, separator, value, command && shellName && match.index >= inside)) {
      if (/[:=]/.test(value)) {
        ASSIGNMENT.lastIndex = end - value.length - 1;
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
    ASSIGNMENT.lastIndex = end;
  }
  return result + text.slice(copied);
};

/**
 * Redacts one string: the home directory becomes `~`; PEM blocks, token-shaped substrings, URL passwords,
 * credential headers and arguments, and the values of secret `NAME=value` and `name: value` pairs become
 * `[redacted]`. In a shell command (`command`) every upper-case `NAME=value` keeps the name only.
 */
export const redactString = (text, command = false) => {
  let result = tildeHome(boundText(text));
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  result = redactBase64Lines(result);
  result = redactYamlBlocks(result);
  result = result.replace(URL_USERINFO, `$1$2:${REDACTED}@`);
  result = result.replace(URL_TOKEN_USERINFO, (match, scheme, token) => (isTokenRun(token) ? `${scheme}${REDACTED}` : match));
  result = result.replace(BEARER, `$1 ${REDACTED}`);
  result = result.replace(HEADER, `$1$2${REDACTED}`);
  for (const [pattern, replacement] of CLI_CREDENTIALS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(VENDOR_RUN, (match, run) => (isTokenRun(run) && !HEX_RUN.test(run) ? REDACTED : match));
  result = result.replace(LONG_RUN, (run) => (isTokenRun(run) ? REDACTED : run));
  result = result.replace(SECRET_KEY_RUN, (run) => (isSecretKeyRun(run) ? REDACTED : run));
  return redactAssignments(result, command);
};

const NAME_FIELDS = ['name', 'key', 'Name', 'Key', 'header'];
const VALUE_FIELDS = new Set(['value', 'Value', 'val']);
const isSecretKey = (key) => SECRET_KEY.test(key) && !SAFE_KEY.test(key);

/** The plugin's marker tools (design section 2.4); their short text carries a new question's id. */
const MARKER_TOOL = /^mcp__plugin_nurselog_nurselog__(plan|gate|question)$/;

/** True for the name of the `plan` marker tool. */
const isPlanTool = (name) => typeof name === 'string' && MARKER_TOOL.exec(name)?.[1] === 'plan';

/**
 * Where a field of `value` stands on the way to the stream ids of a plan marker (design section 2.3), from the scope of
 * `value`: `root` is the value `redactValue` starts on, an envelope or a hook payload; `payload` the payload of a hook
 * line; `input` the `tool_input` of the plan marker tool directly under such a payload, or the `data` of a CLI `plan`
 * line directly under the envelope; `streams` its `streams`, `stream` one item of that and `after` the item's `after`.
 * Every other field is `none`, so the exemption reaches no other field, no deeper object and no marker shape nested in
 * another tool's input.
 */
const fieldScope = (value, field, scope) => {
  if (scope === 'root' && field === 'data') {
    return value.src === 'cli' && value.event === 'plan' ? 'input' : 'none';
  }
  if (scope === 'root' && field === 'payload') {
    return value.src === 'hook' ? 'payload' : 'none';
  }
  if ((scope === 'root' || scope === 'payload') && field === 'tool_input') {
    return isPlanTool(value.tool_name) ? 'input' : 'none';
  }
  if (scope === 'input' && field === 'streams') {
    return 'streams';
  }
  return scope === 'stream' && field === 'after' ? 'after' : 'none';
};

/**
 * Deep copy with every kept string redacted. A value under a secret-looking key becomes `[redacted]`, so
 * does the value of a `{ name, value }` object or a `[name, value]` pair with a secret name (one secret
 * token, or any secret part under `headers` or `env`); array items carry their parent's key. A git sha under `sha` stays.
 * `scope` (`fieldScope`) marks the stream ids of a plan marker in `streams[].after`, which get only the string
 * redaction; a caller that holds the input of a plan marker itself, as `hooks/markers.mjs` does, passes `input`. An object
 * or array nested `MAX_DEPTH` levels deep becomes `[truncated]`, so a hostile payload cannot overflow the stack.
 */
export const redactValue = (value, key = '', scope = 'root', depth = 0) => {
  if (key && isSecretKey(key) && value !== null && value !== undefined && typeof value !== 'boolean') {
    return REDACTED;
  }
  if (typeof value === 'string') {
    return key === 'sha' && GIT_SHA.test(value) ? value : redactString(value, key === 'command');
  }
  if (value && typeof value === 'object' && depth >= MAX_DEPTH) {
    return TRUNCATED;
  }
  if (Array.isArray(value)) {
    const pair = value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string';
    if (pair && scope !== 'after' && isSecretPairName(value[0], key)) {
      return [redactString(value[0]), REDACTED];
    }
    const itemScope = scope === 'streams' ? 'stream' : 'none';
    return value.map((item) => redactValue(item, key, itemScope, depth + 1));
  }
  if (value && typeof value === 'object') {
    const name = NAME_FIELDS.map((field) => value[field]).find((item) => typeof item === 'string');
    const secretPair = name !== undefined && isSecretPairName(name, key);
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

/* ---------- minimisation (design sections 2.2 and 2.3) ---------- */

/** Commands that print secrets: their output is never kept. */
const SECRET_COMMANDS = /\bprintenv\b|(?:^|[;&|(]\s*)env\b|\bsecrets versions access\b|\bauth (?:print-access-)?token\b|\bfind-generic-password\b/;
/** Paths whose content is never kept: env files, npm and netrc credentials, keys, `gh` hosts, anything named secret. */
const SECRET_PATH = /(?:^|[\s/'"=:])(?:\.env(?:\.[\w.-]{0,256})?|\.npmrc|\.netrc|[\w.-]{0,256}\.pem|[\w.-]{0,256}\.key|id_[\w.-]{1,256}|credentials[\w.-]{0,256}|hosts\.yml|[\w.-]{0,256}secret[\w.-]{0,256})(?=$|[\s/'";|&)])/i;
const PATH_FIELDS = ['file_path', 'notebook_path', 'path', 'pattern', 'glob'];
/** In command text only words that name a file count, so a PR title or a branch with `secret` in it keeps its output. */
const COMMAND_WORD_SEPARATOR = /[\s'"=;|&()<>`,]+/;
const SECRET_FILE_NAME = /^(?:\.env(?:\.[\w.-]+)?|\.npmrc|\.netrc|hosts\.yml|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$|.\.env$|\.(?:pem|key)$/;
const SECRET_DIRECTORY = /^\.?secrets?$/;
const BODY_FIELDS = ['content', 'new_string', 'old_string', 'new_source'];
const RESPONSE_SCALARS = ['is_error', 'exitCode', 'exit_code', 'interrupted', 'isAsync', 'agentId', 'status', 'resolvedModel'];
const ERROR_LINE = 300;
const MARKER_TEXT = 300;
/** The characters an AskUserQuestion answer keeps of its question, its answer and its notes, each (design section 2.3). */
const ANSWER_TEXT = 500;
/** The answers of one AskUserQuestion call the hook keeps. */
const ANSWERS_CAP = 10;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One word of a command names a secret file: a denylisted file name, a `secret(s)` directory on its path,
 * `*secret*` with an extension or as a dotfile, or `credentials*` after a directory or with an extension.
 */
const isSecretFileWord = (word) => {
  const directories = word.toLowerCase().split('/');
  const file = directories.pop();
  const extension = /\.\w+$/.test(file);
  if (SECRET_FILE_NAME.test(file) || directories.some((directory) => SECRET_DIRECTORY.test(directory))) {
    return true;
  }
  if (file.includes('secret')) {
    return extension || file.startsWith('.');
  }
  return file.startsWith('credentials') && (extension || directories.length > 0);
};

/** The tool input touches a denylisted path, names a secret file in its command, or runs a secret-printing command. */
export const touchesSecret = (input) => {
  const secretPath = PATH_FIELDS.some((field) => typeof input[field] === 'string' && SECRET_PATH.test(input[field]));
  if (secretPath || typeof input.command !== 'string') {
    return secretPath;
  }
  return SECRET_COMMANDS.test(input.command) || input.command.split(COMMAND_WORD_SEPARATOR).some(isSecretFileWord);
};

/** Bodies (`content`, `new_string`, `old_string`, `new_source`, also in `edits`) become `<field>Chars` lengths. */
const withoutBodies = (input) => {
  const slim = {};
  for (const [field, value] of Object.entries(input)) {
    if (BODY_FIELDS.includes(field)) {
      slim[`${field}Chars`] = typeof value === 'string' ? value.length : JSON.stringify(value ?? null).length;
    } else if (field === 'edits' && Array.isArray(value)) {
      slim.edits = value.map((edit) => (isObject(edit) ? withoutBodies(edit) : edit));
    } else if (field !== '__proto__') {
      // A `__proto__` field of the tool input would swap the copy's prototype instead of adding an entry; it is dropped.
      slim[field] = value;
    }
  }
  return slim;
};

const slimInput = (input, sensitive) => {
  if (!sensitive) {
    return withoutBodies(input);
  }
  const kept = { sensitive: true };
  for (const field of ['file_path', 'notebook_path', 'path', 'command']) {
    if (typeof input[field] === 'string') {
      kept[field] = input[field];
    }
  }
  return kept;
};

/** Text of a string or of the `{ type: 'text', text }` items of an MCP content array. */
const textOf = (value) => {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value.map((item) => (isObject(item) && typeof item.text === 'string' ? item.text : '')).join('\n');
};

/** The first non-blank line of the redacted text, cut after redaction so a cut never leaves part of a token. */
const firstLine = (value) => redactString(textOf(value)).split('\n').find((line) => line.trim())?.trim().slice(0, ERROR_LINE);

/** A text of an AskUserQuestion answer, redacted, then cut, so a cut never leaves part of a token. */
const answerText = (text) => redactString(text).slice(0, ANSWER_TEXT);

/**
 * A question that asks for a secret: a password or passphrase, a secret, an API key or token, an access or auth token,
 * a private key or a credential, also inside an identifier (`DB_PASSWORD`, `MY_API_KEY`): only a letter or a digit
 * next to the name keeps it from counting. A token alone does not count: a token budget is a common question here.
 */
const SECRET_QUESTION = /(?<![A-Za-z0-9])(?:pass(?:word|phrase|wd)s?|secrets?|api[\s_-]?(?:keys?|tokens?)|(?:access|auth)[\s_-]?tokens?|private[\s_-]?keys?|credentials?)(?![A-Za-z0-9])/i;

/** The label of an option: a string, or the `label` of an `{ label, description }` object. */
const optionLabel = (option) => {
  if (typeof option === 'string') {
    return option;
  }
  return isObject(option) && typeof option.label === 'string' ? option.label : undefined;
};

/** The option labels of every question of the call, from its `tool_input.questions` and its response's `questions`. */
const optionLabels = (input, response) => {
  const questions = [input.questions, response.questions].filter(Array.isArray).flat().filter(isObject);
  const options = questions.flatMap((question) => (Array.isArray(question.options) ? question.options : []));
  return new Set(options.map(optionLabel).filter((label) => label !== undefined));
};

/** The answer is one of the call's option labels, or a multi-select of them joined by ", ": text the model wrote, not the developer. */
const isOptionAnswer = (answer, labels) => labels.has(answer) || answer.split(', ').every((part) => labels.has(part));

/**
 * The developer's answers of an AskUserQuestion call (design section 2.3): its `answers` object (question text to the
 * answer string) as a list of `{ question, answer, notes? }` in the object's order, the notes from `annotations` when
 * they are a non-empty string, at most `ANSWERS_CAP`. A list, not the object, so no question text becomes a key that
 * the key rule of `redactValue` reads as a secret name. A question that asks for a secret (`SECRET_QUESTION`) keeps
 * its answer only when the answer is one of the call's option labels, else it becomes `[redacted]`, since redaction by
 * shape would keep a typed password; its notes always become `[redacted]`, since notes are always typed. Undefined when
 * the call has none.
 */
const keptAnswers = (input, response) => {
  if (!isObject(response.answers)) {
    return undefined;
  }
  const annotations = isObject(response.annotations) ? response.annotations : {};
  const labels = optionLabels(input, response);
  const answered = Object.entries(response.answers).filter(([, answer]) => typeof answer === 'string').slice(0, ANSWERS_CAP);
  const kept = answered.map(([question, answer]) => {
    const annotation = Object.hasOwn(annotations, question) ? annotations[question] : undefined;
    const notes = isObject(annotation) ? annotation.notes : undefined;
    const secret = SECRET_QUESTION.test(question);
    const typed = secret && !isOptionAnswer(answer, labels);
    const item = { question: answerText(question), answer: typed ? REDACTED : answerText(answer) };
    if (typeof notes !== 'string' || notes === '') {
      return item;
    }
    return { ...item, notes: secret ? REDACTED : answerText(notes) };
  });
  return kept.length > 0 ? kept : undefined;
};

/**
 * Keeps `responseChars`, the scalars the mapping reads, the first error line, what `keptStdout` (`hooks/verification.mjs`)
 * keeps of a Bash stdout after redaction (a verification tail or a PR URL), the short text of a marker tool (a
 * string, a content list or an object with `content`) and the answers of an AskUserQuestion call (`keptAnswers`).
 */
const slimResponse = (response, tool, input, sensitive) => {
  const command = typeof input.command === 'string' ? input.command : '';
  const slim = { responseChars: JSON.stringify(response ?? null).length };
  if (MARKER_TOOL.test(tool)) {
    slim.text = redactString(textOf(isObject(response) ? response.content : response)).slice(0, MARKER_TEXT);
    if (isObject(response) && typeof response.isError === 'boolean') {
      slim.isError = response.isError;
    }
  }
  if (!isObject(response)) {
    return slim;
  }
  for (const field of RESPONSE_SCALARS) {
    const value = response[field];
    if (typeof value === 'boolean' || typeof value === 'number' || (typeof value === 'string' && value.length <= 200)) {
      slim[field] = value;
    }
  }
  if (sensitive) {
    slim.sensitive = true;
    return slim;
  }
  const failed = response.is_error === true || (typeof response.error === 'string' && response.error !== '');
  const error = failed ? firstLine(response.error || response.stderr || response.content) : undefined;
  if (error) {
    slim.error = error;
  }
  if (tool === 'Bash' && typeof response.stdout === 'string') {
    const stdout = keptStdout(command, response.stdout.slice(-MAX_REDACT_CHARS), redactString);
    if (stdout !== undefined) {
      slim.stdout = stdout;
    }
  }
  const answers = tool === 'AskUserQuestion' ? keptAnswers(input, response) : undefined;
  if (answers) {
    slim.answers = answers;
  }
  return slim;
};

/** The top-level `error` of a failed call: its first `FAILURE_ERROR_CHARS` characters, cut after redaction; none for a sensitive call or a non-string. */
const slimFailureError = (error, sensitive) => {
  if (sensitive || typeof error !== 'string') {
    return undefined;
  }
  return redactString(error).slice(0, FAILURE_ERROR_CHARS);
};

/**
 * What the hook keeps of a payload (design section 2.2): tool inputs without file bodies (lengths instead),
 * tool responses reduced to `slimResponse`, a failure's `error` cut to its start (none for a sensitive call), and
 * nothing but paths and the command for a tool that touches a denylisted path or prints secrets. Other fields pass
 * unchanged; redaction runs on the result.
 */
export const minimizePayload = (payload) => {
  if (payload.tool_input === undefined && payload.tool_response === undefined && payload.error === undefined) {
    return payload;
  }
  const input = isObject(payload.tool_input) ? payload.tool_input : {};
  const sensitive = touchesSecret(input);
  const slim = { ...payload };
  if (payload.error !== undefined) {
    const error = slimFailureError(payload.error, sensitive);
    if (error === undefined) {
      delete slim.error;
    } else {
      slim.error = error;
    }
  }
  if (payload.tool_input !== undefined) {
    slim.tool_input = slimInput(input, sensitive);
  }
  if (payload.tool_response !== undefined) {
    slim.tool_response = slimResponse(payload.tool_response, typeof payload.tool_name === 'string' ? payload.tool_name : '', input, sensitive);
  }
  return slim;
};

/* ---------- private files (design section 3) ---------- */

const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;
const OPEN_BITS = 0o077;

const checkOwner = (path, stat) => {
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (uid !== undefined && stat.uid !== uid) {
    throw new Error(`${path} belongs to another user`);
  }
};

/** Creates `dir` with mode 0700, or checks an existing one: a real directory (no symlink) of this user, tightened to 0700. */
export const ensurePrivateDir = (dir) => {
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

/** Open errors of a path that is no regular file: a final symlink (`O_NOFOLLOW`), a FIFO without a reader, a directory. */
const NOT_A_FILE = new Set(['ELOOP', 'EMLINK', 'ENXIO', 'EISDIR']);

/**
 * Opens a private file for writing with `flags` and returns its descriptor (design section 3): created with mode 0600,
 * never through a final symlink (`O_NOFOLLOW`) and never blocking on a FIFO, then `fstat` of the open descriptor must
 * show a regular file of this user, and a looser mode is tightened with `fchmod`. The checks run on what was opened,
 * so nothing can swap the path between a check and the open.
 */
const openPrivate = (path, flags) => {
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

/** Writes all of `text` to the open descriptor `fd` and closes it. */
const writeAndClose = (fd, text) => {
  try {
    const buffer = Buffer.from(text, 'utf8');
    let written = 0;
    while (written < buffer.length) {
      written += writeSync(fd, buffer, written, buffer.length - written);
    }
  } finally {
    closeSync(fd);
  }
};

/** Appends to a file of a private directory with mode 0600 (`openPrivate`). */
export const appendPrivate = (path, text) => {
  writeAndClose(openPrivate(path, constants.O_WRONLY | constants.O_APPEND), text);
};

/** Writes a file with mode 0600 in a private directory (created 0700), truncated only after `openPrivate` checked it. */
export const writePrivate = (path, text) => {
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

/* ---------- retention (design section 3) ---------- */

const DAY_FILE = /^events-(\d{4}-\d{2}-\d{2})\.ndjson$/;
const PRUNE_MARKER = '.pruned';
const NOTIFIED_DIR = 'notified';
/** The names the hook gives a marker: the session id with everything but word characters and `-` replaced. */
const NOTIFIED_NAME = /^[\w-]+$/;

/**
 * Deletes the `notified/<session_id>` markers of `dir` last written on a day before `oldest` and returns their paths:
 * regular files only (by `lstat`) under the names the hook writes, so nothing else in the folder is touched. An
 * unreadable folder stays until the next prune; a marker that cannot be looked up or removed (not one gone since the
 * listing) goes to `onFailure(path, error)` and stays until the next prune.
 */
const pruneNotified = (dir, oldest, onFailure = () => {}) => {
  const folder = join(dir, NOTIFIED_DIR);
  if (!ownedEntry(folder, 'dir')) {
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
    } catch (error) {
      if (error.code !== 'ENOENT') {
        onFailure(path, error);
      }
    }
  }
  return expired;
};

/** Sorts after every `YYYY-MM-DD`: as the first day kept it makes `deleteDaysBefore` take every day. */
const AFTER_EVERY_DAY = '\uFFFF';

/**
 * The day files of `dir` dated before the local day `oldest`, oldest first; none when `dir` is missing, and a `dir` that
 * cannot be looked up (EACCES on a parent, ENOTDIR) throws, so no prune reads it as empty. A day file is
 * a regular file or a symlink by `lstat` (a symlink is unlinked, never followed); a directory named like one is left out.
 * A file gone since the listing is left out; one that cannot be looked up throws, so no prune reads it as deleted.
 */
const dayFilesBefore = (dir, oldest) => {
  if (lstatIfPresent(dir) === undefined) {
    return [];
  }
  const files = [];
  for (const name of readdirSync(dir)) {
    const day = DAY_FILE.exec(name)?.[1];
    const path = join(dir, name);
    const stat = day !== undefined && day < oldest ? lstatIfPresent(path) : undefined;
    if (stat?.isFile() || stat?.isSymbolicLink()) {
      files.push({ day, path });
    }
  }
  return files.sort((a, b) => a.day.localeCompare(b.day));
};

/**
 * Deletes the day files of `dir` dated before `oldest` and the `notified/` markers last written before it; returns the
 * paths deleted. A day file that cannot be deleted goes to `onFailure` and stays; the others are deleted; one gone
 * since the listing (a concurrent prune or purge) is neither reported nor counted. A marker that cannot be deleted goes
 * to `onMarkerFailure`, which is silent unless given.
 */
const deleteDaysBefore = (dir, oldest, onFailure = () => {}, onMarkerFailure = () => {}) => {
  const deleted = [];
  for (const { path } of dayFilesBefore(dir, oldest)) {
    try {
      unlinkSync(path);
      deleted.push(path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        onFailure(path, error);
      }
    }
  }
  return [...deleted, ...pruneNotified(dir, oldest, onMarkerFailure)];
};

/**
 * Deletes the day files of `dir` and its `notified/<session_id>` markers (design section 3) older than `keepDays`
 * and returns their paths: a day file by the day in its name, a marker by the day it was last written. A missing `dir`
 * deletes nothing; one that cannot be looked up throws (`dayFilesBefore`). A day file or a marker that cannot be
 * deleted goes to `onFailure(path, error)` and stays until the next prune, the others are deleted; without `onFailure`
 * it stays silently (the hook's prune never writes to the terminal).
 */
export const pruneSpool = (dir, keepDays, now = new Date(), onFailure) => {
  if (lstatIfPresent(dir) === undefined) {
    return [];
  }
  const oldest = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - keepDays));
  return deleteDaysBefore(dir, oldest, onFailure, onFailure);
};

/**
 * `pruneSpool` at most once per local day, tracked by the mtime of `<dir>/.pruned`: one `stat` on other runs. The run
 * that prunes also excludes the spool base, the parent of `dir`, from backups (`excludeFromBackup`, once per base).
 */
export const pruneOncePerDay = (dir, keepDays, now = new Date(), backup = {}) => {
  const marker = join(dir, PRUNE_MARKER);
  try {
    if (localDay(statSync(marker).mtime) === localDay(now)) {
      return [];
    }
  } catch {
    // No marker yet: prune now.
  }
  const deleted = pruneSpool(dir, keepDays, now);
  writePrivate(marker, `${localDay(now)}\n`);
  excludeFromBackup(dirname(dir), backup);
  return deleted;
};

/* ---------- purge (design section 3, "Retention") ---------- */

/**
 * Whether the spool directory `dir` exists: false when it is missing; throws when it cannot be looked up (EACCES on a
 * parent, for one), is a symlink, no directory or a directory of another user, as the private-directory rules refuse
 * them (design section 3).
 */
export const spoolDirExists = (dir) => {
  const stat = lstatIfPresent(dir);
  if (stat === undefined) {
    return false;
  }
  if (!stat.isDirectory()) {
    throw new Error(`${dir} is not a directory (a symlink is refused)`);
  }
  checkOwner(dir, stat);
  return true;
};

/** The day files `purgeSpool(dir, before)` would delete, oldest first: those dated before the local day `before`, or every one. */
export const purgeableDayFiles = (dir, before) => (spoolDirExists(dir) ? dayFilesBefore(dir, before ?? AFTER_EVERY_DAY) : []);

/**
 * `nurselog purge` of one spool directory: deletes its day files dated before the local day `before` (every one
 * without it) and the `notified/` markers last written before that day (every one without it), the same deletion as
 * `pruneSpool`, and returns their paths. A missing directory deletes nothing; a refused one throws (`spoolDirExists`).
 * A day file that cannot be deleted goes to `onFailure(path, error)` and the others are still deleted.
 */
export const purgeSpool = (dir, before, onFailure) => (spoolDirExists(dir) ? deleteDaysBefore(dir, before ?? AFTER_EVERY_DAY, onFailure) : []);

/* ---------- backup exclusion (design section 3, "Retention") ---------- */

/** The macOS Time Machine tool, by absolute path so no `PATH` entry can stand in for it. */
export const TMUTIL = '/usr/bin/tmutil';
const BACKUP_MARKER = '.backup-excluded';

/** Runs `command` in the background, detached with ignored stdio and unref'd, so the caller never waits for it. */
const spawnDetached = (command, args) => {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  child.unref();
};

/**
 * Excludes `dir` from Time Machine backups on macOS (design section 3): `tmutil addexclusion <dir>` in the background,
 * once per directory, tracked by the marker file `<dir>/.backup-excluded` (0600), so an exclusion the user removes
 * later is not set again. Only a directory of this user, no symlink, is excluded. Elsewhere than macOS it does
 * nothing, and every error is swallowed. Returns whether it ran `tmutil`.
 */
export const excludeFromBackup = (dir, { platform = process.platform, spawner = spawnDetached } = {}) => {
  if (platform !== 'darwin') {
    return false;
  }
  try {
    const marker = join(dir, BACKUP_MARKER);
    if (!ownedEntry(dir, 'dir') || lstatOrUndefined(marker) !== undefined) {
      return false;
    }
    spawner(TMUTIL, ['addexclusion', dir]);
    writeFileSync(marker, `Nurselog excluded this directory from Time Machine backups with: ${TMUTIL} addexclusion\n`, { mode: PRIVATE_FILE, flag: 'wx' });
    return true;
  } catch {
    return false;
  }
};

/** Whether `excludeFromBackup` ran for `dir` before: its marker file is there, in a directory of this user that is no symlink. */
export const excludedFromBackup = (dir) => ownedEntry(dir, 'dir') && lstatOrUndefined(join(dir, BACKUP_MARKER)) !== undefined;

/* ---------- lines ---------- */

const TAIL_KEYS = new Set(['stdout', 'stderr']);

/** The head of `text` within `room` characters, cut at the last whitespace of its final KiB; empty when there is none. */
const headWithin = (text, room) => {
  const floor = Math.max(0, room - 1024);
  let cut = room;
  while (cut > floor && !/\s/.test(text[cut])) {
    cut -= 1;
  }
  return cut > floor ? text.slice(0, cut) : '';
};

/**
 * Cuts the strings of `value` to `MAX_PAYLOAD_CHARS` in total before the regexes run (design section 2.3). The strings
 * of an object come before its nested values, so the identity fields of a payload stay; the string that crosses the
 * budget keeps its head up to a whitespace (`headWithin`) and every later one is emptied, so no part of a token stays.
 * Nesting past `MAX_DEPTH` is left to `redactValue`, which makes it `[truncated]`. Returns the copy and whether a string was cut.
 */
export const budgetStrings = (value) => {
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
    if (typeof item === 'string') {
      return take(item);
    }
    if (!item || typeof item !== 'object' || depth >= MAX_DEPTH) {
      return item;
    }
    if (Array.isArray(item)) {
      return item.map((entry) => walk(entry, depth + 1));
    }
    const entries = Object.entries(item);
    // The object's own strings take their share before its nested values, so its identity fields come first.
    const strings = entries.map(([, entry]) => (typeof entry === 'string' ? take(entry) : undefined));
    const valueOf = (entry, index) => (typeof entry === 'string' ? strings[index] : walk(entry, depth + 1));
    return Object.fromEntries(entries.map(([field, entry], index) => [field, valueOf(entry, index)]));
  };
  return { value: walk(value, 0), cut };
};

const capStrings = (value, limit, key = '', depth = 0) => {
  if (typeof value === 'string' && value.length > limit) {
    return TAIL_KEYS.has(key) ? value.slice(-limit) : value.slice(0, limit);
  }
  if (value && typeof value === 'object' && depth >= MAX_DEPTH) {
    return TRUNCATED;
  }
  if (Array.isArray(value)) {
    return value.slice(0, limit).map((item) => capStrings(item, limit, '', depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, capStrings(item, limit, name, depth + 1)]));
  }
  return value;
};

/** `JSON.stringify`, or undefined for a value nested too deep for the stack (whose depth depends on the platform). */
const stringifyShallow = (value) => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    if (error instanceof RangeError) {
      return undefined;
    }
    throw error;
  }
};

/**
 * Serialises a line below `maxBytes` (the newline included): when it is longer or nested too deep to serialise, the strings under `field`
 * are cut (the head kept, the tail for stdout and stderr) and the line gets `truncated: true`.
 */
export const serializeLine = (envelope, field, maxBytes) => {
  const line = stringifyShallow(envelope);
  if (line !== undefined && Buffer.byteLength(line) < maxBytes) {
    return line;
  }
  for (const limit of [16000, 4000, 1000, 200, 40]) {
    const shorter = JSON.stringify({ ...envelope, [field]: capStrings(envelope[field], limit), truncated: true });
    if (Buffer.byteLength(shorter) < maxBytes) {
      return shorter;
    }
  }
  return JSON.stringify({ ...envelope, [field]: {}, truncated: true });
};

/**
 * Appends one redacted line to the day file of `envelope.at` with a single append call, so concurrent writers
 * do not interleave. Every writer goes through here (hook, CLI markers, server facts), so every line is redacted;
 * its strings are first held to `MAX_PAYLOAD_CHARS` (`budgetStrings`), and a cut marks the line `truncated`.
 */
export const appendSpoolLine = (dir, envelope, field, maxBytes) => {
  ensurePrivateDir(dir);
  const { value, cut } = budgetStrings(envelope);
  const line = redactValue(cut ? { ...value, truncated: true } : value);
  appendPrivate(spoolFileFor(dir, envelope.at), `${serializeLine(line, field, maxBytes)}\n`);
};

/**
 * The hook's line: the envelope of design section 2.1 with the minimised, redacted payload instead of `event` and `data`.
 * The minimised payload is held to `MAX_PAYLOAD_CHARS` of strings before redaction; a cut marks the line `truncated`.
 */
export const buildHookLine = (payload, at, id) => {
  const bounded = budgetStrings(minimizePayload(payload));
  const clean = redactValue(bounded.value);
  const text = (value) => (typeof value === 'string' ? value : '');
  const line = { v: 1, id, at, src: 'hook', hook: text(payload.hook_event_name) || 'unknown', sessionId: text(clean.session_id), cwd: text(clean.cwd) };
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

/**
 * The line for a payload `buildHookLine` could not process (a throw while minimising or redacting it): the hook name, the
 * session and agent fields, `truncated: true` and an empty payload, so the event is not lost.
 */
export const buildStubLine = (payload, at, id) => {
  const text = (value) => (typeof value === 'string' ? redactString(value) : '');
  const line = { v: 1, id, at, src: 'hook', hook: text(payload.hook_event_name) || 'unknown', sessionId: text(payload.session_id), cwd: text(payload.cwd) };
  if (text(payload.agent_id)) {
    line.agentId = text(payload.agent_id);
    if (text(payload.agent_type)) {
      line.agentType = text(payload.agent_type);
    }
  }
  line.payload = {};
  line.truncated = true;
  return line;
};

/* ---------- repository record (design section 3) ---------- */

const RECORD_FILE = 'repository.json';
const MAX_RECORD_BYTES = 16 * 1024;

/**
 * The main checkout of the repository that holds `start`, as a real path: the parent of the git common directory when
 * that is `<root>/.git`, else the worktree top level (a `--separate-git-dir` clone, a submodule, a bare repository's
 * worktree). Undefined outside a git repository.
 */
export const mainCheckoutRoot = (start) => {
  const common = gitCommonDir(start);
  if (common && basename(common) === '.git') {
    return dirname(common);
  }
  const top = repositoryRoot(start);
  return top === undefined ? undefined : realpathSync(top);
};

/** `~/.local/share/nurselog/<repo-hash>/repository.json`: the record the board finds a repository by. */
export const repositoryRecordPath = (root) => join(userDirFor(root), RECORD_FILE);

/**
 * The repository record at `path` within 16 KiB, or undefined when it is missing, unreadable or invalid, or when it or
 * its directory is a symlink or belongs to another user.
 */
export const readRepositoryRecord = (path) => {
  let record;
  try {
    checkOwnedFile(path);
    record = JSON.parse(readSmallFile(path, MAX_RECORD_BYTES));
  } catch {
    return undefined;
  }
  const valid = isObject(record) && typeof record.root === 'string' && isAbsolute(record.root);
  return valid ? { root: record.root } : undefined;
};

/**
 * Whether a recorded `root` still names the repository with the repo hash `hash`: a directory that is a repository top
 * level (its own `.git`, not a directory inside a worktree) and hashes to `hash`.
 */
export const recordedRootValid = (root, hash) => {
  try {
    return statSync(root).isDirectory() && repositoryRoot(root) === root && repoHash(root) === hash;
  } catch {
    // A root that is gone or unreadable names no repository any more.
    return false;
  }
};

/** Writes a private file whole: a temp file (mode 0600, never an existing one) in the same directory, renamed over `path`. */
const replacePrivate = (path, text) => {
  const temp = `${path}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, text, { mode: PRIVATE_FILE, flag: 'wx' });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
};

/**
 * Writes the repository record of the repository that holds `root` (design section 3) when it is missing, invalid or
 * names a root that is no longer valid (`recordedRootValid`), and returns whether it wrote. An existing valid record is
 * kept even when it names another worktree, so the worktrees of a bare repository or a `--separate-git-dir` clone,
 * whose main checkout is the top level of the worktree the hook ran in, do not rewrite it in turn. A record too long
 * to read back is never written, so a long root cannot cause a write on every call. Throws on a failed write.
 */
export const recordRepository = (root) => {
  const main = mainCheckoutRoot(root);
  if (main === undefined) {
    return false;
  }
  const path = repositoryRecordPath(root);
  const recorded = readRepositoryRecord(path)?.root;
  if (recorded === main || (recorded !== undefined && recordedRootValid(recorded, repoHash(root)))) {
    return false;
  }
  const text = `${JSON.stringify({ root: main })}\n`;
  if (Buffer.byteLength(text) > MAX_RECORD_BYTES) {
    return false;
  }
  ensurePrivateDir(dirname(path));
  replacePrivate(path, text);
  return true;
};

/* ---------- server state file (design section 9) ---------- */

const CONNECT_TIMEOUT_MS = 300;
const MAX_STATE_BYTES = 4096;

/**
 * The `server.json` written by a running server, read within 4096 bytes like any small file (design section 9), or
 * undefined when it is missing, unreadable or invalid: a pid that is not a positive integer or a port outside 1 to
 * 65535.
 */
export const readServerState = (stateFile) => {
  let state;
  try {
    state = JSON.parse(readSmallFile(stateFile, MAX_STATE_BYTES));
  } catch {
    return undefined;
  }
  const validPid = Number.isInteger(state?.pid) && state.pid > 0;
  const validPort = Number.isInteger(state?.port) && state.port >= 1 && state.port <= 65535;
  return validPid && validPort ? state : undefined;
};

/** The pid in the state file is alive and its port on 127.0.0.1 accepts a connection. */
export const serverRunning = (stateFile) => {
  const state = readServerState(stateFile);
  if (!state) {
    return Promise.resolve(false);
  }
  try {
    process.kill(state.pid, 0);
  } catch (error) {
    if (error?.code !== 'EPERM') {
      return Promise.resolve(false);
    }
  }
  return new Promise((done) => {
    const socket = connect({ host: '127.0.0.1', port: state.port });
    const finish = (running) => {
      socket.destroy();
      done(running);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
};

/* ---------- board token (design sections 3 and 9, ADR-0011) ---------- */

/** A board token: 32 random bytes in base64url, 43 characters. */
const BOARD_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_TOKEN_BYTES = 256;

/** The one board token of this user, `<default root>/token` (design section 3). */
export const boardTokenPath = () => join(defaultRoot(), 'token');

/**
 * The token in `path` under the private file rules (design section 3): opened with `O_NOFOLLOW` and without blocking on
 * a FIFO, then `fstat` of the descriptor must show a regular file of this user, and a looser mode is tightened.
 * Undefined when the file is missing; throws when it is refused or holds no board token.
 */
const readTokenFile = (path) => {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
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
    const text = buffer.toString('utf8', 0, readSync(fd, buffer, 0, buffer.length, 0)).trim();
    if (!BOARD_TOKEN.test(text)) {
      throw new Error(`${path} holds no board token; delete it and start the board again`);
    }
    return text;
  } finally {
    closeSync(fd);
  }
};

/**
 * The board token of this user (design section 9): read from `path` when it is there, else made by this start (32
 * random bytes, base64url) in a temp file of mode 0600 that is hard-linked to `path`, so the file is never seen partial
 * and of two boards that start at once one makes it and the other reads it. The default root is checked as for
 * `server.json` (`ensurePrivateDir`). Throws when the file is refused (a symlink, another user's, no token in it).
 */
export const ensureBoardToken = (path = boardTokenPath()) => {
  ensurePrivateDir(dirname(path));
  const found = readTokenFile(path);
  if (found !== undefined) {
    return found;
  }
  const token = randomBytes(32).toString('base64url');
  const temp = `${path}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, `${token}\n`, { mode: PRIVATE_FILE, flag: 'wx' });
    linkSync(temp, path);
    return token;
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
    // Another board made the file first: its token is the one.
    const made = readTokenFile(path);
    if (made === undefined) {
      throw new Error(`${path} was removed while the board started; start the board again`);
    }
    return made;
  } finally {
    rmSync(temp, { force: true });
  }
};

/**
 * The board token for a client of the API (design section 9): the token file and its directory must be this user's and
 * no symlink. Undefined when the file is missing, refused or holds no token, so the client behaves as when the board does
 * not answer; never throws.
 */
export const readBoardToken = (path = boardTokenPath()) => {
  try {
    return ownedEntry(dirname(path), 'dir') ? readTokenFile(path) : undefined;
  } catch {
    return undefined;
  }
};

/** A nonce of `GET /api/health?nonce=`: 16 to 64 base64url characters (design section 9). */
export const NONCE = /^[A-Za-z0-9_-]{16,64}$/;

/** A sign-in ticket of `POST /api/signin`: 32 random bytes, base64url. */
const TICKET = /^[A-Za-z0-9_-]{43}$/;

/** `text` under the board token: base64url HMAC-SHA256, the board's proof of a nonce and the value of its cookie (design section 9). */
export const tokenHmac = (token, text) => createHmac('sha256', token).update(text).digest('base64url');

/**
 * The proof a board on `port` with pid `pid` answers `GET /api/health?nonce=<nonce>` with (design section 9): bound to
 * the endpoint, so a process on another port that relays a real board's answer does not pass.
 */
export const boardProof = (token, port, pid, nonce) => tokenHmac(token, `proof:${port}:${pid}:${nonce}`);

/** `a` and `b` are the same text, compared in constant time after a length check. */
export const sameText = (a, b) => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

/* ---------- board auto-start (design section 9) ---------- */

const BOARD_POLL_MS = 100;
const HEALTH_TIMEOUT_MS = 300;

/**
 * How long `status`, a live `start` and a board's claim of `server.json` wait for `/api/health` of the board it names
 * (`verifiedBoardUrl`): longer than the poll of a starting board, since a running board may be busy reading its spools.
 */
export const RUNNING_CHECK_MS = 1000;

/**
 * The environment variables of the session a board started in the background leaves out, so that it behaves like one
 * started from a terminal: git's repository and identity overrides (`GIT_*`), Claude Code's and the API's own
 * (`CLAUDE*`, `ANTHROPIC_*`) and the GitHub tokens (design section 9).
 */
const SESSION_ENV = /^(?:GIT_|CLAUDE|ANTHROPIC_)|^(?:GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN)$/;

/** `env` without the variables of `SESSION_ENV`; everything else (PATH, HOME, GH_CONFIG_DIR, proxies) is kept. */
export const boardEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([name]) => !SESSION_ENV.test(name)));

/** The address of the board on `port`, as the started line prints it. */
export const boardUrl = (port) => `http://127.0.0.1:${port}/`;

/** The log of a board started in the background: its stdout and stderr, overwritten at each start (design section 9). */
export const boardLogPath = () => join(defaultRoot(), 'board.log');

/**
 * Opens the board log for a new start and returns its descriptor: mode 0600 in the private default root, never
 * through a symlink and refused when it is not a regular file of this user (`openPrivate`), then truncated. It appends,
 * so a board still writing after a second start truncated the log adds its lines at the end instead of leaving a hole.
 */
const openBoardLog = () => {
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

/**
 * Starts the board in the background (design section 9), shared by the SessionStart hook and `nurselog open`:
 * `<node> <cli> start` without `--port`, detached in its own process group and unreferenced, stdin ignored, stdout and
 * stderr in the board log, from the default root (the log's directory) with `boardEnv` of `env`. Returns
 * `{ status: 'not-built' }` and starts nothing when the plugin root (the parent of the CLI's directory) has no
 * `dist/cli.js`, else `{ status: 'started', exited }`, where the signal `exited` aborts once the process ends or fails
 * to spawn, for `waitForBoard`. Throws when the log cannot be opened or the spawn fails at once; a spawn error reported
 * later is appended to the log.
 */
export const startBoardDetached = (cli = CLI_PATH, { node = process.execPath, env = process.env } = {}) => {
  const pluginRoot = resolve(dirname(cli), '..');
  if (!existsSync(join(pluginRoot, 'dist', 'cli.js'))) {
    return { status: 'not-built' };
  }
  const fd = openBoardLog();
  const ended = new AbortController();
  try {
    const child = spawn(node, [cli, 'start'], { cwd: defaultRoot(), env: boardEnv(env), detached: true, stdio: ['ignore', fd, fd] });
    child.once('error', (error) => {
      ended.abort();
      try {
        appendPrivate(boardLogPath(), `nurselog: the board did not start: ${error.message}\n`);
      } catch {
        // The caller already points to the log; a log that cannot be written says nothing more.
      }
    });
    child.once('exit', () => ended.abort());
    child.unref();
  } finally {
    closeSync(fd);
  }
  return { status: 'started', exited: ended.signal };
};

/** Whether `path` is a directory (`kind` `dir`) or a regular file of this user, by `lstat`, so no symlink passes. */
const ownedEntry = (path, kind) => {
  try {
    const stat = lstatSync(path);
    checkOwner(path, stat);
    return kind === 'dir' ? stat.isDirectory() : stat.isFile();
  } catch {
    return false;
  }
};

/**
 * The JSON body of a GET to 127.0.0.1 within `timeoutMs`, or undefined on an error, a status other than 200, a
 * content type other than `application/json`, a body that is not JSON or the deadline. It runs on an agent of its own,
 * so a proxy from the environment (`NODE_USE_ENV_PROXY` with `HTTP_PROXY`) never receives the loopback call, and
 * nothing follows a redirect. A body beyond 1 MiB ends the request with undefined. With `token` it sends `Authorization: Bearer <token>`, which every API route but
 * `/api/health` needs (design section 9); only a caller that proved the board (`checkBoard`) passes one. `checkBoard`,
 * `signInBoard` and `boardTab` of `markers.mjs` call the board through it.
 */
/** The largest body `loopbackJson` reads: 1 MiB. */
const MAX_LOOPBACK_BYTES = 1024 * 1024;

export const loopbackJson = (port, path, timeoutMs, token, method = 'GET') => new Promise((done) => {
  const headers = token === undefined ? {} : { Authorization: `Bearer ${token}` };
  const request = httpRequest({ host: '127.0.0.1', port, path, method, headers, agent: new Agent() }, (response) => {
    const chunks = [];
    let length = 0;
    const json = /^application\/json\b/i.test(response.headers['content-type'] ?? '');
    response.on('data', (chunk) => {
      length += chunk.length;
      chunks.push(chunk);
      // A body without end (a process that squats the port) is cut off: the request ends and gives undefined.
      if (length > MAX_LOOPBACK_BYTES) {
        clearTimeout(timer);
        request.destroy();
        done(undefined);
      }
    });
    response.on('error', () => done(undefined));
    response.on('end', () => {
      clearTimeout(timer);
      try {
        done(response.statusCode === 200 && json ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined);
      } catch {
        // A board that answers with anything but JSON is not the board of the file.
        done(undefined);
      }
    });
  });
  const timer = setTimeout(() => request.destroy(), timeoutMs);
  request.on('error', () => {
    clearTimeout(timer);
    done(undefined);
  });
  request.end();
});

/**
 * The board that `server.json` names, as a client of its API sees it (design section 9, "Board token"). The file and
 * its directory must be this user's (no symlink), its pid alive (`ESRCH` is dead, `EPERM` alive), so nothing is sent to
 * a stale port, and `GET /api/health?nonce=<fresh nonce>` on 127.0.0.1 must answer within `timeoutMs` with `ok` and the
 * file's pid, else `{ status: 'none' }`. Then the board's `proof` must be `boardProof` of the token file beside
 * `server.json` (`readBoardToken`) for the file's port and pid, compared in constant time:
 * `{ status: 'proven', url, port, pid, token }`, the only result that lets a client send the token. A missing token
 * file, a board started with another one, or a process that fakes the pid gives `{ status: 'unproven', url, port, pid }`.
 */
export const checkBoard = async (stateFile = serverStatePath(), timeoutMs = HEALTH_TIMEOUT_MS) => {
  if (!ownedEntry(dirname(stateFile), 'dir') || !ownedEntry(stateFile, 'file')) {
    return { status: 'none' };
  }
  const state = readServerState(stateFile);
  if (!state || !pidAlive(state.pid)) {
    return { status: 'none' };
  }
  const nonce = randomBytes(24).toString('base64url');
  const health = await loopbackJson(state.port, `/api/health?nonce=${nonce}`, timeoutMs);
  if (health?.ok !== true || health.pid !== state.pid) {
    return { status: 'none' };
  }
  const found = { url: boardUrl(state.port), port: state.port, pid: state.pid };
  const token = readBoardToken(join(dirname(stateFile), 'token'));
  const proven = token !== undefined && typeof health.proof === 'string' && sameText(health.proof, boardProof(token, state.port, state.pid, nonce));
  return proven ? { status: 'proven', ...found, token } : { status: 'unproven', ...found };
};

/** The process `pid` runs: `kill(pid, 0)` succeeds, or fails with `EPERM` (a process of another user). */
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

/**
 * The line of a live `start` and of `open` for a board of `server.json` that does not prove the token file: the cause
 * and the way out, on one line.
 */
export const notProvenMessage = (port) => `the board on port ${port} does not prove the token file (board token missing or changed, or another process holds the port); stop the process on port ${port} or delete ${tildeHome(serverStatePath())}, then start the board`;

/** The URL of the board of `server.json` once it proves to be that board with the token file (`checkBoard`), else undefined. */
export const verifiedBoardUrl = async (stateFile = serverStatePath(), timeoutMs = HEALTH_TIMEOUT_MS) => {
  const board = await checkBoard(stateFile, timeoutMs);
  return board.status === 'proven' ? board.url : undefined;
};

/** The line of `status`, `link`, `open` and `start` for a board that runs but does not prove itself with the token file. */
export const TOKEN_CHANGED = 'board token missing or changed; restart the board';

/**
 * The board of `server.json` with a sign-in URL (design section 9): `checkBoard`, and for a proven board a fresh
 * ticket from `POST /api/signin` with the token as Bearer, as `signIn`: `<url>?ticket=<ticket>`, single-use and valid
 * for 60 s. `signIn` is undefined when the board gave no ticket.
 */
export const signInBoard = async (stateFile = serverStatePath(), timeoutMs = HEALTH_TIMEOUT_MS) => {
  const board = await checkBoard(stateFile, timeoutMs);
  if (board.status !== 'proven') {
    return board;
  }
  const answer = await loopbackJson(board.port, '/api/signin', timeoutMs, board.token, 'POST');
  const ticket = typeof answer?.ticket === 'string' && TICKET.test(answer.ticket) ? answer.ticket : undefined;
  return { ...board, signIn: ticket === undefined ? undefined : `${board.url}?ticket=${ticket}` };
};

/** Waits `ms`, or less when `signal` aborts first; not at all when it has aborted already. */
const pause = (ms, signal) => new Promise((done) => {
  if (signal?.aborted) {
    done();
    return;
  }
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    done();
  }, { once: true });
});

/**
 * Polls every 100 ms until `verifiedBoardUrl` holds for the state file: `{ outcome: 'running', url }`. Ends with
 * `{ outcome: 'exited' }` as soon as the signal `exited` of `startBoardDetached` aborts without a board running (the
 * started process ended: it failed, or another board won the claim and is checked once more), and with
 * `{ outcome: 'timeout' }` once `timeoutMs` passes (a check in flight may add up to its 300 ms).
 */
export const waitForBoard = async (timeoutMs, { stateFile = serverStatePath(), exited } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const settled = exited?.aborted === true;
    const url = await verifiedBoardUrl(stateFile, Math.min(HEALTH_TIMEOUT_MS, Math.max(deadline - Date.now(), 50)));
    if (url) {
      return { outcome: 'running', url };
    }
    if (settled) {
      return { outcome: 'exited' };
    }
    const left = deadline - Date.now();
    if (left <= 0) {
      return { outcome: 'timeout' };
    }
    await pause(Math.min(BOARD_POLL_MS, left), exited);
  }
};

/* ---------- app window (design section 9) ---------- */

/** The Chromium browsers an app window is tried in on macOS, by application name, in this order. */
export const MAC_APP_BROWSERS = ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium'];

/** The Chromium browsers an app window is tried in on Linux, by command on PATH, in this order. */
export const LINUX_APP_BROWSERS = ['google-chrome', 'chromium', 'microsoft-edge'];

/** The macOS launcher, by absolute path so no PATH entry can stand in for it. */
export const MAC_OPEN = '/usr/bin/open';

/** `launch` waits for the program's exit (macOS `open`, which fails for an application it cannot find). */
export const UNTIL_EXIT = Number.POSITIVE_INFINITY;

/** `launch` waits this long for a Linux browser to fail before it counts as opened: one that exits non-zero by then did not open. */
export const LINUX_LAUNCH_GRACE_MS = 300;

/**
 * Runs the program at the absolute path `command` with an argument array, never through a shell, as a detached child
 * with stdio ignored, unreferenced once it has an answer. Resolves whether it opened: false when it fails to spawn or
 * exits non-zero within `waitMs` (`UNTIL_EXIT`: until it exits), true when it exits 0 or still runs after `waitMs`.
 * `env` and `cwd` are the child's, the caller's own by default. With `input` its stdin is a pipe that gets `input` and
 * is closed, so a text the process list must not show (the URL of `nurselog open` for osascript) never enters argv; a
 * write error of a child that exited first is dropped, and the exit code decides as without it.
 */
export const launch = (command, args, waitMs, { env, cwd, input } = {}) => new Promise((done) => {
  const stdio = input === undefined ? 'ignore' : ['pipe', 'ignore', 'ignore'];
  const child = spawn(command, args, { detached: true, stdio, env, cwd });
  let timer;
  const finish = (opened) => {
    clearTimeout(timer);
    child.unref();
    done(opened);
  };
  child.once('error', () => finish(false));
  child.once('exit', (code) => finish(code === 0));
  if (input !== undefined) {
    // EPIPE of a child that exits before it reads its stdin: its exit code already says whether it opened.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input);
  }
  if (Number.isFinite(waitMs)) {
    child.once('spawn', () => {
      timer = setTimeout(() => finish(true), waitMs);
    });
  }
});

/**
 * The absolute path of `command` in the first directory of `path` that holds it as an executable file; empty and
 * relative entries are skipped, so the current directory never supplies a program.
 */
export const resolveCommand = (command, path = process.env.PATH ?? '') => {
  for (const dir of path.split(delimiter).filter((entry) => isAbsolute(entry))) {
    const candidate = join(dir, command);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Not in this directory.
    }
  }
  return undefined;
};

/** The places an application is looked for on macOS: `/Applications` and the user's own `~/Applications`. */
const macAppPaths = (browser) => [`/Applications/${browser}.app`, join(homedir(), 'Applications', `${browser}.app`)];

/** How long a sign-in file is kept: the 60 s a sign-in ticket is valid (`TICKET_MS` of `src/server/http.ts`; design section 9, "Sign-in"). */
const SIGN_IN_FILE_MS = 60_000;

/** The names `writeSignInFile` gives: `signin-` and 16 base64url characters (12 random bytes). */
const SIGN_IN_FILE = /^signin-[\w-]{16}\.html$/;

/** `text` with the characters that end or open an HTML attribute or element written as character references. */
const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Removes the sign-in files of `root` older than `SIGN_IN_FILE_MS` at `now`: regular files only (by `lstat`) under the
 * names `writeSignInFile` gives, so nothing else in the root is touched. Their tickets are used or expired; a file that
 * cannot be removed stays and is tried again at the next sign-in.
 */
const sweepSignInFiles = (root, now) => {
  let names;
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  for (const name of names.filter((entry) => SIGN_IN_FILE.test(entry))) {
    const path = join(root, name);
    try {
      const stat = lstatSync(path);
      if (stat.isFile() && now - stat.mtimeMs > SIGN_IN_FILE_MS) {
        unlinkSync(path);
      }
    } catch {
      // A sign-in file that cannot be removed stays until the next sign-in.
    }
  }
};

/**
 * Writes the sign-in file of the ticket URL `signIn` (design section 9, "Sign-in") and returns its `file://` URL: a
 * page that only redirects to `signIn` with a meta refresh (no script, so the ticket is redeemed once) and links to it,
 * at `<root>/signin-<12 random bytes base64url>.html` with mode 0600 in the private root (`writePrivate`). A browser
 * opened on the file URL redeems the ticket without the ticket in any argv. It first removes the sign-in files older
 * than 60 s (`sweepSignInFiles`), so no timer is needed. Throws when the root or the file cannot be written.
 */
export const writeSignInFile = (signIn, { root = defaultRoot(), now = Date.now() } = {}) => {
  ensurePrivateDir(root);
  sweepSignInFiles(root, now);
  const path = join(root, `signin-${randomBytes(12).toString('base64url')}.html`);
  const target = escapeHtml(signIn);
  const head = `<meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Nurselog</title>`;
  const body = `<a href="${target}">Open the Nurselog board</a>`;
  writePrivate(path, `<!doctype html>\n<html><head>${head}</head>\n<body>${body}</body></html>\n`);
  return pathToFileURL(path).href;
};

/** The error `openAppWindow` throws when the sign-in file cannot be written; `reason` is the message of the failed write. */
export class SignInFileError extends Error {
  constructor(cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`the sign-in file could not be written (${reason})`, { cause });
    this.name = 'SignInFileError';
    this.reason = reason;
  }
}

/** Whether `url` carries a `ticket` query parameter; a URL that does not parse counts when it holds `ticket=` anywhere. */
const carriesTicket = (url) => (URL.canParse(url) ? new URL(url).searchParams.has('ticket') : url.includes('ticket='));

/** Where snapd puts its commands: `/snap/bin` on Debian and Ubuntu, `/var/lib/snapd/snap/bin` on Fedora, Arch and openSUSE. */
const SNAP_ROOTS = ['/snap/', '/var/lib/snapd/snap/'];

/** Whether a Linux browser is a snap, by its resolved path: snap confinement cannot read the hidden root of the sign-in file. */
const isSnap = (command) => SNAP_ROOTS.some((root) => command.startsWith(root));

/**
 * Opens `url` in an app window (a Chromium window without tabs or address bar) of the first browser that launches,
 * shared by `nurselog open --app` and the SessionStart hook: on macOS `/usr/bin/open -na <App> --args --app=<url>` for
 * each of `MAC_APP_BROWSERS` whose `<App>.app` exists in `/Applications` or `~/Applications` (the others are skipped,
 * so `open` never shows its error dialog for an application that is not there), else the first of `LINUX_APP_BROWSERS`
 * found on PATH that does not exit non-zero within `LINUX_LAUNCH_GRACE_MS`. Returns the browser's name, or undefined
 * when none launched. A `url` with a `ticket` reaches the browser as the `file://` URL of a sign-in file
 * (`signInFile`, by default `writeSignInFile`), written at the first launch that needs it and at most once, so no
 * argv carries the ticket; only a Linux snap browser, which cannot read that file, gets `url` itself. When the file
 * cannot be written it launches nothing more and throws a `SignInFileError`. `deps` replaces the platform and the
 * machine calls, so a test opens nothing; `launchOptions` (`env` and `cwd`) goes to every `launch`.
 */
export const openAppWindow = async (url, deps = {}) => {
  const { platform = process.platform, launch: run = launch, resolve: find = resolveCommand, exists = existsSync, launchOptions } = deps;
  const signInFile = deps.signInFile ?? ((target) => writeSignInFile(target));
  const ticketed = carriesTicket(url);
  let fileUrl;
  const signInUrl = () => {
    if (!ticketed) {
      return url;
    }
    if (fileUrl === undefined) {
      try {
        fileUrl = signInFile(url);
      } catch (error) {
        throw new SignInFileError(error);
      }
    }
    return fileUrl;
  };
  if (platform === 'darwin') {
    for (const browser of MAC_APP_BROWSERS.filter((name) => macAppPaths(name).some((path) => exists(path)))) {
      if (await run(MAC_OPEN, ['-na', browser, '--args', `--app=${signInUrl()}`], UNTIL_EXIT, launchOptions)) {
        return browser;
      }
    }
    return undefined;
  }
  for (const browser of LINUX_APP_BROWSERS) {
    const command = find(browser);
    if (command === undefined) {
      continue;
    }
    const target = isSnap(command) ? url : signInUrl();
    if (await run(command, [`--app=${target}`], LINUX_LAUNCH_GRACE_MS, launchOptions)) {
      return browser;
    }
  }
  return undefined;
};

/** How long a SessionStart that started the board waits for its app window to launch (design section 9). */
export const AUTO_OPEN_WAIT_MS = 1000;

/** The sign-in URL of the proven board of `server.json` (`signInBoard`), else `url` as it is. */
const defaultSignIn = async (url) => (await signInBoard()).signIn ?? url;

/** The command that opens the board by hand: `open` starts the board when it is down, waits for it and opens the window. */
const openByHand = (cli, short) => cliCommand(undefined, 'open --app', cli, short);

/**
 * The line a SessionStart that has started the board adds to its message when `env.NURSELOG_AUTO_OPEN` is `app`
 * (design section 9), after it opened `url` in an app window: undefined when the variable is anything else, or when
 * the window launched; else why none did and the command that opens it by hand (`cliCommand` of `cli` and `short`).
 * The window opens the sign-in URL `signIn(url)` gives (by default a ticket URL of `signInBoard`, else `url`), so it
 * signs in, through the sign-in file of `openAppWindow`; when that file cannot be written no window opens and the line
 * says so. The lines name `url` without a ticket. The browser runs with `launchOptions`, by default the board's
 * environment (`boardEnv`, without the session's variables) in the home directory, because it outlives the session. It
 * waits at most `waitMs` for the launch, so a slow browser never holds the hook past its budget, and it never throws.
 */
export const autoOpenLine = async (url, options = {}) => {
  const { env = process.env, cli = CLI_PATH, short, waitMs = AUTO_OPEN_WAIT_MS, signIn = defaultSignIn, ...deps } = options;
  const launchOptions = options.launchOptions ?? { env: boardEnv(env), cwd: homedir() };
  if (env.NURSELOG_AUTO_OPEN !== 'app') {
    return undefined;
  }
  const platform = deps.platform ?? process.platform;
  const byHand = openByHand(cli, short);
  if (platform !== 'darwin' && platform !== 'linux') {
    return `No app window: NURSELOG_AUTO_OPEN=app works on macOS and Linux only; open the board at ${url}`;
  }
  let timer;
  try {
    const slow = new Promise((done) => {
      timer = setTimeout(() => done(null), waitMs);
    });
    const opened = signIn(url).then((target) => openAppWindow(target, { ...deps, launchOptions }));
    const browser = await Promise.race([opened, slow]);
    if (browser === null) {
      return `The app window is still opening; if it does not appear, open it with: ${byHand}`;
    }
    if (browser === undefined) {
      const tried = platform === 'darwin' ? MAC_APP_BROWSERS : LINUX_APP_BROWSERS;
      return `No app window opened: no Chromium browser launched (tried ${tried.join(', ')}); open one with: ${byHand}`;
    }
    return undefined;
  } catch (error) {
    if (error instanceof SignInFileError) {
      return `No app window opened: ${error.message}; open one with: ${byHand}`;
    }
    return `No app window opened: the launch failed; open one with: ${byHand}`;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The line a SessionStart adds to its "board is starting" message when `env.NURSELOG_AUTO_OPEN` is `app`: no window
 * opened, because a board that has not answered has no address yet; undefined for any other value.
 */
export const autoOpenStartingLine = ({ env = process.env, cli = CLI_PATH, short } = {}) => {
  if (env.NURSELOG_AUTO_OPEN !== 'app') {
    return undefined;
  }
  return `No app window yet: the board is still starting; open it with: ${openByHand(cli, short)}`;
};
