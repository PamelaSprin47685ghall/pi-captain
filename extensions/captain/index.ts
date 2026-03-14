// ── Captain: Pipeline Orchestration Extension ─────────────────────────────
// Composable multi-agent pipelines with sequential, parallel execution,
// quality gates, failure handling, and merge strategies.

import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CaptainState } from "./infra/state.js";
import { registerCommands } from "./shell/commands.js";
import { registerTools } from "./shell/tools.js";

const baseDir = (() => {
	try {
		return new URL(".", import.meta.url).pathname;
	} catch {
		return process.cwd();
	}
})();

export default function (pi: ExtensionAPI) {
	const state = new CaptainState(baseDir);

	// Write .pi/pipelines/captain.ts so pipeline authors get IDE autocomplete
	try {
		state.ensureContractFile(process.cwd());
	} catch {
		/* best-effort */
	}

	// Bundled prompt for the orchestrate skill
	pi.on("resources_discover", () => ({
		promptPaths: [join(baseDir, "prompts", "orchestrate.md")],
	}));

	registerTools(pi, state);
	registerCommands(pi, state);
}
