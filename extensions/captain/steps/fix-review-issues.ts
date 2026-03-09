// ── Step: Fix Review Issues ──────────────────────────────────────────────
// Fallback step for code review: fixes critical issues found by the reviewer,
// then re-verifies tests pass.

import { allOf, bunTest, regexCI, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const fixReviewIssues: Step = {
	kind: "step",
	label: "Fix Review Issues",
	tools: ["read", "write", "edit", "bash", "grep", "find", "ls"],
	temperature: 0.2,
	description:
		"Fix critical issues found during code review, then re-verify tests pass",
	prompt:
		"You are the Review Fixer. The code review found CRITICAL issues that must be fixed.\n\n" +
		"Review output:\n$INPUT\n\n" +
		"Original Requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Read the review output and identify all 🔴 CRITICAL issues\n" +
		"2. For each critical issue:\n" +
		"   a. Read the file mentioned\n" +
		"   b. Apply the minimal, targeted fix\n" +
		"   c. Run `bun test` to ensure nothing breaks\n" +
		"3. Address 🟡 WARNING issues if the fix is straightforward\n" +
		"4. Run `bun test` one final time\n" +
		"5. Report what was fixed:\n" +
		"   - FIXES APPLIED: N\n" +
		"   - All tests passing: YES\n" +
		"   - REVIEW PASSED: YES",
	// Gate: tests must pass + review issues resolved
	gate: allOf(bunTest, regexCI("review.passed.*yes")),
	onFail: retry(2),
	transform: { kind: "full" },
	maxTurns: 20,
};
