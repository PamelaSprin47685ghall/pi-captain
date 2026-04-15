import { StringEnum } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-tui";
import { Type } from "@sinclair/typebox";
import { buildPrompt, type LoopState } from "./state.js";

export function handleLoopControlTool(opts: {
        params: { status: "next" | "done"; summary: string; reason?: string };
        state: LoopState;
        pi: ExtensionAPI;
        ctx: ExtensionContext;
}): { content: any[]; details?: LoopState; newState: LoopState } {
        const { params, state, pi } = opts;
        if (!state.active) {
                return { content: [{ type: "text", text: "No active loop." }], newState: state };
        }

        if (params.status === "done") {
                if (!state.confirmingDone) {
                        const newState = { ...state, confirmingDone: true };
                        return {
                                content: [{ type: "text", text: "Please confirm that the work is completely done. If there are still pending tasks, call loop_control with status 'next'. If you are truly done, just finish your response without calling loop_control again." }],
                                details: { ...newState },
                                newState,
                        };
                }
                const newState = { ...state, done: true, reasonDone: params.reason ?? params.summary, active: false, confirmingDone: false };
                return {
                        content: [{ type: "text", text: `✓ Loop complete after ${state.currentStep + 1} iteration(s). Reason: ${newState.reasonDone}` }],
                        details: { ...newState },
                        newState,
                };
        }

        const newState = { ...state, currentStep: state.currentStep + 1, confirmingDone: false, nextScheduled: true };
        setTimeout(() => {
                pi.sendMessage({ customType: "loop-iteration", content: buildPrompt(newState), display: false }, { triggerTurn: true, deliverAs: "steer" });
        }, 100);

        return {
                content: [{ type: "text", text: `→ Advancing to step ${newState.currentStep + 1}. Summary: ${params.summary}` }],
                details: { ...newState },
                newState,
        };
}

export function getLoopControlToolDefinition() {
        return {
                name: "loop_control",
                label: "Loop Control",
                description: "Signal loop progress. Call this when you finish a loop iteration. status 'next' to advance, 'done' to finish.",
                parameters: Type.Object({
                        status: StringEnum(["next", "done"] as const),
                        summary: Type.String({ description: "Brief summary of what was accomplished this iteration" }),
                        reason: Type.Optional(Type.String({ description: "Why the goal is met (for 'done')" })),
                }),
        };
}

export function renderLoopControlCall(args: { status: string }, theme: any) {
        return new Text(theme.fg("toolTitle", theme.bold("loop_control ")) + theme.fg(args.status === "done" ? "success" : "accent", args.status), 0, 0);
}

export function renderLoopControlResult(result: { details?: LoopState }, _opts: unknown, theme: any) {
        const d = result.details;
        if (!d) return new Text("", 0, 0);
        return new Text(theme.fg(d.done ? "success" : "accent", `${d.done ? "✓" : "→"} step ${d.currentStep + 1}`), 0, 0);
}
