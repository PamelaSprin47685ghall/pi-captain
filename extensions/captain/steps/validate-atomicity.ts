// ── Step: Validate Atomicity ──────────────────────────────────────────────
// Stage 5 of req-decompose: Verify every TDD task is truly atomic:
// 1 function, 1 test, 5–15 min estimate. Flag and re-split any violators.

import { fallback, regexCI } from "../gates/index.js";
import type { Step } from "../types.js";
import { tddTaskList } from "./tdd-task-list.js";

// Reuse tddTaskList as the fallback to re-split non-atomic tasks
const reExpandTasks: typeof tddTaskList = {
	...tddTaskList,
	label: "Re-expand Tasks",
	description: "Re-apply TDD task list to non-atomic tasks",
	prompt:
		"Some TDD tasks were flagged as non-atomic. Re-expand ONLY the failing tasks into smaller items.\n\n" +
		"Full task list (failing tasks flagged below):\n$INPUT\n\n" +
		"For each FAIL task, produce 2–4 smaller sub-tasks following the same format.\n" +
		"Keep all PASS tasks unchanged. Output the complete merged task list.\n\n" +
		"End with:\n" +
		"TOTAL TASKS: N\n" +
		"ALL ATOMIC: YES",
};

export const validateAtomicity: Step = {
	kind: "step",
	label: "Validate Atomicity",
	agent: "validator",
	description:
		"Verify each TDD task is truly atomic: 1 function, 1 test, 5–15 min",
	prompt:
		"You are the Atomicity Validator. Check every TDD task against atomicity criteria.\n\n" +
		"TDD task list:\n$INPUT\n\n" +
		"For each task, answer three questions:\n" +
		"1. Single function? (does it touch exactly one function/method?)\n" +
		"2. Single test? (does it require exactly one test assertion?)\n" +
		"3. Time-boxed? (can a developer complete it in 5–15 minutes?)\n\n" +
		"For each task:\n" +
		"### TASK-N.X.Y: [name]\n" +
		"- Single function: YES / NO\n" +
		"- Single test: YES / NO\n" +
		"- Time-boxed (5–15 min): YES / NO\n" +
		"- Verdict: PASS / FAIL\n" +
		"- Reason: (one sentence if FAIL)\n\n" +
		"Then output summary:\n" +
		"VALIDATED: X / Y\n" +
		'FAILED TASKS: (comma-separated list, or "none")\n\n' +
		"If all tasks passed, end with exactly:\n" +
		"ALL ATOMIC: YES\n\n" +
		"If any failed, end with exactly:\n" +
		"ALL ATOMIC: NO",
	gate: regexCI("all.atomic.*yes"),
	onFail: fallback(reExpandTasks),
	transform: { kind: "full" },
};
