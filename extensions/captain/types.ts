// ── Backward-compat re-export shim ────────────────────────────────────────
// types.ts has moved to core/types.ts (pure data contracts live in core/).
// This shim keeps any external import paths working.
// New code should import directly from "./core/types.js".
export * from "./core/types.js";
