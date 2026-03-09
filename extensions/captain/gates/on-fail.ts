// ── OnFail Presets — reusable failure handling strategies ─────────────────
// Each preset is an OnFail function: (ctx: OnFailCtx) => OnFailResult
// Mirrors Gate style: return a plain value, compose freely, or write your own inline.

import type { OnFail, Step } from "../types.js";

// ── Presets ───────────────────────────────────────────────────────────────

/** Retry the scope immediately, up to `max` times (default 3) */
export function retry(max = 3): OnFail {
	return () => ({ action: "retry", max });
}

/** Retry the scope after `delayMs` milliseconds, up to `max` times (default 3) */
export function retryWithDelay(max = 3, delayMs: number): OnFail {
	return () => ({ action: "retryWithDelay", max, delayMs });
}

/** Run an alternative step when the scope fails */
export function fallback(step: Step): OnFail {
	return () => ({ action: "fallback", step });
}

/** Skip the scope — mark as skipped and continue with empty output */
export const skip: OnFail = () => ({ action: "skip" });

/** Log a warning but treat as passed and continue */
export const warn: OnFail = () => ({ action: "warn" });
