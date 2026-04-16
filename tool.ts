import { StringEnum } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-tui";
import { Type } from "@sinclair/typebox";
import { type LoopState } from "./state.js";

export function handleLoopControlTool(opts: {
        params: { status: "next" | "done"; summary: string; reason?: string };
        state: LoopState;
        pi: ExtensionAPI;
        ctx: ExtensionContext;
}): { content: any[]; details?: LoopState; newState: LoopState } {
        const { params, state } = opts;
        if (state.status === "inactive" || state.status === "done") {
                return { content: [{ type: "text", text: "No active loop." }], newState: state };
        }

        if (params.status === "done") {
                if (state.status === "running") {
                        const newState: LoopState = {
                                ...state,
                                status: "confirming_done",
                                reasonDone: params.reason?.trim() || params.summary.trim(),
                                lastSummary: params.summary.trim(),
                                turnIntent: "done"
                        };
                        return {
                                content: [{ type: "text", text: "Please confirm that the work is completely done. If there are still pending tasks, call loop_control with status 'next'. If you are truly done, just finish your response without calling loop_control again." }],
                                details: { ...newState },
                                newState,
                        };
                }
                const doneReason = params.reason?.trim() || state.reasonDone || params.summary.trim() || "Goal complete";
                const newState: LoopState = {
                        status: "done",
                        step: state.step,
                        goal: state.goal,
                        reasonDone: doneReason,
                        lastSummary: params.summary.trim() || state.lastSummary,
                };
                return {
                        content: [{ type: "text", text: `✓ Loop complete after ${state.step + 1} iteration(s). Summary: ${params.summary.trim() || state.lastSummary || "(none)"}. Reason: ${doneReason}` }],
                        details: { ...newState },
                        newState,
                };
        }

        const newState: LoopState = {
                ...state,
                status: "running",
                lastSummary: params.summary.trim(),
                turnIntent: "next"
        };

        return {
                content: [{ type: "text", text: `→ Advancing to step ${newState.step + 1}. Summary: ${params.summary}` }],
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
        if (d.status === "done") {
                const summary = d.lastSummary ? ` ${d.lastSummary}` : "";
                const reason = d.reasonDone ? `: ${d.reasonDone}` : "";
                return new Text(theme.fg("success", `✓ done${summary}${reason}`), 0, 0);
        }
        if (d.status === "confirming_done") {
                const summary = d.lastSummary ? ` ${d.lastSummary}` : "";
                const reason = d.reasonDone ? `: ${d.reasonDone}` : "";
                return new Text(theme.fg("accent", `? confirm done${summary}${reason}`), 0, 0);
        }
        if (d.status === "running") {
                const summary = d.lastSummary ? ` ${d.lastSummary}` : "";
                return new Text(theme.fg("accent", `→ step ${d.step + 1}${summary}`), 0, 0);
        }
        return new Text("", 0, 0);
}
