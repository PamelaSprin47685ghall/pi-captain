import { describe, expect, test } from "bun:test";
import type { Step } from "../types.js";
import { fallback, retry, retryWithDelay, skip, warn } from "./on-fail.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function ctx(retryCount = 0) {
	return {
		reason: "gate failed",
		retryCount,
		stepCount: retryCount + 1,
		output: "",
	};
}

function step(): Step {
	return { kind: "step", label: "fb", prompt: "p" };
}

// ── retry ─────────────────────────────────────────────────────────────────

describe("onFail: retry", () => {
	test("returns retry below max", () => {
		expect(retry(3)(ctx(0))).toEqual({ action: "retry" });
		expect(retry(3)(ctx(2))).toEqual({ action: "retry" });
	});

	test("returns fail at max", () => {
		expect(retry(3)(ctx(3))).toEqual({ action: "fail" });
	});

	test("default max is 3", () => {
		expect(retry()(ctx(2))).toEqual({ action: "retry" });
		expect(retry()(ctx(3))).toEqual({ action: "fail" });
	});
});

// ── retryWithDelay ────────────────────────────────────────────────────────

describe("onFail: retryWithDelay", () => {
	test("returns retry with delay", async () => {
		const start = Date.now();
		const result = await retryWithDelay(3, 50)(ctx(0));
		expect(Date.now() - start).toBeGreaterThanOrEqual(40);
		expect(result).toEqual({ action: "retry" });
	});

	test("returns fail at max", async () => {
		expect(await retryWithDelay(2, 0)(ctx(2))).toEqual({ action: "fail" });
	});
});

// ── skip / warn / fallback ────────────────────────────────────────────────

describe("onFail: skip", () => {
	test("always returns skip", () => {
		expect(skip(ctx())).toEqual({ action: "skip" });
	});
});

describe("onFail: warn", () => {
	test("always returns warn", () => {
		expect(warn(ctx())).toEqual({ action: "warn" });
	});
});

describe("onFail: fallback", () => {
	test("returns fallback action with the provided step", () => {
		const fb = step();
		expect(fallback(fb)(ctx())).toEqual({ action: "fallback", step: fb });
	});
});
