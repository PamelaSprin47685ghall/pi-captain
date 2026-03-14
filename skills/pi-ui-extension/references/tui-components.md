# Built-in TUI Components

Import from `@mariozechner/pi-tui`.

```typescript
import {
  Text, Box, Container, Spacer, Markdown,
  Input, matchesKey, truncateToWidth, visibleWidth,
  wrapTextWithAnsi, CURSOR_MARKER,
  type Component, type Focusable, type TUI
} from "@mariozechner/pi-tui";
```

---

## Component interface

All components implement:

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;  // clear caches on theme change
}
```

`render` must return strings where each entry ≤ `width` columns (ANSI included).
The TUI appends a full SGR reset after each line — styles do NOT carry across lines.

---

## Text

Multi-line text with word wrapping.

```typescript
const text = new Text(
  "Hello world",  // content
  1,              // paddingX (default 1)
  1,              // paddingY (default 1)
  (s) => bgGray(s)  // optional background function
);
text.setText("Updated content");
```

---

## Box

Container with padding and optional background.

```typescript
const box = new Box(
  1,               // paddingX
  0,               // paddingY
  (s) => bgBlue(s) // background function
);
box.addChild(new Text("Content", 0, 0));
box.setBgFn((s) => bgGreen(s));
```

---

## Container

Groups children vertically (stack layout).

```typescript
const container = new Container();
container.addChild(header);
container.addChild(new Spacer(1));
container.addChild(body);
container.removeChild(header);
```

`Container` does not handle keyboard input itself — the root component must forward input to the correct child.

---

## Spacer

Inserts empty vertical lines.

```typescript
const spacer = new Spacer(2);  // 2 blank lines
```

---

## Markdown

Renders markdown with syntax highlighting.

```typescript
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";

const md = new Markdown(
  "# Title\n\nSome **bold** text\n```ts\nconst x = 1;\n```",
  1,   // paddingX
  1,   // paddingY
  getMarkdownTheme(theme)  // MarkdownTheme
);
md.setText("# New content");
```

---

## Input (single-line text field)

Handles typing, cursor movement, paste, and IME.

```typescript
import { Input } from "@mariozechner/pi-tui";

const input = new Input();
input.placeholder = "Search…";
input.focused = true;  // show cursor

// In parent handleInput:
input.handleInput(data);

// Read value:
const value = input.value;
```

---

## Focusable — IME cursor positioning

Implement `Focusable` when your component displays a text cursor, so the hardware
cursor (and IME candidate windows) follow the on-screen position.

```typescript
import { CURSOR_MARKER, type Focusable } from "@mariozechner/pi-tui";

class MyInput implements Component, Focusable {
  focused = false;

  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    // Emit marker immediately before the cursor character
    return [`> ${before}${marker}\x1b[7m${atCursor}\x1b[27m${after}`];
  }
  // …
}
```

When a container embeds an `Input`, propagate `focused` to the child:

```typescript
class Dialog extends Container implements Focusable {
  private field = new Input();
  get focused() { return this._f; }
  set focused(v: boolean) { this._f = v; this.field.focused = v; }
  private _f = false;
}
```

---

## matchesKey — keyboard shortcut helper

```typescript
import { matchesKey } from "@mariozechner/pi-tui";

handleInput(data: string) {
  if (matchesKey(data, "escape"))    { /* close */ }
  if (matchesKey(data, "enter"))     { /* confirm */ }
  if (matchesKey(data, "tab"))       { /* next tab */ }
  if (matchesKey(data, "ctrl+c"))    { /* abort */ }
  if (matchesKey(data, "arrowup"))   { /* move up */ }
  if (matchesKey(data, "arrowdown")) { /* move down */ }
}
```

---

## ANSI-safe string helpers

```typescript
truncateToWidth(str, width)     // cut str so visibleWidth ≤ width
visibleWidth(str)               // printable column width (excludes ANSI)
wrapTextWithAnsi(str, width)    // word-wrap, re-applying ANSI styles per line
```

---

## DynamicBorder (from pi-coding-agent)

Animated border for panels — used in the usage stats extension.

```typescript
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
```

## BorderedLoader / CancellableLoader (from pi-coding-agent)

Ready-made blocking loader with ESC-to-cancel:

```typescript
import { BorderedLoader, CancellableLoader } from "@mariozechner/pi-coding-agent";

// BorderedLoader: spinner + message + abort signal
const loader = new BorderedLoader(tui, theme, "Working…");
loader.onAbort = () => done(null);

// CancellableLoader: same but embedded in Container tree
```
