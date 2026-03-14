# Create overlays as fresh instances and implement Focusable for text input

Overlays are disposed when closed — stale references crash on re-use. Text
input overlays must implement `Focusable` so the hardware cursor (and IME
candidate windows) appear in the right position.

## Avoid

```typescript
// Bad: reusing a disposed component
let menu: MyMenu;
await ctx.ui.custom((_, __, ___, done) => {
  menu = new MyMenu(done);
  return menu;
}, { overlay: true });
setActive(menu);  // ← already disposed, crashes

// Bad: Container with Input child, no Focusable propagation
class SearchBox extends Container {
  private input = new Input();
  // ← input.focused is never set → IME shows in wrong position
}
```

## Prefer

```typescript
// Good: re-call the factory to re-show
const showMenu = () =>
  ctx.ui.custom((_, __, ___, done) => new MyMenu(done), { overlay: true });
await showMenu();
// "Back" = just call again
await showMenu();

// Good: Focusable propagation for text input overlays
import { Container, Input, type Focusable } from "@mariozechner/pi-tui";

class SearchDialog extends Container implements Focusable {
  private searchInput: Input;

  // Propagate focus to child so IME cursor is positioned correctly
  private _focused = false;
  get focused() { return this._focused; }
  set focused(v: boolean) {
    this._focused = v;
    this.searchInput.focused = v;
  }

  constructor(onDone: (result: string | null) => void) {
    super();
    this.searchInput = new Input();
    this.addChild(this.searchInput);
  }

  handleInput(data: string) {
    if (data === "\r") {
      // enter
    } else if (data === "\x1b") {
      // escape — close
    } else {
      this.searchInput.handleInput(data);
    }
  }
}
```

## Overlay positioning options

```typescript
await ctx.ui.custom(
  (tui, theme, keybindings, done) => new MyPanel(done),
  {
    overlay: true,
    overlayOptions: {
      width: "50%",
      minWidth: 40,
      maxHeight: "80%",
      anchor: "right-center",    // 9 anchors: center, top-left, top-center, top-right, etc.
      offsetX: -2,
      offsetY: 0,
      margin: 2,                 // or { top, right, bottom, left }
      visible: (w, h) => w >= 80,  // hide on narrow terminals
    },
  }
);
```

## Blocking loader pattern (BorderedLoader)

For async work where the user must wait:

```typescript
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

const result = await ctx.ui.custom<string | null>((tui, theme, done) => {
  const loader = new BorderedLoader(tui, theme, "Fetching data…");
  loader.onAbort = () => done(null);   // ESC / Ctrl-C cancels

  fetchDataAsync(loader.signal)
    .then((data) => done(data))
    .catch(() => done(null));

  return loader;
});

if (result === null) {
  ctx.ui.notify("Cancelled", "info");
  return;
}
// use result
```

## Notify vs custom

Prefer `ctx.ui.notify(msg, level)` for one-liners that auto-dismiss. Use
`ctx.ui.custom()` only when you need keyboard interaction, multi-line layout,
or a persistent panel. Mixing both is fine — notify after a custom dialog closes.
