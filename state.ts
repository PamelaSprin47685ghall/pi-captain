import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

export type TurnIntent = "none" | "next" | "done";

export type LoopState =
    | { status: "inactive" }
    | { status: "running"; step: number; goal: string; lastSummary?: string; turnIntent: TurnIntent }
    | { status: "confirming_done"; step: number; goal: string; reasonDone: string; lastSummary?: string; turnIntent: TurnIntent }
    | { status: "done"; step: number; goal: string; reasonDone: string; lastSummary?: string; };

export type FsmEvent =
    | { type: "START"; goal: string }
    | { type: "STOP"; reason: string }
    | { type: "TURN_START" }
    | { type: "TURN_END" }
    | { type: "TOOL_LOOP_CONTROL"; action: "next" | "done"; summary: string; reason?: string }
    | { type: "RECONSTRUCT"; history: any[] };

export function emptyState(): LoopState {
    return { status: "inactive" };
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
                `└─ Ctrl+Shift+X to stop ─`,
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
