// ── Tests for infra/loader.ts ─────────────────────────────────────────────
// Covers: loadTsPipelineFile (integration — real files on disk)
//         resolveAliases and extractPipeline (unit)
//
// Run with: bun test extensions/captain/infra/loader.test.ts

import { afterEach, describe, expect, test } from "bun:test";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { full, skip } from "../core/presets.js";
import type { Runnable } from "../core/types.js";
import {
	extractPipeline,
	loadTsPipelineFile,
	resolveAliases,
} from "./loader.js";

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Absolute path to extensions/captain/ root — used as captainDir for alias
 * tests (mirrors production: CaptainState is initialised with the captain root).
 */
const CAPTAIN_DIR = resolve(new URL("../", import.meta.url).pathname);

/** Monotonically-increasing counter to guarantee unique filenames. */
let seq = 0;
function tmpTs(label: string): string {
	return join(
		tmpdir(),
		`captain-loader-test-${label}-${++seq}-${Date.now()}.ts`,
	);
}

/** Files to clean up after each test (in addition to auto-cleanup inside loadTsPipelineFile). */
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

// ── loadTsPipelineFile — direct path ──────────────────────────────────────

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
		expect(result.name).toBe(
			(path.split("/").pop() ?? "").replace(/\.ts$/, ""),
		);
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

		expect(pipelines["other-pipeline"]).toBeDefined();
		expect(pipelines["other-pipeline"].spec).toBe(existing);
	});

	test(".js extension is stripped from pipeline name", async () => {
		const jsPath = tmpTs("jsext").replace(/\.ts$/, ".js");
		toCleanup.push(jsPath);
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

// ── loadTsPipelineFile — alias rewriting ──────────────────────────────────

describe("loadTsPipelineFile — alias rewriting", () => {
	test("resolves <captain>/ alias imports and loads successfully", async () => {
		// Pipeline imports presets via the alias — after rewriting it resolves to
		// CAPTAIN_DIR/core/presets.js (the captain root, one level above infra/).
		const aliasSrc = `\
import { full } from "<captain>/core/presets.js";
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
			expect(typeof result.spec.transform).toBe("function");
		}
	});

	test("resolves captain/ alias (no brackets) and loads successfully", async () => {
		const aliasSrc = `\
import { skip } from "captain/core/presets.js";
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
		const aliasSrc = `\
import { full } from "<captain>/core/presets.js";
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

// ── resolveAliases (unit) ─────────────────────────────────────────────────

describe("resolveAliases", () => {
	const captainDir = "/abs/path/to/captain";

	test("replaces <captain>/ alias", () => {
		const src = 'import { retry } from "<captain>/core/presets.js";';
		expect(resolveAliases(src, captainDir)).toBe(
			`import { retry } from "${captainDir}/core/presets.js";`,
		);
	});

	test("replaces captain/ alias (no angle brackets)", () => {
		const src = 'import { concat } from "captain/core/presets.js";';
		expect(resolveAliases(src, captainDir)).toBe(
			`import { concat } from "${captainDir}/core/presets.js";`,
		);
	});

	test("leaves non-alias imports untouched", () => {
		const src = 'import { foo } from "./local.js";';
		expect(resolveAliases(src, captainDir)).toBe(src);
	});

	test("replaces multiple occurrences", () => {
		const src = [
			'import { a } from "<captain>/core/presets.js";',
			'import { b } from "captain/core/types.js";',
		].join("\n");
		const result = resolveAliases(src, captainDir);
		expect(result).toContain(`"${captainDir}/core/presets.js"`);
		expect(result).toContain(`"${captainDir}/core/types.js"`);
	});
});

// ── extractPipeline (unit) ────────────────────────────────────────────────

describe("extractPipeline", () => {
	const seq: Runnable = {
		kind: "sequential",
		steps: [],
		gate: undefined,
		onFail: undefined,
		transform: undefined,
	};
	const step: Runnable = {
		kind: "step",
		label: "x",
		prompt: "y",
		tools: [],
		gate: undefined,
		onFail: skip,
		transform: full,
	};

	test("returns top-level pipeline export", () => {
		const mod = { pipeline: seq };
		expect(extractPipeline(mod as never)).toBe(seq);
	});

	test("returns pipeline from default export", () => {
		const mod = { default: { pipeline: seq } };
		expect(extractPipeline(mod as never)).toBe(seq);
	});

	test("falls back to any named export with a valid kind", () => {
		const mod = { myStep: step };
		expect(extractPipeline(mod as never)).toBe(step);
	});

	test("returns undefined when no valid export found", () => {
		const mod = { somethingElse: { name: "not a pipeline" } };
		expect(extractPipeline(mod as never)).toBeUndefined();
	});

	test("skips default key during fallback scan", () => {
		const mod = { default: step };
		expect(extractPipeline(mod as never)).toBeUndefined();
	});
});
