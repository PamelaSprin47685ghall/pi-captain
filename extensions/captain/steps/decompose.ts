// ── Step: Decompose ──────────────────────────────────────────────────────
// Stage 2 of shredder: Recursively split a structured spec into atomic,
// self-contained, testable sub-tasks with dependency tracking.

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const decompose: Step = {
	kind: "step",
	label: "Decompose",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.2,
	description: "Recursively split the spec into atomic sub-tasks",
	prompt:
		"You are the Decomposer. Take this structured spec and break it into atomic sub-tasks.\n\n" +
		"Spec:\n$INPUT\n\n" +
		"Before decomposing, scan the codebase to understand the project context:\n" +
		"1. Run: find . -type f -name '*.ts' -o -name '*.js' -o -name '*.py' | head -50\n" +
		"2. Run: cat package.json 2>/dev/null || cat Cargo.toml 2>/dev/null || " +
		"cat pyproject.toml 2>/dev/null || echo 'no manifest found'\n" +
		"3. Identify existing modules, patterns, and test files relevant to this spec\n\n" +
		"Map each sub-task to specific files/functions/modules when possible.\n" +
		"Include a 'Files' field for each unit listing the files that will be created or modified.\n\n" +
		"Rules for each sub-task:\n" +
		"- Self-contained: no hidden dependencies\n" +
		"- Single-responsibility: exactly one clear outcome\n" +
		"- Testable: include a pass/fail acceptance test\n\n" +
		"For each sub-task output:\n\n" +
		"### UNIT-N: name\n" +
		"- Goal: one sentence\n" +
		"- Input: what it receives\n" +
		"- Output: what it produces\n" +
		"- Acceptance Test: how to verify\n" +
		"- Dependencies: none or UNIT-X (comma-separated if multiple)\n" +
		"- Files: (list of files to create/modify)\n\n" +
		"Decompose further if a sub-task needs multi-step reasoning.\n" +
		"End with TOTAL UNITS: count",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
