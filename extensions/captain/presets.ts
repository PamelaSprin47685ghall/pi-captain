// @large-file: intentional consolidation of all preset functions into one barrel module
// ── Captain Presets ────────────────────────────────────────────────────────
// All ready-made gate, onFail, merge, and transform functions in one file.
// Import from "./captain.ts" in pipeline files for IDE support.

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type {
	Gate,
	GateCtx,
	MergeCtx,
	MergeFn,
	OnFail,
	Step,
	Transform,
} from "./types.js";

// ── Gate presets ──────────────────────────────────────────────────────────

/** Run a shell command — exit 0 passes, non-zero fails with stderr/stdout. */
export function command(cmd: string): Gate {
	return async ({ ctx }) => {
		if (!ctx) return "command gate requires execution context";
		const { code, stdout, stderr } = await ctx.exec({
			cmd: "bash",
			args: ["-c", cmd],
			signal: ctx.signal,
		});
		if (code !== 0)
			return `Command failed (exit ${code}): ${(stderr || stdout).trim().slice(0, 200)}`;
		return true;
	};
}

/** File must exist at the given path. */
export function file(path: string): Gate {
	return async ({ ctx }) => {
		if (!ctx) return "file gate requires execution context";
		const { code } = await ctx.exec({
			cmd: "test",
			args: ["-f", path],
			signal: ctx.signal,
		});
		return code === 0 ? true : `File not found: ${path}`;
	};
}

/** Output must match a regex (case-insensitive). */
export function regexCI(pattern: string): Gate {
	return ({ output }) => {
		let re: RegExp;
		try {
			re = new RegExp(pattern, "i");
		} catch (err) {
			return `Invalid regex /${pattern}/: ${err instanceof Error ? err.message : String(err)}`;
		}
		return re.test(output) ? true : `Output did not match /${pattern}/i`;
	};
}

/** All gates must pass. */
export function allOf(...gates: Gate[]): Gate {
	return async (params) => {
		for (const g of gates) {
			const r = await g(params);
			if (r !== true) return r;
		}
		return true;
	};
}

/** Require human confirmation via the interactive UI. */
export const user: Gate = async ({ output, ctx }) => {
	if (!(ctx?.hasUI && ctx?.confirm)) return "User gate requires interactive UI";
	const approved = await ctx.confirm(
		"🚦 Step Gate — Approve?",
		output.slice(0, 500) + (output.length > 500 ? "\n…(truncated)" : ""),
	);
	return approved ? true : "User rejected";
};

/** Runs `bun test` — passes on exit 0. */
export const bunTest: Gate = command("bun test");

/** LLM quality gate using a fast model. `threshold` is 0–1 confidence cutoff. */
export function llmFast(criteria: string, threshold = 0.7): Gate {
	return async ({ output, ctx }) => {
		if (!(ctx?.model && ctx?.apiKey))
			return "llmFast gate requires model and apiKey in context";
		const model = resolveFlashModel(ctx) ?? (ctx.model as Model<Api>);
		const prompt = buildLlmGatePrompt(criteria, output);
		try {
			const response = await complete(
				model,
				{
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: prompt }],
							timestamp: Date.now(),
						},
					],
				},
				{ apiKey: ctx.apiKey, maxTokens: 512, signal: ctx.signal },
			);
			const text = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n");
			const j = parseLlmJudgment(text);
			return j.pass && j.confidence >= threshold
				? true
				: `LLM rejected (confidence ${j.confidence.toFixed(2)}): ${j.reason}`;
		} catch (err) {
			return `llmFast error: ${err instanceof Error ? err.message : String(err)}`;
		}
	};
}

// ── OnFail presets ────────────────────────────────────────────────────────

/** Retry up to `max` times, then fail. */
export function retry(max = 3): OnFail {
	return ({ retryCount }) =>
		retryCount < max ? { action: "retry" } : { action: "fail" };
}

/** Retry up to `max` times with a delay between attempts. */
export function retryWithDelay(max = 3, delayMs: number): OnFail {
	return async ({ retryCount }) => {
		if (retryCount >= max) return { action: "fail" };
		await new Promise((r) => setTimeout(r, delayMs));
		return { action: "retry" };
	};
}

/** Run an alternative step when the gate fails. */
export function fallback(step: Step): OnFail {
	return () => ({ action: "fallback", step });
}

/** Skip the step — mark as skipped and pass empty output to the next step. */
export const skip: OnFail = () => ({ action: "skip" });

/** Log a warning but treat as passed and continue. */
export const warn: OnFail = () => ({ action: "warn" });

// ── Merge presets ─────────────────────────────────────────────────────────

/** Join all branch outputs with separators. */
export const concat: MergeFn = (outputs) => {
	const valid = outputs.filter((o) => o.trim().length > 0);
	if (valid.length === 0) return "(no output)";
	if (valid.length === 1) return valid[0];
	return valid.map((o, i) => `--- Branch ${i + 1} ---\n${o}`).join("\n\n");
};

/** Return the first non-empty output. */
export const firstPass: MergeFn = (outputs) =>
	outputs.find((o) => o.trim().length > 0) ?? "(no output)";

/** Alias for concat — wait for all branches then join. */
export const awaitAll: MergeFn = concat;

const MAX_BRANCH_CHARS = 6000;

/** Ask LLM to pick the best/most common answer across branches. */
export const vote: MergeFn = async (outputs, ctx) => {
	const valid = outputs.filter((o) => o.trim().length > 0);
	if (valid.length <= 1) return valid[0] ?? "(no output)";
	const prompt = [
		"You are a merge judge. Multiple agents produced the following outputs for the same task.",
		"Pick the best answer or synthesize the most common consensus. Return ONLY the final answer.\n",
		...valid.map(
			(o, i) =>
				`## Output ${i + 1}\n${o.length > MAX_BRANCH_CHARS ? `${o.slice(0, MAX_BRANCH_CHARS)}\n…(truncated)` : o}\n`,
		),
	].join("\n");
	return llmMerge(prompt, ctx);
};

/** Ask LLM to rank outputs and synthesize the best parts. */
export const rank: MergeFn = async (outputs, ctx) => {
	const valid = outputs.filter((o) => o.trim().length > 0);
	if (valid.length <= 1) return valid[0] ?? "(no output)";
	const prompt = [
		"You are a merge judge. Multiple agents produced the following outputs.",
		"Rank them by quality, then synthesize the best parts into a single coherent answer.\n",
		...valid.map(
			(o, i) =>
				`## Output ${i + 1}\n${o.length > MAX_BRANCH_CHARS ? `${o.slice(0, MAX_BRANCH_CHARS)}\n…(truncated)` : o}\n`,
		),
	].join("\n");
	return llmMerge(prompt, ctx);
};

// ── Transform presets ─────────────────────────────────────────────────────

/** Pass the entire step output unchanged. */
export const full: Transform = ({ output }) => output;

/** Extract a single key from a JSON object embedded in the output. */
export function extract(key: string): Transform {
	return ({ output }) => {
		try {
			const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || [
				null,
				output,
			];
			const parsed = JSON.parse(jsonMatch[1]?.trim());
			return String(parsed[key] ?? output);
		} catch {
			return output;
		}
	};
}

/** Ask the LLM to summarize the output in 2-3 sentences. */
export function summarize(): Transform {
	return async ({ output, ctx }) => {
		if (!(ctx.model && ctx.apiKey)) return output;
		try {
			const response = await complete(
				ctx.model as Model<Api>,
				{
					messages: [
						{
							role: "user",
							content: [
								{
									type: "text",
									text: `Summarize concisely in 2-3 sentences:\n\n${output.slice(0, 4000)}`,
								},
							],
							timestamp: Date.now(),
						},
					],
				},
				{ apiKey: ctx.apiKey, maxTokens: 512, signal: ctx.signal },
			);
			return response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n");
		} catch {
			return output;
		}
	};
}

// ── Internal helpers ──────────────────────────────────────────────────────

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

function buildLlmGatePrompt(criteria: string, output: string): string {
	const truncated = output.slice(0, 8000);
	return [
		"You are a quality gate evaluator. Does the output meet the criteria?",
		"",
		"## Criteria",
		criteria.replace(/\$OUTPUT/g, truncated),
		"",
		"## Output to Evaluate",
		truncated,
		"",
		'Respond with ONLY a JSON object (no markdown): { "pass": true/false, "confidence": 0.0-1.0, "reason": "..." }',
	].join("\n");
}

function parseLlmJudgment(text: string): {
	pass: boolean;
	confidence: number;
	reason: string;
} {
	const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const raw = (jsonMatch ? (jsonMatch[1] ?? text) : text).trim();
	try {
		const parsed = JSON.parse(raw);
		return {
			pass: Boolean(parsed.pass),
			confidence:
				typeof parsed.confidence === "number"
					? Math.max(0, Math.min(1, parsed.confidence))
					: 0.5,
			reason: String(parsed.reason ?? "No reason given"),
		};
	} catch {
		const lower = text.toLowerCase();
		return {
			pass: lower.includes("pass") && !lower.includes("fail"),
			confidence: 0.5,
			reason: `Could not parse response: ${text.slice(0, 200)}`,
		};
	}
}

function resolveFlashModel(ctx: GateCtx): Model<Api> | undefined {
	if (!ctx.modelRegistry) return ctx.model as Model<Api> | undefined;
	const currentProvider = (ctx.model as Model<Api> | undefined)?.provider;
	const providers = [
		currentProvider,
		"anthropic",
		"google",
		"openai",
		"openrouter",
	].filter((p): p is string => !!p);
	const seen = new Set<string>();
	for (const provider of providers) {
		if (seen.has(provider)) continue;
		seen.add(provider);
		try {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic registry lookup
			const found = (ctx.modelRegistry as any).find(provider, "flash");
			if (found) return found;
		} catch {
			/* try next */
		}
	}
	return ctx.model as Model<Api> | undefined;
}
