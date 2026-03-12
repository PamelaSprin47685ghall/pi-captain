import { describe, expect, test } from "bun:test";
import {
	buildAdHocStep,
	parseInlineFlags,
	parseStepFlag,
} from "./commands-parse.js";

// ── parseStepFlag ─────────────────────────────────────────────────────────

describe("parseStepFlag", () => {
	test("extracts step filter and removes it from args", () => {
		const { stepFilter, cleanedArgs } = parseStepFlag(
			"run --step Research input text",
		);
		expect(stepFilter).toBe("Research");
		expect(cleanedArgs).toBe("run input text");
	});

	test("returns undefined stepFilter when flag absent", () => {
		const { stepFilter, cleanedArgs } = parseStepFlag("run some input");
		expect(stepFilter).toBeUndefined();
		expect(cleanedArgs).toBe("run some input");
	});

	test("handles --step at end of string", () => {
		const { stepFilter } = parseStepFlag("run --step MyStep");
		expect(stepFilter).toBe("MyStep");
	});

	test("handles empty string", () => {
		const { stepFilter, cleanedArgs } = parseStepFlag("");
		expect(stepFilter).toBeUndefined();
		expect(cleanedArgs).toBe("");
	});
});

// ── parseInlineFlags ──────────────────────────────────────────────────────

describe("parseInlineFlags", () => {
	test("parses single flag", () => {
		const { flags, prompt } = parseInlineFlags("do the thing --model flash");
		expect(flags.model).toBe("flash");
		expect(prompt).toContain("do the thing");
	});

	test("parses multiple flags", () => {
		const { flags } = parseInlineFlags(
			"prompt text --model sonnet --label MyStep",
		);
		expect(flags.model).toBe("sonnet");
		expect(flags.label).toBe("MyStep");
	});

	test("returns empty flags and full string when no flags present", () => {
		const { flags, prompt } = parseInlineFlags("just a prompt");
		expect(flags).toEqual({});
		expect(prompt).toBe("just a prompt");
	});

	test("returns empty flags for empty input", () => {
		const { flags, prompt } = parseInlineFlags("");
		expect(flags).toEqual({});
		expect(prompt).toBe("");
	});
});

// ── buildAdHocStep ────────────────────────────────────────────────────────

describe("buildAdHocStep", () => {
	test("builds step with default label and tools", () => {
		const s = buildAdHocStep("do something", {});
		expect(s.kind).toBe("step");
		expect(s.label).toBe("ad-hoc step");
		expect(s.prompt).toBe("do something");
		expect(s.tools).toEqual(["read", "bash", "edit", "write"]);
	});

	test("uses label flag when provided", () => {
		const s = buildAdHocStep("prompt", { label: "Custom Label" });
		expect(s.label).toBe("Custom Label");
	});

	test("uses model flag when provided", () => {
		const s = buildAdHocStep("prompt", { model: "flash" });
		expect(s.model).toBe("flash");
	});

	test("splits tools flag on comma", () => {
		const s = buildAdHocStep("prompt", { tools: "read,bash" });
		expect(s.tools).toEqual(["read", "bash"]);
	});

	test("step has skip onFail and full transform", () => {
		const s = buildAdHocStep("p", {});
		expect(typeof s.onFail).toBe("function");
		expect(typeof s.transform).toBe("function");
		expect(s.gate).toBeUndefined();
	});
});
