# Every rendered line must fit within the supplied width

The TUI passes `width` (terminal columns) to `render(width)`. Lines that exceed
this cause visual artefacts, wrapping glitches, or outright TUI crashes.
`String.length` is wrong for ANSI sequences — use `visibleWidth`.

## Avoid

```typescript
// Bad: no truncation
render(width: number): string[] {
  return [`${left}  ${right}`];  // may overflow on narrow terminals
}

// Bad: measuring with .length (ANSI escape chars inflate the count)
const padCount = width - left.length - right.length;

// Bad: forgetting to guard against negative pad counts
const pad = " ".repeat(width - visibleWidth(left) - visibleWidth(right)); // crashes if negative
```

## Prefer

```typescript
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

render(width: number): string[] {
  const left  = buildLeft(theme);
  const right = buildRight(theme);

  // Guard pad to at least 1 space (never negative)
  const gap = width - visibleWidth(left) - visibleWidth(right);
  const pad = " ".repeat(Math.max(1, gap));

  // Always clamp the final line
  return [truncateToWidth(left + pad + right, width)];
}
```

## Wrapping multi-line text with ANSI styles

ANSI styles do NOT carry across line boundaries. For wrapped prose, use
`wrapTextWithAnsi` which re-applies open styles on each wrapped line:

```typescript
import { wrapTextWithAnsi } from "@mariozechner/pi-tui";

render(width: number): string[] {
  const styled = theme.fg("dim", longDescription);
  return wrapTextWithAnsi(styled, width);
}
```

## Minimum width guards for responsive UI

For optional sections, measure whether they fit before including them:

```typescript
render(width: number): string[] {
  const base = theme.fg("accent", model?.id ?? "—");
  const extra = theme.fg("dim", ` | ${branch}`);
  const line = visibleWidth(base) + visibleWidth(extra) <= width
    ? base + extra
    : base;
  return [truncateToWidth(line, width)];
}
```

Or use `overlayOptions.visible` to hide entire overlays on narrow terminals:
```typescript
visible: (termWidth) => termWidth >= 80
```
