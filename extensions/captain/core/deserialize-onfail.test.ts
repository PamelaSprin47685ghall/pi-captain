import { describe, expect, test } from "bun:test";
import type { OnFail, Step } from "../types.js";
import { deserializeRunnable } from "./deserialize.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function step(overrides: Partial<Step> = {}): Step {
	return {
		kind: "step",
		label: "test step",
		prompt: "test prompt",
		...overrides,
	};
}

function ctx(retryCount = 0) {
	return {
		reason: "failed",
		retryCount,
		stepCount: retryCount + 1,
		output: "test",
	};
}

// ── OnFail deserialization ────────────────────────────────────────────────

describe("deserialize: onFail", () => {
	test("leaves function onFail unchanged", () => {
		const onFail: OnFail = () => ({ action: "skip" });
		const result = deserializeRunnable(step({ onFail })) as Step;
		expect(result.onFail).toBe(onFail);
	});

	test("leaves undefined onFail unchanged", () => {
		const result = deserializeRunnable(step()) as Step;
		expect(result.onFail).toBeUndefined();
	});

	test("retry: retries below max", () => {
		const result = deserializeRunnable(
			step({ onFail: { action: "retry", max: 2 } as unknown as OnFail }),
		) as Step;
		expect(result.onFail?.(ctx(0))).toEqual({ action: "retry" });
		expect(result.onFail?.(ctx(1))).toEqual({ action: "retry" });
	});

	test("retry: fails at max", () => {
		const result = deserializeRunnable(
			step({ onFail: { action: "retry", max: 2 } as unknown as OnFail }),
		) as Step;
		expect(result.onFail?.(ctx(2))).toEqual({ action: "fail" });
	});

	test("retryWithDelay: retries with delay", async () => {
		const result = deserializeRunnable(
			step({
				onFail: {
					action: "retryWithDelay",
					max: 1,
					delayMs: 50,
				} as unknown as OnFail,
			}),
		) as Step;
		const start = Date.now();
		const r = await result.onFail?.(ctx(0));
		expect(Date.now() - start).toBeGreaterThanOrEqual(40);
		expect(r).toEqual({ action: "retry" });
	});

	test("retryWithDelay: fails at max", async () => {
		const result = deserializeRunnable(
			step({
				onFail: {
					action: "retryWithDelay",
					max: 1,
					delayMs: 50,
				} as unknown as OnFail,
			}),
		) as Step;
		expect(await result.onFail?.(ctx(1))).toEqual({ action: "fail" });
	});

	test("skip", () => {
		const result = deserializeRunnable(
			step({ onFail: { action: "skip" } as unknown as OnFail }),
		) as Step;
		expect(result.onFail?.(ctx())).toEqual({ action: "skip" });
	});

	test("warn", () => {
		const result = deserializeRunnable(
			step({ onFail: { action: "warn" } as unknown as OnFail }),
		) as Step;
		expect(result.onFail?.(ctx())).toEqual({ action: "warn" });
	});

	test("fallback with step", () => {
		const fb = step({ label: "fallback" });
		const result = deserializeRunnable(
			step({ onFail: { action: "fallback", step: fb } as unknown as OnFail }),
		) as Step;
		const r = result.onFail?.(ctx());
		expect(r).toMatchObject({ action: "fallback", step: expect.any(Object) });
	});

	test("fallback without step → skip", () => {
		const result = deserializeRunnable(
			step({ onFail: { action: "fallback" } as unknown as OnFail }),
		) as Step;
		expect(result.onFail?.(ctx())).toEqual({ action: "skip" });
	});

	test("unknown action → undefined", () => {
		const result = deserializeRunnable(
			step({ onFail: { action: "bogus" } as unknown as OnFail }),
		) as Step;
		expect(result.onFail).toBeUndefined();
	});
});
