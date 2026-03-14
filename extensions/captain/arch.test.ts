// NEED USER APPROVAL FOR ANY CHANGE
// ── Architecture: Layered Folder Structure — Dependency Boundaries ─────────
// Enforces the Functional Core / Imperative Shell architecture from
// ~/.pi/Basic_knowledge.md.
//
// Layer rules (Impureim Sandwich):
//   core/   → PURE — must NOT import from infra/, shell/, or ui/
//   infra/  → adapters — must NOT import from shell/ or ui/
//   ui/     → TUI — must NOT import from infra/ or shell/
//   shell/  → coordinators — may import from core/, infra/, and ui/
//
// Run with: bun test extensions/captain/arch.test.ts

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;

// ── helpers ────────────────────────────────────────────────────────────────

/** Extract all relative import specifiers from a TS source file (static, no AST). */
function relativeImports(filePath: string): string[] {
	const src = readFileSync(filePath, "utf8");
	const hits: string[] = [];
	for (const line of src.split("\n")) {
		const trimmed = line.trimStart();
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
		for (const m of trimmed.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
			const p = m[1];
			if (p.startsWith(".")) hits.push(p);
		}
	}
	return hits;
}

/** Collect all source files in a layer folder (non-recursive, exclude test files). */
function layerFiles(layer: string): string[] {
	const dir = join(ROOT, layer);
	try {
		return readdirSync(dir)
			.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
			.map((f) => join(dir, f));
	} catch {
		return [];
	}
}

/** Collect relative imports that cross into a forbidden layer. */
function crossLayerImports(
	filePath: string,
	forbidden: readonly string[],
): string[] {
	return relativeImports(filePath).filter((imp) =>
		forbidden.some(
			(layer) => imp.includes(`../${layer}/`) || imp.includes(`/${layer}/`),
		),
	);
}

// ── core/ — pure, zero side-effects ──────────────────────────────────────

describe("core/ — pure layer boundaries", () => {
	const FORBIDDEN: readonly string[] = ["infra", "shell", "ui"];

	for (const file of layerFiles("core")) {
		test(`${file.split("/").pop()} must not import from infra/, shell/, or ui/`, () => {
			const violations = crossLayerImports(file, FORBIDDEN);
			expect(violations).toEqual([]);
		});
	}
});

// ── infra/ — side-effectful adapters ─────────────────────────────────────

describe("infra/ — adapter layer boundaries", () => {
	const FORBIDDEN: readonly string[] = ["shell", "ui"];

	for (const file of layerFiles("infra")) {
		test(`${file.split("/").pop()} must not import from shell/ or ui/`, () => {
			const violations = crossLayerImports(file, FORBIDDEN);
			expect(violations).toEqual([]);
		});
	}
});

// ── ui/ — TUI rendering ───────────────────────────────────────────────────

describe("ui/ — presentation layer boundaries", () => {
	const FORBIDDEN: readonly string[] = ["infra", "shell"];

	for (const file of layerFiles("ui")) {
		test(`${file.split("/").pop()} must not import from infra/ or shell/`, () => {
			const violations = crossLayerImports(file, FORBIDDEN);
			expect(violations).toEqual([]);
		});
	}
});

// ── shell/ — coordinators (may use core, infra, ui) ──────────────────────

describe("shell/ — coordinator layer: executor must not import tools or commands", () => {
	test("executor.ts must not import from tools.ts or commands.ts", () => {
		const _src = readFileSync(join(ROOT, "shell", "executor.ts"), "utf8");
		const localImports = relativeImports(join(ROOT, "shell", "executor.ts"))
			.filter((imp) => imp.startsWith("."))
			.map(
				(imp) =>
					imp
						.split("/")
						.pop()
						?.replace(/\.(js|ts)$/, "") ?? "",
			);
		const forbidden = new Set(["tools", "commands", "widget"]);
		const violations = localImports.filter((b) => forbidden.has(b));
		expect(violations).toEqual([]);
	});
});
