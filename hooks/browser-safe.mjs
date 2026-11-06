// The part of the hook library the browser-safe core of `src/` needs (design section 15, "Live demo"): the default
// roles and the text helpers the config (`src/config-core.ts`) is built from, and the rules the hook and the mapping
// (`src/model/hook-payload.ts`) share: a task id, an edit's patch lines and a browser call's target. Plain ESM without
// imports, no Node built-in and no `process`, so the live demo can bundle it; `hooks/lib.mjs` re-exports all of it,
// and `browser-safe.d.mts` types it for TypeScript.

/** The default roles (design section 8), the one copy: `DEFAULT_CONFIG.roles` of `src/config-core.ts` is built from it. */
export const DEFAULT_ROLES = {
  implementer: { stage: 'implement' },
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
  planner: { stage: 'other', step: 'plan' },
  architect: { stage: 'other', step: 'plan' },
  // Claude Code's built-in Plan agent type.
  Plan: { stage: 'other', step: 'plan' },
  // A check runner runs the typecheck and the tests and returns their verdict: a check, no research (decision 190).
  'check-runner': { stage: 'other', step: 'verify' },
  '*': { stage: 'other' },
};

/** `build`, the old name of the role stage `implement` (decision 152): a config's role stage `build` reads as `implement`. */
export const LEGACY_ROLE_STAGE = 'build';

/** Removes control characters from a text built from config or repository values before it is printed. */
export const stripControl = (text) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The characters a background task id keeps at most (`isTaskId`): below the 40 at which the hook's redaction takes a run
 * of letters and digits for a token (`LONG_RUN` of `hooks/lib.mjs`), so the two limits agree; real ids are about 9.
 */
export const TASK_ID_CHARS = 39;

/**
 * A background task id as Claude Code writes it (a Bash response's `backgroundTaskId`, the `task_id` of `TaskOutput`,
 * the `bash_id` of `BashOutput`, design section 2.2): a plain word of ASCII letters, digits, `_` and `-` that starts with
 * a letter, at most `TASK_ID_CHARS`. Starting with a letter keeps it from reading as an array index, so a map keyed by
 * it keeps its insertion order, and from being `__proto__`.
 */
export const isTaskId = (value) => typeof value === 'string' && value.length <= TASK_ID_CHARS && /^[A-Za-z][\w-]*$/.test(value);

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The tools whose response patch (`structuredPatch`) gives the lines an edit added and removed (decision 250). */
export const PATCH_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);

/** The lines of a text: one per newline, plus a last line without one; 0 for an empty text. */
const lineCount = (text) => {
  let lines = 0;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) {
    lines += 1;
  }
  return text === '' || text.endsWith('\n') ? lines : lines + 1;
};

/**
 * The lines an Edit, MultiEdit or Write call added and removed (decision 250): a Write whose response `type` is
 * `create` adds the lines of its response `content` (`lineCount`, as its patch is empty), removes none and has
 * `created: true`; any other call counts its response's `structuredPatch`: of each hunk's `lines`, an entry starting
 * `+` is added, `-` removed, any other (a context line, `\ No newline at end of file`) neither. Counts only, never a
 * line. Undefined for another tool and for a response without either. The hook keeps it, and the mapping counts a raw
 * payload by it.
 */
export const patchLines = (tool, response) => {
  if (!PATCH_TOOLS.has(tool) || !isObject(response)) {
    return undefined;
  }
  const created = tool === 'Write' && response.type === 'create';
  if (created && typeof response.content === 'string') {
    return { linesAdded: lineCount(response.content), linesRemoved: 0, created: true };
  }
  if (!Array.isArray(response.structuredPatch)) {
    return undefined;
  }
  let added = 0;
  let removed = 0;
  for (const hunk of response.structuredPatch) {
    const lines = isObject(hunk) && Array.isArray(hunk.lines) ? hunk.lines : [];
    for (const line of lines) {
      if (typeof line === 'string' && line.startsWith('+')) {
        added += 1;
      } else if (typeof line === 'string' && line.startsWith('-')) {
        removed += 1;
      }
    }
  }
  const counts = { linesAdded: added, linesRemoved: removed };
  return created ? { ...counts, created: true } : counts;
};

/** The characters a browser call keeps of each element target (decision 251). */
export const BROWSER_TARGET_CHARS = 120;

/** The input fields that name a browser call's element target, as the browser servers name them, the most readable first (decision 251). */
export const BROWSER_TARGET_FIELDS = ['element', 'selector', 'uid', 'ref'];

/** A server name, lowercased, that names a browser: Playwright, Puppeteer, Chrome and its DevTools, Selenium, WebDriver, Stagehand (decision 251). */
const BROWSER_SERVER = /playwright|puppeteer|browser|chrome|devtools|selenium|webdriver|stagehand/;

/**
 * A browser call (decision 251): an MCP tool (`mcp__<server>__<tool>`) of a server whose name, lowercased, names a
 * browser (`BROWSER_SERVER`), every tool of it, or a tool named `browser_*`; no config.
 */
export const isBrowserTool = (tool) => {
  if (typeof tool !== 'string' || !tool.startsWith('mcp__')) {
    return false;
  }
  const at = tool.indexOf('__', 5);
  if (at <= 5) {
    return false;
  }
  return BROWSER_SERVER.test(tool.slice(5, at).toLowerCase()) || tool.slice(at + 2).toLowerCase().startsWith('browser_');
};

/** A path segment of this many characters or more that holds a digit reads as a token (a reset, invite, verify or callback link). */
const TOKEN_SEGMENT_CHARS = 8;
/** A path segment of this many characters or more of digits only reads as a code (a one-time code, an account number). */
const DIGIT_SEGMENT_CHARS = 6;
const isTokenSegment = (segment) => (segment.length >= TOKEN_SEGMENT_CHARS && /\d/.test(segment)) || (segment.length >= DIGIT_SEGMENT_CHARS && /^\d+$/.test(segment));
/** Bidi controls and zero-width characters, removed from a kept path as control characters are. */
export const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

/**
 * The path a kept URL shows (decision 251): its pathname percent-decoded once, control, bidi and zero-width characters
 * removed; `/` when the decoding fails or the decoded path holds `?`, `=`, `&`, `#`, `://` (an encoded query or a URL in
 * the path) or a `%` left after the one decoding (`%2541`, which a second reading would decode or refuse); else each
 * token segment (`isTokenSegment`: `TOKEN_SEGMENT_CHARS` or more characters with a digit, or `DIGIT_SEGMENT_CHARS` or
 * more digits only) replaced with `…`, while a shorter or letters-only segment stays.
 */
const keptPath = (pathname) => {
  let path;
  try {
    path = stripControl(decodeURIComponent(pathname)).replace(INVISIBLE, '');
  } catch {
    return '/';
  }
  if (/[?=&#%]|:\/\//.test(path)) {
    return '/';
  }
  return path.split('/').map((segment) => (isTokenSegment(segment) ? '…' : segment)).join('/');
};

/** The scheme at the start of a URL text, at most 32 characters. */
const URL_SCHEME = /^([A-Za-z][A-Za-z0-9+.-]{0,31}):/;
/** A URL text that is only a scheme, as `browserUrl` keeps one (`file:`). */
const ONLY_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{0,31}:$/;

/** The scheme of a URL text, lowercase with its colon, else none. */
const schemeOnly = (text) => {
  const scheme = URL_SCHEME.exec(text)?.[1];
  return scheme === undefined ? undefined : `${scheme.toLowerCase()}:`;
};

/** A text parsed as a URL, else undefined. */
const parseUrl = (text) => {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
};

/**
 * A browser call's URL as kept (decision 251), never its query, its fragment or its user info: an http or https URL as
 * its origin and path; a text without `://` (`localhost:5173/cart`) read as `http://<text>`, as its host, port and path
 * without the scheme, none when that does not parse; any other scheme, and a text with `://` that does not parse, only
 * its scheme (`file:`), none without one. A text without `://` whose authority (up to its first `/`, `\`, `?` or `#`)
 * ends with `:` is a scheme with one slash (`https:/user:pass@host/`) and keeps its scheme only, and one whose authority
 * holds `@` keeps none, as the part before its `:` may be a user name. The path is `keptPath`: no encoded query, no
 * token segment. A text that is only a scheme stays as it is, so a kept URL kept twice stays the same.
 */
export const browserUrl = (url) => {
  if (typeof url !== 'string') {
    return undefined;
  }
  const text = url.trim();
  if (ONLY_SCHEME.test(text)) {
    return text.toLowerCase();
  }
  if (!text.includes('://')) {
    const authority = /^[^/\\?#]*/.exec(text)?.[0] ?? '';
    if (authority.includes('@')) {
      return undefined;
    }
    if (authority.endsWith(':')) {
      return schemeOnly(text);
    }
    const bare = parseUrl(`http://${text}`);
    return bare ? `${bare.host}${keptPath(bare.pathname)}` : undefined;
  }
  const parsed = parseUrl(text);
  if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    return `${parsed.origin}${keptPath(parsed.pathname)}`;
  }
  return schemeOnly(text);
};

/**
 * What a browser call keeps of its tool input (decision 251): `url` by `browserUrl`, and each element target field
 * (`BROWSER_TARGET_FIELDS`) that is a string, passed through `prepare` (the hook's redaction), then cut at
 * `BROWSER_TARGET_CHARS`. Every other field is dropped: typed text (`text`, `value`, `values`, keys), scripts, paths.
 */
export const browserInput = (input, prepare = (text) => text) => {
  const kept = {};
  const fields = isObject(input) ? input : {};
  const url = browserUrl(fields.url);
  if (url !== undefined) {
    kept.url = url;
  }
  for (const field of BROWSER_TARGET_FIELDS) {
    if (typeof fields[field] === 'string') {
      kept[field] = prepare(fields[field]).slice(0, BROWSER_TARGET_CHARS);
    }
  }
  return kept;
};
