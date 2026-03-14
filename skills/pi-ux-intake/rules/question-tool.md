# Register a question tool and let the LLM drive structured clarification

When the information needed depends on context only the LLM understands, register a `question` or `questionnaire` tool and instruct the LLM (via `before_agent_start` or system prompt) to call it when the task is ambiguous. The tool blocks via `ctx.ui.custom()` until the user responds, then returns answers as tool result text that the LLM uses to continue.

This is the pattern used by `hintjen-pi-extensions/explore.ts` (the `/explore` command with `question` + `questionnaire` tools) and the official pi examples `question.ts` / `questionnaire.ts`.

## Avoid

```typescript
// Asking via system prompt text — LLM may ignore it or ask verbally instead of via tool
pi.on("before_agent_start", async (event) => {
  return {
    systemPrompt: event.systemPrompt + "\n\nAlways ask the user for clarification before starting.",
    // ❌ No tool registered — "ask the user" means the LLM writes text, not an interactive UI
  };
});
```

```typescript
// Trying to call ctx.ui.custom() outside a tool execute() — timing is wrong
pi.on("agent_start", async (_event, ctx) => {
  // ❌ Agent just started, UI is mid-render — custom() here is unreliable
  const result = await ctx.ui.custom(...);
});
```

## Prefer

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const OptionSchema = Type.Object({
  label: Type.String({ description: "Display label" }),
  description: Type.Optional(Type.String({ description: "Extra context shown below label" })),
});

export default function (pi: ExtensionAPI) {
  // ✅ Register the tool first
  pi.registerTool({
    name: "question",
    label: "Question",
    description:
      "Ask the user a question with selectable options. Call this whenever the task is ambiguous " +
      "and you need user input before proceeding. Always provide 2–5 concrete options; " +
      "the user can also type a custom answer. Do NOT write the question as text — call this tool.",
    parameters: Type.Object({
      question: Type.String({ description: "The question to ask" }),
      options: Type.Array(OptionSchema, { description: "Options for the user to choose from" }),
    }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      // ✅ Always guard hasUI
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: `Cannot ask "${params.question}" in non-interactive mode. Proceed with best judgement.` }],
          details: { question: params.question, answer: null },
        };
      }
      if (params.options.length === 0) {
        return { content: [{ type: "text", text: "No options provided." }], details: {} };
      }

      const allOptions = [...params.options, { label: "Type something.", isOther: true as const }];

      const result = await ctx.ui.custom<{ answer: string; wasCustom: boolean } | null>(
        (tui, theme, _kb, done) => {
          let selectedIdx = 0;
          let editMode = false;
          let cachedLines: string[] | undefined;

          const editorTheme: EditorTheme = {
            borderColor: (s) => theme.fg("accent", s),
            selectList: {
              selectedPrefix: (t) => theme.fg("accent", t),
              selectedText: (t) => theme.fg("accent", t),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            },
          };
          const editor = new Editor(tui, editorTheme);
          editor.onSubmit = (val) => {
            const trimmed = val.trim();
            if (trimmed) done({ answer: trimmed, wasCustom: true });
            else { editMode = false; editor.setText(""); cachedLines = undefined; tui.requestRender(); }
          };

          return {
            render(width: number) {
              if (cachedLines) return cachedLines;
              const lines: string[] = [];
              const add = (s: string) => lines.push(truncateToWidth(s, width));
              add(theme.fg("accent", "─".repeat(width)));
              add(theme.fg("text", ` ${params.question}`));
              lines.push("");
              for (let i = 0; i < allOptions.length; i++) {
                const opt = allOptions[i];
                const sel = i === selectedIdx;
                const prefix = sel ? theme.fg("accent", "> ") : "  ";
                add(prefix + theme.fg(sel ? "accent" : "text", `${i + 1}. ${opt.label}`));
                if ("description" in opt && opt.description) {
                  add(`     ${theme.fg("muted", opt.description)}`);
                }
              }
              if (editMode) {
                lines.push("");
                add(theme.fg("muted", " Your answer:"));
                for (const l of editor.render(width - 2)) add(` ${l}`);
                lines.push("");
                add(theme.fg("dim", " Enter to submit • Esc to go back"));
              } else {
                lines.push("");
                add(theme.fg("dim", " ↑↓ navigate • Enter select • Esc cancel"));
              }
              add(theme.fg("accent", "─".repeat(width)));
              cachedLines = lines;
              return lines;
            },
            invalidate() { cachedLines = undefined; },
            handleInput(data: string) {
              if (editMode) {
                if (matchesKey(data, Key.escape)) { editMode = false; editor.setText(""); cachedLines = undefined; tui.requestRender(); return; }
                editor.handleInput(data); cachedLines = undefined; tui.requestRender(); return;
              }
              if (matchesKey(data, Key.up)) { selectedIdx = Math.max(0, selectedIdx - 1); cachedLines = undefined; tui.requestRender(); return; }
              if (matchesKey(data, Key.down)) { selectedIdx = Math.min(allOptions.length - 1, selectedIdx + 1); cachedLines = undefined; tui.requestRender(); return; }
              if (matchesKey(data, Key.enter)) {
                const opt = allOptions[selectedIdx];
                if ("isOther" in opt && opt.isOther) { editMode = true; cachedLines = undefined; tui.requestRender(); return; }
                done({ answer: opt.label, wasCustom: false });
                return;
              }
              if (matchesKey(data, Key.escape)) done(null);
            },
          };
        },
      );

      if (!result) {
        return { content: [{ type: "text", text: "User cancelled." }], details: { question: params.question, answer: null } };
      }
      const prefix = result.wasCustom ? "User wrote: " : "User selected: ";
      return { content: [{ type: "text", text: `${prefix}${result.answer}` }], details: { question: params.question, answer: result.answer, wasCustom: result.wasCustom } };
    },

    renderResult(result, _opts, theme) {
      const d = result.details as any;
      if (!d?.answer) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      return new Text(theme.fg("success", "✓ ") + theme.fg("accent", d.answer), 0, 0);
    },
  });

  // ✅ Instruct LLM to use the tool — not ask verbally
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt +
      "\n\nWhen the user's request is ambiguous, call the `question` tool to clarify. " +
      "Do NOT write clarifying questions as text — always use the tool so the user gets an interactive selector.",
  }));

  // ✅ /explore command: load prompt that triggers LLM to start questioning
  pi.registerCommand("explore", {
    description: "Start a structured exploration — LLM will ask questions to understand your goals",
    handler: async (args, ctx) => {
      const topic = args.trim() || "the feature being designed";
      ctx.ui.setEditorText(
        `Explore the design space for: ${topic}. ` +
        `Use the question tool to ask me 2-3 clarifying questions, starting broad. ` +
        `After each round of answers, summarize what you learned and identify gaps.`
      );
      ctx.ui.notify("Exploration prompt ready — submit to begin.", "info");
    },
  });
}
```

**Key decisions:**
- Use `question` (single) for one clarification; `questionnaire` (tabbed) for 3+ related questions at once
- Always include a "Type something." option — users often have answers outside your option list
- Return cancellation gracefully: `"User cancelled — proceed with best judgement."` lets the LLM continue
- The `before_agent_start` instruction is needed so the LLM actually calls the tool instead of asking verbally
