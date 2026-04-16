import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { Key } from "@oh-my-pi/pi-tui";
import { buildPrompt, emptyState, getSystemPromptAddition, type LoopState, updateWidget } from "./state.js";
import { getLoopControlToolDefinition, handleLoopControlTool, renderLoopControlCall, renderLoopControlResult } from "./tool.js";

export default function (pi: ExtensionAPI) {
	let state = emptyState();
	let loopControlCalledThisTurn = false;

	const reconstruct = (ctx: ExtensionContext) => {
		state = emptyState();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "loop_control") {
				const d = entry.message.details as LoopState | undefined;
				if (d) state = { ...d };
			}
		}
	};

	pi.on("session_start", async (_e, ctx) => reconstruct(ctx));
	pi.on("session_switch", async (_e, ctx) => reconstruct(ctx));
	pi.on("session_fork", async (_e, ctx) => reconstruct(ctx));
	pi.on("session_tree", async (_e, ctx) => reconstruct(ctx));

	pi.on("turn_start", async () => {
		if (!state.active) return;
		loopControlCalledThisTurn = false;
	});

	pi.on("tool_call", async (event) => {
		if (!state.active || event.toolName !== "loop_control") return;
		loopControlCalledThisTurn = true;
	});

	pi.on("input", async (event, ctx) => {
		const text = event.text.trim();
		// Handle commands natively
		if (text.startsWith("/")) {
			if (text.startsWith("/once ") || text === "/once") {
				return { text: text.slice(5).trim() };
			}
			return {};
		}

		// Normal message: start loop without sending the raw user text to the model.
		state = { active: true, currentStep: 0, goal: text, done: false, reasonDone: "" };
		updateWidget(state, ctx);

		pi.sendMessage({ customType: "loop-iteration", content: buildPrompt(state), display: true }, { triggerTurn: true, deliverAs: "steer" });

		return { handled: true };
	});

	pi.on("before_agent_start", async (event) => {
		if (!state.active) return;
		return { systemPrompt: event.systemPrompt + getSystemPromptAddition(state) };
	});

	pi.on("turn_end", async (_e, ctx) => {
		if (!state.active) return;

		if (state.confirmingDone) {
			state.active = false;
			state.done = true;
			state.confirmingDone = false;
			state.reasonDone = state.reasonDone || "Confirmed complete by skipping loop_control";
			updateWidget(state, ctx);
			pi.sendMessage({ customType: "loop-status", content: `✓ Loop complete after ${state.currentStep + 1} iteration(s). Reason: ${state.reasonDone}`, display: true, details: { status: "done" } }, { triggerTurn: false, deliverAs: "steer" });
			return;
		}

		if (state.nextScheduled) {
			state.nextScheduled = false;
			loopControlCalledThisTurn = false;
			return;
		}

		if (loopControlCalledThisTurn) {
			loopControlCalledThisTurn = false;
			return;
		}

		// Fallback: LLM stopped without calling loop_control or confirming done
		state.currentStep++;
		updateWidget(state, ctx);
		setTimeout(() => {
			pi.sendMessage({
				customType: "loop-fallback",
				content: "You stopped without calling `loop_control`. If the task is incomplete, continue working. If done, call `loop_control` with status 'done'.",
				display: true
			}, { triggerTurn: true, deliverAs: "steer" });
		}, 100);
	});

	pi.registerTool({
		...getLoopControlToolDefinition(),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			loopControlCalledThisTurn = true;
			const result = handleLoopControlTool({ params, state, pi, ctx });
			state = result.newState;
			updateWidget(state, ctx);
			return { content: result.content, details: result.details };
		},
		renderCall: renderLoopControlCall as any,
		renderResult: renderLoopControlResult as any,
	});

	const stopLoop = (ctx: ExtensionContext, reason: string) => {
		if (!state.active) {
			ctx.ui.notify("No active loop", "info");
			return;
		}
		state.active = false;
		state.done = true;
		state.reasonDone = reason;
		updateWidget(state, ctx);
		ctx.ui.notify(`Loop stopped after ${state.currentStep + 1} iteration(s)`, "warning");
	};

	pi.registerCommand("loop-stop", {
		description: "Stop the active loop",
		handler: async (_args, ctx) => stopLoop(ctx, "Stopped by user"),
	});

	pi.registerShortcut("ctrl+shift+x", {
		description: "Stop the active loop",
		handler: async (ctx) => {
			stopLoop(ctx, "Stopped by shortcut");
			ctx.abort();
		},
	});
}
