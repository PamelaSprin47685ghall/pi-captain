// ── Step: Shrink and Score ────────────────────────────────────────────────
// Stage 3 of shredder: Score each unit's complexity on three axes and
// re-split any unit above the Haiku-safe threshold (composite ≤ 2).

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const shredAndScore: Step = {
	kind: "step",
	label: "Shrink and Score",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.1,
	description:
		"Score complexity and re-split any unit above the Haiku-safe threshold",
	prompt:
		"You are the Shredder. Score each unit's complexity.\n\n" +
		"Units:\n$INPUT\n\n" +
		"Score each on 1-5:\n" +
		"- Token Context (1=under 500 tokens, 2=under 1K, 3=under 2K, 4=under 4K, 5=over 4K)\n" +
		"- Decision Count (1=zero/one decision, 2=two, 3=three, 4=four+, 5=complex branching)\n" +
		"- Reasoning Depth (1=lookup/copy, 2=simple transform, 3=single inference, 4=chain of 2, 5=deep chain)\n\n" +
		"Composite = max of all three. Target: composite 2 or below (Haiku-safe).\n\n" +
		"For each unit:\n" +
		"### UNIT-N: name\n" +
		"- Token: X | Decision: X | Reasoning: X\n" +
		"- Composite: X — PASS or FAIL\n" +
		"- Dependencies: (preserve from input — none or UNIT-X)\n\n" +
		"For any FAIL unit, decompose it inline into smaller sub-units and re-score.\n" +
		"When splitting a unit, update dependency references: units that depended on the\n" +
		"split unit should depend on its children instead.\n" +
		"Repeat until every unit passes.\n\n" +
		"Output each unit in full — preserve ALL original contract fields (Goal, Traceability,\n" +
		"Function, File, Layer, Input schema, Output shape, Constraints, Pre-written test,\n" +
		"Verification, Acceptance Test, Dependencies) and append the score fields below them.\n" +
		"Do NOT strip any contract fields. Only the complexity scores and re-splits are new.\n" +
		"End with:\n" +
		"SHRUNKEN UNITS READY: count\n" +
		"ALL PASS: YES\n\n" +
		"Finally, output a JSON summary block:\n" +
		"```json\n" +
		'{"total_units": N, "all_pass": true}\n' +
		"```",
	gate: none,
	onFail: retry(3),
	transform: { kind: "full" },
};
