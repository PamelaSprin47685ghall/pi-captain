import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

export interface LoopState {
        active: boolean;
        currentStep: number;
        goal: string;
        done: boolean;
        reasonDone: string;
        lastSummary?: string;
        confirmingDone?: boolean;
        nextScheduled?: boolean;
}

export function emptyState(): LoopState {
        return { active: false, currentStep: 0, goal: "", done: false, reasonDone: "", lastSummary: "", confirmingDone: false, nextScheduled: false };
}

export function buildPrompt(state: LoopState): string {
        return [
                `## Loop — Iteration ${state.currentStep + 1}`,
                `Goal: ${state.goal}`,
                `Work toward the goal. When the goal is fully met, call loop_control with status "done" and explain why.`,
                `If more work is needed, call loop_control with status "next" describing what's left.`,
        ].join("\n");
}

export function updateWidget(state: LoopState, ctx: ExtensionContext) {
        if (!state.active) {
                ctx.ui.setWidget("loop", undefined);
                return;
        }
        const label = `iteration ${state.currentStep + 1}`;
        ctx.ui.setWidget("loop", [
                `┌─ Loop ──────────`,
                `│ 🔄 ${label}`,
                `└─ Ctrl+Shift+X to stop ─`,
        ]);
}

export function getSystemPromptAddition(state: LoopState): string {
        return [
                "",
                "## Active Loop",
                `Step: ${state.currentStep + 1}`,
                `Goal: ${state.goal}`,
                "You MUST call `loop_control` when you finish your work for this iteration.",
                'Use status "next" to advance or "done" when the goal is fully met.',
        ].join("\n");
}
