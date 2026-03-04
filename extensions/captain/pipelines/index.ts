// ── Pipeline Registry — re-exports all built-in pipeline presets ──────────
// Add new pipelines as separate .ts files in this folder and export them here.
// Each pipeline module exports: { agents, pipeline }

// ── Original pipelines ───────────────────────────────────────────────────
export * as researchAndSummarize from "./research-and-summarize.js";
export * as fullFeatureBuild from "./full-feature-build.js";
export * as gatedFeatureBuild from "./gated-feature-build.js";

// ── New pipelines ────────────────────────────────────────────────────────
export * as bugHunt from "./bug-hunt.js";
export * as refactorAndVerify from "./refactor-and-verify.js";
export * as prReview from "./pr-review.js";
export * as apiDesign from "./api-design.js";
export * as migrationPlanner from "./migration-planner.js";
export * as testCoverageBoost from "./test-coverage-boost.js";
export * as documentationGen from "./documentation-gen.js";
export * as securityAudit from "./security-audit.js";
export * as shrinker from "./shrinker.js";
