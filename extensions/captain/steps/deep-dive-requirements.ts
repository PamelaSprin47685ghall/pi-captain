// ── Step: Deep Dive Requirements ──────────────────────────────────────────
// Stage 2 of requirements-gathering: Targeted mix of closed (yes/no, pick-one)
// and open questions to eliminate ambiguity, lock down constraints, and
// uncover edge cases.

import { retry, user } from "../gates/index.js";
import type { Step } from "../types.js";

export const deepDiveRequirements: Step = {
	kind: "step",
	label: "Deep Dive Requirements",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.5,
	description:
		"Targeted closed and open questions to eliminate ambiguity and lock down specifics",
	prompt:
		"You are the Deep Diver. Take the exploration findings and the user's answers, " +
		"then drill deeper.\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"Exploration findings + user answers:\n$INPUT\n\n" +
		"Instructions:\n" +
		"1. Analyze what the user revealed — look for implied needs they didn't state explicitly\n" +
		"2. If a codebase exists, cross-reference answers with actual code to spot gaps\n\n" +
		"Produce your deep-dive output in this EXACT format:\n\n" +
		"# Deep Dive Report\n\n" +
		"## Confirmed Understanding\n" +
		"(what we now know for certain — bullet points)\n\n" +
		"## Closed Questions (pick-one / yes-no)\n" +
		"Generate 4-6 closed questions to lock down specifics:\n" +
		"1. [SCOPE] Is X in scope or out of scope? (In / Out)\n" +
		"2. [PRIORITY] Which matters more: A or B?\n" +
		"3. [CONSTRAINT] Must this work with/without X? (Yes / No)\n" +
		"4. [ACCEPTANCE] Is [specific threshold] acceptable? (Yes / No)\n" +
		"5. [TIMELINE] Is this needed by [date] or is it flexible? (Fixed / Flexible)\n" +
		"6. [TRADE-OFF] Would you accept [trade-off A] to get [benefit B]? (Yes / No)\n" +
		"(For each: explain WHY you're asking — what requirement it locks down)\n\n" +
		"## Targeted Open Questions\n" +
		"Generate 3-4 open questions to explore revealed complexity:\n" +
		"1. [EDGE CASE] What should happen when...?\n" +
		"2. [INTEGRATION] How does this connect to...?\n" +
		"3. [WORKFLOW] Walk me through the step-by-step flow of...\n" +
		"4. [DOMAIN] Can you explain what [domain term] means in your context?\n" +
		"(For each: explain WHY you're asking)\n\n" +
		"## Emerging Requirements\n" +
		"(requirements starting to crystallize — numbered FR-001, FR-002...)\n\n" +
		"## Risk Flags\n" +
		"(potential issues, complexity, or ambiguity spotted)",
	gate: user,
	onFail: retry(2),
	transform: { kind: "full" },
};
