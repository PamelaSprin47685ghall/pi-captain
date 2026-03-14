# Prefer setEditorText() over blocking prompts when the extension can make a good guess

`ctx.ui.setEditorText(text)` pre-fills the editor with a proposed message or command. The user sees it, can edit it, and submits when ready. This is the lowest-friction intake pattern: it doesn't block the agent loop, doesn't force the user to answer immediately, and respects user agency. Use it whenever the extension has enough context to make a reasonable guess.

The canonical sources: `startup-intake-router.ts` (first message → proposed `/init-project-docs` command), `/explore` command (loads a structured exploration prompt), `/snapshot` (loads a labeling message).

## Avoid

```typescript
// Blocking when you don't need to
pi.registerCommand("init", {
  handler: async (args, ctx) => {
    // ❌ Blocking select — user must answer NOW
    const framework = await ctx.ui.select("Choose framework", ["react", "vue", "svelte"]);
    // user is now stuck in a modal before they've even seen the options explained
    pi.sendUserMessage(`Set up a ${framework} project`);
  },
});
```

```typescript
// Silently replacing user's editor content mid-conversation
pi.on("tool_result", async (event, ctx) => {
  // ❌ Overwrites whatever the user was typing, with no notice
  ctx.ui.setEditorText("Now run the tests");
});
```

## Prefer

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // ✅ Prefill a command for user to review, not a silent override
  pi.registerCommand("plan", {
    description: "Load a planning prompt into the editor",
    handler: async (args, ctx) => {
      const topic = args.trim() || "the current task";
      // Construct the message the user will likely want to send
      const prompt =
        `Analyze the codebase and create a detailed implementation plan for: ${topic}.\n` +
        `Include: affected files, step-by-step tasks, risks, and acceptance criteria.`;

      ctx.ui.setEditorText(prompt);
      // ✅ Always notify so the user knows why their editor changed
      ctx.ui.notify("Planning prompt loaded — edit if needed, then submit.", "info");
    },
  });

  // ✅ First-message intake: capture intent, propose command
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };
    if (event.text.trim().startsWith("/")) return { action: "continue" };

    // Only on the very first message
    if (alreadyRouted) return { action: "continue" };
    alreadyRouted = true;

    const intent = event.text.replace(/\s+/g, " ").trim().slice(0, 1200);
    // Quote arg so the command parses correctly even with special chars
    const command = `/init-project ${JSON.stringify(intent)}`;

    ctx.ui.setEditorText(command);
    ctx.ui.notify(
      "Intent captured. Review/edit the proposed command, then submit.",
      "info",
    );

    return { action: "handled" };
  });
}

let alreadyRouted = false;
```

**Good reasons to use `setEditorText()`:**
- Extension captured the user's raw intent and can formulate a structured command
- A command just ran and the logical next step is another known command
- A `/snapshot` or `/explore` command loads a reusable prompt template
- You want to propose a follow-up action after a tool finishes

**When NOT to use it:**
- When you don't have enough context to make a useful guess (leave the editor empty)
- When the user is mid-conversation and changing the editor would discard their draft
- As a replacement for `ctx.ui.select` when the options are genuinely unknown to the extension — let the LLM ask instead
- During tool execution inside the agent loop — the user won't see the editor while the agent is running

**Always pair with `ctx.ui.notify()`**: tell the user why the editor changed. A silent prefill feels like a bug.
