// ── Step: Capture and Clarify ─────────────────────────────────────────────
// Stage 1 of shredder: Transform a raw requirement into a structured,
// unambiguous specification with inputs, outputs, acceptance criteria.

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const captureAndClarify: Step = {
	kind: "step",
	label: "Capture and Clarify",
	agent: "clarifier",
	description: "Transform raw requirement into a structured spec",
	prompt:
		"You are the Clarifier. Take this raw requirement and produce a structured spec.\n\n" +
		"Requirement:\n$ORIGINAL\n\n" +
		"Produce a spec in this exact format:\n\n" +
		"## STRUCTURED SPEC\n\n" +
		"### Title\n(concise name)\n\n" +
		"### Inputs\n- (what the system receives)\n\n" +
		"### Outputs\n- (what the system produces)\n\n" +
		"### Acceptance Criteria\n1. (testable criterion)\n2. ...\n\n" +
		"### Constraints\n- (limitations, boundaries)\n\n" +
		"### Edge Cases\n- (unusual scenarios to handle)\n\n" +
		"Be precise. Eliminate all ambiguity. If the requirement is vague, " +
		"make reasonable assumptions and state them explicitly.",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
