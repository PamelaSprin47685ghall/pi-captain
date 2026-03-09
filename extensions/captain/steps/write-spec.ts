// ── Step: Write Technical Spec ────────────────────────────────────────────
// Stage 1 of spec-tdd: Architect analyzes codebase and produces a detailed,
// testable technical specification from the raw requirement.

import { allOf, llmFast, outputIncludesCI, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const writeSpec: Step = {
	kind: "step",
	label: "Write Technical Spec",
	tools: ["read", "bash", "grep", "find", "ls"],
	temperature: 0.3,
	description:
		"Analyze the requirement and codebase, then produce a detailed technical specification",
	prompt:
		"You are the Spec Writer. Analyze this requirement and the existing codebase to produce a " +
		"detailed technical specification.\n\n" +
		"Requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Use `find` and `ls` to understand the project structure\n" +
		"2. Use `read` to examine existing code, types, patterns, and test conventions\n" +
		"3. Identify what files need to be created or modified\n" +
		"4. Identify the test framework and testing patterns already in use\n\n" +
		"Produce a spec in this EXACT format:\n\n" +
		"# Technical Specification\n\n" +
		"## Summary\n(What this feature/change does in 1-2 sentences)\n\n" +
		"## Requirements\n" +
		"1. (functional requirement — testable)\n" +
		"2. ...\n\n" +
		"## Public API\n" +
		"(Functions, types, interfaces to expose — with signatures)\n\n" +
		"## Files to Create/Modify\n" +
		"- `path/to/file.ts` — (what changes)\n" +
		"- `path/to/file.test.ts` — (test file)\n\n" +
		"## Acceptance Criteria\n" +
		"1. (specific, testable criterion)\n" +
		"2. ...\n\n" +
		"## Edge Cases\n" +
		"- (boundary condition to handle)\n\n" +
		"## Constraints\n" +
		"- (technical limitations, compatibility requirements)\n\n" +
		"## Test Strategy\n" +
		"- Unit tests: (what to test)\n" +
		"- Edge case tests: (boundary scenarios)\n" +
		"- Error handling tests: (failure modes)\n\n" +
		"Be precise. Every requirement and acceptance criterion must be directly testable.",
	gate: allOf(
		outputIncludesCI("acceptance criteria"),
		outputIncludesCI("public api"),
		outputIncludesCI("test strategy"),
		llmFast(
			"Does this technical spec contain: (1) clear testable requirements, " +
				"(2) specific file paths, (3) public API signatures, (4) acceptance criteria, " +
				"(5) edge cases? Rate completeness 0-1. Threshold: 0.7",
		),
	),
	onFail: retry(2),
	transform: { kind: "full" },
};
