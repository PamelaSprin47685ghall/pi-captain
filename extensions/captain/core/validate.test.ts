import { describe, expect, test } from "bun:test";
import type { Runnable, Step } from "../core/types.js";
import { validateRunnable } from "./validate.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function step(overrides: Partial<Step> = {}): Step {
	return {
		kind: "step",
		label: "test step",
		prompt: "test prompt",
		...overrides,
	};
}

// ── Valid structures ──────────────────────────────────────────────────────

describe("validate: valid structures", () => {
	test("validates correct step", () => {
		const result = validateRunnable(step());
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	test("validates correct sequential", () => {
		const result = validateRunnable({
			kind: "sequential",
			steps: [step(), step({ label: "s2" })],
		});
		expect(result.valid).toBe(true);
	});

	test("validates correct parallel", () => {
		const result = validateRunnable({
			kind: "parallel",
			steps: [step(), step({ label: "s2" })],
			merge: () => "merged",
		});
		expect(result.valid).toBe(true);
	});

	test("validates correct pool", () => {
		const result = validateRunnable({
			kind: "pool",
			step: step(),
			count: 3,
			merge: () => "merged",
		});
		expect(result.valid).toBe(true);
	});

	test("allows step with both gate and onFail", () => {
		const result = validateRunnable(
			step({ gate: () => true, onFail: () => ({ action: "retry" }) }),
		);
		expect(result.valid).toBe(true);
	});
});

// ── Step validation errors ────────────────────────────────────────────────

describe("validate: step errors", () => {
	test("detects missing label", () => {
		const result = validateRunnable(
			step({ label: undefined as unknown as string }),
		);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"root: Step missing required field 'label'",
		);
	});

	test("detects missing prompt", () => {
		const result = validateRunnable(
			step({ prompt: undefined as unknown as string }),
		);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"root: Step missing required field 'prompt'",
		);
	});

	test("detects onFail without gate", () => {
		const result = validateRunnable(
			step({ onFail: () => ({ action: "retry" }) }),
		);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain(
			"root: 'onFail' specified but no 'gate' defined",
		);
	});

	test("accumulates all errors in a step", () => {
		const result = validateRunnable(
			step({
				label: undefined as unknown as string,
				prompt: undefined as unknown as string,
				onFail: () => ({ action: "retry" }),
			}),
		);
		expect(result.errors).toHaveLength(3);
	});

	test("detects missing kind", () => {
		const result = validateRunnable({
			label: "x",
			prompt: "y",
		} as unknown as Runnable);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("root: Missing required field 'kind'");
	});

	test("detects unknown kind", () => {
		const result = validateRunnable({
			kind: "unknown",
			label: "x",
		} as unknown as Runnable);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("root: Unknown kind 'unknown'");
	});
});
