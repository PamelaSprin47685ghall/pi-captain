# Guard every ctx.ui blocking call with ctx.hasUI

`ctx.ui.confirm()`, `ctx.ui.select()`, and `ctx.ui.input()` are blocking UI primitives — they pause execution until the user responds. They throw or hang in non-interactive modes (`pi -p`, `pi --print`, SDK, RPC). Always check `ctx.hasUI` before calling them and provide a sensible fallback for headless contexts.

## Avoid

```typescript
// Crashes in non-interactive mode (pi -p, SDK, RPC)
pi.registerTool({
  name: "select_task",
  execute: async (_id, params, _signal, _onUpdate, ctx) => {
    // ❌ No hasUI check — throws in pi --print
    const ok = await ctx.ui.confirm("Confirm task", params.name);
    if (!ok) return { content: [{ type: "text", text: "Cancelled" }] };
    // ...
  },
});
```

```typescript
// Stacking two blocking prompts without explaining why
const ok = await ctx.ui.confirm("Are you sure?", "Confirm deletion");
const also = await ctx.ui.confirm("Really sure?", "This cannot be undone");
// User sees two identical modals with no context — confusing
```

## Prefer

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "select_task",
    label: "Select Task",
    description: "Select a task and optionally collect context from the user",
    parameters: Type.Object({
      name: Type.String({ description: "Task name to select" }),
    }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      // ✅ Always guard before any blocking UI call
      if (!ctx.hasUI) {
        // Headless fallback: proceed without asking
        return {
          content: [{ type: "text", text: `Selected task: ${params.name} (auto-confirmed in headless mode)` }],
          details: { name: params.name, confirmed: true, description: "" },
        };
      }

      // ✅ confirm: yes/no gate for a consequential action
      const ok = await ctx.ui.confirm(
        "Confirm task selection",
        `Selected task is "${params.name}". Proceed?`,
      );
      if (!ok) {
        return {
          content: [{ type: "text", text: "User declined task selection. Wait for user input." }],
          details: { name: params.name, confirmed: false },
        };
      }

      // ✅ input: free-text short answer (optional, with ?? "" fallback)
      const description =
        (await ctx.ui.input("Task context", "Add context for this task (optional):")) ?? "";

      // ✅ select: pick from a known list
      const mode = await ctx.ui.select("Implementation mode", [
        "plan-first",
        "code-now",
        "explore",
      ]);
      if (!mode) {
        return {
          content: [{ type: "text", text: "User cancelled mode selection." }],
          details: { name: params.name, confirmed: false },
        };
      }

      return {
        content: [{ type: "text", text: `Task selected: ${params.name} | mode: ${mode}` }],
        details: { name: params.name, confirmed: true, description, mode },
      };
    },
  });
}
```

**Primitive reference:**

| Method | Returns | When cancelled |
|---|---|---|
| `ctx.ui.confirm(title, message)` | `Promise<boolean>` | `false` |
| `ctx.ui.select(title, options[])` | `Promise<string \| undefined>` | `undefined` |
| `ctx.ui.input(title, placeholder?)` | `Promise<string \| undefined>` | `undefined` |

**Decision guide:**
- `confirm` — one irreversible action ("Delete this file?", "Run this command?")
- `select` — pick from a short (≤10) list of known strings ("plan / implement / review")
- `input` — free-text short answer where options can't be predicted ("Task description:", "Branch name:")
- `ctx.ui.custom()` — when you need option descriptions, tabs, inline editor, or cancel-back navigation (see `rules/question-tool.md`)

**Headless fallbacks:**
- `confirm`: auto-approve (most sensible for non-interactive use) or reject with an explanatory message
- `select`: use the first option, or return an error instructing the LLM to ask the user interactively
- `input`: use an empty string or a sensible default
