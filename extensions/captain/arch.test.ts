// ── Architecture: Functional Core / Imperative Shell ─────────────────────
// Enforces layer-boundary rules from Basic_knowledge.md §Architecture.
//
// Rules:
//   core/   → must NOT import from infra/, shell/
//   infra/  → must NOT import from shell/
//
// These are the boundaries that matter for the FC/IS pattern. Other folders
// (gates/, steps/, composition/, transforms/, tools/, ui/) sit at the shell
// level and may depend on core freely.
//
// Run with: bun test extensions/captain/arch.test.ts

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;

// ── helpers ────────────────────────────────────────────────────────────────

/** Collect all .ts source files (excluding .test.ts) under a directory */
function tsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...tsFiles(full));
		else if (
			entry.isFile() &&
			full.endsWith(".ts") &&
			!full.endsWith(".test.ts")
		)
			out.push(full);
	}
	return out;
}

/** Extract all relative import paths from a TS file (static analysis, no AST needed) */
function relativeImports(filePath: string): string[] {
	const src = readFileSync(filePath, "utf8");
	const hits: string[] = [];
	// Matches: from "...", import "...", export ... from "..."
	for (const m of src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
		const p = m[1];
		if (p.startsWith(".")) hits.push(p);
	}
	return hits;
}

/**
 * Returns all violations where a file in `fromDir` imports something that
 * resolves into `toDir`.
 */
function boundaryViolations(
	fromDir: string,
	toDir: string,
): Array<{ file: string; importPath: string }> {
	const violations: Array<{ file: string; importPath: string }> = [];
	const fromDirAbs = join(ROOT, fromDir);
	const toDirAbs = join(ROOT, toDir);

	// Guard: skip if either folder doesn't exist yet
	try {
		statSync(fromDirAbs);
		statSync(toDirAbs);
	} catch {
		return [];
	}

	for (const file of tsFiles(fromDirAbs)) {
		for (const imp of relativeImports(file)) {
			// Resolve the import relative to the importing file's directory
			const resolved = join(file, "..", imp);
			// Normalise away .js extensions used in TS ESM output
			const resolvedNorm = resolved.replace(/\.js$/, "");
			const toDirNorm = toDirAbs;
			if (resolvedNorm.startsWith(toDirNorm)) {
				violations.push({
					file: relative(ROOT, file),
					importPath: imp,
				});
			}
		}
	}
	return violations;
}

// ── rules ──────────────────────────────────────────────────────────────────

describe("Functional Core / Imperative Shell — layer boundaries", () => {
	test("core/ must not import from infra/", () => {
		const violations = boundaryViolations("core", "infra");
		expect(violations).toEqual([]);
	});

	test("core/ must not import from shell/", () => {
		const violations = boundaryViolations("core", "shell");
		expect(violations).toEqual([]);
	});

	test("infra/ must not import from shell/", () => {
		const violations = boundaryViolations("infra", "shell");
		expect(violations).toEqual([]);
	});
});
