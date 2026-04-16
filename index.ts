import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { getLoopControlToolDefinition, renderLoopControlCall, renderLoopControlResult } from "./tool.js";

import LoopFSM from "./loop-fsm.js";

export default function (pi: ExtensionAPI) {
	const fsm = new LoopFSM(pi);

	pi.on("session_start", async (_e, ctx) => fsm.reconstruct(ctx));
	pi.on("session_switch", async (_e, ctx) => fsm.reconstruct(ctx));
	pi.on("session_fork", async (_e, ctx) => fsm.reconstruct(ctx));
	pi.on("session_tree", async (_e, ctx) => fsm.reconstruct(ctx));

	pi.on("agent_start", async (_e, ctx) => fsm.onAgentStart(ctx));

	pi.on("tool_call", async (event, ctx) => fsm.onToolCall(event, ctx));

	pi.on("input", async (event, ctx) => fsm.onInput(event, ctx));

	pi.on("before_agent_start", async (event, ctx) => fsm.onBeforeAgentStart(event, ctx));

	pi.on("agent_end", async (e, ctx) => fsm.onAgentEnd(e, ctx));

	pi.registerTool({
		...getLoopControlToolDefinition(),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			return fsm.executeTool(_id, params, _signal, _onUpdate, ctx);
		},
		renderCall: renderLoopControlCall as any,
		renderResult: renderLoopControlResult as any,
	});

	pi.registerCommand("loop-stop", {
		description: "Stop the active loop",
		handler: async (_args, ctx) => fsm.stop(ctx, "Stopped by user"),
	});

	pi.registerCommand("once", {
		description: "Send a single, non-looping turn",
		handler: async (args, ctx) => {
			const text = args.trim();
			if (text) {
				fsm.setSkipNextAutoLoop(true);
				await pi.sendUserMessage(text, { deliverAs: ctx.isIdle() ? undefined : "steer" });
			}
		},
	});

	pi.registerShortcut("ctrl+shift+s", {
		description: "Stop the active loop",
		handler: async (ctx) => {
			fsm.stop(ctx, "Stopped by shortcut");
			ctx.abort();
		},
	});
}
