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
                        const newState = {
                                ...state,
                                confirmingDone: true,
                                reasonDone: params.reason?.trim() || params.summary.trim(),
                                lastSummary: params.summary.trim(),
                        };
                        return {
                                content: [{ type: "text", text: "Please confirm that the work is completely done. If there are still pending tasks, call loop_control with status 'next'. If you are truly done, just finish your response without calling loop_control again." }],
                                details: { ...newState },
                                newState,
                        };
                }
                const doneReason = params.reason?.trim() || state.reasonDone || params.summary.trim() || "Goal complete";
                const newState = {
                        ...state,
                        done: true,
                        reasonDone: doneReason,
                        lastSummary: params.summary.trim() || state.lastSummary,
                        active: false,
                        confirmingDone: false,
                };
                return {
                        content: [{ type: "text", text: `✓ Loop complete after ${state.currentStep + 1} iteration(s). Summary: ${newState.lastSummary || "(none)"}. Reason: ${doneReason}` }],
                        details: { ...newState },
                        newState,
                };
        }

        const newState = {
                ...state,
                currentStep: state.currentStep + 1,
                confirmingDone: false,
                nextScheduled: true,
                lastSummary: params.summary.trim(),
        };
        setTimeout(() => {
                pi.sendMessage({ customType: "loop-iteration", content: buildPrompt(newState), display: true }, { triggerTurn: true, deliverAs: "steer" });
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
        if (d.done) {
                const summary = d.lastSummary ? ` ${d.lastSummary}` : "";
                const reason = d.reasonDone ? `: ${d.reasonDone}` : "";
                return new Text(theme.fg("success", `✓ done${summary}${reason}`), 0, 0);
        }
        if (d.confirmingDone) {
                const summary = d.lastSummary ? ` ${d.lastSummary}` : "";
                const reason = d.reasonDone ? `: ${d.reasonDone}` : "";
                return new Text(theme.fg("accent", `? confirm done${summary}${reason}`), 0, 0);
        }
        const summary = d.lastSummary ? ` ${d.lastSummary}` : "";
        return new Text(theme.fg("accent", `→ step ${d.currentStep + 1}${summary}`), 0, 0);
}
