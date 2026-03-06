// ── Step: Slice Stories ──────────────────────────────────────────────────
// Stage 2 of req-decompose: Vertically slice EARS requirements into thin,
// independently shippable user stories using business rule splitting and
// SPIDR patterns. Each story cuts through all layers (no horizontal slices).

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const sliceStories: Step = {
	kind: "step",
	label: "Slice Stories",
	agent: "decomposer",
	description:
		"Vertically slice EARS requirements into thin user stories using business rules + SPIDR",
	prompt:
		"You are a Story Slicer expert in vertical slicing and the SPIDR technique.\n\n" +
		"EARS requirements:\n$INPUT\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"Slice each EARS requirement into the thinnest possible vertical user stories.\n\n" +
		"Splitting priority order (highest to lowest atomicity):\n" +
		"1. BUSINESS RULES — isolate each validation rule, constraint, or conditional into its own story\n" +
		"   e.g. 'calculate shipping' → weight tiers rule | zone rules | free threshold rule\n" +
		"2. RULES (SPIDR R) — split by individual business rules and data validations\n" +
		"3. PATHS (SPIDR P) — split by alternative user flows or error paths\n" +
		"4. DATA (SPIDR D) — split by data subsets (e.g. admin vs. user, empty vs. populated)\n" +
		"5. WORKFLOW STEPS — one story per sequential user action\n\n" +
		"INVEST criteria — every story must be:\n" +
		"- Independent (no coupling to other stories)\n" +
		"- Negotiable (implementation details flexible)\n" +
		"- Valuable (delivers user-facing value)\n" +
		"- Estimable (1–3 hours max)\n" +
		"- Small (1–3 functions to implement)\n" +
		"- Testable (clear pass/fail)\n\n" +
		"For each story:\n\n" +
		"### STORY-N: [name]\n" +
		"- As a: [persona]\n" +
		"- I want: [action]\n" +
		"- So that: [value]\n" +
		"- Source REQ: REQ-X\n" +
		"- Splitting pattern: [business rule | SPIDR-R | SPIDR-P | SPIDR-D | workflow step]\n" +
		"- Scope: [1–2 sentence description of exact boundaries]\n" +
		"- Estimated size: [hours]\n" +
		"- Can deprioritize: [YES/NO — if this is the 20% of functionality with lower value]\n\n" +
		"Flag any story still too large with 'NEEDS FURTHER SPLITTING: YES'.\n\n" +
		"End with:\n" +
		"TOTAL STORIES: N",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
