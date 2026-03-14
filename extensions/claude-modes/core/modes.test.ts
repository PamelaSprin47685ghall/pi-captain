import { describe, expect, test } from "bun:test";
import { MODE_ORDER, MODES, type ModeName } from "./modes.js";

describe("MODES", () => {
	test("contains exactly code, plan, review", () => {
		const keys = Object.keys(MODES) as ModeName[];
		expect(keys.sort()).toEqual(["code", "plan", "review"]);
	});

	test("code mode is not read-only and has no systemNote", () => {
		expect(MODES.code.readOnly).toBe(false);
		expect(MODES.code.systemNote).toBeNull();
	});

	test("plan mode is read-only and has a systemNote", () => {
		expect(MODES.plan.readOnly).toBe(true);
		expect(typeof MODES.plan.systemNote).toBe("string");
		expect(MODES.plan.systemNote).toContain("[PLAN MODE ACTIVE]");
	});

	test("review mode is read-only and has a systemNote", () => {
		expect(MODES.review.readOnly).toBe(true);
		expect(typeof MODES.review.systemNote).toBe("string");
		expect(MODES.review.systemNote).toContain("[REVIEW MODE ACTIVE]");
	});

	test("read-only modes do not include edit or write tools", () => {
		for (const mode of ["plan", "review"] as const) {
			expect(MODES[mode].tools).not.toContain("edit");
			expect(MODES[mode].tools).not.toContain("write");
		}
	});

	test("code mode includes edit and write tools", () => {
		expect(MODES.code.tools).toContain("edit");
		expect(MODES.code.tools).toContain("write");
	});
});

describe("MODE_ORDER", () => {
	test("has three entries in order", () => {
		expect(MODE_ORDER).toEqual(["code", "plan", "review"]);
	});

	test("covers all modes", () => {
		const keys = Object.keys(MODES) as ModeName[];
		expect(MODE_ORDER.sort()).toEqual(keys.sort());
	});
});
