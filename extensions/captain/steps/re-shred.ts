// ── Step: Re-Shred Failed Units ──────────────────────────────────────────
// Fallback step for validation: re-splits units that failed the single-pass
// dry-run into smaller sub-units until all are Haiku-safe.

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const reShred: Step = {
	kind: "step",
	label: "Re-Shred Failed Units",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.1,
	description:
		"Extract failed unit names from validation output and re-decompose them into smaller units",
	prompt:
		"You are the Shrinker. The previous validation step found units that cannot be executed " +
		"in a single pass. Your job is to re-split those failing units into smaller, simpler sub-units.\n\n" +
		"Validation output (contains FAILED UNITS list):\n$INPUT\n\n" +
		"Instructions:\n" +
		"1. Parse the FAILED UNITS list from the validation output\n" +
		"2. For each failed unit, decompose it into 2-3 smaller sub-units that ARE single-pass executable\n" +
		"3. Preserve all passing units exactly as they are\n" +
		"4. Update dependency references: any unit that depended on a split unit should depend on its children\n" +
		"5. Re-score all new sub-units to confirm composite ≤ 2\n\n" +
		"Output ALL units (passing originals + new sub-units) in the same format:\n\n" +
		"### UNIT-N: name\n" +
		"- Goal: one sentence\n" +
		"- Input: what it receives\n" +
		"- Output: what it produces\n" +
		"- Acceptance Test: how to verify\n" +
		"- Dependencies: none or UNIT-X\n" +
		"- Token: X | Decision: X | Reasoning: X\n" +
		"- Composite: X — PASS\n\n" +
		"End with TOTAL UNITS: count",
	gate: none,
	onFail: retry(1),
	transform: { kind: "full" },
};
