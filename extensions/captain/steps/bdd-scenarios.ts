// ── Step: BDD Scenarios ──────────────────────────────────────────────────
// Stage 3 of req-decompose: Distill each user story into concrete BDD/Gherkin
// acceptance scenarios. Each Given/When/Then = 1 atomic acceptance test.
// The ">6 criteria = split the story" heuristic is enforced.

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const bddScenarios: Step = {
	kind: "step",
	label: "BDD Scenarios",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.3,
	description:
		"Distill user stories into Given/When/Then acceptance scenarios (ATDD outer loop)",
	prompt:
		"You are an ATDD practitioner. Distill each user story into BDD/Gherkin acceptance scenarios.\n\n" +
		"User stories:\n$INPUT\n\n" +
		"For each story, produce Given/When/Then scenarios that will serve as the ATDD outer loop.\n\n" +
		"Rules:\n" +
		"- Each scenario = exactly 1 acceptance test\n" +
		"- Each scenario must be independently runnable\n" +
		"- Cover: happy path + each edge case + each error path\n" +
		"- Use concrete values, not abstract ones (e.g. 'user with email x@y.com', not 'a user')\n" +
		"- If a story produces >6 scenarios → flag it as 'STORY TOO LARGE: must split further'\n\n" +
		"For each story:\n\n" +
		"### STORY-N: [name]\n\n" +
		"**Scenario N.1: [scenario name]**\n" +
		"- Given: [system state / precondition]\n" +
		"- When: [action taken]\n" +
		"- Then: [expected observable outcome]\n" +
		"- Test type: [unit | integration | e2e]\n\n" +
		"(repeat for each scenario of this story)\n\n" +
		"After all scenarios for a story, add:\n" +
		"- Scenario count: N\n" +
		"- Split needed: YES / NO\n\n" +
		"End with:\n" +
		"TOTAL SCENARIOS: N\n" +
		"STORIES NEEDING SPLIT: N",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
