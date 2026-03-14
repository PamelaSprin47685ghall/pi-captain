// ── Pipeline Generator ────────────────────────────────────────────────────
// LLM-driven TypeScript pipeline file generation.

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";

export interface GeneratedPipeline {
	name: string;
	description: string;
	tsSource: string;
}

export function buildGeneratorPrompt(goal: string): string {
	return `You are a pipeline architect for the Captain orchestration system.
Generate a complete, executable TypeScript pipeline file based on the user's goal.

## Output Format
Respond with ONLY a valid TypeScript file. No explanation. No markdown fences.

Start the file with these two comment lines:
// @name: <kebab-case-pipeline-name>
// @description: <one-line description>

Then the full TypeScript module using ONLY these imports:
- import { retry, retryWithDelay, skip, warn, fallback, bunTest, command, file as fileGate, regexCI, user, allOf, llmFast, full, summarize, extract, concat, awaitAll, firstPass, vote, rank } from "./captain.ts";
- import type { Gate, OnFail, Runnable, Step, Sequential, Parallel, Transform, MergeFn } from "./captain.ts";

End with:
export const pipeline: Runnable = { ... };

## Step shape
\`\`\`ts
const myStep: Step = {
  kind: "step",
  label: "Human-readable name",
  model: "sonnet",          // optional: "sonnet" | "flash" | omit for session default
  tools: ["read", "bash", "edit", "write"],
  prompt: "Do X based on: $INPUT\\n\\nOriginal goal: $ORIGINAL",
  gate: bunTest,            // or: command("npm test"), fileGate("dist/out.js"), regexCI("^ok"), user, undefined
  onFail: retry(3),         // or: skip, warn, retryWithDelay(3, 2000), fallback(otherStep)
  transform: full,          // or: summarize(), extract("key")
};
\`\`\`

## Composition
\`\`\`ts
// Sequential — output chains via $INPUT
export const pipeline: Runnable = { kind: "sequential", steps: [stepA, stepB, stepC] };

// Parallel — different steps concurrently, outputs merged
export const pipeline: Runnable = { kind: "parallel", steps: [stepA, stepB], merge: concat };

// Diverse approaches — repeat the same step N times, let LLM pick the best (no "pool" kind, use parallel)
export const pipeline: Runnable = { kind: "parallel", steps: [solveStep, solveStep, solveStep], merge: vote };
\`\`\`

## Rules
1. Use $INPUT for the previous step's output; $ORIGINAL for the user's initial request.
2. Use meaningful labels and clear, detailed prompts.
3. Choose gates wisely — undefined for exploratory steps, command() for shell checks, bunTest for tests, llmFast() for quality.
4. Choose onFail wisely — retry(3) for critical steps, skip for optional, warn for non-blocking.
5. Use parallel when steps are independent; sequential when output must chain.
6. Keep pipelines focused — 3–7 steps is ideal.
7. Do NOT invent imports. Only use what is listed above.
8. Do NOT add any text outside the TypeScript file.

## User's Goal
${goal}`;
}

export function parseGeneratedPipeline(raw: string): GeneratedPipeline {
	let source = raw.trim();
	const fenceMatch = source.match(/```(?:ts|typescript)?\s*([\s\S]*?)```/);
	if (fenceMatch) source = fenceMatch[1]?.trim() ?? source;

	const nameMatch = source.match(/^\/\/\s*@name:\s*(.+)$/m);
	const descMatch = source.match(/^\/\/\s*@description:\s*(.+)$/m);

	if (!nameMatch)
		throw new Error(
			"Generated pipeline missing `// @name: <name>` header.\n" +
				`Raw output (first 500 chars):\n${raw.slice(0, 500)}`,
		);

	if (!source.includes("export const pipeline"))
		throw new Error(
			"Generated pipeline missing `export const pipeline`.\n" +
				`Raw output (first 500 chars):\n${raw.slice(0, 500)}`,
		);

	return {
		name: nameMatch[1].trim(),
		description: descMatch ? descMatch[1].trim() : "",
		tsSource: source,
	};
}

export async function generatePipeline(opts: {
	goal: string;
	model: Model<Api>;
	apiKey: string;
	signal?: AbortSignal;
}): Promise<GeneratedPipeline> {
	const { goal, model, apiKey, signal } = opts;
	const response = await complete(
		model,
		{
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: buildGeneratorPrompt(goal) }],
					timestamp: Date.now(),
				},
			],
		},
		{ apiKey, maxTokens: 4096, signal },
	);

	const raw = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	return parseGeneratedPipeline(raw);
}
