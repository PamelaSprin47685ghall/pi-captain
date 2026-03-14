// ── Unit tests for ui/widget.ts ───────────────────────────────────────────
// Covers: statusColor, statusDot, renderStepLine.
//
// Run with: bun test extensions/captain/ui/widget.test.ts

import { describe, expect, test } from "bun:test";
import type { StepResult } from "../core/types.js";
import { renderStepLine, statusColor, statusDot } from "./widget.js";

// ── statusColor ───────────────────────────────────────────────────────────

describe("statusColor", () => {
	test("passed → success", () => expect(statusColor("passed")).toBe("success"));
	test("failed → error", () => expect(statusColor("failed")).toBe("error"));
	test("running → accent", () => expect(statusColor("running")).toBe("accent"));
	test("other → dim", () => expect(statusColor("idle")).toBe("dim"));
});

// ── statusDot ─────────────────────────────────────────────────────────────

describe("statusDot", () => {
	test("passed → ✓", () => expect(statusDot("passed")).toBe("✓"));
	test("failed → ✗", () => expect(statusDot("failed")).toBe("✗"));
	test("skipped → ⊘", () => expect(statusDot("skipped")).toBe("⊘"));
	test("running → ●", () => expect(statusDot("running")).toBe("●"));
	test("idle → ○", () => expect(statusDot("idle")).toBe("○"));
});

// ── renderStepLine ────────────────────────────────────────────────────────

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
