import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { buildPrompt, emptyState, getSystemPromptAddition, type LoopState, updateWidget } from "./state.js";
import { handleLoopControlTool } from "./tool.js";

export class LoopFSM {
    private pi: ExtensionAPI;
    private state: LoopState;
    private turnToolAction: "none" | "next" | "done" = "none";
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
            if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "loop_control") {
                const d = entry.message.details as LoopState | undefined;
                if (d) reconstructed = { ...d };
            }
        }
        this.transition(reconstructed, ctx);
    }

    onTurnStart(_ctx: ExtensionContext) {
        if (this.state.status === "inactive" || this.state.status === "done") return;
        this.turnToolAction = "none";
        this.sawNonLoopTool = false;
    }

    onToolCall(event: any, _ctx: ExtensionContext) {
        if (event.toolName !== "loop_control") {
            this.sawNonLoopTool = true;
        }
    }

    async executeTool(_id: string, params: any, _signal: any, _onUpdate: any, ctx: ExtensionContext) {
        this.turnToolAction = params.status === "done" ? "done" : params.status === "next" ? "next" : "none";
        const result = handleLoopControlTool({ params, state: this.state, pi: this.pi, ctx });
        this.transition(result.newState, ctx);

        return { content: result.content, details: result.details };
    }

    onBeforeAgentStart(event: any) {
        if (this.state.status === "inactive" || this.state.status === "done") return;
        return { systemPrompt: event.systemPrompt + getSystemPromptAddition(this.state) };
    }

    async onTurnEnd(ctx: ExtensionContext) {
        if (this.state.status === "inactive" || this.state.status === "done") return;

        if (this.state.status === "running") {
            if (this.turnToolAction === "next") {
                // Saw the tool call but waiting for onInput to advance, so the LLM can generate text.
                return;
            }
            if (this.turnToolAction === "done") {
                // State inconsistency: tool said done but state is still running. Mark done directly.
                const finalReason = "Goal complete";
                const finalStep = this.state.step;
                this.transition({ status: "done", step: finalStep, goal: this.state.goal, reasonDone: finalReason, lastSummary: this.state.lastSummary }, ctx);
                this.pi.sendMessage({ customType: "loop-status", content: `✓ Loop complete after ${finalStep + 1} iteration(s). Reason: ${finalReason}`, display: true, details: { status: "done" } }, { triggerTurn: false, deliverAs: "steer" });
                return;
            }
            if (this.sawNonLoopTool) {
                // Turn ended after other tools executed; continue the loop rather than scolding.
                this.pi.sendMessage({ customType: "loop-iteration", content: buildPrompt(this.state), display: true }, { triggerTurn: true, deliverAs: "steer" });
                return;
            }
            // Fallback: model ended without calling loop_control
            this.transition({ ...this.state, step: this.state.step + 1 }, ctx);
            this.pi.sendMessage({
                customType: "loop-fallback",
                content: "You stopped without calling `loop_control`. If the task is incomplete, continue working. If done, call `loop_control` with status 'done'.",
                display: true
            }, { triggerTurn: true, deliverAs: "steer" });
            return;
        }

        if (this.state.status === "confirming_done") {
            const finalReason = this.state.reasonDone || "Confirmed complete by skipping loop_control";
            const finalStep = this.state.step;
            this.transition({ status: "done", step: finalStep, goal: this.state.goal, reasonDone: finalReason, lastSummary: this.state.lastSummary }, ctx);
            this.pi.sendMessage({ customType: "loop-status", content: `✓ Loop complete after ${finalStep + 1} iteration(s). Reason: ${finalReason}`, display: true, details: { status: "done" } }, { triggerTurn: false, deliverAs: "steer" });
            return;
        }
    }

    async onInput(event: any, ctx: ExtensionContext) {
        const text = event.text.trim();
        if (text.startsWith("/")) {
            if (text.startsWith("/once ") || text === "/once") {
                return { text: text.slice(5).trim() };
            }
            return {};
        }

        if (this.state.status === "confirming_done") {
            this.transition({ status: "done", step: this.state.step, goal: this.state.goal, reasonDone: this.state.reasonDone, lastSummary: this.state.lastSummary }, ctx);
            return { handled: true };
        }

        if (this.state.status === "running" && this.turnToolAction === "next") {
            this.transition({ ...this.state, step: this.state.step + 1 }, ctx);
            this.pi.sendMessage({ customType: "loop-iteration", content: buildPrompt(this.state), display: true }, { triggerTurn: true, deliverAs: "steer" });
            return { handled: true };
        }

        this.transition({ status: "running", step: 0, goal: text }, ctx);
        this.pi.sendMessage({ customType: "loop-iteration", content: buildPrompt(this.state), display: true }, { triggerTurn: true, deliverAs: "steer" });
        return { handled: true };
    }

    stop(ctx: ExtensionContext, reason: string) {
        if (this.state.status === "inactive" || this.state.status === "done") {
            ctx.ui.notify("No active loop", "info");
            return;
        }
        const s = this.state.step;
        const g = this.state.goal;
        this.transition({ status: "done", step: s, goal: g, reasonDone: reason, lastSummary: this.state.lastSummary } as LoopState, ctx);
        ctx.ui.notify(`Loop stopped after ${s + 1} iteration(s)`, "warning");
    }

    // Pure state update entrypoint
    private transition(newState: LoopState, ctx: ExtensionContext) {
        this.state = newState;
        updateWidget(this.state, ctx);
    }
}

export default LoopFSM;
