// ── Backward-compat shim ──────────────────────────────────────────────────
// Transform presets are pure functions → moved to core/transform-presets.ts.
// External callers (index.public.ts, tests) still import from here.
export * from "../core/transform-presets.js";
