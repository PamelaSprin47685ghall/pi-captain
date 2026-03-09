// ── Gate & OnFail Exports ──────────────────────────────────────────────────
// Gates are plain functions: (ctx: GateCtx) => boolean | Promise<boolean>
// Throw to fail with a descriptive message; return true to pass.

export type { GateResult } from "../gates.js";

// Gate runner (used by executor)
export { runGate } from "../gates.js";
// OnFail strategies
export { fallback, retry, retryWithDelay, skip, warn } from "./on-fail.js";

// Gate factories & presets
export {
	allOf,
	anyOf,
	apiReady,
	assert,
	buildOutput,
	bunLint,
	bunTest,
	bunTypecheck,
	command,
	commandAll,
	dir,
	distDirExists,
	distExists,
	dockerRunning,
	envEquals,
	envSet,
	file,
	fullCI,
	gitBranch,
	gitClean,
	httpOk,
	httpPostOk,
	httpStatus,
	jsonHasKeys,
	jsonValid,
	llm,
	llmFast,
	llmStrict,
	noConflicts,
	nodeModulesExists,
	outputIncludes,
	outputIncludesCI,
	outputMinLength,
	portListening,
	prodEnv,
	prodReady,
	regex,
	regexCI,
	regexExcludes,
	testAndTypecheck,
	user,
	withTimeout,
} from "./presets.js";
