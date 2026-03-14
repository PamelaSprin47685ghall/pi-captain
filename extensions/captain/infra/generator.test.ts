// ── Unit tests for infra/generator.ts ────────────────────────────────────
// Covers: buildGeneratorPrompt, parseGeneratedPipeline.
//
// Run with: bun test extensions/captain/infra/generator.test.ts

import { describe, expect, test } from "bun:test";
import { buildGeneratorPrompt, parseGeneratedPipeline } from "./generator.js";

// ── buildGeneratorPrompt ──────────────────────────────────────────────────

describe("buildGeneratorPrompt", () => {
	test("returns a non-empty string containing the goal", () => {
		const prompt = buildGeneratorPrompt("review security vulnerabilities");
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(0);
		expect(prompt).toContain("review security vulnerabilities");
	});

	test("includes import hints and export format", () => {
		const prompt = buildGeneratorPrompt("test pipeline");
		expect(prompt).toContain("export const pipeline");
		expect(prompt).toContain("captain.ts");
	});
});

// ── parseGeneratedPipeline ────────────────────────────────────────────────

describe("parseGeneratedPipeline", () => {
	const validSource = [
		"// @name: my-pipeline",
		"// @description: Does something useful",
		"export const pipeline = { kind: 'step', label: 'x', prompt: 'y', tools: [] };",
	].join("\n");

	test("parses name and description from valid source", () => {
		const result = parseGeneratedPipeline(validSource);
		expect(result.name).toBe("my-pipeline");
		expect(result.description).toBe("Does something useful");
	});

	test("extracts source from markdown fences", () => {
		const fenced = `\`\`\`typescript\n${validSource}\n\`\`\``;
		const result = parseGeneratedPipeline(fenced);
		expect(result.name).toBe("my-pipeline");
	});

	test("throws when @name comment is missing", () => {
		const bad = "export const pipeline = {};";
		expect(() => parseGeneratedPipeline(bad)).toThrow("@name");
	});

	test("throws when export const pipeline is missing", () => {
		const bad = "// @name: my-pipe\n// no pipeline export";
		expect(() => parseGeneratedPipeline(bad)).toThrow("export const pipeline");
	});

	test("empty description when @description comment is absent", () => {
		const src = "// @name: pipe\nexport const pipeline = {};";
		const result = parseGeneratedPipeline(src);
		expect(result.description).toBe("");
	});
});
