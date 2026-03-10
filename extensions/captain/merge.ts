// ── Merge Strategy Presets ─────────────────────────────────────────────────

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { MergeFn } from "./types.js";

export interface MergeCtx {
	model: Model<Api>;
	apiKey: string;
	signal?: AbortSignal;
}

// Max chars per branch output when sending to LLM merge (prevent context overflow)
const MAX_BRANCH_CHARS = 6000;

/** Truncate text to a max length, appending a notice if trimmed */
function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n…(truncated)`;
}

/** Helper: call LLM for merge decisions */
async function llmMerge(prompt: string, ctx: MergeCtx): Promise<string> {
	try {
		const response = await complete(
			ctx.model,
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: prompt }],
						timestamp: Date.now(),
					},
				],
			},
			{ apiKey: ctx.apiKey, maxTokens: 4096, signal: ctx.signal },
		);

		return response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");
	} catch (err) {
		return `(merge error: ${err instanceof Error ? err.message : String(err)})`;
	}
}

// ── Preset functions ──────────────────────────────────────────────────────

/** Simply join all outputs with branch separators */
export const concat: MergeFn = (outputs) => {
	const valid = outputs.filter((o) => o.trim().length > 0);
	if (valid.length === 0) return "(no output)";
	if (valid.length === 1) return valid[0];
	return valid.map((o, i) => `--- Branch ${i + 1} ---\n${o}`).join("\n\n");
};

/** Wait for all branches then join (same as concat, semantically distinct) */
export const awaitAll: MergeFn = concat;

/** Return the first non-empty output */
export const firstPass: MergeFn = (outputs) => {
	const valid = outputs.filter((o) => o.trim().length > 0);
	if (valid.length === 0) return "(no output)";
	return valid[0];
};

/** Ask LLM to pick the best/most common answer via voting */
export const vote: MergeFn = async (outputs, ctx) => {
	const valid = outputs.filter((o) => o.trim().length > 0);
	if (valid.length === 0) return "(no output)";
	if (valid.length === 1) return valid[0];

	const prompt = [
		"You are a merge judge. Multiple agents produced the following outputs for the same task.",
		"Pick the best answer or synthesize the most common consensus. Return ONLY the final answer.\n",
		...valid.map(
			(o, i) => `## Output ${i + 1}\n${truncate(o, MAX_BRANCH_CHARS)}\n`,
		),
	].join("\n");

	return llmMerge(prompt, ctx);
};

/** Ask LLM to rank outputs and synthesize the best parts */
export const rank: MergeFn = async (outputs, ctx) => {
	const valid = outputs.filter((o) => o.trim().length > 0);
	if (valid.length === 0) return "(no output)";
	if (valid.length === 1) return valid[0];

	const prompt = [
		"You are a merge judge. Multiple agents produced the following outputs.",
		"Rank them by quality, then synthesize the best parts into a single coherent answer.\n",
		...valid.map(
			(o, i) => `## Output ${i + 1}\n${truncate(o, MAX_BRANCH_CHARS)}\n`,
		),
	].join("\n");

	return llmMerge(prompt, ctx);
};

/** Map a strategy string (from JSON pipelines) to the corresponding preset */
export function mergeFromStrategy(
	strategy: "concat" | "awaitAll" | "firstPass" | "vote" | "rank",
): MergeFn {
	switch (strategy) {
		case "concat":
			return concat;
		case "awaitAll":
			return awaitAll;
		case "firstPass":
			return firstPass;
		case "vote":
			return vote;
		case "rank":
			return rank;
		default:
			return concat;
	}
}
