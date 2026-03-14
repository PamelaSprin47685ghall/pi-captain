// ── Unit tests for core/types.ts ─────────────────────────────────────────
// Covers: statusIcon, describeRunnable, collectStepLabels, resolveModel.
//
// Run with: bun test extensions/captain/core/types.test.ts

import { describe, expect, test } from "bun:test";
import type { Api, Model } from "@mariozechner/pi-ai";
import { concat, firstPass } from "./presets.js";
import type {
	ModelRegistryLike,
	Parallel,
	Runnable,
	Sequential,
} from "./types.js";
import {
	collectStepLabels,
	describeRunnable,
	resolveModel,
	statusIcon,
} from "./types.js";

// ── statusIcon ────────────────────────────────────────────────────────────

describe("statusIcon", () => {
	test("returns ✓ for passed", () => expect(statusIcon("passed")).toBe("✓"));
	test("returns ✗ for failed", () => expect(statusIcon("failed")).toBe("✗"));
	test("returns ⊘ for skipped", () => expect(statusIcon("skipped")).toBe("⊘"));
	test("returns ⏳ for running", () =>
		expect(statusIcon("running")).toBe("⏳"));
	test("returns ○ for unknown status", () =>
		expect(statusIcon("unknown")).toBe("○"));
});

// ── describeRunnable ──────────────────────────────────────────────────────

describe("describeRunnable", () => {
	test("describes a step", () => {
		const r: Runnable = {
			kind: "step",
			label: "my-step",
			prompt: "do it",
			tools: ["bash"],
		};
		const desc = describeRunnable(r, 0);
		expect(desc).toContain("[step]");
		expect(desc).toContain("my-step");
	});

	test("describes a sequential with nested steps", () => {
		const r: Sequential = {
			kind: "sequential",
			steps: [
				{ kind: "step", label: "s1", prompt: "p1", tools: [] },
				{ kind: "step", label: "s2", prompt: "p2", tools: [] },
			],
		};
		const desc = describeRunnable(r, 0);
		expect(desc).toContain("[sequential]");
		expect(desc).toContain("2 steps");
		expect(desc).toContain("s1");
		expect(desc).toContain("s2");
	});

	test("describes a parallel with nested steps", () => {
		const r: Parallel = {
			kind: "parallel",
			steps: [{ kind: "step", label: "b1", prompt: "p1", tools: [] }],
			merge: concat,
		};
		const desc = describeRunnable(r, 2);
		expect(desc).toContain("[parallel]");
		expect(desc).toContain("b1");
	});

	test("describes a step with a named gate", () => {
		function myGate() {
			return true as const;
		}
		const r: Runnable = {
			kind: "step",
			label: "gated",
			prompt: "do",
			tools: [],
			gate: myGate as never,
		};
		const desc = describeRunnable(r, 0);
		expect(desc).toContain("myGate");
	});
});

// ── collectStepLabels ─────────────────────────────────────────────────────

describe("collectStepLabels", () => {
	test("returns label of a single step", () => {
		const r: Runnable = {
			kind: "step",
			label: "my-label",
			prompt: "p",
			tools: [],
		};
		expect(collectStepLabels(r)).toEqual(["my-label"]);
	});

	test("returns all labels from sequential", () => {
		const r: Sequential = {
			kind: "sequential",
			steps: [
				{ kind: "step", label: "a", prompt: "p", tools: [] },
				{ kind: "step", label: "b", prompt: "p", tools: [] },
			],
		};
		expect(collectStepLabels(r)).toEqual(["a", "b"]);
	});

	test("returns all labels from parallel", () => {
		const r: Parallel = {
			kind: "parallel",
			steps: [
				{ kind: "step", label: "x", prompt: "p", tools: [] },
				{ kind: "step", label: "y", prompt: "p", tools: [] },
			],
			merge: firstPass,
		};
		expect(collectStepLabels(r)).toEqual(["x", "y"]);
	});

	test("returns empty array for unknown kind", () => {
		expect(collectStepLabels({ kind: "bogus" } as never)).toEqual([]);
	});
});

// ── resolveModel ──────────────────────────────────────────────────────────

describe("resolveModel", () => {
	const FAKE_MODEL = {
		id: "claude-fallback",
		provider: "anthropic",
	} as Model<Api>;

	function makeRegistry(
		models: Array<{ id: string; provider: string }>,
	): ModelRegistryLike {
		return {
			getAll: () => models as Model<Api>[],
			find: () => undefined,
			getApiKey: async () => "key",
		};
	}

	test("returns fallback when registry is empty", () => {
		const reg = makeRegistry([]);
		expect(
			resolveModel({ pattern: "sonnet", registry: reg, fallback: FAKE_MODEL }),
		).toBe(FAKE_MODEL);
	});

	test("returns exact match from same provider", () => {
		const model = { id: "claude-sonnet-4-5", provider: "anthropic" };
		const reg = makeRegistry([model]);
		const result = resolveModel({
			pattern: "claude-sonnet-4-5",
			registry: reg,
			fallback: FAKE_MODEL,
		});
		expect(result.id).toBe("claude-sonnet-4-5");
	});

	test("returns partial match from same provider", () => {
		const model = { id: "claude-sonnet-3-7", provider: "anthropic" };
		const reg = makeRegistry([model]);
		const result = resolveModel({
			pattern: "sonnet",
			registry: reg,
			fallback: FAKE_MODEL,
		});
		expect(result.id).toBe("claude-sonnet-3-7");
	});

	test("returns fallback when no match in same provider", () => {
		const model = { id: "gpt-4", provider: "openai" };
		const reg = makeRegistry([model]);
		const result = resolveModel({
			pattern: "gpt-4",
			registry: reg,
			fallback: FAKE_MODEL,
		});
		expect(result).toBe(FAKE_MODEL);
	});
});
