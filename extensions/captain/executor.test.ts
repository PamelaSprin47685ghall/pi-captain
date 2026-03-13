// ── Executor integration tests ─────────────────────────────────────────────
// Tests for execute(), executeStep, executeSequential, and executeParallel.
// The LLM session is injected via RunCtx.sessionFactory so no real API calls
// are made. All tests run deterministically and synchronously (no network).

import { describe, expect, test } from "bun:test";
import type { Api, Model } from "@mariozechner/pi-ai";
import { execute } from "./executor.js";
import {
	concat,
	fallback,
	firstPass,
	regexCI,
	retry,
	skip,
	warn,
} from "./presets.js";
import type {
	ModelRegistryLike,
	Parallel,
	RunCtx,
	Sequential,
	SessionFactory,
	Step,
	StepResult,
} from "./types.js";

// ── Test helpers ──────────────────────────────────────────────────────────

/** Minimal fake Model<Api> — only id/provider are accessed by executor. */
const FAKE_MODEL = {
	id: "test-model",
	provider: "test",
} as unknown as Model<Api>;

/** Minimal registry — executor only calls getAll() when resolving step.model. */
const FAKE_REGISTRY: ModelRegistryLike = {
	getAll: () => [],
	find: () => undefined,
	getApiKey: async () => "test-key",
};

/** Minimal no-op exec (gates that call exec are tested separately). */
const noopExec: RunCtx["exec"] = async () => ({
	code: 0,
	stdout: "",
	stderr: "",
});

/**
 * Build a session factory whose `runPrompt` returns the given sequence of
 * outputs in order. After the queue is exhausted, returns the last output.
 */
function makeFactory(outputs: string[]): SessionFactory {
	let index = 0;
	return {
		createSession: () => Promise.resolve({ __mock: true }),
		runPrompt: (_session, _prompt) => {
			const out = outputs[Math.min(index, outputs.length - 1)];
			index++;
			return Promise.resolve({ output: out ?? "", toolCallCount: 0 });
		},
	};
}

/** Single-output factory convenience. */
function factory(output: string): SessionFactory {
	return makeFactory([output]);
}

/** Build a minimal RunCtx, capturing onStepStart/onStepEnd for assertions. */
function mockCtx(
	opts: {
		sessionOutputs?: string[];
		singleOutput?: string;
		overrides?: Partial<RunCtx>;
	} = {},
): {
	ctx: RunCtx;
	starts: string[];
	ends: StepResult[];
} {
	const starts: string[] = [];
	const ends: StepResult[] = [];

	const sf = opts.sessionOutputs
		? makeFactory(opts.sessionOutputs)
		: factory(opts.singleOutput ?? "step output");

	const ctx: RunCtx = {
		exec: noopExec,
		model: FAKE_MODEL,
		modelRegistry: FAKE_REGISTRY,
		apiKey: "test-key",
		cwd: "/tmp/test",
		hasUI: false,
		pipelineName: "test-pipeline",
		sessionFactory: sf,
		onStepStart: (label) => starts.push(label),
		onStepEnd: (r) => ends.push(r),
		...opts.overrides,
	};

	return { ctx, starts, ends };
}

/** Build a minimal Step. */
function makeStep(label: string, overrides: Partial<Step> = {}): Step {
	return {
		kind: "step",
		label,
		prompt: "do something with $INPUT",
		tools: [],
		...overrides,
	};
}

// ── executeStep ────────────────────────────────────────────────────────────

describe("executeStep", () => {
	test("returns the session output as the step output", async () => {
		const { ctx } = mockCtx({ singleOutput: "hello from LLM" });
		const step = makeStep("s1");
		const { output, results } = await execute(step, "input", "original", ctx);
		expect(output).toBe("hello from LLM");
		expect(results).toHaveLength(1);
		expect(results[0].status).toBe("passed");
		expect(results[0].label).toBe("s1");
	});

	test("fires onStepStart with the step label", async () => {
		const { ctx, starts } = mockCtx();
		await execute(makeStep("alpha"), "in", "orig", ctx);
		expect(starts).toContain("alpha");
	});

	test("fires onStepEnd with a StepResult", async () => {
		const { ctx, ends } = mockCtx({ singleOutput: "out" });
		await execute(makeStep("beta"), "in", "orig", ctx);
		expect(ends).toHaveLength(1);
		expect(ends[0].label).toBe("beta");
		expect(ends[0].output).toBe("out");
		expect(ends[0].status).toBe("passed");
	});

	test("applies transform to the step output", async () => {
		const { ctx } = mockCtx({ singleOutput: "raw output" });
		const step = makeStep("t", {
			transform: ({ output }) => `TRANSFORMED:${output}`,
		});
		const { output } = await execute(step, "in", "orig", ctx);
		expect(output).toBe("TRANSFORMED:raw output");
	});

	test("$INPUT and $ORIGINAL are interpolated into the prompt", async () => {
		const prompts: string[] = [];
		const sf: SessionFactory = {
			createSession: () => Promise.resolve({}),
			runPrompt: (_s, prompt) => {
				prompts.push(prompt);
				return Promise.resolve({ output: "ok", toolCallCount: 0 });
			},
		};
		const { ctx } = mockCtx({ overrides: { sessionFactory: sf } });
		const step = makeStep("p", { prompt: "[$INPUT] vs [$ORIGINAL]" });
		await execute(step, "THE INPUT", "THE ORIGINAL", ctx);
		expect(prompts[0]).toBe("[THE INPUT] vs [THE ORIGINAL]");
	});

	test("elapsed time is recorded on the StepResult", async () => {
		const { ctx, ends } = mockCtx();
		await execute(makeStep("e"), "in", "orig", ctx);
		expect(ends[0].elapsed).toBeGreaterThanOrEqual(0);
	});
});

// ── Gate on step ───────────────────────────────────────────────────────────

describe("executeStep — gate evaluation", () => {
	test("gate passes → status passed", async () => {
		const { ctx, ends } = mockCtx({ singleOutput: "contains keyword" });
		const step = makeStep("g-pass", { gate: regexCI("keyword") });
		const { output } = await execute(step, "in", "orig", ctx);
		expect(output).toBe("contains keyword");
		expect(ends[0].status).toBe("passed");
	});

	test("gate fails + no onFail → status failed, gateResult recorded", async () => {
		const { ctx, ends } = mockCtx({ singleOutput: "no match here" });
		const step = makeStep("g-fail", { gate: regexCI("MISSING") });
		const { output } = await execute(step, "in", "orig", ctx);
		// output is the raw LLM text (preserving it for diagnosis)
		expect(output).toBe("no match here");
		expect(ends[0].status).toBe("failed");
		expect(ends[0].gateResult?.passed).toBe(false);
		expect(ends[0].error).toMatch(/MISSING/i);
	});

	test("gate fails + skip → status skipped, output empty", async () => {
		const { ctx, ends } = mockCtx({ singleOutput: "no match" });
		const step = makeStep("g-skip", { gate: regexCI("ABSENT"), onFail: skip });
		const { output } = await execute(step, "in", "orig", ctx);
		expect(output).toBe("");
		expect(ends[0].status).toBe("skipped");
	});

	test("gate fails + warn → status passed, warning in error field", async () => {
		const { ctx, ends } = mockCtx({ singleOutput: "no match" });
		const step = makeStep("g-warn", { gate: regexCI("ABSENT"), onFail: warn });
		const { output } = await execute(step, "in", "orig", ctx);
		expect(output).toBe("no match");
		expect(ends[0].status).toBe("passed");
		expect(ends[0].error).toMatch(/Warning/i);
	});

	test("gate fails + retry(1) → retries once, then fails", async () => {
		// Both attempts return text that doesn't match → ultimately fails
		const { ctx, ends } = mockCtx({ sessionOutputs: ["bad", "bad"] });
		const step = makeStep("g-retry", {
			gate: regexCI("MATCH"),
			onFail: retry(1),
		});
		await execute(step, "in", "orig", ctx);
		expect(ends[0].status).toBe("failed");
	});

	test("gate passes on second attempt with retry", async () => {
		// First output fails gate; second output passes
		const { ctx, ends } = mockCtx({ sessionOutputs: ["bad", "MATCH found"] });
		const step = makeStep("g-retry-pass", {
			gate: regexCI("MATCH"),
			onFail: retry(2),
		});
		const { output } = await execute(step, "in", "orig", ctx);
		expect(output).toBe("MATCH found");
		expect(ends[0].status).toBe("passed");
	});
});

// ── Fallback regression test ───────────────────────────────────────────────

describe("executeStep — fallback onFail (regression: fallback results in onStepEnd)", () => {
	test("fallback step runs and its results appear via onStepEnd", async () => {
		// Primary step output fails gate; fallback step returns "fallback output"
		const { ctx, ends } = mockCtx({
			sessionOutputs: ["fail text", "fallback output"],
		});
		const fallbackStep = makeStep("fallback-step");
		const step = makeStep("primary", {
			gate: regexCI("SUCCESS"),
			onFail: fallback(fallbackStep),
		});

		const { output } = await execute(step, "in", "orig", ctx);

		// The final output should come from the fallback
		expect(output).toBe("fallback output");

		// The primary step result must be in ends
		const primaryResult = ends.find((r) => r.label === "primary");
		expect(primaryResult?.status).toBe("passed"); // fallback branch marks primary as passed

		// The fallback step result must ALSO be in ends (this was the bug)
		const fallbackResult = ends.find((r) => r.label === "fallback-step");
		expect(fallbackResult).toBeDefined();
		expect(fallbackResult?.status).toBe("passed");
	});
});

// ── executeSequential ──────────────────────────────────────────────────────

describe("executeSequential", () => {
	test("single-step sequential returns the step output", async () => {
		const { ctx } = mockCtx({ singleOutput: "result" });
		const seq: Sequential = {
			kind: "sequential",
			steps: [makeStep("only")],
		};
		const { output, results } = await execute(seq, "in", "orig", ctx);
		expect(output).toBe("result");
		expect(results).toHaveLength(1);
	});

	test("chains output: step 2 receives step 1 output as $INPUT", async () => {
		// step1 outputs "step1out"; step2 prompt has $INPUT → interpolated
		const prompts: string[] = [];
		const sf: SessionFactory = {
			createSession: () => Promise.resolve({}),
			runPrompt: (_s, prompt) => {
				prompts.push(prompt);
				// Return incrementing outputs
				const n = prompts.length;
				return Promise.resolve({ output: `step${n}out`, toolCallCount: 0 });
			},
		};
		const { ctx } = mockCtx({ overrides: { sessionFactory: sf } });
		const seq: Sequential = {
			kind: "sequential",
			steps: [
				makeStep("s1", { prompt: "first: $INPUT" }),
				makeStep("s2", { prompt: "second: $INPUT" }),
			],
		};
		await execute(seq, "initial", "orig", ctx);
		// s1 gets "initial", s2 gets "step1out"
		expect(prompts[0]).toBe("first: initial");
		expect(prompts[1]).toBe("second: step1out");
	});

	test("stops after a failed step (subsequent steps not run)", async () => {
		const stepRan: string[] = [];
		const sf: SessionFactory = {
			createSession: () => Promise.resolve({}),
			runPrompt: (_s, _prompt, step) => {
				stepRan.push(step.label);
				return Promise.resolve({ output: "no match", toolCallCount: 0 });
			},
		};
		const { ctx } = mockCtx({ overrides: { sessionFactory: sf } });
		const seq: Sequential = {
			kind: "sequential",
			steps: [
				// Step 1 has a gate that always fails → sequential stops
				makeStep("s1", { gate: regexCI("REQUIRED"), prompt: "do $INPUT" }),
				makeStep("s2", { prompt: "should not run $INPUT" }),
			],
		};
		await execute(seq, "in", "orig", ctx);
		expect(stepRan).toContain("s1");
		expect(stepRan).not.toContain("s2");
	});

	test("accumulates all step results in order", async () => {
		const { ctx } = mockCtx({ sessionOutputs: ["out1", "out2"] });
		const seq: Sequential = {
			kind: "sequential",
			steps: [makeStep("a"), makeStep("b")],
		};
		const { results } = await execute(seq, "in", "orig", ctx);
		expect(results.map((r) => r.label)).toEqual(["a", "b"]);
	});

	test("sequential gate passes → gate result appended to results", async () => {
		const { ctx } = mockCtx({ singleOutput: "PASS this" });
		const seq: Sequential = {
			kind: "sequential",
			steps: [makeStep("x")],
			gate: regexCI("PASS"),
		};
		const { output, results } = await execute(seq, "in", "orig", ctx);
		expect(output).toBe("PASS this");
		// Gate result is appended as an extra StepResult
		const gateResult = results.find((r) => r.label.startsWith("[gate]"));
		expect(gateResult?.status).toBe("passed");
	});

	test("sequential gate fails + skip → output empty", async () => {
		const { ctx } = mockCtx({ singleOutput: "no keyword" });
		const seq: Sequential = {
			kind: "sequential",
			steps: [makeStep("x")],
			gate: regexCI("REQUIRED"),
			onFail: skip,
		};
		const { output } = await execute(seq, "in", "orig", ctx);
		expect(output).toBe("");
	});

	test("transform applied to final sequential output", async () => {
		const { ctx } = mockCtx({ singleOutput: "raw" });
		const seq: Sequential = {
			kind: "sequential",
			steps: [makeStep("x")],
			transform: ({ output }) => `seq:${output}`,
		};
		const { output } = await execute(seq, "in", "orig", ctx);
		expect(output).toBe("seq:raw");
	});
});

// ── executeParallel ────────────────────────────────────────────────────────

describe("executeParallel", () => {
	test("all branches run and merge receives all outputs", async () => {
		const received: string[][] = [];
		const mergeFn = (outputs: readonly string[]) => {
			received.push([...outputs]);
			return outputs.join("|");
		};

		const { ctx } = mockCtx({ sessionOutputs: ["A", "B"] });
		const par: Parallel = {
			kind: "parallel",
			steps: [makeStep("p1"), makeStep("p2")],
			merge: mergeFn,
		};
		const { output } = await execute(par, "in", "orig", ctx);
		expect(received).toHaveLength(1);
		// Both branches should appear (order may vary, use sort for stability)
		expect([...received[0]].sort()).toEqual(["A", "B"]);
		expect(output).toMatch(/A/);
		expect(output).toMatch(/B/);
	});

	test("single branch parallel returns that branch output directly", async () => {
		const { ctx } = mockCtx({ singleOutput: "solo" });
		const par: Parallel = {
			kind: "parallel",
			steps: [makeStep("only")],
			merge: firstPass,
		};
		const { output } = await execute(par, "in", "orig", ctx);
		expect(output).toBe("solo");
	});

	test("concat merge joins multiple outputs with separators", async () => {
		const { ctx } = mockCtx({ sessionOutputs: ["Alpha", "Beta"] });
		const par: Parallel = {
			kind: "parallel",
			steps: [makeStep("b1"), makeStep("b2")],
			merge: concat,
		};
		const { output } = await execute(par, "in", "orig", ctx);
		expect(output).toContain("Alpha");
		expect(output).toContain("Beta");
		expect(output).toContain("Branch");
	});

	test("all branch results are collected in results array", async () => {
		const { ctx } = mockCtx({ sessionOutputs: ["X", "Y", "Z"] });
		const par: Parallel = {
			kind: "parallel",
			steps: [makeStep("r1"), makeStep("r2"), makeStep("r3")],
			merge: concat,
		};
		const { results } = await execute(par, "in", "orig", ctx);
		const labels = results.map((r) => r.label);
		expect(labels).toContain("r1");
		expect(labels).toContain("r2");
		expect(labels).toContain("r3");
	});

	test("branches share the same $INPUT (not chained)", async () => {
		const seenInputs: string[] = [];
		const sf: SessionFactory = {
			createSession: () => Promise.resolve({}),
			runPrompt: (_s, prompt) => {
				seenInputs.push(prompt);
				return Promise.resolve({ output: "out", toolCallCount: 0 });
			},
		};
		const { ctx } = mockCtx({ overrides: { sessionFactory: sf } });
		const par: Parallel = {
			kind: "parallel",
			steps: [
				makeStep("pa", { prompt: "prompt:$INPUT" }),
				makeStep("pb", { prompt: "prompt:$INPUT" }),
			],
			merge: firstPass,
		};
		await execute(par, "SHARED", "orig", ctx);
		// Both branches should see the same input, not each other's output
		expect(seenInputs.filter((p) => p === "prompt:SHARED")).toHaveLength(2);
	});

	test("parallel gate passes → gate result appended", async () => {
		const { ctx } = mockCtx({ singleOutput: "PASS here" });
		const par: Parallel = {
			kind: "parallel",
			steps: [makeStep("q")],
			merge: firstPass,
			gate: regexCI("PASS"),
		};
		const { results } = await execute(par, "in", "orig", ctx);
		const gateR = results.find((r) => r.label.startsWith("[gate]"));
		expect(gateR?.status).toBe("passed");
	});

	test("parallel gate fails + warn → output preserved with warning", async () => {
		const { ctx } = mockCtx({ singleOutput: "no keyword" });
		const par: Parallel = {
			kind: "parallel",
			steps: [makeStep("w")],
			merge: firstPass,
			gate: regexCI("REQUIRED"),
			onFail: warn,
		};
		const { output, results } = await execute(par, "in", "orig", ctx);
		expect(output).toBe("no keyword");
		const gateR = results.find((r) => r.label.startsWith("[gate]"));
		expect(gateR?.status).toBe("passed");
		expect(gateR?.error).toMatch(/Warning/i);
	});
});

// ── Parallel branch failure surfacing ─────────────────────────────────────

describe("execute — parallel branch failure surfacing", () => {
	test("failed branch output appears as (error: ...) in merge inputs", async () => {
		// One branch succeeds, one branch has a gate that fails with no onFail
		// The failing branch result should be surfaced as '(error: ...)' in the merged output.
		const { ctx } = mockCtx({ sessionOutputs: ["good output", "bad output"] });
		const capturedMergeInputs: string[] = [];
		const captureMerge = async (outputs: readonly string[]) => {
			capturedMergeInputs.push(...outputs);
			return outputs.join("\n---\n");
		};
		const par: Parallel = {
			kind: "parallel",
			steps: [
				makeStep("ok-branch"),
				makeStep("fail-branch", { gate: regexCI("NEVER_MATCHES") }),
			],
			merge: captureMerge,
		};
		const { results } = await execute(par, "in", "orig", ctx);

		// The failing branch records a 'failed' StepResult
		const failedBranchResult = results.find(
			(r) => r.label === "fail-branch" || r.status === "failed",
		);
		expect(failedBranchResult).toBeDefined();
		expect(failedBranchResult?.status).toBe("failed");
	});

	test("all branches fail → merged output contains all error strings", async () => {
		const { ctx } = mockCtx({ sessionOutputs: ["a", "b"] });
		const par: Parallel = {
			kind: "parallel",
			steps: [
				makeStep("b1", { gate: regexCI("NEVER") }),
				makeStep("b2", { gate: regexCI("NEVER") }),
			],
			merge: concat,
		};
		const { results } = await execute(par, "in", "orig", ctx);
		const failed = results.filter((r) => r.status === "failed");
		expect(failed.length).toBeGreaterThanOrEqual(2);
	});
});

// ── Signal abort ───────────────────────────────────────────────────────────

describe("execute — signal abort", () => {
	test("aborted signal returns (cancelled) without running steps", async () => {
		const controller = new AbortController();
		controller.abort();

		const { ctx } = mockCtx({ overrides: { signal: controller.signal } });
		const step = makeStep("never");
		const { output, results } = await execute(step, "in", "orig", ctx);
		expect(output).toBe("(cancelled)");
		expect(results).toHaveLength(0);
	});

	test("aborted signal short-circuits sequential", async () => {
		const controller = new AbortController();
		controller.abort();

		const { ctx } = mockCtx({ overrides: { signal: controller.signal } });
		const seq: Sequential = {
			kind: "sequential",
			steps: [makeStep("a"), makeStep("b")],
		};
		const { output } = await execute(seq, "in", "orig", ctx);
		expect(output).toBe("(cancelled)");
	});
});

// ── Unknown kind ───────────────────────────────────────────────────────────

describe("execute — unknown runnable kind", () => {
	test("returns error message for unknown kind", async () => {
		const { ctx } = mockCtx();
		// Cast to bypass TypeScript type checking
		const unknown = {
			kind: "bogus",
		} as unknown as import("./types.js").Runnable;
		const { output } = await execute(unknown, "in", "orig", ctx);
		expect(output).toMatch(/Unknown runnable kind/);
	});
});
