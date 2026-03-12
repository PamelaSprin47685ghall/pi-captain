import { describe, expect, test } from "bun:test";
import type { Runnable, Step } from "../types.js";
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

// ── Sequential validation errors ──────────────────────────────────────────

describe("validate: sequential errors", () => {
	test("detects missing steps field", () => {
		const result = validateRunnable({
			kind: "sequential",
		} as unknown as Runnable);
		expect(result.errors).toContain(
			"root: Sequential missing required field 'steps' (array)",
		);
	});

	test("detects non-array steps", () => {
		const result = validateRunnable({
			kind: "sequential",
			steps: "bad",
		} as unknown as Runnable);
		expect(result.errors).toContain(
			"root: Sequential missing required field 'steps' (array)",
		);
	});

	test("detects empty steps array", () => {
		const result = validateRunnable({ kind: "sequential", steps: [] });
		expect(result.errors).toContain(
			"root: Sequential 'steps' array cannot be empty",
		);
	});

	test("detects onFail without gate", () => {
		const result = validateRunnable({
			kind: "sequential",
			steps: [step()],
			onFail: () => ({ action: "retry" }),
		});
		expect(result.errors).toContain(
			"root: 'onFail' specified but no 'gate' defined",
		);
	});
});

// ── Parallel validation errors ────────────────────────────────────────────

describe("validate: parallel errors", () => {
	test("detects missing steps", () => {
		const result = validateRunnable({
			kind: "parallel",
			merge: () => "",
		} as unknown as Runnable);
		expect(result.errors).toContain(
			"root: Parallel missing required field 'steps' (array)",
		);
	});

	test("detects empty steps array", () => {
		const result = validateRunnable({
			kind: "parallel",
			steps: [],
			merge: () => "",
		});
		expect(result.errors).toContain(
			"root: Parallel 'steps' array cannot be empty",
		);
	});

	test("detects missing merge", () => {
		const result = validateRunnable({
			kind: "parallel",
			steps: [step()],
		} as unknown as Runnable);
		expect(result.errors).toContain(
			"root: Parallel missing required field 'merge'",
		);
	});

	test("detects onFail without gate", () => {
		const result = validateRunnable({
			kind: "parallel",
			steps: [step()],
			merge: () => "",
			onFail: () => ({ action: "retry" }),
		});
		expect(result.errors).toContain(
			"root: 'onFail' specified but no 'gate' defined",
		);
	});
});

// ── Pool validation errors ────────────────────────────────────────────────

describe("validate: pool errors", () => {
	test("detects missing step", () => {
		const result = validateRunnable({
			kind: "pool",
			count: 3,
			merge: () => "",
		} as unknown as Runnable);
		expect(result.errors).toContain("root: Pool missing required field 'step'");
	});

	test("detects missing count", () => {
		const result = validateRunnable({
			kind: "pool",
			step: step(),
			merge: () => "",
		} as unknown as Runnable);
		expect(result.errors).toContain("root: Pool missing or invalid 'count'");
	});

	test("detects zero count", () => {
		const result = validateRunnable({
			kind: "pool",
			step: step(),
			count: 0,
			merge: () => "",
		});
		expect(result.errors).toContain("root: Pool missing or invalid 'count'");
	});

	test("detects negative count", () => {
		const result = validateRunnable({
			kind: "pool",
			step: step(),
			count: -1,
			merge: () => "",
		});
		expect(result.errors).toContain("root: Pool missing or invalid 'count'");
	});

	test("detects missing merge", () => {
		const result = validateRunnable({
			kind: "pool",
			step: step(),
			count: 3,
		} as unknown as Runnable);
		expect(result.errors).toContain(
			"root: Pool missing required field 'merge'",
		);
	});
});

// ── Nested validation with path prefixes ──────────────────────────────────

describe("validate: nested path prefixes", () => {
	test("prefixes sequential child errors correctly", () => {
		const result = validateRunnable({
			kind: "sequential",
			steps: [step(), step({ label: undefined as unknown as string })],
		});
		expect(result.errors).toContain(
			"root.steps[1]: Step missing required field 'label'",
		);
	});

	test("prefixes deeply nested errors correctly", () => {
		const result = validateRunnable({
			kind: "sequential",
			steps: [
				step(),
				{
					kind: "parallel",
					steps: [step(), step({ prompt: undefined as unknown as string })],
					merge: () => "",
				},
			],
		});
		expect(result.errors).toContain(
			"root.steps[1].steps[1]: Step missing required field 'prompt'",
		);
	});

	test("prefixes pool child errors correctly", () => {
		const result = validateRunnable({
			kind: "pool",
			count: 2,
			merge: () => "",
			step: {
				kind: "sequential",
				steps: [step({ label: undefined as unknown as string })],
			},
		});
		expect(result.errors).toContain(
			"root.step.steps[0]: Step missing required field 'label'",
		);
	});
});
