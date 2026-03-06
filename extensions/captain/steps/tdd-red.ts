// ── Step: TDD Red — Write Failing Tests ──────────────────────────────────
// Stage 2 of spec-tdd: Tester writes comprehensive tests from the spec.
// Tests MUST FAIL because no implementation exists yet.

import { command, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const tddRed: Step = {
	kind: "step",
	label: "TDD Red — Write Failing Tests",
	agent: "tdd-red",
	description:
		"Write comprehensive test suites from the spec. Tests MUST fail (no implementation yet).",
	prompt:
		"You are the TDD Red Tester. Your job is to write tests that will FAIL " +
		"because the implementation does not exist yet.\n\n" +
		"Technical Specification:\n$INPUT\n\n" +
		"Original Requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Read the spec carefully — every acceptance criterion becomes at least one test\n" +
		"2. Examine the existing test framework and patterns in the codebase:\n" +
		"   - Run: find . -name '*.test.*' -o -name '*.spec.*' | head -20\n" +
		"   - Read an existing test file to match the style\n" +
		"3. Write test files following the project's conventions\n" +
		"4. Include tests for:\n" +
		"   - Every requirement in the spec\n" +
		"   - Every acceptance criterion\n" +
		"   - Every edge case listed\n" +
		"   - Error handling / invalid inputs\n" +
		"   - Type safety (if TypeScript)\n" +
		"5. Use descriptive test names: `it('should reject empty input with TypeError')`\n" +
		"6. Import from the paths specified in the spec (even though they don't exist yet)\n" +
		"7. Run the tests with `bun test` — they MUST FAIL\n\n" +
		"CRITICAL: Do NOT write any implementation code. Only test files.\n" +
		"The tests must fail because the implementation doesn't exist, NOT because the tests are broken.\n\n" +
		"After writing, run `bun test` and confirm failures. Report:\n" +
		"- Total tests written\n" +
		"- All tests failing: YES\n" +
		"- TEST FILES: (list of test files created)",
	// Gate: tests must exit non-zero (all failing = success for RED phase)
	gate: command("bun test 2>&1; test $? -ne 0"),
	onFail: retry(2),
	transform: { kind: "full" },
	maxTurns: 15,
};
