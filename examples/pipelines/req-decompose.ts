// ── Pipeline: Requirement Decomposition to Atomic Tasks ─────────────────
// Implements the two-phase ATDD/TDD pipeline from the research document
// "Requirement Decomposition to Atomic Tasks" (research-vault, 2026-03-06).
//
// Takes any requirement and progressively refines it down to the smallest
// possible unit of work: 1 function, 1 test, 1 commit (5–15 min each).
//
// Flow:
//   1. EARS        → clarifier structures requirement into testable EARS statements
//                    "While [precondition], when [trigger], the [system] shall [response]"
//   2. SLICE       → decomposer vertically slices into thin user stories
//                    (pool ×3, ranked) using business rule splitting + SPIDR
//   3. BDD         → clarifier distills each story into Given/When/Then scenarios
//                    (ATDD outer loop — each scenario = 1 acceptance test)
//   4. TDD LIST    → decomposer applies Kent Beck's Canon TDD task list
//                    (inner loop — each item = 1 failing test → 1 function → 1 commit)
//   5. VALIDATE    → validator checks atomicity: 1 fn, 1 test, 5–15 min
//                    (fallback → re-expand non-atomic tasks)
//   6. BACKLOG     → resolver formats BACKLOG.md living decomposition artifact
//
// Decomposition hierarchy produced:
//   Requirement
//     └── EARS requirements (testable, unambiguous)
//           └── User Stories (INVEST, vertical slices, business rule split)
//                 └── BDD Scenarios (Given/When/Then, acceptance tests)
//                       └── TDD Task List items
//                             └── 1 failing unit test → 1 function → 1 commit
//
// Preset: captain:req-decompose
//   Load with: captain_load { action: "load", name: "captain:req-decompose" }
//
// Agents: clarifier, decomposer, validator, resolver (bundled in extensions/captain/agents/)
// Steps:  extensions/captain/steps/{ears-structure,slice-stories,bdd-scenarios,
//         tdd-task-list,validate-atomicity,format-backlog}.ts

import { rank } from "../../extensions/captain/presets.js";
import type { Parallel, Runnable } from "../../extensions/captain/types.js";
import { bddScenarios } from "../steps/bdd-scenarios.js";
import { earsStructure } from "../steps/ears-structure.js";
import { formatBacklog } from "../steps/format-backlog.js";
import { sliceStories } from "../steps/slice-stories.js";
import { tddTaskList } from "../steps/tdd-task-list.js";
import { validateAtomicity } from "../steps/validate-atomicity.js";

// ── Stage 2: 3 story-slicing attempts in parallel — rank best ───────────
// Business rule splitting benefits from multiple decomposition attempts;
// the ranked merge picks the most granular / INVEST-compliant result.

const slicePool: Parallel = {
	kind: "parallel",
	steps: [sliceStories, sliceStories, sliceStories],
	merge: rank,
};

// ── Pipeline Spec ────────────────────────────────────────────────────────

export const pipeline: Runnable = {
	kind: "sequential",
	steps: [
		earsStructure, //  1️⃣  EARS     — structure requirement into testable EARS statements
		slicePool, //  2️⃣  SLICE    — pool ×3: vertical story slicing (ranked best)
		bddScenarios, //  3️⃣  BDD      — distill stories into Given/When/Then scenarios
		tddTaskList, //  4️⃣  TDD LIST — Kent Beck task list: each scenario → atomic tasks
		validateAtomicity, //  5️⃣  VALIDATE — check 1 fn / 1 test / 5–15 min (fallback → re-expand)
		formatBacklog, //  6️⃣  BACKLOG  — produce BACKLOG.md living decomposition artifact
	],
};
