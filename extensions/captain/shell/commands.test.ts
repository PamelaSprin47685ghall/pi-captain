// ── Unit tests for shell/commands.ts ─────────────────────────────────────
// Covers: parsePipelineAndInput, parseInlineFlags.
//
// Run with: bun test extensions/captain/shell/commands.test.ts

import { describe, expect, test } from "bun:test";
import { parseInlineFlags, parsePipelineAndInput } from "./commands.js";

// ── parsePipelineAndInput ─────────────────────────────────────────────────

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

// ── parseInlineFlags ──────────────────────────────────────────────────────

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
