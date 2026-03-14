---
name: extension-testing
description: >
  Testing strategies and patterns for pi extensions — TypeScript modules loaded via
  the ExtensionAPI. Use when: (1) writing unit tests for pure business logic extracted
  from an extension (CLI parsers, state reducers, output formatters), (2) writing
  integration tests with a lightweight mock ExtensionContext to verify tool execute()
  handlers without running pi, (3) adding bun smoke tests that verify an extension
  loads cleanly via `pi -e`, (4) designing eval datasets for LLM-backed extensions
  using the evalset pattern, (5) verifying extension state reconstruction logic by
  replaying session entry sequences, or (6) writing document-consistency tests that
  check markdown/config files stay in sync with actual code. Covers the test
  pyramid for pi extensions: what to test at each layer, how to isolate pure logic
  from the pi runtime, how to build a minimal ctx mock, and how to structure
  bun:test suites. Also covers the evalset slash-command pattern from
  tryingET-pi-evalset-lab for prompt regression testing.
---

# Extension Testing

## Core Concepts

**Extract pure logic first — pi has no official test harness**: The `ExtensionAPI` and `ExtensionContext` interfaces have no mock or stub provided by `@mariozechner/pi-coding-agent`. The key insight is to isolate all testable logic into plain functions that don't import from pi at all. The extension module wires those functions to the API; your tests call the functions directly.

```typescript
// tools/parser.ts  (NO pi imports — fully testable)
export function parseArgs(raw: string): string[] { ... }
export function evaluateCase(expected: EvalCase, output: string): CheckResult { ... }
export function mergeSystemPrompt(base?: string, variant?: string): string { ... }

// index.ts  (pi-facing — thin shell, minimal logic)
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { parseArgs, evaluateCase, mergeSystemPrompt } from "./tools/parser";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("run", {
    handler: async (args, ctx) => {
      const tokens = parseArgs(args);   // <-- tested separately
      // ...
    },
  });
}

// tools/parser.test.ts  (bun:test, no pi)
import { describe, test, expect } from "bun:test";
import { parseArgs, evaluateCase } from "./parser";

describe("parseArgs", () => {
  test("parses quoted strings", () => {
    expect(parseArgs(`run "my file.json"`)).toEqual(["run", "my file.json"]);
  });
});
```

**Build a minimal ctx mock for integration tests**: When you must test code that calls `ctx.ui.*` or `ctx.model`, create a typed stub object. You don't need to implement everything — only the methods the code under test actually calls.

```typescript
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

function makeCtx(overrides: Partial<ExtensionCommandContext> = {}): ExtensionCommandContext {
  const notifications: string[] = [];
  return {
    cwd: "/tmp/test",
    hasUI: true,
    model: { provider: "anthropic", id: "claude-3-5-sonnet-20241022", api: "messages" },
    ui: {
      notify: (msg, _level) => { notifications.push(msg); },
      setStatus: (_key, _val) => {},
      setWidget: (_key, _lines) => {},
      confirm: async (_title, _msg) => true,
      select: async (_title, _opts) => _opts[0] ?? "",
    },
    sessionManager: { getBranch: () => [], getEntries: () => [] },
    modelRegistry: { getApiKey: async () => undefined },
    // expose collected notifications for assertions
    _notifications: notifications,
  } as unknown as ExtensionCommandContext & { _notifications: string[] };
}
```

**Use `pi -e` smoke tests to verify the extension loads**: The simplest end-to-end test is loading your extension with a piped command in print mode. If pi exits without error and the expected output appears, the extension is wired correctly.

```bash
# Smoke test: extension loads, /hello command responds
echo "/hello" | pi -e ./my-ext.ts -p "/hello" --print
```

Run this in a CI or pre-commit hook. It catches import errors, missing exports, and broken command registration — without needing a full test suite.

---

## Test Pyramid for Pi Extensions

```
                  ┌──────────────────────────────┐
              E2E │  pi -e ext.ts -p "/cmd"       │  1-3 smoke tests
                  │  (live pi process, slow)       │
                  ├──────────────────────────────┤
         Integ.   │  mock ctx + execute() calls   │  5-15 tests
                  │  (no pi runtime, fast)         │
                  ├──────────────────────────────┤
          Unit    │  pure functions, no imports   │  many tests
                  │  from pi (fastest)            │
                  └──────────────────────────────┘
```

Decide the layer by the dependency:
- **No ctx, no pi imports** → unit test directly
- **Needs ctx.ui or ctx.model** → integration test with mock ctx
- **Needs the full pi event loop** → smoke test with `pi -e`

---

## Quick Patterns

1. **Scaffold test file** — create `<extension>.test.ts` next to the extension file, import from `bun:test`
2. **Extract pure functions** — move CLI parsers, validators, formatters, and state reducers to a separate module with no pi imports
3. **Test pure functions exhaustively** — happy path, edge cases, error paths
4. **Build a mock ctx** — implement only the methods actually called; collect side-effects (notifications, status) in arrays for assertions
5. **Test tool `execute()` handlers** — call them directly with mock ctx; assert on `content[0].text` and `details`
6. **Add one smoke test** — `pi -e ./ext.ts -p "/command"` via `bun:test` using `Bun.spawnSync`
7. **Run** — `bun test` picks up all `*.test.ts` files automatically

---

## Reference Files

Consult these only when you need specific details:

- `rules/unit-testing.md` — when writing tests for pure functions: parsers, formatters, validators, state reducers
- `rules/mock-ctx.md` — when testing tool execute() handlers or command handlers that call ctx methods
- `rules/smoke-tests.md` — when verifying extension loads and commands work end-to-end via `pi -e`
- `rules/evalset-pattern.md` — when testing LLM-backed extensions with prompt regression datasets (expectContains / expectRegex)
- `rules/state-reconstruction.md` — when testing session state reconstruction by replaying branch entry sequences
- `rules/document-consistency.md` — when writing tests that verify markdown/config files stay in sync with code
