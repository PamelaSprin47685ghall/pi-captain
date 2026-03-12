// ── Backward-compat shim ──────────────────────────────────────────────────
// on-fail presets are pure functions → moved to core/on-fail.ts.
// External callers (index.public.ts, tests) still import from here.
export * from "../core/on-fail.js";
