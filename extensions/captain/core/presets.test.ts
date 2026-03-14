// ── Unit tests for core/presets.ts ───────────────────────────────────────
// Covers all gate, onFail, merge, and transform presets.
//
// Run with: bun test extensions/captain/core/presets.test.ts

import { describe, expect, test } from "bun:test";
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

// ── Gate presets ───────────────────────────────────────────────────────────

describe("Gate presets", () => {
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

	describe("command (no ctx)", () => {
		test("returns error string when no ctx provided", async () => {
			const gate = command("exit 0");
			const result = await gate({ output: "" });
			expect(typeof result).toBe("string");
			expect(result).toContain("requires execution context");
		});
	});

	describe("file (no ctx)", () => {
		test("returns error string when no ctx provided", async () => {
			const gate = file("/tmp/does-not-exist");
			const result = await gate({ output: "" });
			expect(typeof result).toBe("string");
			expect(result).toContain("requires execution context");
		});
	});

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
});
