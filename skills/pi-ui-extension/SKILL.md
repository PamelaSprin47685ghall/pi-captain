---
name: pi-ui-extension
description: >
  Build, improve, and debug pi coding agent UI extensions — TypeScript modules
  that add or customise visual elements in the pi TUI. Use when: (1) Building a
  custom footer that shows tokens, cost, git branch, or context bar; (2) Adding
  a live widget above the editor for tool counts, turn stats, or quota bars;
  (3) Setting themed status text that updates during agent runs; (4) Creating
  interactive TUI overlays (Q&A, model pickers, progress dialogs) with
  ctx.ui.custom(); (5) Displaying streaming progress with BorderedLoader or
  CancellableLoader; (6) Wiring re-renders correctly with tui.requestRender(),
  onBranchChange, or setInterval; (7) Applying semantic theme colours so the UI
  respects the user's active theme; (8) Debugging blank/clipped output from
  failing width constraints; (9) Combining multiple UI surfaces in one extension;
  or any other pi UI styling or interaction work.
---

# pi UI Extension

## The 4 UI Surfaces

Every visual extension chooses from four non-exclusive surfaces:

| Surface | API | Lines | Best for |
|---------|-----|-------|---------|
| **Footer** | `ctx.ui.setFooter(factory)` | 1–2 | Persistent status bar at bottom (replaces default) |
| **Status** | `ctx.ui.setStatus(key, text)` | 1 | Short keyed text blocks embedded in the default footer |
| **Widget** | `ctx.ui.setWidget(key, lines[])` | N | Multi-line live panel above the editor |
| **Custom** | `ctx.ui.custom(factory, opts)` | full-screen | Interactive dialogs, overlays, loaders |

Never mix `setFooter` with `setStatus` — a custom footer replaces the default footer entirely (status texts won't appear).

## Core Rendering Contract

`render(width)` **must** return `string[]` where every entry is ≤ `width` visible columns:

```typescript
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

render(width: number): string[] {
  const left  = theme.fg("accent", model?.id ?? "—");
  const right = theme.fg("dim", branch ?? "");
  const gap   = width - visibleWidth(left) - visibleWidth(right);
  const pad   = " ".repeat(Math.max(1, gap));
  return [truncateToWidth(left + pad + right, width)];  // ← always clamp
}
```

Violating the width contract causes garbled output or TUI crashes. `truncateToWidth` accounts for ANSI escape sequences; `visibleWidth` measures printable-character width.

## Theme Colour Tokens

Use semantic tokens — never hardcode ANSI codes:

```typescript
theme.fg("accent", text)    // model names, highlights
theme.fg("dim", text)       // secondary info, separators
theme.fg("muted", text)     // de-emphasised stats
theme.fg("success", text)   // ✓, OK states, low context usage
theme.fg("warning", text)   // caution, 70–89 % context
theme.fg("error", text)     // failures, ≥ 90 % context
theme.bold(text)             // emphasis
```

The `theme` object is always passed into footer factories, `ctx.ui.custom()` callbacks, and `renderCall`/`renderResult` renderers. Never import a colour library directly.

## Footer Skeleton

```typescript
pi.on("session_start", async (_event, ctx) => {
  ctx.ui.setFooter((tui, theme, footerData) => {
    // 1. Subscribe to branch changes for reactive re-renders
    const unsub = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose: unsub,          // called when footer is replaced or session ends
      invalidate() {},         // called on theme change — clear cached data here
      render(width: number): string[] {
        // build left / right sections, pad between them
        const left  = theme.fg("dim", "left content");
        const right = theme.fg("dim", "right content");
        const pad   = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
        return [truncateToWidth(left + pad + right, width)];
      },
    };
  });
});
```

`footerData` gives access to two things not exposed elsewhere:
- `footerData.getGitBranch()` → current git branch string (or `null`)
- `footerData.getExtensionStatuses()` → `ReadonlyMap<string, string>` of all `setStatus` values

## Status & Widget (Simple)

```typescript
pi.on("turn_start", async (_event, ctx) => {
  const t = ctx.ui.theme;
  ctx.ui.setStatus("my-ext", t.fg("accent", "●") + t.fg("dim", " thinking…"));
});

pi.on("turn_end", async (_event, ctx) => {
  ctx.ui.setStatus("my-ext", ctx.ui.theme.fg("success", "✓ done"));
});

// Multi-line widget above editor
ctx.ui.setWidget("my-ext", ["Line 1", "Line 2"]);
ctx.ui.setWidget("my-ext", null); // clear
```

## Interactive Loaders

Use `BorderedLoader` (from `@mariozechner/pi-coding-agent`) for blocking work with a cancel button:

```typescript
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

const result = await ctx.ui.custom<string | null>((tui, theme, done) => {
  const loader = new BorderedLoader(tui, theme, "Loading…");
  loader.onAbort = () => done(null);

  doWorkAsync()
    .then(done)
    .catch(() => done(null));

  return loader;
});
```

## Reactive Re-render Patterns

```
Re-render trigger           When to use
────────────────────────────────────────────────
tui.requestRender()         Sync trigger after state change
footerData.onBranchChange() On every new session message (tokens changed, etc.)
setInterval(fn, ms)         Polling — elapsed timers, live clocks (store handle, clear in dispose)
pi.on("turn_start/end")     Event-driven widget updates
```

Always clear timers in `dispose()` to avoid ghost intervals across `/new` sessions.

## Context Usage Bar

```typescript
const usage = ctx.getContextUsage();   // { tokens, total, percent } | null
const pct   = usage ? Math.round(usage.percent) : 0;
const filled = Math.round((pct / 100) * 10);
const bar    = theme.fg(pct >= 90 ? "error" : pct >= 70 ? "warning" : "success",
                 "█".repeat(filled)) +
               theme.fg("dim", "░".repeat(10 - filled));
```

## Reference Files

- `references/ui-surfaces.md` — Full API for footer, status, widget, custom, overlay
- `references/tui-components.md` — Built-in TUI components (Text, Box, Container, Markdown, Image, Input)
- `rules/footer-layout.md` — left/right padding patterns and common footer sections
- `rules/theme-colors.md` — how to use semantic tokens; avoid hardcoded colours
- `rules/rendering-contract.md` — width contract, truncation, ANSI-safe helpers
- `rules/reactive-updates.md` — when and how to trigger re-renders; avoid ghost timers
- `rules/overlay-patterns.md` — overlay positioning, lifecycle, Focusable for IME support
