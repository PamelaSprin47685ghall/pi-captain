// ── Unit tests for shell/tools.ts ────────────────────────────────────────
// Covers: buildCompletionText.
//
// Run with: bun test extensions/captain/shell/tools.test.ts

import { describe, expect, test } from "bun:test";
import type { StepResult } from "../core/types.js";
import { buildCompletionText } from "./tools.js";

// ── buildCompletionText ───────────────────────────────────────────────────

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
