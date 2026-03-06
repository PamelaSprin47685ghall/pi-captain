// ── Recursive Pipeline Execution Engine ────────────────────────────────────
// Each Step runs `pi --print` as a subprocess — captain is pure orchestration.

import type { Api, Model } from "@mariozechner/pi-ai";
import { complete } from "@mariozechner/pi-ai";
import { evaluateGate, type GateResult } from "./gates.js";
import { mergeOutputs } from "./merge.js";
import type {
	Agent,
	Gate,
	OnFail,
	Parallel,
	Pool,
	Runnable,
	Sequential,
	Step,
	StepResult,
	Transform,
} from "./types.js";
import { createWorktree, removeWorktree } from "./worktree.js";

/** Model registry interface — for LLM gates and merge strategies */
export interface ModelRegistryLike {
	find(provider: string, modelId: string): Model<Api> | undefined;
	getApiKey(model: Model<Api>): Promise<string | undefined>;
}

/** Everything the executor needs from the host environment */
export interface ExecutorContext {
	exec: (
		cmd: string,
		args: string[],
		opts?: { signal?: AbortSignal },
	) => Promise<{ stdout: string; stderr: string; code: number }>;
	agents: Record<string, Agent>;
	/** Fallback model used by LLM gates and merge strategies */
	model: Model<Api>;
	modelRegistry: ModelRegistryLike;
	apiKey: string;
	cwd: string;
	hasUI: boolean;
	confirm?: (title: string, body: string) => Promise<boolean>;
	signal?: AbortSignal;
	onStepStart?: (label: string) => void;
	onStepEnd?: (result: StepResult) => void;
	pipelineName: string;
}

/** Execute any Runnable recursively, returning output text */
export async function executeRunnable(
	runnable: Runnable,
	input: string,
	original: string,
	ectx: ExecutorContext,
): Promise<{ output: string; results: StepResult[] }> {
	if (ectx.signal?.aborted) return { output: "(cancelled)", results: [] };

	switch (runnable.kind) {
		case "step":
			return executeStep(runnable, input, original, ectx);
		case "sequential":
			return executeSequential(runnable, input, original, ectx);
		case "pool":
			return executePool(runnable, input, original, ectx);
		case "parallel":
			return executeParallel(runnable, input, original, ectx);
		default:
			return {
				output: `Unknown runnable kind: ${(runnable as Runnable & { kind: string }).kind}`,
				results: [],
			};
	}
}

// ── Step Execution ─────────────────────────────────────────────────────────

/** Build the argv for `pi --print` from a Step and its resolved agent config */
function buildPiArgs(
	step: Step,
	agent: Agent | undefined,
	prompt: string,
): string[] {
	const model = step.model ?? agent?.model ?? "sonnet";
	const tools = step.tools ?? agent?.tools ?? ["read", "bash", "edit", "write"];
	const systemPrompt = step.systemPrompt ?? agent?.systemPrompt;

	const args: string[] = [
		"--print",
		"--no-session",
		"--model",
		model,
		"--tools",
		tools.join(","),
	];
	if (systemPrompt) args.push("--system-prompt", systemPrompt);
	if (step.jsonOutput) args.push("--mode", "json");
	// TODO: wire up once pi --print supports these flags
	// Tracking: https://github.com/badlogic/pi-mono/issues/1898
	// if (step.maxTurns)  args.push("--max-turns",  String(step.maxTurns));
	// if (step.maxTokens) args.push("--max-tokens", String(step.maxTokens));
	for (const s of step.skills ?? []) args.push("--skill", s);
	for (const e of step.extensions ?? []) args.push("--extension", e);
	args.push(prompt);
	return args;
}

/** Resolve agent, run pi --print, evaluate gate, apply transform. Returns output + status. */
async function runStepCore(
	step: Step,
	input: string,
	original: string,
	ectx: ExecutorContext,
): Promise<{
	status: "passed" | "failed" | "skipped";
	output: string;
	gateResult?: GateResult;
	error?: string;
}> {
	const agent = step.agent ? ectx.agents[step.agent] : undefined;
	if (step.agent && !agent) {
		const available = Object.keys(ectx.agents).join(", ");
		throw new Error(
			`Agent "${step.agent}" not found. Available agents: ${available}`,
		);
	}

	const prompt = interpolatePrompt(step.prompt, input, original);
	const args = buildPiArgs(step, agent, prompt);
	const { stdout } = await ectx.exec("pi", args, { signal: ectx.signal });
	const output = stdout.trim();

	const gateResult = await evaluateGate(step.gate, output, {
		exec: ectx.exec,
		confirm: ectx.confirm,
		hasUI: ectx.hasUI,
		cwd: ectx.cwd,
		signal: ectx.signal,
		model: ectx.model,
		apiKey: ectx.apiKey,
		modelRegistry: ectx.modelRegistry,
	});

	if (!gateResult.passed) {
		const failResult = await handleFailure(
			step,
			input,
			original,
			output,
			gateResult,
			ectx,
			0,
		);
		const transformed = await applyTransform(
			step.transform,
			failResult.output,
			ectx,
		);
		return { ...failResult, output: transformed, gateResult };
	}

	const transformed = await applyTransform(step.transform, output, ectx);
	return { status: "passed", output: transformed, gateResult };
}

async function executeStep(
	step: Step,
	input: string,
	original: string,
	ectx: ExecutorContext,
): Promise<{ output: string; results: StepResult[] }> {
	const start = Date.now();
	ectx.onStepStart?.(step.label);

	const result: StepResult = {
		label: step.label,
		status: "running",
		output: "",
		elapsed: 0,
	};

	try {
		const core = await runStepCore(step, input, original, ectx);
		result.status = core.status;
		result.output = core.output;
		result.gateResult = core.gateResult;
		result.error = core.error;
	} catch (err) {
		result.status = "failed";
		result.error = err instanceof Error ? err.message : String(err);
		result.output = `Error: ${result.error}`;
	}

	result.elapsed = Date.now() - start;
	ectx.onStepEnd?.(result);
	return { output: result.output, results: [result] };
}

// ── Shared Gate + OnFail for Composition Nodes ────────────────────────────

async function gateCheck(
	output: string,
	results: StepResult[],
	gate: Gate | undefined,
	onFail: OnFail | undefined,
	scopeLabel: string,
	rerunFn: () => Promise<{ output: string; results: StepResult[] }>,
	ectx: ExecutorContext,
	retryCount: number,
): Promise<{ output: string; results: StepResult[] }> {
	if (!gate || gate.type === "none") return { output, results };

	const gateResult = await evaluateGate(gate, output, {
		exec: ectx.exec,
		confirm: ectx.confirm,
		hasUI: ectx.hasUI,
		cwd: ectx.cwd,
		signal: ectx.signal,
		model: ectx.model,
		apiKey: ectx.apiKey,
		modelRegistry: ectx.modelRegistry,
	});

	const gateStepResult: StepResult = {
		label: `[gate] ${scopeLabel}`,
		status: gateResult.passed ? "passed" : "failed",
		output: gateResult.reason,
		gateResult,
		elapsed: 0,
	};
	ectx.onStepEnd?.(gateStepResult);

	if (gateResult.passed)
		return { output, results: [...results, gateStepResult] };
	if (!onFail) return { output, results: [...results, gateStepResult] };

	switch (onFail.action) {
		case "retry":
		case "retryWithDelay": {
			const max = onFail.max ?? 3;
			if (retryCount >= max) {
				gateStepResult.error = `Gate failed after ${max} retries: ${gateResult.reason}`;
				return { output, results: [...results, gateStepResult] };
			}
			if (onFail.action === "retryWithDelay") {
				await new Promise((r) => setTimeout(r, onFail.delayMs));
			}
			const retried = await rerunFn();
			return gateCheck(
				retried.output,
				retried.results,
				gate,
				onFail,
				scopeLabel,
				rerunFn,
				ectx,
				retryCount + 1,
			);
		}

		case "skip":
			gateStepResult.status = "skipped";
			gateStepResult.error = `Skipped: ${gateResult.reason}`;
			return { output: "", results: [...results, gateStepResult] };

		case "warn":
			gateStepResult.status = "passed";
			gateStepResult.error = `⚠️ Warning (gate failed but continued): ${gateResult.reason}`;
			return { output, results: [...results, gateStepResult] };

		case "fallback": {
			const fallback = await executeStep(
				{ ...onFail.step, kind: "step" },
				output,
				output,
				ectx,
			);
			return {
				output: fallback.output,
				results: [...results, gateStepResult, ...fallback.results],
			};
		}

		default:
			return { output, results: [...results, gateStepResult] };
	}
}

// ── Sequential ─────────────────────────────────────────────────────────────

async function executeSequential(
	seq: Sequential,
	input: string,
	original: string,
	ectx: ExecutorContext,
): Promise<{ output: string; results: StepResult[] }> {
	let currentInput = input;
	const allResults: StepResult[] = [];

	for (const step of seq.steps) {
		if (ectx.signal?.aborted) break;
		const { output, results } = await executeRunnable(
			step,
			currentInput,
			original,
			ectx,
		);
		allResults.push(...results);
		currentInput = output;
		const lastResult = results.at(-1);
		if (lastResult?.status === "failed") break;
	}

	return gateCheck(
		currentInput,
		allResults,
		seq.gate,
		seq.onFail,
		`sequential (${seq.steps.length} steps)`,
		() => executeSequential(seq, input, original, ectx),
		ectx,
		0,
	);
}

// ── Pool ──────────────────────────────────────────────────────────────────

async function executePool(
	pool: Pool,
	input: string,
	original: string,
	ectx: ExecutorContext,
): Promise<{ output: string; results: StepResult[] }> {
	const worktrees: { path: string; branch: string }[] = [];
	const allResults: StepResult[] = [];

	try {
		const promises = Array.from({ length: pool.count }, async (_, i) => {
			const label = getLabel(pool.step) || `pool-${i}`;
			const wt = await createWorktree(
				ectx.exec,
				ectx.cwd,
				ectx.pipelineName,
				label,
				i,
				ectx.signal,
			);
			if (wt) worktrees.push({ path: wt.worktreePath, branch: wt.branchName });
			const branchCtx: ExecutorContext = {
				...ectx,
				cwd: wt?.worktreePath ?? ectx.cwd,
			};
			return executeRunnable(
				pool.step,
				`${input}\n[Branch ${i + 1} of ${pool.count}]`,
				original,
				branchCtx,
			);
		});

		const settled = await Promise.allSettled(promises);
		const outputs: string[] = [];
		for (const r of settled) {
			if (r.status === "fulfilled") {
				outputs.push(r.value.output);
				allResults.push(...r.value.results);
			} else outputs.push(`(error: ${r.reason})`);
		}

		const merged = await mergeOutputs(pool.merge.strategy, outputs, {
			model: ectx.model,
			apiKey: ectx.apiKey,
			signal: ectx.signal,
		});
		return gateCheck(
			merged,
			allResults,
			pool.gate,
			pool.onFail,
			`pool ×${pool.count}`,
			() => executePool(pool, input, original, ectx),
			ectx,
			0,
		);
	} finally {
		for (const wt of worktrees)
			await removeWorktree(
				ectx.exec,
				ectx.cwd,
				wt.path,
				wt.branch,
				ectx.signal,
			);
	}
}

// ── Parallel ──────────────────────────────────────────────────────────────

async function executeParallel(
	par: Parallel,
	input: string,
	original: string,
	ectx: ExecutorContext,
): Promise<{ output: string; results: StepResult[] }> {
	const worktrees: { path: string; branch: string }[] = [];
	const allResults: StepResult[] = [];

	try {
		const promises = par.steps.map(async (step, i) => {
			const label = getLabel(step) || `parallel-${i}`;
			const wt = await createWorktree(
				ectx.exec,
				ectx.cwd,
				ectx.pipelineName,
				label,
				i,
				ectx.signal,
			);
			if (wt) worktrees.push({ path: wt.worktreePath, branch: wt.branchName });
			const branchCtx: ExecutorContext = {
				...ectx,
				cwd: wt?.worktreePath ?? ectx.cwd,
			};
			return executeRunnable(step, input, original, branchCtx);
		});

		const settled = await Promise.allSettled(promises);
		const outputs: string[] = [];
		for (const r of settled) {
			if (r.status === "fulfilled") {
				outputs.push(r.value.output);
				allResults.push(...r.value.results);
			} else outputs.push(`(error: ${r.reason})`);
		}

		const merged = await mergeOutputs(par.merge.strategy, outputs, {
			model: ectx.model,
			apiKey: ectx.apiKey,
			signal: ectx.signal,
		});
		return gateCheck(
			merged,
			allResults,
			par.gate,
			par.onFail,
			`parallel (${par.steps.length} branches)`,
			() => executeParallel(par, input, original, ectx),
			ectx,
			0,
		);
	} finally {
		for (const wt of worktrees)
			await removeWorktree(
				ectx.exec,
				ectx.cwd,
				wt.path,
				wt.branch,
				ectx.signal,
			);
	}
}

// ── Helpers ────────────────────────────────────────────────────────────────

function interpolatePrompt(
	template: string,
	input: string,
	original: string,
): string {
	return template.replace(/\$INPUT/g, input).replace(/\$ORIGINAL/g, original);
}

async function applyTransform(
	transform: Transform,
	output: string,
	ectx: ExecutorContext,
): Promise<string> {
	switch (transform.kind) {
		case "full":
			return output;

		case "extract": {
			try {
				const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/) || [
					null,
					output,
				];
				const parsed = JSON.parse(jsonMatch[1]?.trim());
				return String(parsed[transform.key] ?? output);
			} catch {
				return output;
			}
		}

		case "summarize": {
			try {
				const response = await complete(
					ectx.model,
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
					{ apiKey: ectx.apiKey, maxTokens: 512, signal: ectx.signal },
				);
				return response.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text)
					.join("\n");
			} catch {
				return output;
			}
		}

		default:
			return output;
	}
}

async function handleFailure(
	step: Step,
	input: string,
	original: string,
	lastOutput: string,
	gateResult: GateResult,
	ectx: ExecutorContext,
	retryCount: number,
): Promise<{
	status: "passed" | "failed" | "skipped";
	output: string;
	error?: string;
}> {
	const onFail = step.onFail;

	switch (onFail.action) {
		case "retry":
		case "retryWithDelay": {
			const max = onFail.max ?? 3;
			if (retryCount >= max) {
				return {
					status: "failed",
					output: lastOutput,
					error: `Gate failed after ${max} retries: ${gateResult.reason}`,
				};
			}
			if (onFail.action === "retryWithDelay") {
				await new Promise((r) => setTimeout(r, onFail.delayMs));
			}
			const retryPrompt = `${step.prompt}\n\n[RETRY ${retryCount + 1}/${max}: Previous attempt failed gate: ${gateResult.reason}]\n\nPrevious output:\n${lastOutput.slice(0, 1000)}`;
			const retryStep: Step = { ...step, prompt: retryPrompt };
			const { output, results } = await executeStep(
				retryStep,
				input,
				original,
				ectx,
			);
			const lastResult = results.at(-1);
			if (lastResult?.status === "passed") return { status: "passed", output };
			return handleFailure(
				step,
				input,
				original,
				output,
				lastResult?.gateResult ?? gateResult,
				ectx,
				retryCount + 1,
			);
		}

		case "skip":
			return {
				status: "skipped",
				output: "",
				error: `Skipped: ${gateResult.reason}`,
			};

		case "warn":
			return {
				status: "passed",
				output: lastOutput,
				error: `⚠️ Warning (gate failed but continued): ${gateResult.reason}`,
			};

		case "fallback": {
			const { output } = await executeStep(
				{ ...onFail.step, kind: "step" },
				input,
				original,
				ectx,
			);
			return { status: "passed", output };
		}

		default:
			return { status: "failed", output: lastOutput, error: gateResult.reason };
	}
}

function getLabel(r: Runnable): string {
	switch (r.kind) {
		case "step":
			return r.label;
		case "sequential":
			return `seq-${r.steps[0] ? getLabel(r.steps[0]) : "empty"}`;
		case "pool":
			return `pool-${getLabel(r.step)}`;
		case "parallel":
			return "par";
		default:
			return "unknown";
	}
}
