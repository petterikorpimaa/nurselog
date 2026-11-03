// The part of the hook library the browser-safe core of `src/` needs (design section 15, "Live demo"): the default
// roles and the text helpers the config (`src/config-core.ts`) is built from. Plain ESM without imports, no Node
// built-in and no `process`, so the live demo can bundle it; `hooks/lib.mjs` re-exports all of it, and
// `browser-safe.d.mts` types it for TypeScript.

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
