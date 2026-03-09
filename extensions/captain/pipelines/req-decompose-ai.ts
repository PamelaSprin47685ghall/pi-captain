// ── Pipeline: Requirement Decomposition for AI Execution ─────────────────
// The AI-executable evolution of req-decompose. Keeps the thoughtful 4-level
// refinement (EARS → stories → BDD → tasks) that makes req-decompose superior
// to shredder at the semantic level, but replaces every human-oriented output
// with machine-actionable contracts — then feeds the result into shredder's
// proven planning machinery (score → resolve → exec spec → canvas).
//
// Every unit produced is deterministic for an AI agent:
//   ✓ Typed function signature (no guessing input/output shapes)
//   ✓ Explicit file path (no guessing where to write)
//   ✓ Pre-written test stub (AI verifies its own work immediately)
//   ✓ Runnable verification command (shell command, not a description)
//   ✓ Haiku-safe complexity score (reliable small-model execution)
//   ✓ Topological dependency order (parallel agents don't conflict)
//   ✓ Executable captain pipeline spec (captain can run it directly)
//
// Flow:
//   1. EARS         → clarifier: requirement → individually testable EARS statements
//   2. SLICE        → decomposer pool ×3 ranked: codebase-aware vertical story slicing
//                     (business rules + SPIDR + file area grounding)
//   3. BDD          → clarifier: stories → Given/When/Then acceptance contracts
//                     (ATDD outer loop — these become the AI's acceptance tests)
//   4. CONTRACT     → decomposer: BDD scenarios → typed UNIT-N execution contracts
//                     (prompt-as-contract: input schema + constraints + output shape
//                      + pre-written test + verification command)
//   5. VALIDATE     → validator: machine-verifiability gate (typed? explicit file?
//                     pre-written test? runnable command?) fallback → re-contract failing units
//                     (must run BEFORE score so full contract fields are present)
//   6. SCORE        → shrinker: Haiku-safe complexity scoring, re-split until composite ≤ 2
//                     (preserves all contract fields; only adds score lines + re-splits)
//   7. RESOLVE      → resolver: adjacency graph → topological sort → parallel layers
//   8. EXEC SPEC    → resolver: layered units → captain pipeline JSON (execution-spec.json)
//   9. CANVAS       → canvas-renderer: visual backlog.canvas for Obsidian
//
// What changed vs req-decompose (human):
//   - sliceStories  → sliceStoriesAi   (adds codebase scan + file area per story)
//   - tddTaskList   → contractTasks    (typed contracts instead of human task list)
//   - validateAtomicity → validateContracts (machine criteria instead of human criteria)
//   - formatBacklog → shredAndScore + resolveDependencies + generateExecutionSpec + renderCanvas
//     (4 shredder stages replace 1 human-readable markdown dump)
//
// What's reused unchanged:
//   from req-decompose: earsStructure, bddScenarios
//   from shredder:      shredAndScore, resolveDependencies, generateExecutionSpec, renderCanvas
//
// Preset: captain:req-decompose-ai
//   Load with: captain_load { action: "load", name: "captain:req-decompose-ai" }
//
// Agents: clarifier, decomposer, shrinker, validator, resolver, canvas-renderer
// Steps:  extensions/captain/steps/{ears-structure, slice-stories-ai, bdd-scenarios,
//         contract-tasks, shred-and-score, validate-contracts, resolve-dependencies,
//         generate-execution-spec, render-canvas}.ts

import {
	bddScenarios,
	contractTasks,
	earsStructure,
	generateExecutionSpec,
	renderCanvas,
	resolveDependencies,
	shredAndScore,
	sliceStoriesAi,
	validateContracts,
} from "../steps/index.js";
import type { Pool, Runnable } from "../types.js";

// ── Stage 2: Pool ×3 — codebase-aware story slicing, rank best ──────────
// Multiple decomposition attempts find the most granular INVEST-compliant
// story split. The ranked merge picks the one with the most business-rule
// isolation and smallest estimated story size.

const slicePool: Pool = {
	kind: "pool",
	step: sliceStoriesAi,
	count: 3,
	merge: { strategy: "rank" },
};

// ── Pipeline Spec ────────────────────────────────────────────────────────

export const pipeline: Runnable = {
	kind: "sequential",
	steps: [
		earsStructure, //  1️⃣  EARS      — req-decompose: EARS formalization (reused)
		slicePool, //  2️⃣  SLICE     — new: codebase-aware stories, pool ×3 ranked
		bddScenarios, //  3️⃣  BDD       — req-decompose: Given/When/Then (reused)
		contractTasks, //  4️⃣  CONTRACT  — new: typed contracts, prompt-as-contract pattern
		validateContracts, //  5️⃣  VALIDATE  — new: machine-verifiability gate (before scoring)
		shredAndScore, //  6️⃣  SCORE     — shredder: Haiku-safe complexity (reused)
		resolveDependencies, //  7️⃣  RESOLVE   — shredder: topo sort → parallel layers (reused)
		generateExecutionSpec, //  8️⃣  EXEC SPEC — shredder: captain pipeline JSON (reused)
		renderCanvas, //  9️⃣  CANVAS    — shredder: Obsidian backlog.canvas (reused)
	],
};
