import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
	buildPrompt,
	emptyState,
	formatFallbackMessage,
	formatStatusMessage,
	getSystemPromptAddition,
	shouldSendIteration,
	shouldSendStatus,
	transition,
	type LoopEvent,
	type LoopState,
	updateWidget,
} from "./state.js";
import { handleLoopControlTool } from "./tool.js";

export class LoopFSM {
	private pi: ExtensionAPI;
	private state: LoopState;
	/**
	 * True when the agent has emitted a loop_control tool_call but the execute
	 * has not finished yet. Guards onTurnEnd against observing stale state.
	 */
	private pendingLoopControl: boolean = false;
	/** Result of loop_control execution for the current turn ("none" if not called). */
	private turnAction: "none" | "next" | "done" = "none";
	/** Tracks whether any non-loop tool was called in the current turn. */
	private sawNonLoopTool: boolean = false;

	constructor(pi: ExtensionAPI) {
		this.pi = pi;
		this.state = emptyState();
	}

	reconstruct(ctx: ExtensionContext) {
		if (this.state.status === "confirming_done" || this.state.status === "done") {
			return;
		}
		let reconstructed = emptyState();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (
				entry.type === "message" &&
				entry.message.role === "toolResult" &&
				entry.message.toolName === "loop_control"
			) {
				const d = entry.message.details as LoopState | undefined;
				if (d) reconstructed = { ...d };
			}
		}
		this.dispatch({ type: "reconstruct", state: reconstructed }, ctx);
	}

	onTurnStart(_ctx: ExtensionContext) {
		if (this.state.status === "inactive" || this.state.status === "done") return;
		this.turnAction = "none";
		this.sawNonLoopTool = false;
		this.pendingLoopControl = false;
	}

	onToolCall(event: { toolName?: string }, _ctx: ExtensionContext) {
		if (this.state.status === "inactive" || this.state.status === "done") return;
		if (event.toolName === "loop_control") {
			this.pendingLoopControl = true;
		} else if (event.toolName) {
			this.sawNonLoopTool = true;
		}
	}

	async executeTool(
		_id: string,
		params: { status: "next" | "done"; summary: string; reason?: string },
		_signal: unknown,
		_onUpdate: unknown,
		ctx: ExtensionContext,
	) {
		this.turnAction = params.status;
		this.pendingLoopControl = false;
		const result = handleLoopControlTool({
			params,
			state: this.state,
			pi: this.pi,
			ctx,
		});
		this.dispatch(
			{
				type: "tool_result_loop_control",
				action: params.status,
				summary: params.summary,
				reason: params.reason,
			},
			ctx,
		);
		return { content: result.content, details: result.details };
	}

	onBeforeAgentStart(event: { systemPrompt?: string }) {
		if (this.state.status === "inactive" || this.state.status === "done") return;
		return { systemPrompt: (event.systemPrompt ?? "") + getSystemPromptAddition(this.state) };
	}

	async onTurnEnd(ctx: ExtensionContext) {
		if (this.state.status === "inactive" || this.state.status === "done") return;

		// Defensive: if loop_control was called but hasn't executed yet, wait.
		if (this.pendingLoopControl) {
			return;
		}

		if (this.state.status === "running") {
			if (this.turnAction === "next") {
				// Agent called loop_control next; wait for onInput to advance.
				return;
			}
			if (this.turnAction === "done") {
				// State inconsistency: tool said done but state is still running.
				// Force done directly.
				this.dispatch({ type: "stop", reason: "Goal complete" }, ctx);
				return;
			}
			if (this.sawNonLoopTool) {
				// Turn ended after other tools; continue loop rather than scolding.
				this.sendIteration();
				return;
			}
			// Fallback: model ended turn without calling loop_control.
			this.dispatch({ type: "turn_end" }, ctx);
			this.sendFallback();
			return;
		}

		if (this.state.status === "confirming_done") {
			// Agent confirmed completion by skipping loop_control again.
			this.dispatch({ type: "confirm_done" }, ctx);
			return;
		}
	}

	async onInput(event: { text?: string }, ctx: ExtensionContext) {
		const text = (event.text ?? "").trim();
		if (text.startsWith("/")) {
			if (text.startsWith("/once ") || text === "/once") {
				return { text: text.slice(5).trim() };
			}
			return {};
		}

		if (this.state.status === "confirming_done") {
			this.dispatch({ type: "confirm_done" }, ctx);
			return { handled: true };
		}

		if (this.state.status === "running" && this.turnAction === "next") {
			// Advance to next iteration and send prompt.
			this.dispatch({ type: "advance" }, ctx);
			this.sendIteration();
			return { handled: true };
		}

		// New user input starts a fresh loop.
		this.dispatch({ type: "start", goal: text }, ctx);
		return { handled: true };
	}

	stop(ctx: ExtensionContext, reason: string) {
		if (this.state.status === "inactive" || this.state.status === "done") {
			ctx.ui.notify("No active loop", "info");
			return;
		}
		this.dispatch({ type: "stop", reason }, ctx);
		ctx.ui.notify(`Loop stopped after ${this.state.step + 1} iteration(s)`, "warning");
	}

	/** State update, widget sync, and derived message emission. */
	private dispatch(event: LoopEvent, ctx: ExtensionContext) {
		const prev = this.state;
		this.state = transition(this.state, event);
		updateWidget(this.state, ctx);

		if (shouldSendIteration(prev, this.state)) {
			this.sendIteration();
		}
		if (shouldSendStatus(prev, this.state)) {
			this.sendStatus();
		}
	}

	private sendIteration() {
		this.pi.sendMessage(
			{ customType: "loop-iteration", content: buildPrompt(this.state), display: true },
			{ triggerTurn: true, deliverAs: "steer" },
		);
	}

	private sendStatus() {
		this.pi.sendMessage(
			{
				customType: "loop-status",
				content: formatStatusMessage(this.state),
				display: true,
				details: { status: "done" },
			},
			{ triggerTurn: false, deliverAs: "steer" },
		);
	}

	private sendFallback() {
		this.pi.sendMessage(
			{ customType: "loop-fallback", content: formatFallbackMessage(), display: true },
			{ triggerTurn: true, deliverAs: "steer" },
		);
	}
}

export default LoopFSM;
