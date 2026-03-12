// ── Pipeline: Spec-Driven TDD ────────────────────────────────────────────
// A very safe, gate-heavy pipeline enforcing strict spec-driven development
// with Test-Driven Development (RED → GREEN) methodology.
//
// Flow:
//   1. SPEC        → spec-writer produces a detailed technical specification
//   2. TDD RED     → tdd-red writes failing tests from the spec (tests MUST fail)
//   3. TDD GREEN   → tdd-green writes minimal code to make tests pass
//                  ↕ (parallel with code)
//      DOC         → doc-writer produces documentation from the spec
//   4. REVIEW      → code-reviewer audits code + tests + docs for quality
//                    (fallback → review-fixer fixes critical issues)
//   5. PR          → pr-preparer creates branch, commits, pushes (human approval)
//
// Safety guarantees:
//   - Every step has a meaningful gate (no "none" gates on critical steps)
//   - Human approval gate before PR creation
//   - Tests must FAIL after RED, PASS after GREEN
//   - LLM quality gates on spec and review
//   - onFail strategies tuned per step (retry critical, warn optional)
//
// Preset: captain:spec-tdd (load with: captain_load { action: "load", name: "captain:spec-tdd" })
// Agents: spec-writer, tdd-red, tdd-green, doc-writer, code-reviewer,
//         review-fixer, pr-preparer (bundled in extensions/captain/agents/)
// Steps:  extensions/captain/steps/{write-spec,tdd-red,tdd-green,write-docs,
//         review-code,fix-review-issues,prepare-pr}.ts

import { concat } from "../../extensions/captain/core/merge.js";
import type { Parallel, Runnable } from "../../extensions/captain/types.js";
import { preparePR } from "../steps/prepare-pr.js";
import { reviewCode } from "../steps/review-code.js";
import { tddGreen } from "../steps/tdd-green.js";
import { tddRed } from "../steps/tdd-red.js";
import { writeDocs } from "../steps/write-docs.js";
import { writeSpec } from "../steps/write-spec.js";

// ── Stage 3: Parallel — Code + Doc run concurrently ─────────────────────

const codeAndDoc: Parallel = {
	kind: "parallel",
	steps: [tddGreen, writeDocs],
	merge: concat,
};

// ── Pipeline Spec ────────────────────────────────────────────────────────

export const pipeline: Runnable = {
	kind: "sequential",
	steps: [
		writeSpec, //  1️⃣  SPEC    — spec-writer writes technical specification
		tddRed, //  2️⃣  RED     — tdd-red writes failing tests
		codeAndDoc, //  3️⃣  GREEN   — tdd-green codes | doc-writer documents (parallel)
		reviewCode, //  4️⃣  REVIEW  — code-reviewer audits (fallback → review-fixer)
		preparePR, //  5️⃣  PR      — pr-preparer branches, commits, pushes
	],
};
