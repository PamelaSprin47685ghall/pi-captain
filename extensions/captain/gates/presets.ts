// ── Gate Presets ──────────────────────────────────────────────────────────
// Every export is either a Gate (function) or a factory that returns a Gate.
// Gates receive a GateCtx and return boolean | Promise<boolean>.
// Throw to fail with a descriptive message.

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import type { Gate, GateCtx } from "../types.js";

// ── Shell gates ───────────────────────────────────────────────────────────

/** Run a shell command — exit 0 = pass */
export function command(cmd: string): Gate {
	return async ({ exec, signal }) => {
		const { code, stdout, stderr } = await exec("bash", ["-c", cmd], {
			signal,
		});
		if (code !== 0) {
			throw new Error(
				`Command failed (exit ${code}): ${(stderr || stdout).trim().slice(0, 200)}`,
			);
		}
		return true;
	};
}

/** Run multiple commands — all must exit 0 */
export function commandAll(...cmds: string[]): Gate {
	return command(cmds.join(" && "));
}

// ── Filesystem gates ──────────────────────────────────────────────────────

/** File must exist at the given path */
export function file(path: string): Gate {
	return async ({ exec, signal }) => {
		const { code } = await exec("test", ["-f", path], { signal });
		if (code !== 0) throw new Error(`File not found: ${path}`);
		return true;
	};
}

/** Directory must exist at the given path */
export function dir(path: string): Gate {
	return async ({ exec, signal }) => {
		const { code } = await exec("test", ["-d", path], { signal });
		if (code !== 0) throw new Error(`Directory not found: ${path}`);
		return true;
	};
}

// ── Output content gates ──────────────────────────────────────────────────

/** Output must match the given JS assertion expression.
 *  Supported patterns:
 *    output.includes('text')        output.toLowerCase().includes('text')
 *    !output.includes('text')       output.length > N   (also <, >=, <=, ===, !==)
 *    expr || expr                   expr && expr
 */
export function assert(expr: string): Gate {
	return ({ output }) => {
		const result = evaluateAssert(expr, output);
		if (!result) throw new Error(`Assertion failed: ${expr}`);
		return true;
	};
}

/** Output must contain the given string (case-sensitive) */
export function outputIncludes(needle: string): Gate {
	return assert(`output.includes('${needle.replace(/'/g, "\\'")}')`);
}

/** Output must contain the given string (case-insensitive) */
export function outputIncludesCI(needle: string): Gate {
	return assert(
		`output.toLowerCase().includes('${needle.toLowerCase().replace(/'/g, "\\'")}')`,
	);
}

/** Output must be at least N characters */
export function outputMinLength(n: number): Gate {
	return assert(`output.length > ${n}`);
}

/** Output must match a regex */
export function regex(pattern: string, flags?: string): Gate {
	return ({ output }) => {
		let re: RegExp;
		try {
			re = new RegExp(pattern, flags ?? "");
		} catch (err) {
			throw new Error(
				`Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		if (!re.test(output)) {
			throw new Error(`Regex did not match: /${pattern}/${flags ?? ""}`);
		}
		return true;
	};
}

/** Output must match a regex (case-insensitive) */
export function regexCI(pattern: string): Gate {
	return regex(pattern, "i");
}

/** Output must NOT match a regex */
export function regexExcludes(pattern: string, flags?: string): Gate {
	return ({ output }) => {
		const re = new RegExp(pattern, flags ?? "");
		if (re.test(output)) {
			throw new Error(
				`Output matched excluded pattern: /${pattern}/${flags ?? ""}`,
			);
		}
		return true;
	};
}

// ── JSON gates ────────────────────────────────────────────────────────────

/** Output must be valid JSON */
export const jsonValid: Gate = ({ output }) => {
	try {
		JSON.parse(output);
		return true;
	} catch {
		throw new Error("Output is not valid JSON");
	}
};

/** Output must be valid JSON containing the given top-level keys */
export function jsonHasKeys(...keys: string[]): Gate {
	return ({ output }) => {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(output) as Record<string, unknown>;
		} catch {
			throw new Error("Output is not valid JSON");
		}
		const missing = keys.filter((k) => !(k in parsed));
		if (missing.length > 0)
			throw new Error(`JSON missing keys: ${missing.join(", ")}`);
		return true;
	};
}

// ── HTTP gates ────────────────────────────────────────────────────────────

/** URL must return HTTP 200 */
export function httpOk(url: string): Gate {
	return httpStatus(url, 200, "GET");
}

/** URL must return a specific status code */
export function httpStatus(url: string, status: number, method = "GET"): Gate {
	return async ({ exec, signal }) => {
		const curlCmd = `curl -sf -o /dev/null -w "%{http_code}" -X ${method} "${url}"`;
		const { stdout } = await exec("bash", ["-c", curlCmd], { signal });
		const code = parseInt(stdout.trim(), 10);
		if (code !== status) {
			throw new Error(`HTTP ${method} ${url} → ${code} (expected ${status})`);
		}
		return true;
	};
}

/** POST must return HTTP 200 */
export function httpPostOk(url: string): Gate {
	return httpStatus(url, 200, "POST");
}

// ── Combinator gates ──────────────────────────────────────────────────────

/** All gates must pass (logical AND) */
export function allOf(...gates: Gate[]): Gate {
	return async (ctx) => {
		for (const g of gates) await g(ctx); // throws on first failure
		return true;
	};
}

/** At least one gate must pass (logical OR) */
export function anyOf(...gates: Gate[]): Gate {
	return async (ctx) => {
		const errors: string[] = [];
		for (const g of gates) {
			try {
				const ok = await g(ctx);
				if (ok) return true;
			} catch (err) {
				errors.push(err instanceof Error ? err.message : String(err));
			}
		}
		throw new Error(`All gates failed: ${errors.join("; ")}`);
	};
}

// ── Environment gates ─────────────────────────────────────────────────────

/** Environment variable must be set (non-empty) */
export function envSet(name: string): Gate {
	return async ({ exec, signal }) => {
		const { code } = await exec("bash", ["-c", `test -n "$${name}"`], {
			signal,
		});
		if (code !== 0) throw new Error(`Env ${name} is not set`);
		return true;
	};
}

/** Environment variable must equal a specific value */
export function envEquals(name: string, value: string): Gate {
	return async ({ exec, signal }) => {
		const { code } = await exec(
			"bash",
			["-c", `test "$${name}" = "${value}"`],
			{ signal },
		);
		if (code !== 0) throw new Error(`Env ${name} != ${value}`);
		return true;
	};
}

/** NODE_ENV must be "production" */
export const prodEnv: Gate = envEquals("NODE_ENV", "production");

// ── Timeout gate ──────────────────────────────────────────────────────────

/** Fail if the inner gate takes longer than ms milliseconds */
export function withTimeout(inner: Gate, ms: number): Gate {
	return (ctx) => {
		const raceTimeout = new Promise<boolean>((_, reject) =>
			setTimeout(() => reject(new Error(`Gate timed out after ${ms}ms`)), ms),
		);
		return Promise.race([Promise.resolve(inner(ctx)), raceTimeout]);
	};
}

// ── Human approval gate ───────────────────────────────────────────────────

/** Require human confirmation via the interactive UI */
export const user: Gate = async ({ output, confirm, hasUI }) => {
	if (!(hasUI && confirm)) throw new Error("User gate requires interactive UI");
	const approved = await confirm(
		"🚦 Step Gate — Approve?",
		output.slice(0, 500) + (output.length > 500 ? "\n…(truncated)" : ""),
	);
	if (!approved) throw new Error("User rejected");
	return true;
};

// ── Test runner presets ───────────────────────────────────────────────────

/** bun test must exit 0 */
export const bunTest: Gate = command("bun test");

/** TypeScript type-check must exit 0 */
export const bunTypecheck: Gate = command("bunx tsc --noEmit");

/** Lint must exit 0 */
export const bunLint: Gate = command("bun run lint");

// ── Build artifact presets ────────────────────────────────────────────────

export const distExists: Gate = file("dist/index.js");
export const distDirExists: Gate = dir("dist");
export const nodeModulesExists: Gate = dir("node_modules");

export function buildOutput(path: string): Gate {
	return file(path);
}

// ── Composite presets ─────────────────────────────────────────────────────

export const testAndTypecheck: Gate = commandAll(
	"bun test",
	"bunx tsc --noEmit",
);
export const fullCI: Gate = commandAll(
	"bun test",
	"bunx tsc --noEmit",
	"bun run lint",
);

export const gitClean: Gate = command('test -z "$(git status --porcelain)"');
export const noConflicts: Gate = command(
	"! grep -rn '<<<<<<< ' --include='*.ts' --include='*.js' --include='*.tsx' --include='*.jsx' .",
);

export function gitBranch(branch: string): Gate {
	return command(`test "$(git branch --show-current)" = "${branch}"`);
}

// ── Docker / service gates ────────────────────────────────────────────────

export function dockerRunning(containerName: string): Gate {
	return command(
		`docker ps --format '{{.Names}}' | grep -q '^${containerName}$'`,
	);
}

export function portListening(port: number, host = "localhost"): Gate {
	return command(`nc -z ${host} ${port}`);
}

export function apiReady(healthUrl: string): Gate {
	return allOf(httpOk(healthUrl), bunTest);
}

export const prodReady: Gate = allOf(bunTest, bunTypecheck, distExists);

// ── LLM evaluation gates ──────────────────────────────────────────────────

/**
 * Ask an LLM to evaluate whether the step output meets the given criteria.
 * The criteria prompt supports $OUTPUT interpolation.
 */
export function llm(
	prompt: string,
	opts?: { model?: string; threshold?: number },
): Gate {
	return async (ctx) => {
		if (!(ctx.model && ctx.apiKey)) {
			throw new Error("LLM gate requires model and apiKey in context");
		}

		const model = opts?.model
			? (resolveModel(opts.model, ctx) ?? (ctx.model as Model<Api>))
			: (ctx.model as Model<Api>);

		const evalPrompt = buildLlmPrompt(prompt, ctx.output);

		const response = await complete(
			model,
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: evalPrompt }],
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

		if (!(judgment.pass && judgment.confidence >= threshold)) {
			throw new Error(
				`LLM rejected (confidence: ${judgment.confidence.toFixed(2)}, threshold: ${threshold}): ${judgment.reason}`,
			);
		}
		return true;
	};
}

/** LLM gate using a fast/cheap model (e.g. "flash") */
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
	const interpolated = criteria.replace(/\$OUTPUT/g, truncated);
	return [
		"You are a quality gate evaluator. Determine whether the output meets the criteria.",
		"",
		"## Criteria",
		interpolated,
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
			// try next provider
		}
	}
	return ctx.model as Model<Api> | undefined;
}

/**
 * Safe assertion evaluator — no eval/new Function.
 * Supported: output.includes('x'), output.toLowerCase().includes('x'),
 * !output.includes('x'), output.length OP N, expr || expr, expr && expr
 */
function evaluateAssert(expr: string, output: string): boolean {
	const t = expr.trim();

	if (t.includes("||"))
		return t.split("||").some((p) => evaluateAssert(p, output));
	if (t.includes("&&"))
		return t.split("&&").every((p) => evaluateAssert(p, output));

	const negInc = t.match(
		/^!output(?:\.toLowerCase\(\))?\.includes\((['"])(.*?)\1\)$/,
	);
	if (negInc) {
		const needle = negInc[2] ?? "";
		return !(
			t.includes(".toLowerCase()") ? output.toLowerCase() : output
		).includes(needle);
	}

	const inc = t.match(
		/^output(?:\.toLowerCase\(\))?\.includes\((['"])(.*?)\1\)$/,
	);
	if (inc) {
		const needle = inc[2] ?? "";
		return (
			t.includes(".toLowerCase()") ? output.toLowerCase() : output
		).includes(needle);
	}

	const lenCmp = t.match(/^output\.length\s*(>=|<=|>|<|===|!==)\s*(\d+)$/);
	if (lenCmp) {
		const n = parseInt(lenCmp[2] ?? "0", 10);
		switch (lenCmp[1]) {
			case ">":
				return output.length > n;
			case "<":
				return output.length < n;
			case ">=":
				return output.length >= n;
			case "<=":
				return output.length <= n;
			case "===":
				return output.length === n;
			case "!==":
				return output.length !== n;
			default:
				return false;
		}
	}

	throw new Error(
		`Unsupported assert expression: "${t}". ` +
			`Supported: output.includes('...'), output.length > N, and ||/&& combinations.`,
	);
}
