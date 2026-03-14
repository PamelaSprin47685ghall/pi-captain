// ── Captain Public Pipeline API ───────────────────────────────────────────
// Single import surface for pipeline authors.
//
// Usage in .pi/pipelines/my-pipeline.ts:
//   import { retry, bunTest, full, concat } from "./captain.ts";
//   import type { Runnable, Step } from "./captain.ts";

// ── Gate presets ───────────────────────────────────────────────────────────
// ── OnFail presets ─────────────────────────────────────────────────────────
// ── Merge presets ──────────────────────────────────────────────────────────
// ── Transform presets ──────────────────────────────────────────────────────
export {
	allOf,
	awaitAll,
	bunTest,
	command,
	concat,
	extract,
	fallback,
	file,
	firstPass,
	full,
	llmFast,
	rank,
	regexCI,
	retry,
	retryWithDelay,
	skip,
	summarize,
	user,
	vote,
	warn,
} from "./core/presets.js";
// ── Types ──────────────────────────────────────────────────────────────────
export type {
	Gate,
	GateCtx,
	MergeCtx,
	MergeFn,
	ModelId,
	OnFail,
	OnFailCtx,
	OnFailResult,
	Parallel,
	Pool,
	Runnable,
	Sequential,
	Step,
	StepHooks,
	Transform,
} from "./core/types.js";
