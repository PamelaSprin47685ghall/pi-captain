# Build footers with left/right sections separated by elastic padding

The footer is a single terminal-width string. Use `visibleWidth` to measure
ANSI-safe lengths, then fill the gap with spaces. Always `truncateToWidth` the
final string to prevent overflow.

## Avoid

```typescript
// Bad: string concat without width awareness
render(width: number): string[] {
  return [`${modelId}   ${branch}`];  // length unknown, may overflow or under-fill
}

// Bad: measuring with .length (breaks on ANSI sequences)
const pad = " ".repeat(width - left.length - right.length);
```

## Prefer

```typescript
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

render(width: number): string[] {
  const left  = [modelStr, statsStr, costStr].join(sep);
  const right = [branchStr, extStr].filter(Boolean).join(sep);
  const gap   = width - visibleWidth(left) - visibleWidth(right);
  const pad   = " ".repeat(Math.max(1, gap));   // at least 1 space
  return [truncateToWidth(left + pad + right, width)];
}
```

## Common footer sections and how to build them

**Model name:**
```typescript
const modelStr = theme.fg("accent", ctx.model?.id ?? "no model");
```

**Token stats (cumulative from branch):**
```typescript
import type { AssistantMessage } from "@mariozechner/pi-ai";
let input = 0, output = 0, cost = 0;
for (const e of ctx.sessionManager.getBranch()) {
  if (e.type === "message" && e.message.role === "assistant") {
    const m = e.message as AssistantMessage;
    input += m.usage.input;
    output += m.usage.output;
    cost += m.usage.cost.total;
  }
}
const fmt = (n: number) => n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
const statsStr = theme.fg("muted", `↑${fmt(input)} ↓${fmt(output)}`);
const costStr  = theme.fg("dim", `$${cost.toFixed(2)}`);
```

**Git branch (only accessible via footerData):**
```typescript
const branch   = footerData.getGitBranch();
const isDirty  = branch ? isGitDirty() : false;    // run git status --porcelain
const branchStr = branch
  ? theme.fg("dim", branch) + (isDirty ? theme.fg("warning", " *") : "")
  : "";
```

**Context bar (10-char):**
```typescript
const usage  = ctx.getContextUsage();
const pct    = usage ? Math.round(usage.percent) : 0;
const filled = Math.round((pct / 100) * 10);
const color  = pct >= 90 ? "error" : pct >= 70 ? "warning" : "success";
const bar    = theme.fg(color, "█".repeat(filled)) + theme.fg("dim", "░".repeat(10 - filled));
const label  = theme.fg(pct >= 90 ? "error" : "dim", `${pct}%`);
const ctxStr = `${bar} ${label}`;
```

**Separator:**
```typescript
const sep = theme.fg("dim", " | ");
```

**Two-line footer** — return two strings from `render()`:
```typescript
render(width: number): string[] {
  return [
    truncateToWidth(topLine, width),
    truncateToWidth(bottomLine, width),
  ];
}
```
