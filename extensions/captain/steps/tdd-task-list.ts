// ── Step: TDD Task List ───────────────────────────────────────────────────
// Stage 4 of req-decompose: Apply Kent Beck's Canon TDD task list technique
// to each BDD scenario. Expand each scenario into a list of unit-level test
// scenarios → each maps to 1 failing test → 1 function → 1 commit.
// This is the last-mile decomposition (story → atomic implementation tasks).

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const tddTaskList: Step = {
	kind: "step",
	label: "TDD Task List",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.2,
	description:
		"Apply Kent Beck's Canon TDD task list: each BDD scenario → atomic unit tests → 1 function each",
	prompt:
		"You are a TDD practitioner applying Kent Beck's Canon TDD task list technique.\n\n" +
		"BDD scenarios:\n$INPUT\n\n" +
		"For each BDD scenario, produce a TDD task list:\n" +
		"- Write ALL test scenarios you can think of for this behaviour (one line each)\n" +
		"- Order them: simplest / degenerate case first, then progressively more complex\n" +
		"- Each item = exactly 1 unit test + 1 function/code change + 1 commit\n" +
		"- Estimated implementation time per item: 5–15 minutes\n" +
		"- If an item would take longer → split it further\n\n" +
		"For each BDD scenario:\n\n" +
		"### STORY-N, SCENARIO N.X: [scenario name]\n" +
		"[Acceptance test: Given/When/Then from input]\n\n" +
		"**TDD Task List:**\n" +
		"- [ ] TASK-N.X.1: [test name] → fn: [function name to implement]\n" +
		"  - Test: [one-line description of what the unit test asserts]\n" +
		"  - Implementation: [one-line description of the code to write]\n" +
		"  - Est: [minutes]\n" +
		"- [ ] TASK-N.X.2: ...\n" +
		"(newly discovered tasks found while thinking are added at end with *)\n\n" +
		"Atomicity rules per task:\n" +
		"- Single responsibility: tests exactly ONE behaviour\n" +
		"- Single function: implements or modifies exactly ONE function\n" +
		"- No setup beyond the function under test\n" +
		"- A junior dev should be able to complete it in one sitting without interruption\n\n" +
		"End with:\n" +
		"TOTAL TASKS: N\n" +
		"ALL ATOMIC: YES / NO (if NO, flag which tasks need further splitting)",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
