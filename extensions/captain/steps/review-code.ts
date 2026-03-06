// ── Step: Code Review ────────────────────────────────────────────────────
// Stage 4 of spec-tdd: Reviewer audits implementation, tests, and docs.
// Produces a structured verdict with severity-rated issues.
// On failure (critical issues found), falls back to review-fix step.

import { allOf, bunTest, fallback, llmFast, regexCI } from "../gates/index.js";
import type { Step } from "../types.js";
import { fixReviewIssues } from "./fix-review-issues.js";

export const reviewCode: Step = {
	kind: "step",
	label: "Code Review",
	agent: "code-reviewer",
	description:
		"Review implementation, tests, and documentation for quality and correctness",
	prompt:
		"You are the Code Reviewer. Conduct a thorough code review of the implementation.\n\n" +
		"Context from previous steps:\n$INPUT\n\n" +
		"Original Requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Read ALL implementation files that were created/modified\n" +
		"2. Read ALL test files\n" +
		"3. Read ALL documentation files\n" +
		"4. Run `bun test` to confirm tests still pass\n" +
		"5. Run `find . -name '*.ts' | xargs grep -l 'TODO\\|FIXME\\|HACK\\|XXX'` to find shortcuts\n\n" +
		"Review checklist:\n\n" +
		"## Code Quality\n" +
		"- [ ] Follows existing codebase patterns and conventions\n" +
		"- [ ] No dead code, unused imports, or commented-out blocks\n" +
		"- [ ] Proper error handling (no swallowed errors)\n" +
		"- [ ] Types are correct and precise (no `any`)\n" +
		"- [ ] Functions are focused (single responsibility)\n\n" +
		"## Test Quality\n" +
		"- [ ] Every acceptance criterion has a test\n" +
		"- [ ] Edge cases are covered\n" +
		"- [ ] Test names are descriptive\n" +
		"- [ ] No flaky patterns (timeouts, race conditions)\n" +
		"- [ ] Tests actually assert meaningful things (not just `expect(true)`)\n\n" +
		"## Documentation Quality\n" +
		"- [ ] API signatures match the implementation\n" +
		"- [ ] Examples are correct and runnable\n" +
		"- [ ] No stale or misleading information\n\n" +
		"## Security\n" +
		"- [ ] No exposed secrets or credentials\n" +
		"- [ ] Input validation on public APIs\n" +
		"- [ ] No path traversal, injection, or XSS risks\n\n" +
		"For each issue found, output:\n" +
		"- **[SEVERITY]** file:line — description — suggestion\n" +
		"  Severities: 🔴 CRITICAL | 🟡 WARNING | 🔵 INFO\n\n" +
		"End with:\n" +
		"## Verdict\n" +
		"- CRITICAL issues: N\n" +
		"- Warnings: N\n" +
		"- REVIEW PASSED: YES/NO\n" +
		"(PASSED only if zero CRITICAL issues)",
	// Gate: tests pass + review passed + LLM confirms thoroughness
	gate: allOf(
		bunTest,
		regexCI("review.passed.*yes"),
		llmFast(
			"Does this review cover code quality, test quality, documentation, and security? " +
				"Does it give a clear PASSED/FAILED verdict with zero critical issues for PASSED? " +
				"Rate thoroughness 0-1. Threshold: 0.7",
		),
	),
	// Fallback: if review finds critical issues, hand off to fixer
	onFail: fallback(fixReviewIssues),
	transform: { kind: "full" },
	maxTurns: 15,
};
