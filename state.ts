import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

export type LoopState =
	| { status: "inactive" }
	| { status: "running"; step: number; goal: string; lastSummary?: string }
	| { status: "confirming_done"; step: number; goal: string; reasonDone: string; lastSummary?: string }
	| { status: "done"; step: number; goal: string; reasonDone: string; lastSummary?: string };

export type LoopEvent =
	| { type: "start"; goal: string }
	| { type: "stop"; reason: string }
	| { type: "agent_start" }
	| { type: "tool_call_loop_control" }
	| { type: "tool_result_loop_control"; action: "next" | "done"; summary: string; reason?: string }
	| { type: "agent_end" }
	| { type: "advance" }
	| { type: "confirm_done" }
	| { type: "reconstruct"; state: LoopState };

export function emptyState(): LoopState {
	return { status: "inactive" };
}

/**
 * Pure state transition. All side effects (sending messages) are handled by
 * the caller inspecting prev/next state.
 */
export function transition(state: LoopState, event: LoopEvent): LoopState {
	switch (event.type) {
		case "start":
			return { status: "running", step: 0, goal: event.goal };

		case "stop": {
			if (state.status === "inactive" || state.status === "done") return state;
			return {
				status: "done",
				step: state.step,
				goal: state.goal,
				reasonDone: event.reason,
				lastSummary: state.lastSummary,
			};
		}

		case "tool_result_loop_control": {
			if (state.status !== "running") return state;
			const summary = event.summary.trim();
			if (event.action === "done") {
				return {
					status: "confirming_done",
					step: state.step,
					goal: state.goal,
					reasonDone: event.reason?.trim() || summary,
					lastSummary: summary,
				};
			}
			return { ...state, lastSummary: summary };
		}

		case "advance": {
			if (state.status !== "running") return state;
			return { ...state, step: state.step + 1 };
		}

		case "confirm_done": {
			if (state.status !== "confirming_done") return state;
			return {
				status: "done",
				step: state.step,
				goal: state.goal,
				reasonDone: state.reasonDone,
				lastSummary: state.lastSummary,
			};
		}

		case "reconstruct":
			return event.state;

		case "agent_start":
		case "tool_call_loop_control":
		case "agent_end":
		default:
			return state;
	}
}

export function buildPrompt(state: LoopState): string {
	const currentStep = state.status !== "inactive" ? state.step : 0;
	const goal = state.status !== "inactive" ? state.goal : "unknown";
	return [
		`## Loop — Iteration ${currentStep + 1}`,
		`Goal: ${goal}`,
		`Work toward the goal. When the goal is fully met, call loop_control with status "done" and explain why.`,
		`If more work is needed, call loop_control with status "next" describing what's left.`,
	].join("\n");
}

export function updateWidget(state: LoopState, ctx: ExtensionContext) {
	if (state.status === "inactive" || state.status === "done") {
		ctx.ui.setWidget("loop", undefined);
		return;
	}
	const label = `iteration ${state.step + 1}`;
	ctx.ui.setWidget("loop", [
		`┌─ Loop ──────────`,
		`│ 🔄 ${label}`,
		`└─ Ctrl+Shift+S to stop ─`,
	]);
}

export function getSystemPromptAddition(state: LoopState): string {
	if (state.status === "inactive" || state.status === "done") return "";
	return [
		"",
		"## Active Loop",
		`Step: ${state.step + 1}`,
		`Goal: ${state.goal}`,
		"You MUST call `loop_control` when you finish your work for this iteration.",
		'Use status "next" to advance or "done" when the goal is fully met.',
	].join("\n");
}

/** Derive whether a loop-iteration message should be sent after this transition. */
export function shouldSendIteration(prev: LoopState, next: LoopState): boolean {
	if (next.status !== "running") return false;
	if (prev.status !== "running") return true;
	return prev.step !== next.step;
}

/** Derive whether a loop-status message should be sent after this transition. */
export function shouldSendStatus(prev: LoopState, next: LoopState): boolean {
	return next.status === "done" && prev.status !== "done";
}

export function formatStatusMessage(state: LoopState): string {
	if (state.status !== "done") return "";
	return `✓ Loop complete after ${state.step + 1} iteration(s).`;
}

export function formatFallbackMessage(): string {
	return "You stopped without calling `loop_control`. If the task is incomplete, continue working. If done, call `loop_control` with status 'done'.";
}
