// ── Step: Synthesize Requirements ─────────────────────────────────────────
// Stage 4 of requirements-gathering: Takes all gathered intelligence from
// exploration → deep-dive → challenge phases and produces a comprehensive,
// professional requirements document written to REQUIREMENTS.md.

import { allOf, file, llmFast, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const synthesizeRequirements: Step = {
	kind: "step",
	label: "Synthesize Requirements",
	tools: ["read", "bash", "write"],
	model: "flash",
	temperature: 0.3,
	description:
		"Produce the final comprehensive requirements document from all gathered intelligence",
	prompt:
		"You are the Requirements Synthesizer. Produce a definitive requirements document.\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"All gathered intelligence (exploration → deep-dive → challenge → user confirmations):\n$INPUT\n\n" +
		"Write a comprehensive requirements document to `REQUIREMENTS.md`.\n\n" +
		"The document MUST follow this EXACT structure:\n\n" +
		"# Requirements Document\n\n" +
		"## 1. Executive Summary\n" +
		"(2-3 sentences capturing the essence of the project)\n\n" +
		"## 2. Problem Statement\n" +
		"(What problem, for whom, why it matters, what triggered it)\n\n" +
		"## 3. Goals & Success Metrics\n" +
		"(Measurable outcomes — each goal has a metric and target value)\n\n" +
		"## 4. User Personas\n" +
		"(Name, role, context, needs, pain points — for each persona)\n\n" +
		"## 5. User Stories\n" +
		"(As a [persona], I want [action], so that [benefit])\n" +
		"(Each story has numbered acceptance criteria)\n\n" +
		"## 6. Functional Requirements\n" +
		"| ID | Requirement | Priority | Acceptance Criteria |\n" +
		"|------|-------------|----------|--------------------|\n" +
		"| FR-001 | ... | Must | ... |\n" +
		"(Use MoSCoW: Must / Should / Could / Won't)\n\n" +
		"## 7. Non-Functional Requirements\n" +
		"| ID | Category | Requirement | Target |\n" +
		"|------|----------|-------------|--------|\n" +
		"| NFR-001 | Performance | ... | ... |\n" +
		"(Cover: performance, security, scalability, accessibility, reliability)\n\n" +
		"## 8. Constraints & Assumptions\n" +
		"### Constraints\n(technical, business, timeline, budget — things we cannot change)\n" +
		"### Assumptions\n(things we believe to be true but haven't fully verified)\n\n" +
		"## 9. System Context & Integration\n" +
		"(External systems, APIs, data sources, integration points)\n\n" +
		"## 10. Data Requirements\n" +
		"(Data models, storage, privacy, retention, migration needs)\n\n" +
		"## 11. Acceptance Criteria Summary\n" +
		"(Top-level criteria for the project as a whole to be considered done)\n\n" +
		"## 12. Priority Matrix (MoSCoW)\n" +
		"### Must Have\n(list)\n" +
		"### Should Have\n(list)\n" +
		"### Could Have\n(list)\n" +
		"### Won't Have (this iteration)\n(list)\n\n" +
		"## 13. Risks & Mitigations\n" +
		"| Risk | Likelihood | Impact | Mitigation |\n" +
		"|------|-----------|--------|------------|\n\n" +
		"## 14. Open Questions\n" +
		"(Anything still unresolved that needs future attention)\n\n" +
		"## 15. Appendix\n" +
		"(Discovery notes, raw context, references)\n\n" +
		"Rules:\n" +
		"- Every requirement MUST be testable and unambiguous\n" +
		"- Use consistent ID numbering (FR-001, NFR-001)\n" +
		"- MoSCoW priority on every functional requirement\n" +
		"- Include at least one user story per persona\n" +
		"- Write the file using the write tool\n" +
		"- Confirm the file was written by listing it",
	gate: allOf(
		file("REQUIREMENTS.md"),
		llmFast(
			"Evaluate this requirements document for: (1) clear testable requirements with IDs, " +
				"(2) MoSCoW priorities on all functional requirements, (3) user stories with " +
				"acceptance criteria, (4) non-functional requirements covering performance and " +
				"security, (5) risks with mitigations, (6) completeness — does it feel like a " +
				"real, actionable spec? Rate 0-1. Threshold: 0.7",
		),
	),
	onFail: retry(2),
	transform: { kind: "full" },
};
