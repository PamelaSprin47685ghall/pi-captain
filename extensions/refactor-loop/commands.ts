// ─── /refactor and /refactor-stop commands ─────────────────────────────────

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { makeTextInputDialog } from "./dialog.js";
import type { RefactorState } from "./state.js";
import { updateWidget } from "./widget.js";

async function handleRefactorCommand(opts: {
	pi: ExtensionAPI;
	setState: (state: RefactorState) => void;
	args: string | undefined;
	ctx: import("@mariozechner/pi-coding-agent").ExtensionContext;
}) {
	const { pi, setState, args, ctx } = opts;
	if (!ctx.hasUI) return;

	let target: string | null | undefined = args?.trim();

	// If no args, prompt the user for what to refactor
	if (!target) {
		// biome-ignore lint/complexity/useMaxParams: pi SDK's ctx.ui.custom callback signature is fixed
		target = await ctx.ui.custom<string | null>((tui, theme, _kb, done) =>
			makeTextInputDialog({
				title: "Refactor Pipeline",
				hint: "What should be refactored? (file path, function name, module, etc.)",
				tui,
				theme,
				done,
			}),
		);
	}

	if (!target) {
		ctx.ui.notify("Refactoring cancelled.", "info");
		return;
	}

	// Ask for test command
	const testCommand = await ctx.ui.custom<string | null>(
		// biome-ignore lint/complexity/useMaxParams: pi SDK's ctx.ui.custom callback signature is fixed
		(tui, theme, _kb, done) =>
			makeTextInputDialog({
				title: "Test Command",
				hint: "Command to verify each pass (e.g. bun test, npm test, pytest). Leave empty to skip.",
				tui,
				theme,
				done,
			}),
	);

	// Ask for max passes
	const maxStr = await ctx.ui.select("Max refactoring passes?", [
		"3 — Quick cleanup",
		"5 — Standard",
		"10 — Deep refactor",
		"20 — Thorough overhaul",
	]);

	if (!maxStr) {
		ctx.ui.notify("Refactoring cancelled.", "info");
		return;
	}

	const maxPasses = parseInt(maxStr, 10) || 5;

	// Ask about auto commit+push
	const autoCommit = await ctx.ui.confirm(
		"Auto commit & push?",
		"Automatically git commit and push all changes when the pipeline completes?",
	);

	// Initialize state
	const state: RefactorState = {
		active: true,
		target,
		passes: [],
		maxPasses,
		testCommand: testCommand ?? "",
		autoCommit,
	};
	setState(state);

	updateWidget(ctx, state);

	// Send initial notification and prompt
	sendInitialPrompt({ pi, state, autoCommit, ctx });
}

function sendInitialPrompt(opts: {
	pi: ExtensionAPI;
	state: RefactorState;
	autoCommit: boolean;
	ctx: import("@mariozechner/pi-coding-agent").ExtensionContext;
}) {
	const { pi, state, autoCommit, ctx } = opts;
	const testInfo = state.testCommand
		? ` | tests: \`${state.testCommand}\``
		: " | no test command";
	const commitInfo = autoCommit ? " | auto commit+push" : " | no auto commit";

	ctx.ui.notify(
		`🔄 Starting refactor pipeline on: ${state.target} (max ${state.maxPasses} passes${testInfo}${commitInfo})`,
		"info",
	);

	// Build the initial prompt with test instructions
	const testInstructions = state.testCommand
		? `\n\n## Test Verification\nAfter EVERY change, you MUST run: \`${state.testCommand}\`\n` +
			`If tests fail, revert your change and try a different approach.\n` +
			`NEVER call refactor_pass unless all tests are passing.`
		: "";

	const commitNote = autoCommit
		? "\n\nWhen the pipeline completes, changes will be automatically committed and pushed to git."
		: "";

	pi.sendUserMessage(
		`Start the refactor-loop pipeline on: ${state.target}\n\n` +
			`Follow the refactor-loop skill instructions. Run up to ${state.maxPasses} iterative passes.\n` +
			`Each pass: analyze → apply ONE focused simplification → run tests → call refactor_pass tool.\n` +
			`Keep going until the code is clean or you hit the pass limit.\n` +
			`Start with pass 1 now — read the target code and identify the first simplification.` +
			testInstructions +
			commitNote,
	);
}

export function registerCommands(opts: {
	pi: ExtensionAPI;
	getState: () => RefactorState;
	setState: (state: RefactorState) => void;
}) {
	const { pi, getState, setState } = opts;
	// ── /refactor command ────────────────────────────────────────────────────

	pi.registerCommand("refactor", {
		description:
			"Start an iterative refactoring/simplification pipeline on a target",
		handler: async (args, ctx) => {
			await handleRefactorCommand({ pi, setState, args, ctx });
		},
	});

	// ── /refactor-stop command ───────────────────────────────────────────────

	pi.registerCommand("refactor-stop", {
		description: "Stop the active refactoring pipeline",
		handler: async (_args, ctx) => {
			const state = getState();
			if (!state.active) {
				ctx.ui.notify("No active refactoring pipeline.", "info");
				return;
			}

			const passCount = state.passes.length;
			state.active = false;
			setState(state);

			ctx.ui.setWidget("refactor-loop", undefined);
			ctx.ui.notify(
				`🛑 Refactoring pipeline stopped after ${passCount} pass(es).`,
				"info",
			);
		},
	});
}
