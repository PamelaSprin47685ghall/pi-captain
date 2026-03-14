// Backward-compatibility shim — examples and external code that import
// directly from "captain/types.js" continue to work unchanged.
// New code should import from "./core/types.js" or via "./captain.ts".
export * from "./core/types.js";
