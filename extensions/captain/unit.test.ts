// ── Unit tests for captain core modules ──────────────────────────────────
// Covers: presets.ts (gates, onFail, merge, transform)
//         loader.ts  (resolveAliases, extractPipeline)
//         commands.ts helpers (parsePipelineAndInput, parseInlineFlags)
//
// Run with: bun test extensions/captain/unit.test.ts

import { describe, expect, test } from "bun:test";

// ── Import helpers from modules under test ─────────────────────────────────

import type { Api, Model } from "@mariozechner/pi-ai";
import { parseInlineFlags, parsePipelineAndInput } from "./commands.js";
import { buildGeneratorPrompt, parseGeneratedPipeline } from "./generator.js";
import { extractPipeline, resolveAliases } from "./loader.js";
import {
	allOf,
	awaitAll,
	command,
	concat,
	extract,
	fallback,
	file,
	firstPass,
	full,
	rank,
	regexCI,
	retry,
	retryWithDelay,
	skip,
	summarize,
	user,
	vote,
	warn,
} from "./presets.js";
import { buildCompletionText } from "./tools.js";
import type {
	ModelRegistryLike,
	Parallel,
	Runnable,
	Sequential,
	StepResult,
} from "./types.js";
import {
	collectStepLabels,
	describeRunnable,
	resolveModel,
	statusIcon,
} from "./types.js";
import { renderStepLine, statusColor, statusDot } from "./widget.js";

// ── Gate presets ───────────────────────────────────────────────────────────

describe("Gate presets", () => {
	// regexCI
	describe("regexCI", () => {
		test("passes when output matches pattern (case-insensitive)", async () => {
			const gate = regexCI("^ok");
			expect(await gate({ output: "OK — all done" })).toBe(true);
		});

		test("fails when output does not match", async () => {
			const gate = regexCI("^ok");
			const result = await gate({ output: "Error: something went wrong" });
			expect(result).toContain("/^ok/i");
		});

		test("fails gracefully on invalid regex", async () => {
			const gate = regexCI("[invalid");
			const result = await gate({ output: "anything" });
			expect(typeof result).toBe("string");
			expect(result).toContain("Invalid regex");
		});
	});

	// allOf
	describe("allOf", () => {
		test("passes when all inner gates pass", async () => {
			const g1 = regexCI("foo");
			const g2 = regexCI("bar");
			expect(await allOf(g1, g2)({ output: "foo and bar" })).toBe(true);
		});

		test("fails at the first failing gate", async () => {
			const g1 = regexCI("foo");
			const g2 = regexCI("bar");
			const result = await allOf(g1, g2)({ output: "only foo here" });
			expect(typeof result).toBe("string");
			expect(result).toContain("/bar/i");
		});

		test("passes with no gates (vacuously true)", async () => {
			expect(await allOf()({ output: "anything" })).toBe(true);
		});
	});

	// command — only test when ctx is absent (no subprocess in unit tests)
	describe("command (no ctx)", () => {
		test("returns error string when no ctx provided", async () => {
			const gate = command("exit 0");
			const result = await gate({ output: "" });
			expect(typeof result).toBe("string");
			expect(result).toContain("requires execution context");
		});
	});

	// file — only test when ctx is absent
	describe("file (no ctx)", () => {
		test("returns error string when no ctx provided", async () => {
			const gate = file("/tmp/does-not-exist");
			const result = await gate({ output: "" });
			expect(typeof result).toBe("string");
			expect(result).toContain("requires execution context");
		});
	});
});

// ── OnFail presets ─────────────────────────────────────────────────────────

describe("OnFail presets", () => {
	describe("skip", () => {
		test("always returns { action: skip }", () => {
			expect(
				skip({ reason: "x", retryCount: 0, stepCount: 1, output: "" }),
			).toMatchObject({ action: "skip" });
		});
	});

	describe("warn", () => {
		test("always returns { action: warn }", () => {
			expect(
				warn({ reason: "x", retryCount: 0, stepCount: 1, output: "" }),
			).toMatchObject({ action: "warn" });
		});
	});

	describe("retry(max)", () => {
		test("returns retry while under max", () => {
			const onFail = retry(3);
			expect(
				onFail({ reason: "x", retryCount: 0, stepCount: 1, output: "" }),
			).toMatchObject({ action: "retry" });
			expect(
				onFail({ reason: "x", retryCount: 2, stepCount: 3, output: "" }),
			).toMatchObject({ action: "retry" });
		});

		test("returns fail when retryCount >= max", () => {
			const onFail = retry(3);
			expect(
				onFail({ reason: "x", retryCount: 3, stepCount: 4, output: "" }),
			).toMatchObject({ action: "fail" });
		});

		test("defaults max to 3", () => {
			const onFail = retry();
			expect(
				onFail({ reason: "x", retryCount: 3, stepCount: 4, output: "" }),
			).toMatchObject({ action: "fail" });
		});
	});

	describe("retryWithDelay(max, delay)", () => {
		test("returns retry while under max (delay=0 for speed)", async () => {
			const onFail = retryWithDelay(2, 0);
			const r = await onFail({
				reason: "x",
				retryCount: 0,
				stepCount: 1,
				output: "",
			});
			expect(r).toMatchObject({ action: "retry" });
		});

		test("returns fail when retryCount >= max", async () => {
			const onFail = retryWithDelay(2, 0);
			const r = await onFail({
				reason: "x",
				retryCount: 2,
				stepCount: 3,
				output: "",
			});
			expect(r).toMatchObject({ action: "fail" });
		});
	});

	describe("fallback(step)", () => {
		test("returns fallback action with the given step", () => {
			const step = {
				kind: "step" as const,
				label: "alt",
				prompt: "do it differently",
				tools: [],
				gate: undefined,
				onFail: skip,
				transform: full,
			};
			const onFail = fallback(step);
			const result = onFail({
				reason: "x",
				retryCount: 0,
				stepCount: 1,
				output: "",
			});
			expect(result).toMatchObject({ action: "fallback", step });
		});
	});
});

// ── Merge presets ──────────────────────────────────────────────────────────

describe("Merge presets", () => {
	describe("concat", () => {
		test("joins multiple outputs with separators", () => {
			const result = concat(["alpha", "beta", "gamma"], undefined as never);
			expect(result).toContain("Branch 1");
			expect(result).toContain("alpha");
			expect(result).toContain("Branch 3");
		});

		test("returns single output without separator", () => {
			expect(concat(["only one"], undefined as never)).toBe("only one");
		});

		test("filters empty outputs", () => {
			expect(concat(["", "  ", "content"], undefined as never)).toBe("content");
		});

		test("returns fallback for all-empty", () => {
			expect(concat(["", "  "], undefined as never)).toBe("(no output)");
		});
	});

	describe("firstPass", () => {
		test("returns the first non-empty output", () => {
			expect(firstPass(["", "second", "third"], undefined as never)).toBe(
				"second",
			);
		});

		test("returns fallback when all are empty", () => {
			expect(firstPass(["", "  "], undefined as never)).toBe("(no output)");
		});
	});
});

// ── Transform presets ──────────────────────────────────────────────────────

describe("Transform presets", () => {
	describe("full", () => {
		test("returns output unchanged", async () => {
			const result = await full({
				output: "hello",
				original: "",
				ctx: undefined as never,
			});
			expect(result).toBe("hello");
		});
	});

	describe("extract(key)", () => {
		test("extracts a key from JSON in a code block", async () => {
			const t = extract("answer");
			const output = '```json\n{"answer": "42"}\n```';
			const result = await t({ output, original: "", ctx: undefined as never });
			expect(result).toBe("42");
		});

		test("extracts a key from bare JSON", async () => {
			const t = extract("name");
			const result = await t({
				output: '{"name": "Alice"}',
				original: "",
				ctx: undefined as never,
			});
			expect(result).toBe("Alice");
		});

		test("falls back to raw output on invalid JSON", async () => {
			const t = extract("key");
			const output = "not json at all";
			const result = await t({ output, original: "", ctx: undefined as never });
			expect(result).toBe(output);
		});
	});
});

// ── loader.ts ─────────────────────────────────────────────────────────────

describe("resolveAliases", () => {
	const captainDir = "/abs/path/to/captain";

	test("replaces <captain>/ alias", () => {
		const src = 'import { retry } from "<captain>/gates/on-fail.js";';
		expect(resolveAliases(src, captainDir)).toBe(
			`import { retry } from "${captainDir}/gates/on-fail.js";`,
		);
	});

	test("replaces captain/ alias (no angle brackets)", () => {
		const src = 'import { concat } from "captain/merge.js";';
		expect(resolveAliases(src, captainDir)).toBe(
			`import { concat } from "${captainDir}/merge.js";`,
		);
	});

	test("leaves non-alias imports untouched", () => {
		const src = 'import { foo } from "./local.js";';
		expect(resolveAliases(src, captainDir)).toBe(src);
	});

	test("replaces multiple occurrences", () => {
		const src = [
			'import { a } from "<captain>/a.js";',
			'import { b } from "captain/b.js";',
		].join("\n");
		const result = resolveAliases(src, captainDir);
		expect(result).toContain(`"${captainDir}/a.js"`);
		expect(result).toContain(`"${captainDir}/b.js"`);
	});
});

describe("extractPipeline", () => {
	const seq: Runnable = {
		kind: "sequential",
		steps: [],
		gate: undefined,
		onFail: undefined,
		transform: undefined,
	};
	const step: Runnable = {
		kind: "step",
		label: "x",
		prompt: "y",
		tools: [],
		gate: undefined,
		onFail: skip,
		transform: full,
	};

	test("returns top-level pipeline export", () => {
		const mod = { pipeline: seq };
		expect(extractPipeline(mod as never)).toBe(seq);
	});

	test("returns pipeline from default export", () => {
		const mod = { default: { pipeline: seq } };
		expect(extractPipeline(mod as never)).toBe(seq);
	});

	test("falls back to any named export with a valid kind", () => {
		const mod = { myStep: step };
		expect(extractPipeline(mod as never)).toBe(step);
	});

	test("returns undefined when no valid export found", () => {
		const mod = { somethingElse: { name: "not a pipeline" } };
		expect(extractPipeline(mod as never)).toBeUndefined();
	});

	test("skips default key during fallback scan", () => {
		const mod = { default: step };
		// default key should be skipped in the fallback scan
		expect(extractPipeline(mod as never)).toBeUndefined();
	});
});

// ── commands.ts — parsePipelineAndInput ────────────────────────────────────

describe("parsePipelineAndInput", () => {
	test("returns empty strings for empty input", () => {
		expect(parsePipelineAndInput("")).toEqual({ pipeline: "", input: "" });
	});

	test("single token becomes pipeline, input is empty", () => {
		expect(parsePipelineAndInput("my-pipeline")).toEqual({
			pipeline: "my-pipeline",
			input: "",
		});
	});

	test("first token is pipeline, rest join as input", () => {
		expect(parsePipelineAndInput("review this PR")).toEqual({
			pipeline: "review",
			input: "this PR",
		});
	});

	test("quoted pipeline name with spaces is treated as single token", () => {
		const result = parsePipelineAndInput('"my cool pipeline" do something');
		expect(result.pipeline).toBe("my cool pipeline");
		expect(result.input).toBe("do something");
	});

	test("single-quoted pipeline name is treated as single token", () => {
		const result = parsePipelineAndInput("'code review' fix the bug");
		expect(result.pipeline).toBe("code review");
		expect(result.input).toBe("fix the bug");
	});

	test("only whitespace returns empty strings", () => {
		expect(parsePipelineAndInput("   ")).toEqual({ pipeline: "", input: "" });
	});

	test("multiple extra tokens all join into input", () => {
		const result = parsePipelineAndInput("pipe one two three");
		expect(result.pipeline).toBe("pipe");
		expect(result.input).toBe("one two three");
	});

	test("pipeline name with hyphens and dots parses correctly", () => {
		const result = parsePipelineAndInput("github-pr-review.ts some input here");
		expect(result.pipeline).toBe("github-pr-review.ts");
		expect(result.input).toBe("some input here");
	});
});

// ── commands.ts — parseInlineFlags ────────────────────────────────────────

describe("parseInlineFlags", () => {
	test("returns empty flags and original string when no flags present", () => {
		expect(parseInlineFlags("just some text")).toEqual({
			flags: {},
			prompt: "just some text",
		});
	});

	test("extracts a single --model flag", () => {
		const result = parseInlineFlags("review this --model sonnet");
		expect(result.flags).toMatchObject({ model: "sonnet" });
		expect(result.prompt).toBe("review this");
	});

	test("extracts --background flag", () => {
		const result = parseInlineFlags("do stuff --background true");
		expect(result.flags).toMatchObject({ background: "true" });
		expect(result.prompt).toBe("do stuff");
	});

	test("extracts multiple flags", () => {
		const result = parseInlineFlags(
			"review pr --model haiku --background false",
		);
		expect(result.flags).toMatchObject({ model: "haiku", background: "false" });
		expect(result.prompt).toBe("review pr");
	});

	test("prompt with no leading text and only flags", () => {
		const result = parseInlineFlags("--model opus");
		expect(result.flags).toMatchObject({ model: "opus" });
		expect(result.prompt).toBe("");
	});

	test("empty string returns empty flags and empty prompt", () => {
		expect(parseInlineFlags("")).toEqual({ flags: {}, prompt: "" });
	});

	test("flag value captures multiple words until next flag", () => {
		const result = parseInlineFlags("text --title my long title --model haiku");
		expect(result.flags.title).toBe("my long title");
		expect(result.flags.model).toBe("haiku");
		expect(result.prompt).toBe("text");
	});
});

// ── Additional Gate preset coverage ───────────────────────────────────────

describe("user gate", () => {
	test("returns error string when no ctx provided", async () => {
		const result = await user({ output: "test output" });
		expect(typeof result).toBe("string");
		expect(result).toContain("interactive UI");
	});

	test("returns error string when ctx has no UI", async () => {
		const ctx = { hasUI: false, confirm: undefined } as never;
		const result = await user({ output: "test output", ctx });
		expect(typeof result).toBe("string");
		expect(result).toContain("interactive UI");
	});
});

// ── Merge presets — vote & rank & awaitAll ────────────────────────────────

describe("vote", () => {
	test("returns single valid output without LLM", async () => {
		const result = await vote(["only answer"], undefined as never);
		expect(result).toBe("only answer");
	});

	test("returns fallback when all outputs are empty", async () => {
		const result = await vote(["", "  "], undefined as never);
		expect(result).toBe("(no output)");
	});

	test("with 2+ outputs + undefined ctx → llmMerge error string", async () => {
		const result = await vote(["answer A", "answer B"], undefined as never);
		expect(typeof result).toBe("string");
		// llmMerge catches the TypeError and returns "(merge error: ...)"
		expect(result).toContain("error");
	});
});

describe("rank", () => {
	test("returns single valid output without LLM", async () => {
		const result = await rank(["best answer"], undefined as never);
		expect(result).toBe("best answer");
	});

	test("returns fallback when all outputs are empty", async () => {
		const result = await rank(["", "  "], undefined as never);
		expect(result).toBe("(no output)");
	});

	test("with 2+ outputs + undefined ctx → llmMerge error string", async () => {
		const result = await rank(["result 1", "result 2"], undefined as never);
		expect(typeof result).toBe("string");
		expect(result).toContain("error");
	});
});

describe("awaitAll", () => {
	test("behaves like concat — joins multiple outputs", () => {
		const result = awaitAll(["A", "B"], undefined as never);
		expect(result).toContain("A");
		expect(result).toContain("B");
	});
});

// ── Transform presets — summarize ─────────────────────────────────────────

describe("summarize()", () => {
	test("returns the original output unchanged when no model in ctx", async () => {
		const transform = summarize();
		const result = await transform({
			output: "the original text",
			original: "",
			ctx: { model: null, apiKey: null } as never,
		});
		expect(result).toBe("the original text");
	});

	test("returns output unchanged when apiKey is absent", async () => {
		const transform = summarize();
		const result = await transform({
			output: "some content",
			original: "",
			ctx: { model: { id: "test" }, apiKey: undefined } as never,
		});
		expect(result).toBe("some content");
	});
});

// ── types.ts utilities ─────────────────────────────────────────────────────

describe("statusIcon", () => {
	test("returns ✓ for passed", () => expect(statusIcon("passed")).toBe("✓"));
	test("returns ✗ for failed", () => expect(statusIcon("failed")).toBe("✗"));
	test("returns ⊘ for skipped", () => expect(statusIcon("skipped")).toBe("⊘"));
	test("returns ⏳ for running", () =>
		expect(statusIcon("running")).toBe("⏳"));
	test("returns ○ for unknown status", () =>
		expect(statusIcon("unknown")).toBe("○"));
});

describe("describeRunnable", () => {
	test("describes a step", () => {
		const r: Runnable = {
			kind: "step",
			label: "my-step",
			prompt: "do it",
			tools: ["bash"],
		};
		const desc = describeRunnable(r, 0);
		expect(desc).toContain("[step]");
		expect(desc).toContain("my-step");
	});

	test("describes a sequential with nested steps", () => {
		const r: Sequential = {
			kind: "sequential",
			steps: [
				{ kind: "step", label: "s1", prompt: "p1", tools: [] },
				{ kind: "step", label: "s2", prompt: "p2", tools: [] },
			],
		};
		const desc = describeRunnable(r, 0);
		expect(desc).toContain("[sequential]");
		expect(desc).toContain("2 steps");
		expect(desc).toContain("s1");
		expect(desc).toContain("s2");
	});

	test("describes a parallel with nested steps", () => {
		const r: Parallel = {
			kind: "parallel",
			steps: [{ kind: "step", label: "b1", prompt: "p1", tools: [] }],
			merge: concat,
		};
		const desc = describeRunnable(r, 2);
		expect(desc).toContain("[parallel]");
		expect(desc).toContain("b1");
	});

	test("describes a step with a named gate", () => {
		function myGate() {
			return true as const;
		}
		const r: Runnable = {
			kind: "step",
			label: "gated",
			prompt: "do",
			tools: [],
			gate: myGate as never,
		};
		const desc = describeRunnable(r, 0);
		expect(desc).toContain("myGate");
	});
});

describe("collectStepLabels", () => {
	test("returns label of a single step", () => {
		const r: Runnable = {
			kind: "step",
			label: "my-label",
			prompt: "p",
			tools: [],
		};
		expect(collectStepLabels(r)).toEqual(["my-label"]);
	});

	test("returns all labels from sequential", () => {
		const r: Sequential = {
			kind: "sequential",
			steps: [
				{ kind: "step", label: "a", prompt: "p", tools: [] },
				{ kind: "step", label: "b", prompt: "p", tools: [] },
			],
		};
		expect(collectStepLabels(r)).toEqual(["a", "b"]);
	});

	test("returns all labels from parallel", () => {
		const r: Parallel = {
			kind: "parallel",
			steps: [
				{ kind: "step", label: "x", prompt: "p", tools: [] },
				{ kind: "step", label: "y", prompt: "p", tools: [] },
			],
			merge: firstPass,
		};
		expect(collectStepLabels(r)).toEqual(["x", "y"]);
	});

	test("returns empty array for unknown kind", () => {
		expect(collectStepLabels({ kind: "bogus" } as never)).toEqual([]);
	});
});

describe("resolveModel", () => {
	const FAKE_MODEL = {
		id: "claude-fallback",
		provider: "anthropic",
	} as Model<Api>;

	function makeRegistry(
		models: Array<{ id: string; provider: string }>,
	): ModelRegistryLike {
		return {
			getAll: () => models as Model<Api>[],
			find: () => undefined,
			getApiKey: async () => "key",
		};
	}

	test("returns fallback when registry is empty", () => {
		const reg = makeRegistry([]);
		expect(
			resolveModel({ pattern: "sonnet", registry: reg, fallback: FAKE_MODEL }),
		).toBe(FAKE_MODEL);
	});

	test("returns exact match from same provider", () => {
		const model = { id: "claude-sonnet-4-5", provider: "anthropic" };
		const reg = makeRegistry([model]);
		const result = resolveModel({
			pattern: "claude-sonnet-4-5",
			registry: reg,
			fallback: FAKE_MODEL,
		});
		expect(result.id).toBe("claude-sonnet-4-5");
	});

	test("returns partial match from same provider", () => {
		const model = { id: "claude-sonnet-3-7", provider: "anthropic" };
		const reg = makeRegistry([model]);
		const result = resolveModel({
			pattern: "sonnet",
			registry: reg,
			fallback: FAKE_MODEL,
		});
		expect(result.id).toBe("claude-sonnet-3-7");
	});

	test("returns fallback when no match in same provider", () => {
		const model = { id: "gpt-4", provider: "openai" };
		const reg = makeRegistry([model]);
		const result = resolveModel({
			pattern: "gpt-4",
			registry: reg,
			fallback: FAKE_MODEL,
		});
		expect(result).toBe(FAKE_MODEL);
	});
});

// ── widget.ts — statusColor & statusDot & renderStepLine ──────────────────

describe("statusColor", () => {
	test("passed → success", () => expect(statusColor("passed")).toBe("success"));
	test("failed → error", () => expect(statusColor("failed")).toBe("error"));
	test("running → accent", () => expect(statusColor("running")).toBe("accent"));
	test("other → dim", () => expect(statusColor("idle")).toBe("dim"));
});

describe("statusDot", () => {
	test("passed → ✓", () => expect(statusDot("passed")).toBe("✓"));
	test("failed → ✗", () => expect(statusDot("failed")).toBe("✗"));
	test("skipped → ⊘", () => expect(statusDot("skipped")).toBe("⊘"));
	test("running → ●", () => expect(statusDot("running")).toBe("●"));
	test("idle → ○", () => expect(statusDot("idle")).toBe("○"));
});

describe("renderStepLine", () => {
	// Simple mock theme — just returns text unchanged
	const mockTheme = { fg: (_color: string, text: string) => text };

	const baseResult: StepResult = {
		label: "my-step",
		status: "passed",
		output: "all done",
		elapsed: 1500,
		toolCount: 4,
		toolCallCount: 2,
		model: "claude-sonnet-4-5",
		group: undefined,
	};

	test("renders step label", () => {
		const line = renderStepLine(baseResult, {
			width: 100,
			indent: 0,
			theme: mockTheme,
		});
		expect(line).toContain("my-step");
	});

	test("renders model id in shortened form", () => {
		const line = renderStepLine(baseResult, {
			width: 100,
			indent: 0,
			theme: mockTheme,
		});
		// shortenModelId("claude-sonnet-4-5") → "sonnet 4.5"
		expect(line).toContain("sonnet");
	});

	test("renders tool counts", () => {
		const line = renderStepLine(baseResult, {
			width: 100,
			indent: 0,
			theme: mockTheme,
		});
		expect(line).toContain("2/4");
	});

	test("renders elapsed time", () => {
		const line = renderStepLine(baseResult, {
			width: 100,
			indent: 0,
			theme: mockTheme,
		});
		expect(line).toContain("1.5s");
	});

	test("renders step with error output when output is empty", () => {
		const r: StepResult = {
			...baseResult,
			output: "",
			error: "something went wrong",
		};
		const line = renderStepLine(r, { width: 100, indent: 0, theme: mockTheme });
		expect(line).toContain("my-step");
	});

	test("handles indent correctly", () => {
		const line = renderStepLine(baseResult, {
			width: 100,
			indent: 4,
			theme: mockTheme,
		});
		expect(line.startsWith("    ")).toBe(true);
	});

	test("renders failed step", () => {
		const r: StepResult = {
			...baseResult,
			status: "failed",
			output: "Error occurred",
		};
		const line = renderStepLine(r, { width: 100, indent: 0, theme: mockTheme });
		expect(line).toContain("my-step");
	});
});

// ── generator.ts — buildGeneratorPrompt & parseGeneratedPipeline ──────────

describe("buildGeneratorPrompt", () => {
	test("returns a non-empty string containing the goal", () => {
		const prompt = buildGeneratorPrompt("review security vulnerabilities");
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(0);
		expect(prompt).toContain("review security vulnerabilities");
	});

	test("includes import hints and export format", () => {
		const prompt = buildGeneratorPrompt("test pipeline");
		expect(prompt).toContain("export const pipeline");
		expect(prompt).toContain("captain.ts");
	});
});

describe("parseGeneratedPipeline", () => {
	const validSource = [
		"// @name: my-pipeline",
		"// @description: Does something useful",
		"export const pipeline = { kind: 'step', label: 'x', prompt: 'y', tools: [] };",
	].join("\n");

	test("parses name and description from valid source", () => {
		const result = parseGeneratedPipeline(validSource);
		expect(result.name).toBe("my-pipeline");
		expect(result.description).toBe("Does something useful");
	});

	test("extracts source from markdown fences", () => {
		const fenced = `\`\`\`typescript\n${validSource}\n\`\`\``;
		const result = parseGeneratedPipeline(fenced);
		expect(result.name).toBe("my-pipeline");
	});

	test("throws when @name comment is missing", () => {
		const bad = "export const pipeline = {};";
		expect(() => parseGeneratedPipeline(bad)).toThrow("@name");
	});

	test("throws when export const pipeline is missing", () => {
		const bad = "// @name: my-pipe\n// no pipeline export";
		expect(() => parseGeneratedPipeline(bad)).toThrow("export const pipeline");
	});

	test("empty description when @description comment is absent", () => {
		const src = "// @name: pipe\nexport const pipeline = {};";
		const result = parseGeneratedPipeline(src);
		expect(result.description).toBe("");
	});
});

// ── tools.ts — buildCompletionText ────────────────────────────────────────

describe("buildCompletionText", () => {
	const mockResults: StepResult[] = [
		{ label: "s1", status: "passed", output: "out1", elapsed: 500 },
		{ label: "s2", status: "failed", output: "", error: "bad", elapsed: 100 },
		{ label: "s3", status: "skipped", output: "", elapsed: 50 },
	];

	test("includes pipeline name in output", () => {
		const text = buildCompletionText({
			name: "my-pipe",
			output: "final output",
			results: mockResults,
		});
		expect(text).toContain("my-pipe");
	});

	test("reports step counts correctly", () => {
		const text = buildCompletionText({
			name: "pipe",
			output: "out",
			results: mockResults,
		});
		expect(text).toContain("3");
		expect(text).toContain("1 passed");
		expect(text).toContain("1 failed");
		expect(text).toContain("1 skipped");
	});

	test("includes the final output", () => {
		const text = buildCompletionText({
			name: "pipe",
			output: "final result here",
			results: mockResults,
		});
		expect(text).toContain("final result here");
	});

	test("includes elapsed time", () => {
		const start = Date.now() - 2000;
		const end = Date.now();
		const text = buildCompletionText({
			name: "pipe",
			output: "out",
			results: [],
			startTime: start,
			endTime: end,
		});
		expect(text).toMatch(/\d+\.\d+s/);
	});
});
