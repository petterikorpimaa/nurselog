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
