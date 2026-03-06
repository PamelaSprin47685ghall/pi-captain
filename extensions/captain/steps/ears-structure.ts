// ── Step: EARS Structure ─────────────────────────────────────────────────
// Stage 1 of req-decompose: Transform a raw requirement into EARS-structured
// (Easy Approach to Requirements Syntax) statements that are individually
// testable: "While [precondition], when [trigger], the [system] shall [response]."

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const earsStructure: Step = {
	kind: "step",
	label: "EARS Structure",
	agent: "clarifier",
	description:
		"Transform raw requirement into testable EARS-structured statements",
	prompt:
		"You are a Requirements Analyst expert in EARS notation (Easy Approach to Requirements Syntax).\n\n" +
		"Raw requirement:\n$ORIGINAL\n\n" +
		"Transform this requirement into structured EARS statements:\n\n" +
		"EARS patterns:\n" +
		"- Ubiquitous: 'The [system] shall [response]'\n" +
		"- Event-driven: 'When [trigger], the [system] shall [response]'\n" +
		"- State-driven: 'While [precondition], the [system] shall [response]'\n" +
		"- Conditional: 'Where [feature], the [system] shall [response]'\n" +
		"- Optional feature: 'Where [optional feature], the [system] shall [response]'\n\n" +
		"For each EARS requirement:\n\n" +
		"### REQ-N: [name]\n" +
		"- Pattern: [ubiquitous | event-driven | state-driven | conditional]\n" +
		"- EARS: [full EARS statement]\n" +
		"- Precondition: [or 'none']\n" +
		"- Trigger: [or 'none']\n" +
		"- System: [the component/system]\n" +
		"- Response: [the expected behaviour]\n" +
		"- Assumptions: [if any ambiguity was resolved — state what you assumed]\n\n" +
		"Rules:\n" +
		"- Each statement must be independently testable\n" +
		"- Expose all implicit preconditions\n" +
		"- One behaviour per statement (no 'and' combining multiple responses)\n" +
		"- If the requirement is vague, make reasonable assumptions and note them\n\n" +
		"End with:\n" +
		"TOTAL REQUIREMENTS: N",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
