# pi UI Surfaces — Complete API Reference

## setFooter — full custom footer

Replaces the default footer. Once set, `setStatus` values from other extensions
are **not** shown (the default footer is gone). Use `footerData.getExtensionStatuses()` if you want to aggregate them yourself.

```typescript
ctx.ui.setFooter(factory);   // set
ctx.ui.setFooter(undefined); // restore default
```

**Factory signature:**
```typescript
type FooterFactory = (
  tui: { requestRender(): void },
  theme: Theme,
  footerData: {
    getGitBranch(): string | null;
    getExtensionStatuses(): ReadonlyMap<string, string>;
    onBranchChange(cb: () => void): () => void;  // returns unsubscribe fn
  }
) => {
  dispose(): void;     // cleanup (timers, subscriptions)
  invalidate(): void;  // called on theme change
  render(width: number): string[];
}
```

**Best practices:**
- Call `footerData.onBranchChange(() => tui.requestRender())` to update on new messages
- Return 1–2 lines max (anything more hides content above)
- Always `truncateToWidth` each returned line
- Clear timers and unsubscribe in `dispose()`

---

## setStatus — keyed status text in default footer

Shows a named block inside the **default** footer. Multiple extensions can each
own their key — they appear left-to-right in registration order.

```typescript
ctx.ui.setStatus("my-ext", "text to show");
ctx.ui.setStatus("my-ext", "");  // clear without removing the key
```

Status text should be a single line with ANSI styling. Updates are reflected
immediately on the next frame.

**Typical lifecycle:**

```typescript
pi.on("session_start", async (_event, ctx) => {
  ctx.ui.setStatus("my-ext", ctx.ui.theme.fg("dim", "ready"));
});
pi.on("turn_start", async (_event, ctx) => {
  ctx.ui.setStatus("my-ext", ctx.ui.theme.fg("accent", "● thinking"));
});
pi.on("turn_end", async (_event, ctx) => {
  ctx.ui.setStatus("my-ext", ctx.ui.theme.fg("success", "✓ done"));
});
```

---

## setWidget — multi-line panel above editor

Displays `string[]` above the editor input. Lines are not width-capped by the
API — you must ensure they fit.

```typescript
ctx.ui.setWidget("my-ext", ["Line 1", "Line 2"]); // show
ctx.ui.setWidget("my-ext", null);                  // remove
```

Widget is rendered every frame — for expensive widgets, cache the rendered
lines and only recompute when underlying data changes.

**Tabbed widget example** (provider quota bars, token breakdown by source):
- Track which tab is selected in extension state
- Handle `ctrl+tab` via `registerShortcut` to cycle
- Call `ctx.ui.setWidget(...)` with new lines after state change

---

## ctx.ui.custom — full-screen or overlay component

Takes over the TUI with an arbitrary `Component`. Can be used as:
- **Full takeover** (default): replaces all other UI until done
- **Overlay**: renders on top of existing content

```typescript
// Full-screen async dialog
const answer = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => {
    return new MyDialog({ onClose: done });
  }
);

// Overlay (positioned panel)
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new SidePanel(done),
  {
    overlay: true,
    overlayOptions: {
      anchor: "right-center",
      width: "40%",
      minWidth: 40,
      visible: (w) => w >= 100,
    },
  }
);
```

For non-blocking overlays (e.g. live widget panels), use the `onHandle` option:
```typescript
let panelHandle: { setHidden(v: boolean): void; hide(): void } | undefined;

ctx.ui.custom(
  (tui, theme, keybindings, done) => new LivePanel(),
  {
    overlay: true,
    onHandle: (h) => { panelHandle = h; },
  }
);
// later:
panelHandle?.setHidden(true);
panelHandle?.hide(); // permanently remove
```

---

## ctx.ui.notify — transient toast messages

Shows a notification that auto-dismisses. Not a surface per se, but the right
tool for one-liners that don't need a component.

```typescript
ctx.ui.notify("Done!", "success");  // levels: "info" | "success" | "warning" | "error"
```

---

## ctx.ui.setEditorText — pre-fill editor

Pre-fills the user's input editor with text. Useful after processing (e.g. load
extracted Q&A into editor for the user to fill in).

```typescript
ctx.ui.setEditorText("Q: What language?\nA: ");
```

---

## ctx.getContextUsage — read context window state

```typescript
const usage = ctx.getContextUsage();
// null if no model or no usage data yet
// { tokens: number, total: number, percent: number }
```

Use `percent` to colour a context bar: success < 70, warning 70–90, error ≥ 90.

---

## Choosing a surface

```
What do you want to show?
├── Persistent one-line status alongside model/tokens?
│   └── setStatus (stays in default footer, automatic)
├── Replace the entire footer with your own layout?
│   └── setFooter (you own git branch / extension statuses yourself)
├── Multi-line live panel above editor?
│   └── setWidget
├── One-shot dismissable message?
│   └── ctx.ui.notify
└── Interactive dialog, progress loader, picker, or game?
    └── ctx.ui.custom (with overlay:true for side panels)
```
