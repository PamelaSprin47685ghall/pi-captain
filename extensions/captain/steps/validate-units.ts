// ── Step: Validate Units ─────────────────────────────────────────────────
// Stage 4 of shredder: Flash dry-run — confirm each unit can be executed
// in a single pass with no ambiguity. Falls back to re-shred on failure.

import { fallback, regexCI } from "../gates/index.js";
import type { Step } from "../types.js";
import { reShred } from "./re-shred.js";

export const validateUnits: Step = {
	kind: "step",
	label: "Validate",
	tools: ["read"],
	model: "flash",
	temperature: 0,
	description:
		"Flash dry-run: confirm each unit can be executed in a single pass with no ambiguity",
	prompt:
		"You are the Validator. You are a small, fast model.\n" +
		"For each unit below, answer ONE question:\n" +
		'"Given this goal, input, and constraints — can I produce the expected output ' +
		'in a single pass with no ambiguity?"\n\n' +
		"Units:\n$INPUT\n\n" +
		"For each unit output exactly:\n" +
		"### UNIT-N: name\n" +
		"- Verdict: YES or NO\n" +
		"- Reason: (one sentence)\n" +
		"- Dependencies: (pass through from input)\n\n" +
		"Then output a summary:\n" +
		"VALIDATED: X / Y\n" +
		'FAILED UNITS: (comma-separated list, or "none")\n\n' +
		"If all units passed, end with exactly:\n" +
		"ALL VALIDATED: YES\n\n" +
		"If any failed, end with exactly:\n" +
		"ALL VALIDATED: NO\n\n" +
		"Finally, output a JSON summary block:\n" +
		"```json\n" +
		'{"validated": N, "total": N, "all_validated": true, "failed_units": []}\n' +
		"```\n" +
		'(Set "all_validated" to false and list failing unit names in "failed_units" if any failed.)',
	gate: regexCI("all.validated.*yes"),
	onFail: fallback(reShred),
	transform: { kind: "full" },
};
