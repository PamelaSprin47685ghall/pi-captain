# Use the input event only for early routing, transforms, and first-message intake

The `input` event is the earliest hook in the pipeline — it fires before the LLM sees the message, before skill expansion, before any tool is offered. This makes it powerful but also dangerous: misuse silently swallows messages or creates infinite loops. The two legitimate uses are: (1) routing a special first message to a command, and (2) applying global text transforms (shorthand prefixes).

## Avoid

```typescript
// Infinite loop: extension injects a message, input fires again, loop
pi.on("input", async (event, ctx) => {
  // ❌ No source guard — will re-process extension-injected messages
  if (event.text.startsWith("?")) {
    pi.sendUserMessage(event.text.replace("?", "QUESTION: "));
    return { action: "handled" };
  }
  return { action: "continue" };
});
```

```typescript
// Over-intercepting: routing ALL messages, user can never talk to the LLM
pi.on("input", async (event, ctx) => {
  // ❌ Always handled — LLM never sees messages
  doSomething(event.text);
  return { action: "handled" };
});
```

## Prefer

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let firstMessageSeen = false;

  // Reconstruct on session resume/fork
  pi.on("session_start",  async (_e, ctx) => { firstMessageSeen = hasPriorMessages(ctx); });
  pi.on("session_switch", async (_e, ctx) => { firstMessageSeen = hasPriorMessages(ctx); });
  pi.on("session_fork",   async (_e, ctx) => { firstMessageSeen = hasPriorMessages(ctx); });

  pi.on("input", async (event, ctx) => {
    // ✅ Always skip extension-injected messages to prevent loops
    if (event.source === "extension") return { action: "continue" };

    // ✅ Skip commands (start with "/") — don't interfere with other extensions
    if (event.text.trim().startsWith("/")) return { action: "continue" };

    // Pattern 1: First-message routing
    if (!firstMessageSeen) {
      firstMessageSeen = true;
      const intent = event.text.trim();

      // Propose a well-formed command for the user to review
      ctx.ui.setEditorText(`/plan "${intent}"`);
      ctx.ui.notify("Review the proposed command, edit if needed, then submit.", "info");

      return { action: "handled" };   // consume — don't send to LLM
    }

    // Pattern 2: Global shorthands (transform only)
    if (event.text.startsWith("?brief ")) {
      const query = event.text.slice(7).trim();
      return { action: "transform", text: `Respond in one sentence: ${query}` };
    }

    return { action: "continue" };
  });
}

function hasPriorMessages(ctx: any): boolean {
  return ctx.sessionManager.getBranch().some(
    (e: any) => e.type === "message" && e.message?.role === "user"
  );
}
```

**Return shapes:**
- `{ action: "continue" }` — pass through unchanged (always safe default)
- `{ action: "handled" }` — consume entirely; no LLM turn fires
- `{ action: "transform", text: "..." }` — replace text before LLM sees it

**When to use each:**
- `handled` — first-message routing, instant commands (ping/pong), help shortcuts
- `transform` — global prefix shorthands, inject context into every message
- `continue` — everything else (the safe default)

**State across sessions**: the `firstMessageSeen` flag must be reconstructed on `session_switch`, `session_fork`, `session_tree` — otherwise resuming a session will re-trigger first-message routing even though the session already has messages.
