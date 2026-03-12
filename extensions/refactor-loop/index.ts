// Refactor Loop — iterative simplification pipeline extension
// Runs analyze → refactor → verify (tests!) cycles, then commits and pushes
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { registerCommands } from "./commands.js";
import { defaultState, type RefactorState } from "./state.js";
import { registerRefactorTool } from "./tool.js";
import { updateWidget } from "./widget.js";

const baseDir = dirname(fileURLToPath(import.meta.url));

export default function (pi: ExtensionAPI) {
	let state: RefactorState = defaultState();

	// State accessors for child modules
	const getState = () => state;
	const setState = (newState: RefactorState) => {
		state = newState;
	};

	// Bundle the companion skill with refactoring instructions
	pi.on("resources_discover", () => ({
		skillPaths: [join(baseDir, "refactor-loop/SKILL.md")],
	}));

	// ── State reconstruction from session branch ─────────────────────────────

	const reconstruct = (ctx: ExtensionContext) => {
		state = reconstructStateFromSession(ctx);
		updateWidgetFromState(ctx, state);
	};

	const reconstructStateFromSession = (
		ctx: ExtensionContext,
	): RefactorState => {
		let newState = defaultState();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role === "toolResult" && msg.toolName === "refactor_pass") {
				const d = msg.details as RefactorState | undefined;
				if (d) newState = d;
			}
		}
		return newState;
	};

	const updateWidgetFromState = (
		ctx: ExtensionContext,
		currentState: RefactorState,
	) => {
		if (currentState.active) updateWidget(ctx, currentState);
		else ctx.ui.setWidget("refactor-loop", undefined);
	};

	// Session event handlers
	pi.on("session_start", async (_e, ctx) => reconstruct(ctx));
	pi.on("session_switch", async (_e, ctx) => reconstruct(ctx));
	pi.on("session_fork", async (_e, ctx) => reconstruct(ctx));
	pi.on("session_tree", async (_e, ctx) => reconstruct(ctx));

	// Register tool and commands with state access
	registerRefactorTool(pi, getState, setState);
	registerCommands(pi, getState, setState);

	// ── System prompt injection when pipeline is active ──────────────────────

	pi.on("before_agent_start", async (event) => {
		if (!state.active) return;

		const passInfo =
			state.passes.length > 0
				? `\nCompleted passes:\n${state.passes
						.map((p) => `- Pass ${p.pass}: ${p.change}`)
						.join("\n")}`
				: "";

		const testSection = state.testCommand
			? `\n\n## Test Command\nRun after EVERY change: \`${state.testCommand}\`\nDo NOT call refactor_pass if tests fail. Fix or revert first.`
			: "";

		const commitSection = state.autoCommit
			? `\n\nChanges will be auto-committed and pushed when the pipeline completes.`
			: "";

		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## Active Refactoring Pipeline\n` +
				`Target: ${state.target}\n` +
				`Pass: ${state.passes.length + 1} of ${state.maxPasses}\n` +
				`${passInfo}` +
				testSection +
				commitSection +
				`\n\nYou MUST follow the refactor-loop skill instructions. After each change, verify with tests, then call the refactor_pass tool to report results and continue the loop.`,
		};
	});
}
