// ── Backward-compat shim ──────────────────────────────────────────────────
// Gate presets are pure functions → moved to core/gate-presets.ts.
// External callers (index.public.ts, tests) still import from here.
export * from "../core/gate-presets.js";
