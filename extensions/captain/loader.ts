// ── Pipeline Loader ───────────────────────────────────────────────────────
// Load TypeScript pipeline files, resolving captain import aliases.

import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Runnable } from "./types.js";

const ALIAS_BRACKETS = '"<captain>/';
const ALIAS_NO_BRACKETS = '"captain/';
const RUNNABLE_KINDS = new Set(["step", "sequential", "parallel"]);

/** Replace captain alias imports in source with the absolute captainDir path. */
export function resolveAliases(raw: string, captainDir: string): string {
	return raw
		.replaceAll(ALIAS_BRACKETS, `"${captainDir}/`)
		.replaceAll(ALIAS_NO_BRACKETS, `"${captainDir}/`);
}

/**
 * Extract the `pipeline` export from a dynamically imported module.
 * Falls back to scanning all exports for any object with a valid `kind`
 * so that single step files can be loaded directly.
 */
export function extractPipeline(
	mod: Record<string, unknown>,
): Runnable | undefined {
	const direct = (mod as Record<string, { pipeline?: Runnable } & Runnable>)
		.pipeline;
	if (direct && typeof direct === "object" && "kind" in direct)
		return direct as unknown as Runnable;

	const fromDefault = (mod.default as { pipeline?: Runnable } | undefined)
		?.pipeline;
	if (fromDefault) return fromDefault;

	for (const [key, val] of Object.entries(mod)) {
		if (key === "default") continue;
		if (
			val &&
			typeof val === "object" &&
			"kind" in val &&
			RUNNABLE_KINDS.has((val as { kind: string }).kind)
		) {
			return val as unknown as Runnable;
		}
	}
	return undefined;
}

/**
 * Load a TypeScript pipeline file, resolving captain aliases if present.
 * Registers the loaded pipeline into `pipelines` registry.
 */
export async function loadTsPipelineFile(opts: {
	filePath: string;
	captainDir: string;
	pipelines: Record<string, { spec: Runnable }>;
}): Promise<{ name: string; spec: Runnable; source: string }> {
	const { filePath, captainDir, pipelines } = opts;
	const raw = await readFile(filePath, "utf8");
	const needsAlias =
		raw.includes(ALIAS_BRACKETS) || raw.includes(ALIAS_NO_BRACKETS);

	let importPath = filePath;
	let tmpFile: string | undefined;
	if (needsAlias) {
		const resolved = resolveAliases(raw, captainDir);
		tmpFile = join(
			tmpdir(),
			`captain-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`,
		);
		await writeFile(tmpFile, resolved, "utf8");
		importPath = tmpFile;
	}

	let mod: Record<string, unknown>;
	try {
		mod = await import(importPath);
	} finally {
		if (tmpFile) {
			try {
				await unlink(tmpFile);
			} catch {
				/* best-effort cleanup */
			}
		}
	}

	const pipeline = extractPipeline(mod);
	if (!pipeline?.kind) {
		throw new Error(
			`Invalid pipeline file: "${filePath}" must export a Runnable.\n` +
				`Export a "pipeline" const with kind "step" | "sequential" | "parallel".`,
		);
	}

	const ext = filePath.endsWith(".ts") ? ".ts" : ".js";
	const name = basename(filePath, ext);
	pipelines[name] = { spec: pipeline };
	return { name, spec: pipeline, source: filePath };
}
