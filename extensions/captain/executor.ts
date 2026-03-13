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
	output: string,
	gateCtx: GateCtx,
): Promise<{ passed: boolean; reason: string }> {
	try {
		const result = await gate({ output, ctx: gateCtx });
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
	output: string,
	original: string,
	ctx: RunCtx,
): Promise<string> {
	if (!transform) return output;
	return transform({ output, original, ctx: makeGateCtx(ctx) });
}

// ── Step execution ────────────────────────────────────────────────────────

async function executeStepAttempt(
	step: Step,
	input: string,
	original: string,
	ctx: RunCtx,
	retryCount: number,
): Promise<StepResult> {
	const resolvedModel = step.model
		? resolveModel(step.model, ctx.modelRegistry, ctx.model)
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
		const session = await sf.createSession(step, ctx, resolvedModel);
		({ output, toolCallCount } = await sf.runPrompt(
			session,
			interpolated,
			step,
			ctx,
			input,
			original,
		));
	} else {
		const session = await createSession(step, ctx, resolvedModel);
		({ output, toolCallCount } = await runPrompt(
			session,
			interpolated,
			step,
			ctx,
			input,
			original,
		));
	}
	result.toolCallCount = toolCallCount;

	const gateCtx = makeGateCtx(ctx);
	const gateResult = step.gate
		? await evalGate(step.gate, output, gateCtx)
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
			return executeStepAttempt(
				retryStep,
				input,
				original,
				ctx,
				retryCount + 1,
			);
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
				input,
				original,
				ctx,
			);
			// Emit each fallback step result so it appears in pipeline status output.
			// executeStepAttempt returns a single StepResult, so we surface extras here.
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
	input: string,
	original: string,
	ctx: RunCtx,
): Promise<{ output: string; results: StepResult[] }> {
	const start = Date.now();
	await step.hooks?.onStart?.({ label: step.label, input, original });
	ctx.onStepStart?.(step.label);

	let result: StepResult;
	try {
		result = await executeStepAttempt(step, input, original, ctx, 0);
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

	const transformed = await applyTransform(
		step.transform,
		result.output,
		original,
		ctx,
	);
	return { output: transformed, results: [result] };
}

// ── Container gate ────────────────────────────────────────────────────────

async function runContainerGate(
	output: string,
	results: StepResult[],
	gate: Gate | undefined,
	onFail: OnFail | undefined,
	label: string,
	transform: Transform | undefined,
	original: string,
	ctx: RunCtx,
	rerunFn: () => Promise<{ output: string; results: StepResult[] }>,
	retryCount = 0,
): Promise<{ output: string; results: StepResult[] }> {
	if (!gate) {
		const out = await applyTransform(transform, output, original, ctx);
		return { output: out, results };
	}

	const gateResult = await evalGate(gate, output, makeGateCtx(ctx));
	const gateStepResult: StepResult = {
		label: `[gate] ${label}`,
		status: gateResult.passed ? "passed" : "failed",
		output: gateResult.reason,
		gateResult,
		elapsed: 0,
	};
	ctx.onStepEnd?.(gateStepResult);

	if (gateResult.passed) {
		const out = await applyTransform(transform, output, original, ctx);
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
			return runContainerGate(
				retried.output,
				retried.results,
				gate,
				onFail,
				label,
				transform,
				original,
				ctx,
				rerunFn,
				retryCount + 1,
			);
		}
		case "skip":
			gateStepResult.status = "skipped";
			gateStepResult.error = `Skipped: ${gateResult.reason}`;
			return { output: "", results: [...results, gateStepResult] };
		case "warn":
			gateStepResult.status = "passed";
			gateStepResult.error = `⚠️ Warning: ${gateResult.reason}`;
			return {
				output: await applyTransform(transform, output, original, ctx),
				results: [...results, gateStepResult],
			};
		case "fail":
			gateStepResult.error = `Gate failed: ${gateResult.reason}`;
			return { output, results: [...results, gateStepResult] };
		case "fallback": {
			const fb = await execute(
				{ ...decision.step, kind: "step" },
				output,
				original,
				ctx,
			);
			return {
				output: await applyTransform(transform, fb.output, original, ctx),
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
	input: string,
	original: string,
	ctx: RunCtx,
): Promise<{ output: string; results: StepResult[] }> {
	let current = input;
	const allResults: StepResult[] = [];

	for (const runnable of seq.steps) {
		if (ctx.signal?.aborted) break;
		const { output, results } = await execute(runnable, current, original, ctx);
		allResults.push(...results);
		current = output;
		if (results.at(-1)?.status === "failed") break;
	}

	return runContainerGate(
		current,
		allResults,
		seq.gate,
		seq.onFail,
		`sequential (${seq.steps.length} steps)`,
		seq.transform,
		original,
		ctx,
		() => executeSequential(seq, input, original, ctx),
	);
}

// ── Parallel execution ────────────────────────────────────────────────────

async function executeParallel(
	par: Parallel,
	input: string,
	original: string,
	ctx: RunCtx,
): Promise<{ output: string; results: StepResult[] }> {
	const group = `parallel ×${par.steps.length}`;
	const settled = await Promise.allSettled(
		par.steps.map((s) =>
			execute(s, input, original, { ...ctx, stepGroup: group }),
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

	return runContainerGate(
		merged,
		allResults,
		par.gate,
		par.onFail,
		group,
		par.transform,
		original,
		ctx,
		() => executeParallel(par, input, original, ctx),
	);
}

// ── Main dispatch ─────────────────────────────────────────────────────────

/** Execute any Runnable recursively. */
export async function execute(
	runnable: Runnable,
	input: string,
	original: string,
	ctx: RunCtx,
): Promise<{ output: string; results: StepResult[] }> {
	if (ctx.signal?.aborted) return { output: "(cancelled)", results: [] };

	switch (runnable.kind) {
		case "step":
			return executeStep(runnable, input, original, ctx);
		case "sequential":
			return executeSequential(runnable, input, original, ctx);
		case "parallel":
			return executeParallel(runnable, input, original, ctx);
		default:
			return {
				output: `Unknown runnable kind: ${(runnable as Runnable & { kind: string }).kind}`,
				results: [],
			};
	}
}
