// ── Architecture: Flat Module Structure — Dependency Boundaries ───────────
// Enforces structural invariants for the flat (non-subdirectory) captain layout.
//
// Rules:
//   executor.ts  → must NOT import from tools.ts, commands.ts, or widget.ts
//   types.ts     → must NOT import from any other captain file
//   presets.ts   → must only import from types.ts (among captain files)
//
// Run with: bun test extensions/captain/arch.test.ts

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;

// ── helpers ────────────────────────────────────────────────────────────────

/** Extract all relative import specifiers from a TS source file (static, no AST) */
function relativeImports(filePath: string): string[] {
	const src = readFileSync(filePath, "utf8");
	const hits: string[] = [];
	for (const line of src.split("\n")) {
		const trimmed = line.trimStart();
		// Skip comment lines
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
		for (const m of trimmed.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
			const p = m[1];
			if (p.startsWith(".")) hits.push(p);
		}
	}
	return hits;
}

/** Resolve a relative import specifier to just the basename (no ext) */
function basename(imp: string): string {
	return (imp.split("/").pop() ?? "").replace(/\.(js|ts)$/, "");
}

function importsOf(file: string): string[] {
	return relativeImports(join(ROOT, file)).map(basename);
}

/** All captain source files (flat, same dir) — excluding test files */
const CAPTAIN_FILES = [
	"captain.ts",
	"commands.ts",
	"executor.ts",
	"generator.ts",
	"loader.ts",
	"presets.ts",
	"session.ts",
	"state.ts",
	"tools.ts",
	"types.ts",
	"widget.ts",
];
const CAPTAIN_BASENAMES = new Set(
	CAPTAIN_FILES.map((f) => f.replace(/\.ts$/, "")),
);

function captainImportsOf(file: string): string[] {
	return importsOf(file).filter((b) => CAPTAIN_BASENAMES.has(b));
}

// ── rules ──────────────────────────────────────────────────────────────────

describe("Flat module structure — dependency boundaries", () => {
	test("executor.ts must not import from tools.ts, commands.ts, or widget.ts", () => {
		const forbidden = new Set(["tools", "commands", "widget"]);
		const violations = captainImportsOf("executor.ts").filter((b) =>
			forbidden.has(b),
		);
		expect(violations).toEqual([]);
	});

	test("types.ts must not import from any other captain file", () => {
		const violations = captainImportsOf("types.ts");
		expect(violations).toEqual([]);
	});

	test("presets.ts must only import types.ts among captain files", () => {
		const allowed = new Set(["types"]);
		const violations = captainImportsOf("presets.ts").filter(
			(b) => !allowed.has(b),
		);
		expect(violations).toEqual([]);
	});

	test("session.ts must not import from commands.ts or widget.ts", () => {
		const forbidden = new Set(["commands", "widget"]);
		const violations = captainImportsOf("session.ts").filter((b) =>
			forbidden.has(b),
		);
		expect(violations).toEqual([]);
	});

	test("loader.ts must not import from commands.ts, tools.ts, or widget.ts", () => {
		const forbidden = new Set(["commands", "tools", "widget"]);
		const violations = captainImportsOf("loader.ts").filter((b) =>
			forbidden.has(b),
		);
		expect(violations).toEqual([]);
	});
});
