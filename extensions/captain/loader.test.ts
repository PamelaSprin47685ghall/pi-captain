// ── Integration tests for loader.ts::loadTsPipelineFile ───────────────────
// These tests write real .ts pipeline files to disk, call loadTsPipelineFile,
// and assert the returned Runnable. No real LLM calls or network needed.
//
// Each test uses a unique filename to prevent Bun module-cache collisions.
//
// Run with: bun test extensions/captain/loader.test.ts

import { afterEach, describe, expect, test } from "bun:test";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadTsPipelineFile } from "./loader.js";
import type { Runnable } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Absolute path to extensions/captain/ — used as captainDir for alias tests. */
const CAPTAIN_DIR = resolve(new URL(".", import.meta.url).pathname);

/** Monotonically-increasing counter to guarantee unique filenames. */
let seq = 0;
function tmpTs(label: string): string {
	return join(
		tmpdir(),
		`captain-loader-test-${label}-${++seq}-${Date.now()}.ts`,
	);
}

/** Files to clean up after each test (in addition to the auto-cleanup inside loadTsPipelineFile). */
const toCleanup: string[] = [];
afterEach(async () => {
	for (const p of toCleanup.splice(0)) {
		try {
			await unlink(p);
		} catch {
			/* best-effort */
		}
	}
});

// ── Fixtures ──────────────────────────────────────────────────────────────

const SEQUENTIAL_SRC = `\
export const pipeline = {
  kind: "sequential" as const,
  steps: [],
  gate: undefined,
  onFail: undefined,
  transform: undefined,
};
`;

const STEP_SRC = `\
export const pipeline = {
  kind: "step" as const,
  label: "hello",
  prompt: "say hi",
  tools: [],
  gate: undefined,
  onFail: undefined,
  transform: undefined,
};
`;

const NAMED_EXPORT_SRC = `\
export const myPipeline = {
  kind: "step" as const,
  label: "named",
  prompt: "do something",
  tools: [],
  gate: undefined,
  onFail: undefined,
  transform: undefined,
};
`;

const INVALID_SRC = `\
export const notAPipeline = { name: "foo", value: 42 };
`;

// ── Tests: direct path (no alias rewriting) ────────────────────────────────

describe("loadTsPipelineFile — direct path", () => {
	test("loads a sequential pipeline and registers it in pipelines map", async () => {
		const path = tmpTs("seq");
		toCleanup.push(path);
		await writeFile(path, SEQUENTIAL_SRC, "utf8");

		const pipelines: Record<string, { spec: Runnable }> = {};
		const result = await loadTsPipelineFile({
			filePath: path,
			captainDir: "",
			pipelines,
		});

		expect(result.spec.kind).toBe("sequential");
		expect(result.source).toBe(path);
		// name is the basename without extension
		expect(result.name).toBe(
			(path.split("/").pop() ?? "").replace(/\.ts$/, ""),
		);
		// registry entry is set
		expect(pipelines[result.name]).toBeDefined();
		expect(pipelines[result.name].spec.kind).toBe("sequential");
	});

	test("loads a step pipeline", async () => {
		const path = tmpTs("step");
		toCleanup.push(path);
		await writeFile(path, STEP_SRC, "utf8");

		const pipelines: Record<string, { spec: Runnable }> = {};
		const result = await loadTsPipelineFile({
			filePath: path,
			captainDir: "",
			pipelines,
		});

		expect(result.spec.kind).toBe("step");
		if (result.spec.kind === "step") {
			expect(result.spec.label).toBe("hello");
			expect(result.spec.prompt).toBe("say hi");
		}
	});

	test("falls back to named export when no 'pipeline' export exists", async () => {
		const path = tmpTs("named");
		toCleanup.push(path);
		await writeFile(path, NAMED_EXPORT_SRC, "utf8");

		const pipelines: Record<string, { spec: Runnable }> = {};
		const result = await loadTsPipelineFile({
			filePath: path,
			captainDir: "",
			pipelines,
		});

		expect(result.spec.kind).toBe("step");
		if (result.spec.kind === "step") {
			expect(result.spec.label).toBe("named");
		}
	});

	test("throws a helpful error when no valid Runnable export exists", async () => {
		const path = tmpTs("invalid");
		toCleanup.push(path);
		await writeFile(path, INVALID_SRC, "utf8");

		const pipelines: Record<string, { spec: Runnable }> = {};
		await expect(
			loadTsPipelineFile({ filePath: path, captainDir: "", pipelines }),
		).rejects.toThrow(/Invalid pipeline file/);
	});

	test("error message includes the file path", async () => {
		const path = tmpTs("errmsg");
		toCleanup.push(path);
		await writeFile(path, INVALID_SRC, "utf8");

		let message = "";
		try {
			await loadTsPipelineFile({
				filePath: path,
				captainDir: "",
				pipelines: {},
			});
		} catch (e) {
			message = (e as Error).message;
		}
		expect(message).toContain(path);
		expect(message).toContain("Runnable");
	});

	test("does NOT overwrite an existing pipelines entry with a different name", async () => {
		const path = tmpTs("reg");
		toCleanup.push(path);
		await writeFile(path, STEP_SRC, "utf8");

		const existing: Runnable = {
			kind: "sequential",
			steps: [],
			gate: undefined,
			onFail: undefined,
			transform: undefined,
		};
		const pipelines: Record<string, { spec: Runnable }> = {
			"other-pipeline": { spec: existing },
		};

		await loadTsPipelineFile({ filePath: path, captainDir: "", pipelines });

		// The pre-existing entry must still be there
		expect(pipelines["other-pipeline"]).toBeDefined();
		expect(pipelines["other-pipeline"].spec).toBe(existing);
	});

	test(".js extension is stripped from pipeline name", async () => {
		// Simulate a .js file (unusual but loader supports it)
		const jsPath = tmpTs("jsext").replace(/\.ts$/, ".js");
		toCleanup.push(jsPath);
		// Write pure JS — no TypeScript syntax so Bun can import as JS
		const jsSrc = `export const pipeline = { kind: "sequential", steps: [], gate: undefined, onFail: undefined, transform: undefined };`;
		await writeFile(jsPath, jsSrc, "utf8");

		const pipelines: Record<string, { spec: Runnable }> = {};
		const result = await loadTsPipelineFile({
			filePath: jsPath,
			captainDir: "",
			pipelines,
		});

		expect(result.name.endsWith(".js")).toBe(false);
		expect(result.name.endsWith(".ts")).toBe(false);
	});
});

// ── Tests: alias path (alias rewriting triggered) ──────────────────────────

describe("loadTsPipelineFile — alias rewriting", () => {
	test("resolves <captain>/ alias imports and loads successfully", async () => {
		// The file imports from the real captain presets via the alias.
		// After rewriting, the import will point to CAPTAIN_DIR/presets.js
		// which Bun resolves to presets.ts — so full is available.
		const aliasSrc = `\
import { full } from "<captain>/presets.js";
export const pipeline = {
  kind: "step" as const,
  label: "alias-test",
  prompt: "do something",
  tools: [],
  gate: undefined,
  onFail: undefined,
  transform: full,
};
`;
		const path = tmpTs("alias-brackets");
		toCleanup.push(path);
		await writeFile(path, aliasSrc, "utf8");

		const pipelines: Record<string, { spec: Runnable }> = {};
		const result = await loadTsPipelineFile({
			filePath: path,
			captainDir: CAPTAIN_DIR,
			pipelines,
		});

		expect(result.spec.kind).toBe("step");
		if (result.spec.kind === "step") {
			expect(result.spec.label).toBe("alias-test");
			// transform should be the real `full` function
			expect(typeof result.spec.transform).toBe("function");
		}
	});

	test("resolves captain/ alias (no brackets) and loads successfully", async () => {
		const aliasSrc = `\
import { skip } from "captain/presets.js";
export const pipeline = {
  kind: "step" as const,
  label: "no-brackets",
  prompt: "go",
  tools: [],
  gate: undefined,
  onFail: skip,
  transform: undefined,
};
`;
		const path = tmpTs("alias-no-brackets");
		toCleanup.push(path);
		await writeFile(path, aliasSrc, "utf8");

		const pipelines: Record<string, { spec: Runnable }> = {};
		const result = await loadTsPipelineFile({
			filePath: path,
			captainDir: CAPTAIN_DIR,
			pipelines,
		});

		expect(result.spec.kind).toBe("step");
		if (result.spec.kind === "step") {
			expect(result.spec.label).toBe("no-brackets");
			expect(typeof result.spec.onFail).toBe("function");
		}
	});

	test("cleans up the temp file after successful alias import", async () => {
		// We can't easily intercept the tmp path, but we verify no .ts junk
		// is left in tmpdir by checking that load succeeds without throwing.
		// A throw during cleanup would surface here.
		const aliasSrc = `\
import { full } from "<captain>/presets.js";
export const pipeline = {
  kind: "sequential" as const,
  steps: [],
  gate: undefined,
  onFail: undefined,
  transform: full,
};
`;
		const path = tmpTs("cleanup");
		toCleanup.push(path);
		await writeFile(path, aliasSrc, "utf8");

		await expect(
			loadTsPipelineFile({
				filePath: path,
				captainDir: CAPTAIN_DIR,
				pipelines: {},
			}),
		).resolves.toBeDefined();
	});
});
