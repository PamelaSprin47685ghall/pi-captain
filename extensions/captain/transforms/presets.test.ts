import { describe, expect, test } from "bun:test";
import { extract, full, summarize } from "./presets.js";

// ── full ──────────────────────────────────────────────────────────────────

describe("transform: full", () => {
	test("returns output unchanged", () => {
		expect(full({ output: "hello", original: "o", ctx: {} as never })).toBe(
			"hello",
		);
	});

	test("returns empty string unchanged", () => {
		expect(full({ output: "", original: "o", ctx: {} as never })).toBe("");
	});
});

// ── extract ───────────────────────────────────────────────────────────────

describe("transform: extract", () => {
	test("extracts key from JSON code block", () => {
		const out = '```json\n{"result":"done","other":"x"}\n```';
		expect(
			extract("result")({ output: out, original: "", ctx: {} as never }),
		).toBe("done");
	});

	test("extracts key from raw JSON (no code block)", () => {
		const out = '{"score":42}';
		expect(
			extract("score")({ output: out, original: "", ctx: {} as never }),
		).toBe("42");
	});

	test("falls back to raw output on invalid JSON", () => {
		const out = "not json";
		expect(
			extract("key")({ output: out, original: "", ctx: {} as never }),
		).toBe(out);
	});

	test("falls back when key missing in parsed object", () => {
		const out = '{"other":"val"}';
		expect(
			extract("missing")({ output: out, original: "", ctx: {} as never }),
		).toBe(out);
	});
});

// ── summarize ────────────────────────────────────────────────────────────

describe("transform: summarize", () => {
	test("returns raw output when ctx has no model", async () => {
		const out = "long text to summarize";
		const result = await summarize()({
			output: out,
			original: "",
			ctx: {} as never,
		});
		expect(result).toBe(out);
	});
});
