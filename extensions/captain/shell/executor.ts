// ── Recursive Pipeline Execution Engine (shell layer) ──────────────────────
// Orchestrates composition/* and steps/* — all impure. Lives in shell/ because
// it calls into side-effectful layers; pure logic belongs in core/.

import { executeParallel } from "../composition/parallel.js";
import { executePool } from "../composition/pool.js";
import { executeSequential } from "../composition/sequential.js";
import type { Runnable, StepResult } from "../core/types.js";
import { type ExecutorContext, executeStep } from "../steps/runner.js";

// Re-export interfaces for public API
export type { ExecutorContext };
export type { ModelRegistryLike } from "../core/types.js";

/** Execute any Runnable recursively, returning output text */
export async function executeRunnable(
	runnable: Runnable,
	input: string,
	original: string,
	ectx: ExecutorContext,
): Promise<{ output: string; results: StepResult[] }> {
	if (ectx.signal?.aborted) return { output: "(cancelled)", results: [] };

	switch (runnable.kind) {
		case "step":
			return executeStep(runnable, input, original, ectx);
		case "sequential":
			return executeSequential(
				runnable,
				input,
				original,
				ectx,
				executeRunnable,
			);
		case "pool":
			return executePool(runnable, input, original, ectx, executeRunnable);
		case "parallel":
			return executeParallel(runnable, input, original, ectx, executeRunnable);
		default:
			return {
				output: `Unknown runnable kind: ${(runnable as Runnable & { kind: string }).kind}`,
				results: [],
			};
	}
}
