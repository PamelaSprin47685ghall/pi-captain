// @large-file: intentional consolidation of all execution logic into one module
// ── Executor ──────────────────────────────────────────────────────────────
// All execution logic in one file: step, sequential, parallel, gates, retries.
// No worktrees, no shared sessions — clean and composable.

import { createSession, runPrompt } from "./session.js";
import type {
	Gate,
	GateCtx,
	MergeCtx,
	OnFail,
	Parallel,
	RunCtx,
	Runnable,
	Sequential,
	Step,
	StepResult,
	Transform,
} from "./types.js";
import { resolveModel } from "./types.js";

const MAX_RETRIES = 10;
const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

// ── RunScope ──────────────────────────────────────────────────────────────

/** The three values that flow through every step in a pipeline chain. */
interface RunScope {
	readonly input: string;
	readonly original: string;
	readonly ctx: RunCtx;
}

// ── Gate evaluation ───────────────────────────────────────────────────────

function makeGateCtx(ctx: RunCtx): GateCtx {
	return {
		cwd: ctx.cwd,
		signal: ctx.signal,
		exec: ctx.exec,
		confirm: ctx.confirm,
		hasUI: ctx.hasUI,
		model: ctx.model,
		apiKey: ctx.apiKey,
		modelRegistry: ctx.modelRegistry,
	};
}

async function evalGate(
	gate: Gate,
	params: { output: string; ctx: GateCtx },
): Promise<{ passed: boolean; reason: string }> {
	try {
		const result = await gate({ output: params.output, ctx: params.ctx });
		return result === true
			? { passed: true, reason: "passed" }
			: { passed: false, reason: result };
	} catch (err) {
		return {
			passed: false,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

// ── Transform application ─────────────────────────────────────────────────

async function applyTransform(
	transform: Transform | undefined,
	params: { output: string; original: string; ctx: RunCtx },
): Promise<string> {
	if (!transform) return params.output;
	return transform({
		output: params.output,
		original: params.original,
		ctx: makeGateCtx(params.ctx),
	});
}

// ── Step execution ────────────────────────────────────────────────────────

async function executeStepAttempt(
	step: Step,
	scope: RunScope & { retryCount: number },
): Promise<StepResult> {
	const { input, original, ctx, retryCount } = scope;
	const resolvedModel = step.model
		? resolveModel({
				pattern: step.model,
				registry: ctx.modelRegistry,
				fallback: ctx.model,
			})
		: ctx.model;

	const result: StepResult = {
		label: step.label,
		status: "running",
		output: "",
		elapsed: 0,
		toolCount: (step.tools ?? DEFAULT_TOOLS).length,
		toolCallCount: 0,
		model: resolvedModel.id,
		group: ctx.stepGroup,
	};

	const interpolated = step.prompt
		.replace(/\$INPUT/g, input)
		.replace(/\$ORIGINAL/g, original);

	let output: string;
	let toolCallCount: number;
	const sf = ctx.sessionFactory;
	if (sf) {
		const session = await sf.createSession(step, { ctx, model: resolvedModel });
		({ output, toolCallCount } = await sf.runPrompt({
			session,
			prompt: interpolated,
			step,
			ctx,
			input,
			original,
		}));
	} else {
		const session = await createSession(step, { ctx, model: resolvedModel });
		({ output, toolCallCount } = await runPrompt({
			session,
			prompt: interpolated,
			step,
			ctx,
			input,
			original,
		}));
	}
	result.toolCallCount = toolCallCount;

	const gateCtx = makeGateCtx(ctx);
	const gateResult = step.gate
		? await evalGate(step.gate, { output, ctx: gateCtx })
		: { passed: true, reason: "no gate" };
	result.gateResult = gateResult;

	if (gateResult.passed) {
		result.status = "passed";
		result.output = output;
		return result;
	}

	// Gate failed — consult onFail
	const onFail = step.onFail;
	if (!onFail) {
		result.status = "failed";
		result.output = output;
		result.error = gateResult.reason;
		return result;
	}

	const decision = await onFail({
		reason: gateResult.reason,
		retryCount,
		stepCount: retryCount + 1,
		output,
	});

	switch (decision.action) {
		case "retry": {
			if (retryCount >= MAX_RETRIES) {
				result.status = "failed";
				result.output = output;
				result.error = `Gate failed after ${MAX_RETRIES} retries: ${gateResult.reason}`;
				return result;
			}
			// Re-run with retry context appended to prompt
			const retryStep: Step = {
				...step,
				prompt: `${step.prompt}\n\n[RETRY ${retryCount + 1}: ${gateResult.reason}]\n\n${output.slice(0, 1000)}`,
			};
			return executeStepAttempt(retryStep, {
				input,
				original,
				ctx,
				retryCount: retryCount + 1,
			});
		}
		case "skip":
			result.status = "skipped";
			result.output = "";
			result.error = `Skipped: ${gateResult.reason}`;
			return result;
		case "warn":
			result.status = "passed";
			result.output = output;
			result.error = `⚠️ Warning: ${gateResult.reason}`;
			return result;
		case "fail":
			result.status = "failed";
			result.output = output;
			result.error = `Gate failed: ${gateResult.reason}`;
			return result;
		case "fallback": {
			const { output: fallbackOut, results: fallbackResults } = await execute(
				{ ...decision.step, kind: "step" },
				{ input, original, ctx },
			);
			// Emit each fallback step result so it appears in pipeline status output.
			for (const r of fallbackResults) {
				ctx.onStepEnd?.(r);
			}
			result.status = "passed";
			result.output = fallbackOut;
			return result;
		}
		default:
			result.status = "failed";
			result.output = output;
			result.error = gateResult.reason;
			return result;
	}
}

async function executeStep(
	step: Step,
	scope: RunScope,
): Promise<{ output: string; results: StepResult[] }> {
	const { input, original, ctx } = scope;
	const start = Date.now();
	await step.hooks?.onStart?.({ label: step.label, input, original });
	ctx.onStepStart?.(step.label);

	let result: StepResult;
	try {
		result = await executeStepAttempt(step, {
			input,
			original,
			ctx,
			retryCount: 0,
		});
	} catch (err) {
		result = {
			label: step.label,
			status: "failed",
			output: `Error: ${err instanceof Error ? err.message : String(err)}`,
			error: err instanceof Error ? err.message : String(err),
			elapsed: 0,
			group: ctx.stepGroup,
		};
	}

	result.elapsed = Date.now() - start;
	await step.hooks?.onFinish?.({ label: step.label, input, original, result });
	ctx.onStepEnd?.(result);

	const transformed = await applyTransform(step.transform, {
		output: result.output,
		original,
		ctx,
	});
	return { output: transformed, results: [result] };
}

// ── Container gate ────────────────────────────────────────────────────────

interface ContainerGateOpts {
	output: string;
	results: StepResult[];
	gate: Gate | undefined;
	onFail: OnFail | undefined;
	label: string;
	transform: Transform | undefined;
	original: string;
	ctx: RunCtx;
	rerunFn: () => Promise<{ output: string; results: StepResult[] }>;
	retryCount?: number;
}

async function runContainerGate(
	opts: ContainerGateOpts,
): Promise<{ output: string; results: StepResult[] }> {
	const {
		output,
		results,
		gate,
		onFail,
		label,
		transform,
		original,
		ctx,
		rerunFn,
	} = opts;
	const retryCount = opts.retryCount ?? 0;

	if (!gate) {
		const out = await applyTransform(transform, { output, original, ctx });
		return { output: out, results };
	}

	const gateResult = await evalGate(gate, { output, ctx: makeGateCtx(ctx) });
	const gateStepResult: StepResult = {
		label: `[gate] ${label}`,
		status: gateResult.passed ? "passed" : "failed",
		output: gateResult.reason,
		gateResult,
		elapsed: 0,
	};
	ctx.onStepEnd?.(gateStepResult);

	if (gateResult.passed) {
		const out = await applyTransform(transform, { output, original, ctx });
		return { output: out, results: [...results, gateStepResult] };
	}

	if (!onFail) {
		return { output, results: [...results, gateStepResult] };
	}

	const decision = await onFail({
		reason: gateResult.reason,
		retryCount,
		stepCount: retryCount + 1,
		output,
	});

	switch (decision.action) {
		case "retry": {
			if (retryCount >= MAX_RETRIES) {
				gateStepResult.error = `Gate failed after ${MAX_RETRIES} retries: ${gateResult.reason}`;
				return { output, results: [...results, gateStepResult] };
			}
			const retried = await rerunFn();
			return runContainerGate({
				...opts,
				...retried,
				retryCount: retryCount + 1,
			});
		}
		case "skip":
			gateStepResult.status = "skipped";
			gateStepResult.error = `Skipped: ${gateResult.reason}`;
			return { output: "", results: [...results, gateStepResult] };
		case "warn":
			gateStepResult.status = "passed";
			gateStepResult.error = `⚠️ Warning: ${gateResult.reason}`;
			return {
				output: await applyTransform(transform, { output, original, ctx }),
				results: [...results, gateStepResult],
			};
		case "fail":
			gateStepResult.error = `Gate failed: ${gateResult.reason}`;
			return { output, results: [...results, gateStepResult] };
		case "fallback": {
			const fb = await execute(
				{ ...decision.step, kind: "step" },
				{ input: output, original, ctx },
			);
			return {
				output: await applyTransform(transform, {
					output: fb.output,
					original,
					ctx,
				}),
				results: [...results, gateStepResult, ...fb.results],
			};
		}
		default:
			return { output, results: [...results, gateStepResult] };
	}
}

// ── Sequential execution ──────────────────────────────────────────────────

async function executeSequential(
	seq: Sequential,
	scope: RunScope,
): Promise<{ output: string; results: StepResult[] }> {
	const { original, ctx } = scope;
	let current = scope.input;
	const allResults: StepResult[] = [];

	for (const runnable of seq.steps) {
		if (ctx.signal?.aborted) break;
		const { output, results } = await execute(runnable, {
			input: current,
			original,
			ctx,
		});
		allResults.push(...results);
		current = output;
		if (results.at(-1)?.status === "failed") break;
	}

	return runContainerGate({
		output: current,
		results: allResults,
		gate: seq.gate,
		onFail: seq.onFail,
		label: `sequential (${seq.steps.length} steps)`,
		transform: seq.transform,
		original,
		ctx,
		rerunFn: () => executeSequential(seq, scope),
	});
}

// ── Parallel execution ────────────────────────────────────────────────────

async function executeParallel(
	par: Parallel,
	scope: RunScope,
): Promise<{ output: string; results: StepResult[] }> {
	const { input, original, ctx } = scope;
	const group = `parallel ×${par.steps.length}`;
	const settled = await Promise.allSettled(
		par.steps.map((s) =>
			execute(s, { input, original, ctx: { ...ctx, stepGroup: group } }),
		),
	);

	const allResults: StepResult[] = [];
	const outputs: string[] = [];

	for (const [i, r] of settled.entries()) {
		if (r.status === "fulfilled") {
			outputs.push(r.value.output);
			allResults.push(...r.value.results);
		} else {
			const reason =
				r.reason instanceof Error ? r.reason.message : String(r.reason);
			outputs.push(`(error: ${reason})`);
			allResults.push({
				label: `branch ${i + 1}`,
				status: "failed",
				output: "",
				error: reason,
				elapsed: 0,
				group,
			});
		}
	}

	const mctx: MergeCtx = {
		model: ctx.model,
		apiKey: ctx.apiKey,
		signal: ctx.signal,
	};
	const merged = await par.merge(outputs, mctx);

	return runContainerGate({
		output: merged,
		results: allResults,
		gate: par.gate,
		onFail: par.onFail,
		label: group,
		transform: par.transform,
		original,
		ctx,
		rerunFn: () => executeParallel(par, scope),
	});
}

// ── Main dispatch ─────────────────────────────────────────────────────────

/** Execute any Runnable recursively. */
export async function execute(
	runnable: Runnable,
	scope: RunScope,
): Promise<{ output: string; results: StepResult[] }> {
	if (scope.ctx.signal?.aborted) return { output: "(cancelled)", results: [] };

	switch (runnable.kind) {
		case "step":
			return executeStep(runnable, scope);
		case "sequential":
			return executeSequential(runnable, scope);
		case "parallel":
			return executeParallel(runnable, scope);
		default:
			return {
				output: `Unknown runnable kind: ${(runnable as Runnable & { kind: string }).kind}`,
				results: [],
			};
	}
}
