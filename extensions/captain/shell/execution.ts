// ── Backward-compat shim ──────────────────────────────────────────────────
// runContainerGate / applyTransform moved to composition/execution.ts
// (they are composition utilities, not shell coordinators).
export * from "../composition/execution.js";
