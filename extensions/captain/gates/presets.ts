// ── Gate Presets ──────────────────────────────────────────────────────────
// Each factory returns a Gate: (ctx) => string | true | Promise<string | true>
// Return true to pass. Return a string to fail — the string is the reason.

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { Gate, GateCtx } from "../types.js";

// ── Shell ─────────────────────────────────────────────────────────────────

/** Run a shell command — exit 0 passes, non-zero returns the stderr/stdout as reason */
export function command(cmd: string): Gate {
	return async ({ exec, signal }) => {
		const { code, stdout, stderr } = await exec("bash", ["-c", cmd], {
			signal,
		});
		if (code !== 0)
			return `Command failed (exit ${code}): ${(stderr || stdout).trim().slice(0, 200)}`;
		return true;
	};
}

// ── Filesystem ────────────────────────────────────────────────────────────

/** File must exist */
export function file(path: string): Gate {
	return async ({ exec, signal }) => {
		const { code } = await exec("test", ["-f", path], { signal });
		return code === 0 ? true : `File not found: ${path}`;
	};
}

/** Directory must exist */
export function dir(path: string): Gate {
	return async ({ exec, signal }) => {
		const { code } = await exec("test", ["-d", path], { signal });
		return code === 0 ? true : `Directory not found: ${path}`;
	};
}

// ── Output ────────────────────────────────────────────────────────────────

/** Output must match a regex */
export function regex(pattern: string, flags?: string): Gate {
	return ({ output }) => {
		let re: RegExp;
		try {
			re = new RegExp(pattern, flags ?? "");
		} catch (err) {
			return `Invalid regex /${pattern}/: ${err instanceof Error ? err.message : String(err)}`;
		}
		return re.test(output)
			? true
			: `Output did not match /${pattern}/${flags ?? ""}`;
	};
}

/** Output must match a regex (case-insensitive) */
export function regexCI(pattern: string): Gate {
	return regex(pattern, "i");
}

// ── JSON ──────────────────────────────────────────────────────────────────

/** Output must be valid JSON */
export const jsonValid: Gate = ({ output }) => {
	try {
		JSON.parse(output);
		return true;
	} catch {
		return "Output is not valid JSON";
	}
};

/** Output must be valid JSON containing specific top-level keys */
export function jsonHasKeys(...keys: string[]): Gate {
	return ({ output }) => {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(output) as Record<string, unknown>;
		} catch {
			return "Output is not valid JSON";
		}
		const missing = keys.filter((k) => !(k in parsed));
		return missing.length === 0
			? true
			: `JSON missing keys: ${missing.join(", ")}`;
	};
}

// ── HTTP ──────────────────────────────────────────────────────────────────

/** URL must return a specific HTTP status code */
export function httpStatus(url: string, status: number, method = "GET"): Gate {
	return async ({ exec, signal }) => {
		const curlCmd = `curl -sf -o /dev/null -w "%{http_code}" -X ${method} "${url}"`;
		const { stdout } = await exec("bash", ["-c", curlCmd], { signal });
		const code = parseInt(stdout.trim(), 10);
		return code === status
			? true
			: `HTTP ${method} ${url} → ${code} (expected ${status})`;
	};
}

/** URL must return HTTP 200 */
export function httpOk(url: string): Gate {
	return httpStatus(url, 200);
}

// ── Combinators ───────────────────────────────────────────────────────────

/** All gates must pass */
export function allOf(...gates: Gate[]): Gate {
	return async (ctx) => {
		for (const g of gates) {
			const result = await g(ctx);
			if (result !== true) return result;
		}
		return true;
	};
}

/** At least one gate must pass */
export function anyOf(...gates: Gate[]): Gate {
	return async (ctx) => {
		const reasons: string[] = [];
		for (const g of gates) {
			const result = await g(ctx);
			if (result === true) return true;
			reasons.push(result);
		}
		return `All gates failed: ${reasons.join("; ")}`;
	};
}

// ── Timeout ───────────────────────────────────────────────────────────────

/** Fail if the inner gate takes longer than ms milliseconds */
export function withTimeout(inner: Gate, ms: number): Gate {
	return (ctx) => {
		const timeout = new Promise<string>((resolve) =>
			setTimeout(() => resolve(`Gate timed out after ${ms}ms`), ms),
		);
		return Promise.race([Promise.resolve(inner(ctx)), timeout]);
	};
}

// ── Human approval ────────────────────────────────────────────────────────

/** Require human confirmation via the interactive UI */
export const user: Gate = async ({ output, confirm, hasUI }) => {
	if (!(hasUI && confirm)) return "User gate requires interactive UI";
	const approved = await confirm(
		"🚦 Step Gate — Approve?",
		output.slice(0, 500) + (output.length > 500 ? "\n…(truncated)" : ""),
	);
	return approved ? true : "User rejected";
};

// ── Test runners ──────────────────────────────────────────────────────────

export const bunTest: Gate = command("bun test");
export const bunTypecheck: Gate = command("bunx tsc --noEmit");
export const bunLint: Gate = command("bun run lint");

// ── LLM evaluation ────────────────────────────────────────────────────────

/**
 * Ask an LLM to evaluate whether the step output meets the given criteria.
 * Supports $OUTPUT interpolation in the prompt.
 */
export function llm(
	prompt: string,
	opts?: { model?: string; threshold?: number },
): Gate {
	return async (ctx) => {
		if (!(ctx.model && ctx.apiKey))
			return "LLM gate requires model and apiKey in context";

		const model = opts?.model
			? (resolveModel(opts.model, ctx) ?? (ctx.model as Model<Api>))
			: (ctx.model as Model<Api>);

		const response = await complete(
			model,
			{
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: buildLlmPrompt(prompt, ctx.output) },
						],
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

		const judgment = parseLlmJudgment(text);
		const threshold = opts?.threshold ?? 0.7;

		return judgment.pass && judgment.confidence >= threshold
			? true
			: `LLM rejected (confidence: ${judgment.confidence.toFixed(2)}, threshold: ${threshold}): ${judgment.reason}`;
	};
}

/** LLM gate using a fast/cheap model */
export function llmFast(prompt: string, threshold?: number): Gate {
	return llm(prompt, { model: "flash", threshold });
}

/** LLM gate requiring high confidence (threshold 0.9) */
export function llmStrict(prompt: string, model?: string): Gate {
	return llm(prompt, { model, threshold: 0.9 });
}

// ── Helpers ───────────────────────────────────────────────────────────────

const LLM_MAX_OUTPUT = 8000;

function buildLlmPrompt(criteria: string, output: string): string {
	const truncated = output.slice(0, LLM_MAX_OUTPUT);
	return [
		"You are a quality gate evaluator. Determine whether the output meets the criteria.",
		"",
		"## Criteria",
		criteria.replace(/\$OUTPUT/g, truncated),
		"",
		"## Output to Evaluate",
		truncated,
		"",
		"## Instructions",
		"Respond with ONLY a JSON object (no markdown fences):",
		'{ "pass": true/false, "confidence": 0.0-1.0, "reason": "brief explanation" }',
	].join("\n");
}

interface LlmJudgment {
	pass: boolean;
	confidence: number;
	reason: string;
}

function parseLlmJudgment(text: string): LlmJudgment {
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

function resolveModel(modelName: string, ctx: GateCtx): Model<Api> | undefined {
	if (!ctx.modelRegistry) return ctx.model as Model<Api> | undefined;
	const currentProvider = (ctx.model as Model<Api> | undefined)?.provider;
	const providers = [
		currentProvider,
		"anthropic",
		"google",
		"openai",
		"openrouter",
		"deepseek",
	].filter((p): p is string => !!p);
	const seen = new Set<string>();
	for (const provider of providers) {
		if (seen.has(provider)) continue;
		seen.add(provider);
		try {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic registry lookup
			const found = (ctx.modelRegistry as any).find(provider, modelName);
			if (found) return found;
		} catch {
			/* try next */
		}
	}
	return ctx.model as Model<Api> | undefined;
}
