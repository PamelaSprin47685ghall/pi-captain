import { describe, expect, test } from "bun:test";
import type { Runnable, Step } from "../../types.js";
import {
	collectAgentRefs,
	collectStepLabels,
	containerGateInfo,
	describeRunnable,
	findStepByLabel,
	statusIcon,
} from "./runnable.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function step(label = "my step"): Step {
	return { kind: "step", label, prompt: "do it" };
}

const seq: Runnable = { kind: "sequential", steps: [step("A"), step("B")] };
const pool: Runnable = {
	kind: "pool",
	step: step("pooled"),
	count: 2,
	merge: () => "",
};
const par: Runnable = {
	kind: "parallel",
	steps: [step("X"), step("Y")],
	merge: () => "",
};

// ── findStepByLabel ───────────────────────────────────────────────────────

describe("findStepByLabel", () => {
	test("finds step by exact label", () => {
		expect(findStepByLabel(step("Alpha"), "Alpha")).toBeDefined();
	});

	test("finds step by partial / case-insensitive label", () => {
		expect(findStepByLabel(step("Alpha"), "alph")).toBeDefined();
	});

	test("returns undefined when not found", () => {
		expect(findStepByLabel(step("Alpha"), "Beta")).toBeUndefined();
	});

	test("searches sequential children", () => {
		expect(findStepByLabel(seq, "B")).toBeDefined();
	});

	test("searches pool child", () => {
		expect(findStepByLabel(pool, "pooled")).toBeDefined();
	});

	test("searches parallel children", () => {
		expect(findStepByLabel(par, "Y")).toBeDefined();
	});
});

// ── collectStepLabels ─────────────────────────────────────────────────────

describe("collectStepLabels", () => {
	test("returns label for single step", () => {
		expect(collectStepLabels(step("Z"))).toEqual(["Z"]);
	});

	test("collects all labels from sequential", () => {
		expect(collectStepLabels(seq)).toEqual(["A", "B"]);
	});

	test("collects label from pool", () => {
		expect(collectStepLabels(pool)).toEqual(["pooled"]);
	});

	test("collects all labels from parallel", () => {
		expect(collectStepLabels(par)).toEqual(["X", "Y"]);
	});
});

// ── collectAgentRefs ──────────────────────────────────────────────────────

describe("collectAgentRefs", () => {
	test("matches collectStepLabels for all kinds", () => {
		for (const r of [step("A"), seq, pool, par]) {
			expect(collectAgentRefs(r)).toEqual(collectStepLabels(r));
		}
	});
});

// ── statusIcon ────────────────────────────────────────────────────────────

describe("statusIcon", () => {
	test.each([
		["passed", "✓"],
		["failed", "✗"],
		["skipped", "⊘"],
		["running", "⏳"],
		["unknown", "○"],
	])("'%s' → '%s'", (status, icon) => {
		expect(statusIcon(status)).toBe(icon);
	});
});

// ── containerGateInfo ─────────────────────────────────────────────────────

describe("containerGateInfo", () => {
	test("returns empty string when no gate", () => {
		expect(containerGateInfo(undefined, undefined)).toBe("");
	});

	test("includes gate and onFail info when gate present", () => {
		const info = containerGateInfo(
			() => true,
			() => ({ action: "skip" }),
		);
		expect(info).toContain("gate:");
		expect(info).toContain("onFail:");
	});
});

// ── describeRunnable ──────────────────────────────────────────────────────

describe("describeRunnable", () => {
	test("describes a step", () => {
		const d = describeRunnable(step("MyStep"), 0);
		expect(d).toContain("[step]");
		expect(d).toContain("MyStep");
	});

	test("describes sequential with children", () => {
		const d = describeRunnable(seq, 0);
		expect(d).toContain("[sequential]");
		expect(d).toContain("A");
		expect(d).toContain("B");
	});

	test("describes pool", () => {
		expect(describeRunnable(pool, 0)).toContain("[pool]");
	});

	test("describes parallel", () => {
		expect(describeRunnable(par, 0)).toContain("[parallel]");
	});
});
