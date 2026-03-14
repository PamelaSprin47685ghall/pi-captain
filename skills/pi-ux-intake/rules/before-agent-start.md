# Use before_agent_start to inject per-turn context based on collected user state

`before_agent_start` fires after the user submits a message, before the LLM sees it. It can inject a persistent custom message into the session and/or augment the system prompt for that turn. Use it to deliver context the LLM needs — the user's selected mode, active preset, collected intent — without requiring the user to re-state it every turn.

Sources: `ask-mode` (injects `[ASK MODE ACTIVE]` block), `system-select.ts` (injects active agent body), `preset.ts` (appends instructions), `startup-intake-router.ts` (has no injection but state shape is the model).

## Avoid

```typescript
// Injecting unconditionally — always fires, adds tokens even when not needed
pi.on("before_agent_start", async (event) => {
  return {
    systemPrompt: event.systemPrompt + "\n\nUser prefers concise answers.",
    // ❌ Always injected, even when user hasn't opted into anything
  };
});
```

```typescript
// Injecting a message that re-states the system prompt — redundant
pi.on("before_agent_start", async (event) => {
  if (activeMode) {
    return {
      message: {
        customType: "mode-context",
        content: event.systemPrompt + "\n\n[MODE: " + activeMode + "]",  // ❌ duplicates system prompt
        display: true,
      },
    };
  }
});
```

## Prefer

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface ActiveMode {
  name: string;
  systemPromptAddition: string;
  tools?: string[];
}

export default function (pi: ExtensionAPI) {
  let activeMode: ActiveMode | null = null;
  let defaultTools: string[] = [];

  pi.on("session_start", async (_e, ctx) => {
    defaultTools = pi.getActiveTools();

    // ✅ Let user pick a mode at session start
    if (!ctx.hasUI) return;
    const choice = await ctx.ui.select("Choose working mode", [
      "default — full access",
      "plan — read-only, strategic thinking",
      "review — read-only, code quality focus",
    ]);

    if (!choice || choice.startsWith("default")) {
      activeMode = null;
      return;
    }

    if (choice.startsWith("plan")) {
      activeMode = {
        name: "plan",
        systemPromptAddition:
          "You are in PLANNING MODE. Read files thoroughly, ask clarifying questions, " +
          "do NOT make any changes. Produce a numbered implementation plan.",
        tools: ["read", "bash", "grep", "find", "ls"],
      };
    } else if (choice.startsWith("review")) {
      activeMode = {
        name: "review",
        systemPromptAddition:
          "You are in CODE REVIEW MODE. Read files thoroughly, identify issues, " +
          "suggest improvements, do NOT make any changes.",
        tools: ["read", "bash", "grep", "find", "ls"],
      };
    }

    if (activeMode?.tools) pi.setActiveTools(activeMode.tools);
    ctx.ui.setStatus("mode", ctx.ui.theme.fg("warning", `⚙ ${activeMode?.name ?? "default"}`));
    ctx.ui.notify(`Mode activated: ${activeMode?.name}`, "info");
  });

  // ✅ Inject only when a mode is active; use systemPrompt not message for persistent guidance
  pi.on("before_agent_start", async (event) => {
    if (!activeMode) return;  // ✅ Guard: don't inject when not needed
    return {
      systemPrompt: event.systemPrompt + "\n\n" + activeMode.systemPromptAddition,
      // ✅ Use message injection only for per-turn dynamic data (e.g., current file, current task)
      // message: { customType: "mode-ctx", content: "...", display: false },
    };
  });

  // ✅ /mode command: switch mid-session
  pi.registerCommand("mode", {
    description: "Switch working mode (plan / review / default)",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (name === "default" || name === "") {
        activeMode = null;
        pi.setActiveTools(defaultTools);
        ctx.ui.setStatus("mode", undefined);
        ctx.ui.notify("Mode reset to default", "info");
        return;
      }
      // ... same logic as session_start selection
    },
  });
}
```

**systemPrompt vs. message injection:**

| | `systemPrompt` | `message` |
|---|---|---|
| Stored in session | No (per-turn only) | Yes (persisted) |
| Visible in TUI | No | If `display: true` |
| Best for | Persistent behavioural rules, mode instructions | Dynamic per-turn context (active task, current file) |
| Chaining | Each extension receives previous result, can append | Multiple extensions each return one message |

**Filtering stale injected messages**: if you inject a `message` (stored in session), filter it out of the context when the mode is no longer active:

```typescript
pi.on("context", async (event) => {
  if (activeMode) return;  // Mode active — keep injected messages
  return {
    messages: event.messages.filter((m: any) => m.customType !== "mode-context"),
  };
});
```
