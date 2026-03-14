# Trigger re-renders from the right source and always clean up timers

Pi only re-renders TUI components when explicitly asked. Missing a trigger
leaves stale data on screen; leaking timers crash the next session.

## Avoid

```typescript
// Bad: footer that never re-renders after initial draw
ctx.ui.setFooter((tui, theme, footerData) => ({
  dispose() {},
  invalidate() {},
  render(width) { return [theme.fg("dim", getStats())]; },
  // ← no tui.requestRender() is ever called — stats never update
}));

// Bad: setInterval not cleared in dispose
ctx.ui.setFooter((tui, theme, footerData) => {
  setInterval(() => tui.requestRender(), 1000); // leaks across /new sessions
  return { dispose() {}, invalidate() {}, render(w) { return [""]; } };
});
```

## Prefer

```typescript
ctx.ui.setFooter((tui, theme, footerData) => {
  // 1. React to branch changes (new messages → token counts change)
  const unsub = footerData.onBranchChange(() => tui.requestRender());

  // 2. Live timer if needed — store handle and clear in dispose
  const timer = setInterval(() => tui.requestRender(), 500);

  return {
    dispose() {
      unsub();           // unsubscribe from branch changes
      clearInterval(timer);
    },
    invalidate() {
      // clear cached values that depend on theme colours
    },
    render(width) { /* … */ },
  };
});
```

## Re-render trigger cheat sheet

| Trigger | API | When to use |
|---------|-----|-------------|
| Branch changes | `footerData.onBranchChange(() => tui.requestRender())` | Any data derived from session messages |
| Event-driven | `pi.on("turn_start/end", …)` → `ctx.ui.setWidget(…)` | Widget that changes per-turn |
| Polling | `setInterval(() => tui.requestRender(), ms)` | Elapsed timers, live clocks, external state |
| Manual | `tui.requestRender()` inline after state mutation | State changed synchronously |

## Widget re-renders via events (simpler pattern)

For widgets that don't need sub-second polling, just update in event handlers:

```typescript
let turnCount = 0;

pi.on("turn_start", async (_event, ctx) => {
  turnCount++;
  ctx.ui.setWidget("my-ext", [
    ctx.ui.theme.fg("accent", `Turn ${turnCount} in progress…`),
  ]);
});

pi.on("turn_end", async (_event, ctx) => {
  ctx.ui.setWidget("my-ext", [
    ctx.ui.theme.fg("success", `✓ Turn ${turnCount} complete`),
  ]);
});
```

## Resetting across sessions

Use `session_switch` with `event.reason === "new"` to reset counters and clear widgets:

```typescript
pi.on("session_switch", async (event, ctx) => {
  if (event.reason === "new") {
    turnCount = 0;
    ctx.ui.setWidget("my-ext", null); // clear widget
  }
});
```
