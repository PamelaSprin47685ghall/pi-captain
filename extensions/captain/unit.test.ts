// ── Unit tests for captain core modules ──────────────────────────────────
// Covers: presets.ts (gates, onFail, merge, transform)
//         loader.ts  (resolveAliases, extractPipeline)
//         commands.ts helpers (parsePipelineAndInput, parseInlineFlags)
//
// Run with: bun test extensions/captain/unit.test.ts

import { describe, expect, test } from "bun:test";

// ── Import helpers from modules under test ─────────────────────────────────

import { parseInlineFlags, parsePipelineAndInput } from "./commands.js";
import { extractPipeline, resolveAliases } from "./loader.js";
import {
	allOf,
	command,
	concat,
	extract,
	fallback,
	file,
	firstPass,
	full,
	regexCI,
	retry,
	retryWithDelay,
	skip,
	warn,
} from "./presets.js";

import type { Runnable } from "./types.js";

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
