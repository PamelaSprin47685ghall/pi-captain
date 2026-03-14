---
name: pi-ux-intake
description: >
  Design and implement user intake flows in pi extensions — all the patterns
  for getting information from the user without building custom UI components.
  Use when: (1) intercepting the first user message to clarify intent before
  routing to the LLM, (2) pre-filling the editor with a proposed command for
  the user to review and edit, (3) using built-in ctx.ui primitives (confirm,
  select, input) inside tool execute() or command handlers, (4) instructing the
  LLM to gather structured answers via the question/questionnaire tools and
  feeding answers back as context, (5) building multi-step state-machine flows
  where the agent pauses at each transition to ask the user, (6) injecting
  a system prompt or context message based on user-selected profiles (presets,
  personas, modes), or (7) transforming/handling raw user input before it
  reaches the LLM via the input event. Covers when to use each mechanism,
  what signals to watch for degraded UX (long blocking, modal stacking, non-UI
  mode crashes), and how to combine intake primitives without confusing the user.
---

# Pi UX Intake

## Core Concepts

**Five ways to collect user input — choose by where in the flow you need the answer**:

```
When?                   Mechanism                    Blocks?
──────────────────────────────────────────────────────────────
Before user types       input event → handled/transform  yes
As user types           input event → transform          yes
Before LLM sees msg     before_agent_start injection     no
During a command        ctx.ui.confirm/select/input      yes
During a tool call      ctx.ui.custom() or globalThis    yes
During agent turn       LLM calls question tool          yes
Between turns           sendUserMessage()                no
```

**The `input` event is the earliest interception point** — it fires before the message reaches the LLM. Return `{ action: "handled" }` to consume it entirely (no LLM turn), `{ action: "transform", text: "..." }` to rewrite it, or `{ action: "continue" }` to pass through. Always skip `source === "extension"` messages to avoid infinite loops.

```typescript
pi.on("input", async (event, ctx) => {
  if (event.source === "extension") return { action: "continue" };

  // First real message: propose a command, don't pass to LLM
  if (!state.seenFirstMessage) {
    state.seenFirstMessage = true;
    const intent = event.text.trim();
    ctx.ui.setEditorText(`/init "${intent}"`);     // pre-fill for review
    ctx.ui.notify("Review command and submit, or edit it first.", "info");
    return { action: "handled" };                   // consume — no LLM turn
  }

  // Transform: inject prefix
  if (event.text.startsWith("?brief ")) {
    return { action: "transform", text: `Respond in one sentence: ${event.text.slice(7)}` };
  }

  return { action: "continue" };
});
```

**`ctx.ui.setEditorText()` is the lowest-friction intake** — instead of blocking the user with a prompt, you pre-fill the editor with a well-formed command or message. The user sees it, edits if needed, and submits. This respects user agency and avoids surprising modal interruptions. Use it when the extension can make a good guess at what the user wants.

```typescript
// Command: load exploration prompt into editor
pi.registerCommand("explore", {
  handler: async (args, ctx) => {
    const topic = args.trim() || "the system being designed";
    ctx.ui.setEditorText(
      `Explore the design of ${topic}. Ask me structured questions ` +
      `using the question tool. Start broad, then drill deeper.`
    );
    ctx.ui.notify("Prompt ready — edit if needed, then submit.", "info");
  },
});
```

**`ctx.ui.confirm` / `ctx.ui.select` / `ctx.ui.input` for simple gates** — use inside tool `execute()` or command handlers when you need a yes/no, a pick from a list, or a free-text answer. Always guard with `if (!ctx.hasUI) return …` — these throw in non-interactive (`-p`, `--print`) mode.

```typescript
// In tool execute():
if (!ctx.hasUI) {
  return { content: [{ type: "text", text: "Cannot ask in non-interactive mode" }] };
}
const ok = await ctx.ui.confirm("Confirm task", `Selected: "${task.name}"`);
if (!ok) return { content: [{ type: "text", text: "User declined" }] };

const description = await ctx.ui.input("Task context", "Add context (optional):") ?? "";
const mode = await ctx.ui.select("Choose mode", ["plan", "implement", "review"]);
```

---

## Intake Mechanisms at a Glance

```
intake mechanism             best for
────────────────────────────────────────────────────────────
input event → handled        routing first message to a command
input event → transform      global shorthands (?brief, ?quick)
setEditorText()              proposing a command for review
before_agent_start           per-turn context/system prompt injection
ctx.ui.confirm()             one yes/no gate (destructive actions)
ctx.ui.select()              picking from a short known list
ctx.ui.input()               free-text short answer
ctx.ui.custom()              rich pickers, tabbed questionnaires
question/questionnaire tool  LLM-driven structured clarification
sendUserMessage()            injecting info after collecting it
```

---

## Quick Patterns

1. **Intercept first message** — use `input` event + state flag; return `handled` and call `setEditorText` with a proposed command
2. **Gate a destructive tool** — check `ctx.hasUI`, call `ctx.ui.confirm()`; return blocked result on refusal
3. **Collect profile at session start** — on `session_start`, call `ctx.ui.select()` to pick preset/mode; store in `before_agent_start` for injection
4. **LLM-driven clarification** — register a `question` tool that calls `ctx.ui.custom()`; instruct LLM via system prompt to call it when ambiguous
5. **Multi-step flow** — state machine with tool transitions; each tool calls `ctx.ui.confirm()` + `ctx.ui.input()` and sends the result via `pi.sendUserMessage()`

---

## Reference Files

Consult these only when you need specific details:

- `rules/input-event.md` — when using the input event: handled vs. transform vs. continue, source guard, first-message pattern
- `rules/editor-prefill.md` — when to use setEditorText() vs. blocking prompts, how to combine with notify
- `rules/ui-primitives.md` — ctx.ui.confirm/select/input usage, hasUI guard, non-interactive fallbacks
- `rules/question-tool.md` — registering a question/questionnaire tool for LLM-driven intake, ctx.ui.custom() pattern
- `rules/before-agent-start.md` — injecting system prompt and context messages based on collected state
- `rules/state-machine-flow.md` — multi-step agent flows: state transitions, ctx.ui calls, sendUserMessage injection
- `rules/anti-patterns.md` — what breaks UX: stacking modals, blocking in non-UI mode, over-intercepting input
