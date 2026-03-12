// ── select.ts Unit Tests ───────────────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import type { CaptainState } from "../state.js";
import {
	buildPipelineSelectOptions,
	parsePipelineSelectOption,
} from "./select.js";

function makeState(loadedNames: string[] = []): CaptainState {
	const pipelines: Record<string, { spec: unknown }> = {};
	for (const name of loadedNames) {
		pipelines[name] = { spec: { kind: "step" } as unknown };
	}
	return { pipelines } as unknown as CaptainState;
}

// ── buildPipelineSelectOptions ─────────────────────────────────────────────

describe("buildPipelineSelectOptions", () => {
	test("returns empty array when no pipelines are loaded", () => {
		expect(buildPipelineSelectOptions(makeState())).toEqual([]);
	});

	test("returns loaded pipelines labeled with (loaded)", () => {
		const options = buildPipelineSelectOptions(makeState(["my-pipe"]));
		expect(options).toContain("my-pipe (loaded)");
	});

	test("returns multiple loaded pipelines all labeled (loaded)", () => {
		const options = buildPipelineSelectOptions(makeState(["pipe-a", "pipe-b"]));
		expect(options).toContain("pipe-a (loaded)");
		expect(options).toContain("pipe-b (loaded)");
	});

	test("returns only (loaded) entries — no (builtin)", () => {
		const options = buildPipelineSelectOptions(makeState(["captain:spec-tdd"]));
		expect(options).toEqual(["captain:spec-tdd (loaded)"]);
		expect(options.some((o) => o.includes("(builtin)"))).toBe(false);
	});

	test("works with pipeline name containing parentheses in the middle", () => {
		const options = buildPipelineSelectOptions(makeState(["my(special)pipe"]));
		expect(options).toContain("my(special)pipe (loaded)");
	});
});

// ── parsePipelineSelectOption ──────────────────────────────────────────────

describe("parsePipelineSelectOption", () => {
	test('strips " (loaded)" suffix', () => {
		expect(parsePipelineSelectOption("my-pipe (loaded)")).toBe("my-pipe");
	});

	test("handles pipeline name with spaces before the suffix", () => {
		expect(parsePipelineSelectOption("name with spaces (loaded)")).toBe(
			"name with spaces",
		);
	});

	test("returns the string unchanged when no suffix is present", () => {
		expect(parsePipelineSelectOption("plain-name")).toBe("plain-name");
	});

	test('returns correct name for "foo-bar (loaded)"', () => {
		expect(parsePipelineSelectOption("foo-bar (loaded)")).toBe("foo-bar");
	});

	test("handles pipeline name that itself contains ' (' in the middle", () => {
		expect(parsePipelineSelectOption("weird (name) (loaded)")).toBe(
			"weird (name)",
		);
	});

	test("handles empty string input gracefully", () => {
		const result = parsePipelineSelectOption("");
		expect(typeof result).toBe("string");
	});
});
