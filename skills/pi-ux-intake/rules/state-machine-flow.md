# Model multi-step agent flows as explicit state machines with tool transitions

Complex intake sequences — e.g., select task → collect context → plan → implement → review — become unmaintainable if each step is its own ad-hoc command. Model them as a state machine: a current-state variable, tools that trigger transitions (calling `ctx.ui` to collect input at each gate), and `pi.sendUserMessage()` to inject the next prompt. Each tool's `execute()` returns the result of the gate AND the next system prompt. The pattern is from `ManuelSelch-pi-agent-extension-flow/flow.ts`.

## Avoid

```typescript
// Flat command per step — no state, no guard, any command works at any time
pi.registerCommand("plan", {
  handler: async (_args, ctx) => {
    // ❌ No state machine — user can run /plan without having selected a task
    const plan = await ctx.ui.input("Plan", "Describe the plan:");
    // ...
  },
});
pi.registerCommand("implement", {
  handler: async (_args, ctx) => {
    // ❌ Can run implement without a plan — undefined behavior
    pi.sendUserMessage("Start implementing");
  },
});
```

```typescript
// Deeply nested ctx.ui calls in a single tool — hard to follow, hard to test
async execute(_id, params, _signal, _onUpdate, ctx) {
  const ok1 = await ctx.ui.confirm(...);
  if (ok1) {
    const choice = await ctx.ui.select(...);
    if (choice === "x") {
      const text = await ctx.ui.input(...);
      const ok2 = await ctx.ui.confirm(...);
      // 4 levels deep — user can't tell where they are
    }
  }
}
```

## Prefer

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

type Phase = "idle" | "planning" | "implementing" | "reviewing";

interface FlowState {
  phase: Phase;
  taskName?: string;
  taskDescription?: string;
}

export default function (pi: ExtensionAPI) {
  let state: FlowState = { phase: "idle" };

  // ── Helpers ──────────────────────────────────────────────────────

  function guardPhase(expected: Phase, ctx: ExtensionContext): string | null {
    if (state.phase !== expected) {
      return `FAILED: this action requires phase "${expected}", currently in "${state.phase}"`;
    }
    return null;
  }

  function transition(next: Phase, systemPrompt: string): string {
    state = { ...state, phase: next };
    pi.sendUserMessage(systemPrompt, { deliverAs: "steer" });
    return `Transitioned to phase: ${next}`;
  }

  // ── Tool: select_task (idle → planning) ──────────────────────────

  pi.registerTool({
    name: "select_task",
    label: "Select Task",
    description: "Select a task to work on. Call in idle phase to begin the flow.",
    parameters: Type.Object({ name: Type.String({ description: "Task name" }) }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      const err = guardPhase("idle", ctx);
      if (err) return { content: [{ type: "text", text: err }], details: {} };

      if (!ctx.hasUI) {
        state = { phase: "planning", taskName: params.name, taskDescription: "" };
        return { content: [{ type: "text", text: transition("planning", `Plan the task: ${params.name}`) }], details: {} };
      }

      // ✅ One confirm, one input — flat, predictable
      const ok = await ctx.ui.confirm("Confirm task", `Start working on "${params.name}"?`);
      if (!ok) {
        return { content: [{ type: "text", text: "User declined. Stay in idle." }], details: {} };
      }

      const description = (await ctx.ui.input("Task context", "Add context (optional):")) ?? "";

      state = { phase: "planning", taskName: params.name, taskDescription: description };

      return {
        content: [{ type: "text", text: transition("planning",
          `Analyze the codebase and create a plan for: "${params.name}".\n` +
          (description ? `Context: ${description}\n` : "") +
          `When done, call start_implementation with your gathered requirements.`
        )}],
        details: { phase: "planning", taskName: params.name },
      };
    },
  });

  // ── Tool: start_implementation (planning → implementing) ─────────

  pi.registerTool({
    name: "start_implementation",
    label: "Start Implementation",
    description: "Complete planning and begin implementation. Only valid in planning phase.",
    parameters: Type.Object({ requirements: Type.String({ description: "Requirements gathered during planning" }) }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      const err = guardPhase("planning", ctx);
      if (err) return { content: [{ type: "text", text: err }], details: {} };

      if (ctx.hasUI) {
        const ok = await ctx.ui.confirm(
          "Requirements ready?",
          `Proceed to implementation with:\n${params.requirements.slice(0, 200)}...`
        );
        if (!ok) {
          return { content: [{ type: "text", text: "Requirements rejected. Continue planning." }], details: {} };
        }
      }

      return {
        content: [{ type: "text", text: transition("implementing",
          `Implement the task using these requirements:\n${params.requirements}\n` +
          `When done, call request_review.`
        )}],
        details: { phase: "implementing" },
      };
    },
  });

  // ── Tool: request_review (implementing → reviewing) ──────────────

  pi.registerTool({
    name: "request_review",
    label: "Request Review",
    description: "Ask the user to review the implementation. Only valid in implementing phase.",
    parameters: Type.Object({ summary: Type.String({ description: "What was implemented" }) }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      const err = guardPhase("implementing", ctx);
      if (err) return { content: [{ type: "text", text: err }], details: {} };

      if (ctx.hasUI) {
        const verdict = await ctx.ui.select(
          `Review: ${state.taskName}`,
          ["Approved — mark complete", "Needs changes — continue", "Abort — discard"]
        );

        if (verdict?.startsWith("Approved")) {
          state = { phase: "idle" };
          return { content: [{ type: "text", text: "Task approved and complete. Back to idle." }], details: {} };
        }
        if (verdict?.startsWith("Abort")) {
          state = { phase: "idle" };
          return { content: [{ type: "text", text: "Task aborted. Back to idle." }], details: {} };
        }
        return { content: [{ type: "text", text: "Needs changes — continue implementing." }], details: {} };
      }

      // Headless: auto-approve
      state = { phase: "idle" };
      return { content: [{ type: "text", text: "Review auto-approved (headless mode). Task complete." }], details: {} };
    },
  });

  // ── Commands ─────────────────────────────────────────────────────

  pi.registerCommand("flow-start", {
    description: "Start the development flow",
    handler: async (_args, ctx) => {
      if (state.phase !== "idle") {
        ctx.ui.notify(`Flow already active (phase: ${state.phase}). Use /flow-reset to restart.`, "warning");
        return;
      }
      pi.sendUserMessage(
        "Use the select_task tool to choose a task from the project backlog and begin the flow."
      );
    },
  });

  pi.registerCommand("flow-reset", {
    description: "Reset the flow to idle",
    handler: async (_args, ctx) => {
      state = { phase: "idle" };
      ctx.ui.notify("Flow reset to idle.", "info");
      ctx.ui.setStatus("flow", undefined);
    },
  });

  // ── Status indicator ─────────────────────────────────────────────

  pi.on("turn_start", async (_e, ctx) => {
    if (!ctx.hasUI) return;
    const label = state.phase === "idle" ? undefined : `flow:${state.phase}`;
    ctx.ui.setStatus("flow", label ? ctx.ui.theme.fg("accent", label) : undefined);
  });
}
```

**Key rules for state machine flows:**
1. **One tool per transition** — each tool does exactly one phase change; the guard at the top enforces it
2. **Guard returns a FAILED message** — the LLM reads it and understands it can't proceed; don't throw
3. **Flat UI calls** — at most confirm + one input or select per tool; never nest more than 2 blocking calls
4. **`sendUserMessage` carries the next prompt** — this is the handoff to the next phase's LLM instructions; use `deliverAs: "steer"` if the agent is still active
5. **Status indicator** — update `ctx.ui.setStatus` at each turn so the user always knows the current phase
