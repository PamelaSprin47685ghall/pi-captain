// ── Reusable Gate & OnFail Factories ──────────────────────────────────────
// Import these into any pipeline step or composition node.
// Factory functions let you parameterize gates like function calls.

// Atomic gates
export { none, command, file, dir, user, assert } from "./presets.js";

// String/content assertion gates
export { outputIncludes, outputIncludesCI, outputMinLength } from "./presets.js";

// Regex gates
export { regex, regexCI, regexExcludes } from "./presets.js";

// JSON validation gates
export { jsonValid, jsonHasKeys } from "./presets.js";

// HTTP / service gates
export { httpOk, httpStatus, httpPostOk, portListening, dockerRunning } from "./presets.js";

// Combinator gates (AND/OR)
export { allOf, anyOf } from "./presets.js";

// Environment gates
export { envSet, envEquals, prodEnv } from "./presets.js";

// Timeout wrapper
export { withTimeout } from "./presets.js";

// Test runner presets
export { bunTest, bunTypecheck, bunLint } from "./presets.js";

// Build artifact gates
export { distExists, distDirExists, nodeModulesExists, buildOutput } from "./presets.js";

// Chained command gates
export { commandAll, testAndTypecheck, fullCI } from "./presets.js";

// Git gates
export { gitClean, gitBranch, noConflicts } from "./presets.js";

// Composite presets
export { prodReady, apiReady } from "./presets.js";

// LLM evaluation gates
export { llm, llmFast, llmStrict } from "./presets.js";

// OnFail strategies
export { retry, retryWithDelay, skip, warn, fallback } from "./on-fail.js";
