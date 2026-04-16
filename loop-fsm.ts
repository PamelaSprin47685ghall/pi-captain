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
	 * Tracks the most recent loop_control action across the whole agent loop.
	 * "none" if loop_control was not called in the current agent loop.
	 */
	private agentLoopAction: "none" | "next" | "done" = "none";
	/** Tracks whether any non-loop tool was called in the current agent loop. */
	private sawAnyNonLoopTool: boolean = false;

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

	onAgentStart(_ctx: ExtensionContext) {
		if (this.state.status === "inactive" || this.state.status === "done") return;
		this.agentLoopAction = "none";
		this.sawAnyNonLoopTool = false;
	}

	onToolCall(event: { toolName?: string }, _ctx: ExtensionContext) {
		if (this.state.status === "inactive" || this.state.status === "done") return;
		if (event.toolName && event.toolName !== "loop_control") {
			this.sawAnyNonLoopTool = true;
		}
	}

	async executeTool(
		_id: string,
		params: { status: "next" | "done"; summary: string; reason?: string },
		_signal: unknown,
		_onUpdate: unknown,
		ctx: ExtensionContext,
	) {
		this.agentLoopAction = params.status;
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

	async onAgentEnd(ctx: ExtensionContext) {
		if (this.state.status === "inactive" || this.state.status === "done") return;

		if (this.state.status === "confirming_done") {
			this.dispatch({ type: "confirm_done" }, ctx);
			return;
		}

		if (this.state.status === "running") {
			if (this.agentLoopAction === "next") {
				this.dispatch({ type: "advance" }, ctx);
				this.sendIteration();
				return;
			}
			if (this.agentLoopAction === "done") {
				// Safety net: loop_control said done but state is still running.
				this.dispatch({ type: "stop", reason: "Goal complete" }, ctx);
				return;
			}
			if (this.sawAnyNonLoopTool) {
				// Agent ended after other tools; continue loop rather than scolding.
				this.sendIteration();
				return;
			}
			// Fallback: model ended the agent loop without calling loop_control.
			this.sendFallback();
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
