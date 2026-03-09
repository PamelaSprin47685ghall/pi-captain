// ── Gate Runner ────────────────────────────────────────────────────────────
// A gate is: (ctx: GateCtx) => string | true | Promise<string | true>
//   true   → passed
//   string → failed — the string IS the reason
//   throw  → failed — error.message becomes the reason

import type { Gate, GateCtx } from "./types.js";

export interface GateResult {
	passed: boolean;
	reason: string;
}

/** Run a gate and return a structured { passed, reason } result. */
export async function runGate(gate: Gate, ctx: GateCtx): Promise<GateResult> {
	try {
		const result = await gate(ctx);
		return result === true
			? { passed: true, reason: "passed" }
			: { passed: false, reason: result };
	} catch (err) {
		return {
			passed: false,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}
