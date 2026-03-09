// ── Gate Runner ────────────────────────────────────────────────────────────
// A gate is just a function: (ctx: GateCtx) => boolean | Promise<boolean>.
// runGate wraps the call to produce a { passed, reason } result for the
// executor to display.  All gate logic lives in gates/presets.ts.

import type { Gate, GateCtx } from "./types.js";

export interface GateResult {
	passed: boolean;
	reason: string;
}

/** Run a gate and return a structured { passed, reason } result. */
export async function runGate(gate: Gate, ctx: GateCtx): Promise<GateResult> {
	try {
		const passed = await gate(ctx);
		return passed
			? { passed: true, reason: "Gate passed" }
			: { passed: false, reason: "Gate returned false" };
	} catch (err) {
		return {
			passed: false,
			reason: `Gate error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
