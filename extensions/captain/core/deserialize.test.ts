import { describe, expect, test } from "bun:test";
import type {
	Gate,
	MergeFn,
	OnFail,
	Runnable,
	Step,
	Transform,
} from "../types.js";
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

// ── Transform deserialization ─────────────────────────────────────────────

describe("deserialize: transform", () => {
	test("leaves function transform unchanged", () => {
		const transform: Transform = ({ output }) => output.toUpperCase();
		const result = deserializeRunnable(step({ transform })) as Step;
		expect(result.transform).toBe(transform);
	});

	test("'full' → identity transform", () => {
		const result = deserializeRunnable(
			step({ transform: { kind: "full" } as unknown as Transform }),
		) as Step;
		expect(
			result.transform?.({ output: "x", original: "", ctx: {} as never }),
		).toBe("x");
	});

	test("'extract' → pulls key from JSON code block", () => {
		const result = deserializeRunnable(
			step({
				transform: { kind: "extract", key: "val" } as unknown as Transform,
			}),
		) as Step;
		const out = result.transform?.({
			output: '```json\n{"val":"ok"}\n```',
			original: "",
			ctx: {} as never,
		});
		expect(out).toBe("ok");
	});

	test("'extract' → falls back on invalid JSON", () => {
		const result = deserializeRunnable(
			step({
				transform: { kind: "extract", key: "val" } as unknown as Transform,
			}),
		) as Step;
		expect(
			result.transform?.({
				output: "not json",
				original: "",
				ctx: {} as never,
			}),
		).toBe("not json");
	});

	test("'summarize' → falls back when no model in ctx", async () => {
		const result = deserializeRunnable(
			step({ transform: { kind: "summarize" } as unknown as Transform }),
		) as Step;
		const out = await result.transform?.({
			output: "long text",
			original: "",
			ctx: {} as never,
		});
		expect(out).toBe("long text");
	});

	test("missing transform → defaults to full", () => {
		const result = deserializeRunnable(step()) as Step;
		expect(typeof result.transform).toBe("function");
		expect(
			result.transform?.({ output: "y", original: "", ctx: {} as never }),
		).toBe("y");
	});
});

// ── Merge deserialization ─────────────────────────────────────────────────

describe("deserialize: merge", () => {
	test("leaves function merge unchanged", () => {
		const merge: MergeFn = (o) => o.join(" | ");
		const pool: Runnable = { kind: "pool", step: step(), count: 2, merge };
		const result = deserializeRunnable(pool) as Extract<
			Runnable,
			{ kind: "pool" }
		>;
		expect(result.merge).toBe(merge);
	});

	test("'concat' strategy joins outputs", () => {
		const pool: Runnable = {
			kind: "pool",
			step: step(),
			count: 2,
			merge: { strategy: "concat" } as unknown as MergeFn,
		};
		const result = deserializeRunnable(pool) as Extract<
			Runnable,
			{ kind: "pool" }
		>;
		expect(result.merge(["a", "b"], {} as never)).toContain("a");
	});

	test("'firstPass' returns first non-empty", () => {
		const pool: Runnable = {
			kind: "pool",
			step: step(),
			count: 2,
			merge: { strategy: "firstPass" } as unknown as MergeFn,
		};
		const result = deserializeRunnable(pool) as Extract<
			Runnable,
			{ kind: "pool" }
		>;
		expect(result.merge(["", "second"], {} as never)).toBe("second");
	});

	test("unknown strategy defaults to concat", () => {
		const pool: Runnable = {
			kind: "pool",
			step: step(),
			count: 2,
			merge: { strategy: "bogus" } as unknown as MergeFn,
		};
		const result = deserializeRunnable(pool) as Extract<
			Runnable,
			{ kind: "pool" }
		>;
		expect(typeof result.merge(["x"], {} as never)).toBe("string");
	});
});

// ── Full Runnable recursive deserialization ───────────────────────────────

describe("deserialize: full runnable", () => {
	test("deserializes step with all raw properties", () => {
		const raw: Step = {
			kind: "step",
			label: "t",
			prompt: "t",
			gate: { type: "command", value: "true" } as unknown as Gate,
			onFail: { action: "retry", max: 3 } as unknown as OnFail,
			transform: { kind: "extract", key: "r" } as unknown as Transform,
		};
		const result = deserializeRunnable(raw) as Step;
		expect(typeof result.gate).toBe("function");
		expect(typeof result.onFail).toBe("function");
		expect(typeof result.transform).toBe("function");
	});

	test("recursively deserializes sequential children", () => {
		const seq: Runnable = {
			kind: "sequential",
			steps: [
				{
					kind: "step",
					label: "a",
					prompt: "a",
					gate: { type: "command", value: "true" } as unknown as Gate,
				},
				{
					kind: "step",
					label: "b",
					prompt: "b",
					onFail: { action: "skip" } as unknown as OnFail,
				},
			],
		};
		const result = deserializeRunnable(seq) as Extract<
			Runnable,
			{ kind: "sequential" }
		>;
		expect(typeof (result.steps[0] as Step).gate).toBe("function");
		expect(typeof (result.steps[1] as Step).onFail).toBe("function");
	});

	test("recursively deserializes parallel children and merge", () => {
		const par: Runnable = {
			kind: "parallel",
			steps: [
				{
					kind: "step",
					label: "a",
					prompt: "a",
					gate: { type: "regex", pattern: "ok" } as unknown as Gate,
				},
			],
			merge: { strategy: "concat" } as unknown as MergeFn,
		};
		const result = deserializeRunnable(par) as Extract<
			Runnable,
			{ kind: "parallel" }
		>;
		expect(typeof (result.steps[0] as Step).gate).toBe("function");
		expect(typeof result.merge).toBe("function");
	});

	test("recursively deserializes pool step and merge", () => {
		const pool: Runnable = {
			kind: "pool",
			step: {
				kind: "step",
				label: "p",
				prompt: "p",
				transform: { kind: "full" } as unknown as Transform,
			},
			count: 2,
			merge: { strategy: "firstPass" } as unknown as MergeFn,
		};
		const result = deserializeRunnable(pool) as Extract<
			Runnable,
			{ kind: "pool" }
		>;
		expect(typeof (result.step as Step).transform).toBe("function");
		expect(typeof result.merge).toBe("function");
	});

	test("preserves unknown kinds unchanged", () => {
		const unknown = { kind: "unknown", data: "x" } as unknown as Runnable;
		expect(deserializeRunnable(unknown)).toBe(unknown);
	});
});
