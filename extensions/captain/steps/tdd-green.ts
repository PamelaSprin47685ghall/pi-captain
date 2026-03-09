// ── Step: TDD Green — Write Implementation ──────────────────────────────
// Stage 3a of spec-tdd: Builder writes the minimal implementation to make
// all failing tests pass. Does NOT modify test files.

import { bunTest, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const tddGreen: Step = {
	kind: "step",
	label: "TDD Green — Write Implementation",
	tools: ["read", "write", "edit", "bash", "grep", "find", "ls"],
	temperature: 0.2,
	description:
		"Write the minimal implementation code to make all failing tests pass",
	prompt:
		"You are the TDD Green Builder. The tests already exist and are FAILING. " +
		"Your job is to write the MINIMAL implementation to make them PASS.\n\n" +
		"Previous step output (test results + spec context):\n$INPUT\n\n" +
		"Original Requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Find and read the test files to understand exactly what's expected:\n" +
		"   - Run: find . -name '*.test.*' -o -name '*.spec.*' | head -20\n" +
		"   - Read each test file carefully\n" +
		"2. Read the existing codebase to match patterns and conventions\n" +
		"3. Write the MINIMAL code to make all tests pass:\n" +
		"   - Follow the public API signatures from the spec\n" +
		"   - Match the file paths specified in the spec\n" +
		"   - Don't add features beyond what the tests verify\n" +
		"4. Run `bun test` after each file you write\n" +
		"5. Iterate until ALL tests pass\n" +
		"6. Run `bun test` one final time and confirm:\n" +
		"   - All tests passing: YES\n" +
		"   - IMPLEMENTATION FILES: (list of files created/modified)\n\n" +
		"CRITICAL RULES:\n" +
		"- MINIMAL code only — if a test doesn't check for it, don't build it\n" +
		"- Do NOT modify any test files\n" +
		"- Clean, readable code following existing patterns\n" +
		"- Proper error handling as specified by the tests\n" +
		"- Run tests frequently — commit to green incrementally",
	// Gate: all tests must pass
	gate: bunTest,
	onFail: retry(3),
	transform: { kind: "full" },
	maxTurns: 25,
};
