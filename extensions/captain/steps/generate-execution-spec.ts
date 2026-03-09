// ── Step: Generate Execution Spec ─────────────────────────────────────────
// Stage 7 of shredder: Convert the task tree into an executable captain
// pipeline JSON spec that can be loaded and run directly.

import { file, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const generateExecutionSpec: Step = {
	kind: "step",
	label: "Generate Execution Spec",
	tools: ["read", "bash"],
	model: "flash",
	temperature: 0,
	description:
		"Convert the task tree into an executable captain pipeline JSON spec",
	prompt:
		"You are the Execution Spec Generator. Convert the task tree into a valid captain pipeline JSON spec.\n\n" +
		"Task tree:\n$INPUT\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Map each execution layer to a parallel node (units within a layer run concurrently)\n" +
		"2. Map cross-layer dependencies to sequential ordering (layers run in order)\n" +
		"3. Assign agents to each unit based on its domain:\n" +
		"   - Code generation → 'builder' or 'backend-dev' / 'frontend-dev'\n" +
		"   - Testing → 'tester'\n" +
		"   - Documentation → 'doc-writer'\n" +
		"   - Architecture / design → 'architect'\n" +
		"   - Research / investigation → 'researcher'\n" +
		"   - Review → 'reviewer'\n" +
		"   - Default → 'builder'\n" +
		"4. Each unit becomes a Step with: kind, label, agent, description, prompt, gate, onFail, transform\n" +
		"5. Each layer becomes a Parallel node wrapping its unit Steps\n" +
		"6. The top-level pipeline is a Sequential node containing all layer Parallel nodes in order\n\n" +
		"The output JSON must match the Runnable type:\n" +
		"- Step: { kind: 'step', label, agent, description, prompt, " +
		"gate: { type: 'none' }, onFail: { action: 'retry', max: 2 }, transform: { kind: 'full' } }\n" +
		"- Sequential: { kind: 'sequential', steps: [Runnable...] }\n" +
		"- Parallel: { kind: 'parallel', steps: [Runnable...], merge: { strategy: 'awaitAll' } }\n\n" +
		"Write the JSON spec to execution-spec.json using the write tool.\n" +
		"Also output the full JSON in a ```json code block.",
	gate: file("execution-spec.json"),
	onFail: retry(2),
	transform: { kind: "full" },
};
