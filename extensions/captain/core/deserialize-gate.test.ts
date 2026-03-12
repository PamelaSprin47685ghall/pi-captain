import { describe, expect, test } from "bun:test";
import type { Gate, Step } from "../core/types.js";
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

function fakeCtx() {
	return {
		exec: async () => ({ code: 0, stdout: "", stderr: "" }),
		hasUI: false,
		cwd: "/tmp",
	};
}

// ── Gate deserialization ──────────────────────────────────────────────────

describe("deserialize: gate", () => {
	test("leaves function gate unchanged", () => {
		const gate: Gate = () => true;
		const result = deserializeRunnable(step({ gate })) as Step;
		expect(result.gate).toBe(gate);
	});

	test("leaves undefined gate unchanged", () => {
		const result = deserializeRunnable(step()) as Step;
		expect(result.gate).toBeUndefined();
	});

	test("'none' gate → undefined", () => {
		const result = deserializeRunnable(
			step({ gate: { type: "none" } as unknown as Gate }),
		) as Step;
		expect(result.gate).toBeUndefined();
	});

	test("command gate passes on exit 0", async () => {
		const result = deserializeRunnable(
			step({ gate: { type: "command", value: "true" } as unknown as Gate }),
		) as Step;
		expect(typeof result.gate).toBe("function");
		const r = await result.gate?.({ output: "ok", ctx: fakeCtx() });
		expect(r).toBe(true);
	});

	test("file gate passes when exec returns 0", async () => {
		const result = deserializeRunnable(
			step({ gate: { type: "file", value: "any.txt" } as unknown as Gate }),
		) as Step;
		const r = await result.gate?.({ output: "", ctx: fakeCtx() });
		expect(r).toBe(true);
	});

	test("regex gate passes on matching output", () => {
		const result = deserializeRunnable(
			step({ gate: { type: "regex", pattern: "success" } as unknown as Gate }),
		) as Step;
		expect(result.gate?.({ output: "great SUCCESS" })).toBe(true);
		expect(typeof result.gate?.({ output: "failure" })).toBe("string");
	});

	test("user gate fails without UI ctx", async () => {
		const result = deserializeRunnable(
			step({ gate: { type: "user" } as unknown as Gate }),
		) as Step;
		const r = await result.gate?.({ output: "test" });
		expect(typeof r).toBe("string");
		expect(r).toContain("interactive UI");
	});

	test("unknown gate type → undefined", () => {
		const result = deserializeRunnable(
			step({ gate: { type: "bogus" } as unknown as Gate }),
		) as Step;
		expect(result.gate).toBeUndefined();
	});
});
