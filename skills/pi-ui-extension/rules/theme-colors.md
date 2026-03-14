# Use semantic theme tokens — never hardcode ANSI codes

Pi themes expose semantic colour names that adapt to the user's active theme.
Using raw ANSI codes or chalk directly breaks when the user switches themes.

## Avoid

```typescript
// Bad: hardcoded ANSI colour
const txt = `\x1b[32m${model}\x1b[0m`;

// Bad: importing chalk / picocolors directly in a UI extension
import chalk from "chalk";
const txt = chalk.green(model);

// Bad: using hex or 256-colour codes that clash with dark/light themes
const txt = `\x1b[38;5;214m${branch}\x1b[0m`;
```

## Prefer

```typescript
// Good: semantic tokens via theme object
render(width: number): string[] {
  const modelStr  = theme.fg("accent", model?.id ?? "—");
  const statsStr  = theme.fg("muted", `↑${input} ↓${output}`);
  const branchStr = theme.fg("dim", branch ?? "");
  const warnStr   = theme.fg("warning", "context high");
  const errStr    = theme.fg("error", "context full");
  const okStr     = theme.fg("success", "✓");
  const boldStr   = theme.bold(label);
  return [truncateToWidth(`${modelStr} ${statsStr}`, width)];
}
```

## Available semantic tokens

| Token | Typical meaning |
|-------|----------------|
| `"accent"` | Primary highlight — model names, active items |
| `"dim"` | Deemphasised — separators, secondary info |
| `"muted"` | Even lighter — background stats |
| `"success"` | OK, done, low usage |
| `"warning"` | Caution — context at 70–89 % |
| `"error"` | Critical — failures, context ≥ 90 % |

`theme.bold(text)` applies bold without changing colour.

## Getting the theme object

The `theme` argument is automatically injected wherever pi passes it:
- `ctx.ui.setFooter((tui, theme, footerData) => …)` — inside the factory callback
- `ctx.ui.custom((tui, theme, keybindings, done) => …)` — inside custom UI factory
- `renderCall(args, theme)` / `renderResult(result, opts, theme)` — tool renderers
- `ctx.ui.theme` — available anywhere via the context object

Never store the theme reference beyond one session — call `ctx.ui.theme` fresh in each handler if needed.
