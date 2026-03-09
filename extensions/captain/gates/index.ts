// ── Gate & OnFail Exports ──────────────────────────────────────────────────
// Gate: (ctx: GateCtx) => string | true | Promise<string | true>
//   true   → passed
//   string → failed — the string IS the reason

export type { GateResult } from "../gates.js";
export { runGate } from "../gates.js";
export { fallback, retry, retryWithDelay, skip, warn } from "./on-fail.js";
export {
	allOf,
	anyOf,
	bunLint,
	bunTest,
	bunTypecheck,
	command,
	dir,
	file,
	httpOk,
	httpStatus,
	jsonHasKeys,
	jsonValid,
	llm,
	llmFast,
	llmStrict,
	regex,
	regexCI,
	user,
	withTimeout,
} from "./presets.js";
