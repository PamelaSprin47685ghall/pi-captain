// ── Step: Challenge Requirements ──────────────────────────────────────────
// Stage 3 of requirements-gathering: Devil's advocate phase — stress-test
// all gathered information for contradictions, unstated assumptions, missing
// perspectives, and completeness.

import { retry, user } from "../gates/index.js";
import type { Step } from "../types.js";

export const challengeRequirements: Step = {
	kind: "step",
	label: "Challenge & Validate",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.6,
	description:
		"Stress-test assumptions, find contradictions, and close remaining gaps",
	prompt:
		"You are the Challenger. Review ALL gathered information and play devil's advocate.\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"All gathered information (exploration + deep-dive + user answers):\n$INPUT\n\n" +
		"Instructions:\n" +
		"1. Read through every answer carefully — look for contradictions\n" +
		"2. If a codebase exists, verify claims against actual code\n" +
		"3. Think about stakeholders/scenarios nobody mentioned\n\n" +
		"Produce your challenge report in this EXACT format:\n\n" +
		"# Challenge Report\n\n" +
		"## Contradictions Found\n" +
		"(list any conflicting statements or requirements — or 'None found')\n\n" +
		"## Unstated Assumptions\n" +
		"(what we're assuming that hasn't been explicitly confirmed)\n\n" +
		"## Missing Perspectives\n" +
		"(stakeholders, user types, or scenarios not yet considered)\n\n" +
		"## Completeness Checklist\n" +
		"- [ ] User personas defined?\n" +
		"- [ ] Happy path clear?\n" +
		"- [ ] Error/edge cases covered?\n" +
		"- [ ] Performance expectations set?\n" +
		"- [ ] Security considerations addressed?\n" +
		"- [ ] Data requirements clear?\n" +
		"- [ ] Integration points mapped?\n" +
		"- [ ] Success metrics defined?\n" +
		"- [ ] Migration/rollback plan needed?\n" +
		"- [ ] Accessibility requirements considered?\n" +
		"(Mark [x] for covered, [ ] for gaps, add notes)\n\n" +
		"## Final Confirmation Questions\n" +
		"Generate 3-5 CLOSED questions to resolve the most critical remaining uncertainties:\n" +
		"1. (question) — Yes/No\n" +
		"2. (question) — A/B/C\n" +
		"3. (question) — Yes/No\n\n" +
		"## Confidence Assessment\n" +
		"(How confident are we that requirements will be accurate? Why? What's the biggest remaining risk?)",
	gate: user,
	onFail: retry(1),
	transform: { kind: "full" },
};
