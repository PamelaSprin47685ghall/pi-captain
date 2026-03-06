// ── Pipeline: Shredder ───────────────────────────────────────────────────
// Takes any requirement → clarifies → decomposes → shrinks to Haiku-safe
// units → validates with Flash dry-run → resolves dependency graph into
// parallelizable execution layers → outputs a structured task tree →
// generates an executable pipeline spec → renders a visual backlog.canvas.
// No execution — planning only.
//
// Flow:
//   1. CLARIFY     → clarifier produces a structured spec from raw requirement
//   2. DECOMPOSE   → decomposer splits spec into atomic sub-tasks (pool ×3, ranked)
//   3. SHRED       → shrinker scores complexity, re-splits until Haiku-safe
//   4. VALIDATE    → validator confirms each unit is single-pass executable
//                    (fallback → re-shred failing units)
//   5. RESOLVE     → resolver builds dependency graph, topological sort → layers
//   6. FORMAT      → format layered units into a final task tree
//   7. EXEC SPEC   → generate an executable captain pipeline JSON spec
//   8. CANVAS      → render backlog.canvas for Obsidian
//
// Preset: captain:shredder (load with: captain_load { action: "load", name: "captain:shredder" })
// Agents: clarifier, decomposer, shrinker, validator, resolver,
//         canvas-renderer (bundled in extensions/captain/agents/)
// Steps:  extensions/captain/steps/{capture-and-clarify,decompose,shred-and-score,
//         re-shred,validate-units,resolve-dependencies,format-tree,
//         generate-execution-spec,render-canvas}.ts

import {
	captureAndClarify,
	decompose,
	formatTree,
	generateExecutionSpec,
	renderCanvas,
	resolveDependencies,
	shredAndScore,
	validateUnits,
} from "../steps/index.js";
import type { Pool, Runnable } from "../types.js";

// ── Stage 2: Pool of 3 decomposition attempts — rank best ───────────────

const decomposePool: Pool = {
	kind: "pool",
	step: decompose,
	count: 3,
	merge: { strategy: "rank" },
};

// ── Pipeline Spec ────────────────────────────────────────────────────────

export const pipeline: Runnable = {
	kind: "sequential",
	steps: [
		captureAndClarify, //  1️⃣  CLARIFY   — raw requirement → structured spec
		decomposePool, //  2️⃣  DECOMPOSE — pool ×3 decomposition attempts (ranked)
		shredAndScore, //  3️⃣  SHRED     — score & re-split until composite ≤ 2
		validateUnits, //  4️⃣  VALIDATE  — Flash dry-run (fallback → re-shred)
		resolveDependencies, //  5️⃣  RESOLVE   — adjacency graph → topo sort → layers
		formatTree, //  6️⃣  FORMAT    — output final layered task tree
		generateExecutionSpec, //  7️⃣  EXEC SPEC — task tree → pipeline JSON spec
		renderCanvas, //  8️⃣  CANVAS    — render backlog.canvas for Obsidian
	],
};
