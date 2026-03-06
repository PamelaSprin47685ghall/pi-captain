// ── Step: Write Documentation ────────────────────────────────────────────
// Stage 3b of spec-tdd: Doc-writer produces developer documentation from
// the spec. Runs in parallel with TDD Green.

import { llmFast } from "../gates/index.js";
import type { Step } from "../types.js";

export const writeDocs: Step = {
	kind: "step",
	label: "Write Documentation",
	agent: "doc-writer",
	description:
		"Write developer documentation from the spec (runs in parallel with implementation)",
	prompt:
		"You are the Doc Writer. Write developer documentation based on the technical specification.\n\n" +
		"Technical Specification:\n$INPUT\n\n" +
		"Original Requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Read the spec's Public API section for signatures and types\n" +
		"2. Read the existing codebase to understand where docs go:\n" +
		"   - Check for existing README.md, docs/ folder, JSDoc patterns\n" +
		"   - Match the project's documentation style\n" +
		"3. Write documentation that includes:\n" +
		"   - **Overview** — what this feature does and why\n" +
		"   - **Quick Start** — minimal usage example\n" +
		"   - **API Reference** — every public function/type with params, returns, examples\n" +
		"   - **Error Handling** — what errors can be thrown and when\n" +
		"   - **Edge Cases** — known limitations or special behaviors\n" +
		"4. If the project has JSDoc, add JSDoc comments to the API signatures\n" +
		"5. If there's a CHANGELOG, add an entry\n\n" +
		"Output the documentation and list:\n" +
		"- DOC FILES: (list of documentation files created/modified)",
	// Gate: LLM checks documentation completeness
	gate: llmFast(
		"Does this documentation include: (1) an overview, (2) usage examples, " +
			"(3) API reference with function signatures, (4) error handling docs? " +
			"Rate completeness 0-1. Threshold: 0.6",
	),
	onFail: { action: "warn" },
	transform: { kind: "full" },
	maxTurns: 15,
};
