// ─── refactor_pass tool registration ────────────────────────────────────────

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { commitAndPush } from "./git-helper.js";
import type { RefactorPass, RefactorState } from "./state.js";
import { updateWidget } from "./widget.js";

async function executeRefactorPass(
	pi: ExtensionAPI,
	getState: () => RefactorState,
	setState: (state: RefactorState) => void,
	params: {
		change: string;
		reason: string;
		remaining: string;
		done: boolean;
	},
	ctx: import("@mariozechner/pi-coding-agent").ExtensionContext,
) {
	const state = getState();
	if (!state.active) {
		return {
			content: [
				{
					type: "text" as const,
					text: "Error: No active refactoring session. Use /refactor to start one.",
				},
			],
			details: undefined,
		};
	}

	// Record this pass
	const pass: RefactorPass = {
		pass: state.passes.length + 1,
		change: params.change,
		reason: params.reason,
		remaining: params.remaining,
		done: params.done,
	};
	state.passes.push(pass);
	setState(state);

	if (ctx) updateWidget(ctx, state);

	// Decide whether to continue the loop
	const passNum = state.passes.length;
	const hitMax = passNum >= state.maxPasses;
	const isDone = params.done || hitMax;

	let responseText: string;

	if (isDone) {
		responseText = await handlePipelineComplete(
			pi,
			state,
			setState,
			passNum,
			hitMax,
			ctx,
		);
	} else {
		responseText = buildContinueMessage(state, passNum, params);
	}

	return {
		content: [{ type: "text" as const, text: responseText }],
		details: { ...state } as RefactorState, // Persist for reconstruction
	};
}

async function handlePipelineComplete(
	pi: ExtensionAPI,
	state: RefactorState,
	setState: (state: RefactorState) => void,
	passNum: number,
	hitMax: boolean,
	ctx: import("@mariozechner/pi-coding-agent").ExtensionContext,
): Promise<string> {
	// Pipeline complete
	state.active = false;
	setState(state);
	const summary = state.passes
		.map((p) => `  Pass ${p.pass}: ${p.change} (${p.reason})`)
		.join("\n");
	let responseText = `✅ Refactoring pipeline complete after ${passNum} pass(es).\n\nSummary:\n${summary}`;

	if (hitMax && !state.passes.at(-1)?.done) {
		responseText += `\n\n⚠️ Reached max passes (${state.maxPasses}). Use /refactor to continue if needed.`;
	}

	// Auto commit+push if enabled
	if (state.autoCommit && ctx) {
		updateWidget(ctx, state); // Show "committing" state
		const gitResult = await commitAndPush(pi, state, ctx as never);
		responseText += `\n\n---\n\n## Git\n${gitResult}`;
	}

	// Clear widget after a delay
	if (ctx) {
		setTimeout(() => ctx.ui.setWidget("refactor-loop", undefined), 5000);
	}

	return responseText;
}

function buildContinueMessage(
	state: RefactorState,
	passNum: number,
	params: { change: string; remaining: string },
): string {
	// Continue — prompt the next pass
	const testReminder = state.testCommand
		? `\n\n⚠️ IMPORTANT: After making your change, run \`${state.testCommand}\` and confirm all tests pass BEFORE calling refactor_pass.`
		: "";

	return (
		`Pass ${passNum} complete: ${params.change}\n` +
		`Remaining: ${params.remaining}\n\n` +
		`Continue with pass ${passNum + 1}. Follow the refactor-loop skill instructions: ` +
		`analyze the next simplification opportunity, apply ONE focused change, verify with tests, then call refactor_pass again.` +
		testReminder
	);
}

export function registerRefactorTool(
	pi: ExtensionAPI,
	getState: () => RefactorState,
	setState: (state: RefactorState) => void,
) {
	pi.registerTool({
		name: "refactor_pass",
		label: "Refactor Pass",
		description:
			"Report a refactoring pass result during the refactor pipeline. Call this after each analyze→refactor→verify cycle. " +
			"You MUST run the test command and confirm tests pass BEFORE calling this tool. " +
			"Set done=true when no more meaningful simplifications exist.",
		parameters: Type.Object({
			change: Type.String({ description: "What was changed in this pass" }),
			reason: Type.String({
				description: "Why this simplification improves the code",
			}),
			remaining: Type.String({
				description: "What simplification opportunities remain (empty if done)",
			}),
			done: Type.Boolean({
				description: "True if code is clean and no more passes needed",
			}),
		}),

		async execute(_id, params, _signal, _onUpdate, ctx) {
			return await executeRefactorPass(pi, getState, setState, params, ctx);
		},

		// Custom rendering
		renderCall(args, theme) {
			const icon = args.done ? "✅" : "🔄";
			return new Text(
				theme.fg("toolTitle", theme.bold(`${icon} refactor_pass `)) +
					theme.fg("muted", args.change?.slice(0, 60) || ""),
				0,
				0,
			);
		},
		renderResult(result, { expanded }, theme) {
			const d = result.details as RefactorState | undefined;
			if (!d) return new Text("", 0, 0);

			const passCount = d.passes.length;
			const icon = d.active ? "🔄" : "✅";
			let text = theme.fg("success", `${icon} ${passCount} pass(es)`);

			if (expanded && d.passes.length > 0) {
				for (const p of d.passes) {
					const pIcon = p.done ? "✓" : "→";
					text += `\n  ${pIcon} Pass ${p.pass}: ${p.change}`;
					text += `\n    ${theme.fg("dim", p.reason)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
