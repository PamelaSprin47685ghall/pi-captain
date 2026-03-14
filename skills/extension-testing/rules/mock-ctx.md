# Build a typed mock ctx to test handlers without running pi

Tool `execute()` handlers and command handlers receive `ctx: ExtensionCommandContext`. You can test these without pi by constructing a stub object that satisfies only the interface methods the handler actually calls. The stub captures side-effects (notifications, status updates) so you can assert on them.

## Avoid

```typescript
// Test that skips verification of side effects
test("run command notifies on success", async () => {
  // Can't test — handler is buried inside pi.registerCommand()
  // and requires a live pi process to fire
});
```

Or worse — testing with `as any` and losing type safety:

```typescript
const ctx = {} as any; // No type checking — broken ctx silently passes
await handleRun(pi, ctx as any, tokens);
```

## Prefer

Build a reusable `makeCtx()` factory in a shared test helper:

```typescript
// test-helpers.ts
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export interface MockCtx extends ExtensionCommandContext {
  _notifications: Array<{ msg: string; level: string }>;
  _statuses: Record<string, string | undefined>;
  _confirmResponse: boolean;
  _selectResponse: string;
}

export function makeCtx(overrides: {
  cwd?: string;
  hasUI?: boolean;
  confirmResponse?: boolean;
  selectResponse?: string;
  model?: ExtensionCommandContext["model"];
} = {}): MockCtx {
  const notifications: Array<{ msg: string; level: string }> = [];
  const statuses: Record<string, string | undefined> = {};

  return {
    cwd: overrides.cwd ?? "/tmp/test",
    hasUI: overrides.hasUI ?? true,
    model: overrides.model ?? {
      provider: "anthropic",
      id: "claude-3-5-sonnet-20241022",
      api: "messages",
    },
    ui: {
      notify: (msg, level) => { notifications.push({ msg, level: level ?? "info" }); },
      setStatus: (key, val) => { statuses[key] = val ?? undefined; },
      setWidget: (_key, _lines) => {},
      confirm: async (_title, _msg) => overrides.confirmResponse ?? true,
      select: async (_title, _opts) => overrides.selectResponse ?? (_opts[0] ?? ""),
      setEditorText: (_text) => {},
    },
    sessionManager: {
      getBranch: () => [],
      getEntries: () => [],
    },
    modelRegistry: {
      getApiKey: async (_model) => undefined,
    },
    _notifications: notifications,
    _statuses: statuses,
    _confirmResponse: overrides.confirmResponse ?? true,
    _selectResponse: overrides.selectResponse ?? "",
    isIdle: () => true,
    abort: () => {},
    compact: async () => {},
    shutdown: () => {},
    hasUI: overrides.hasUI ?? true,
  } as unknown as MockCtx;
}
```

Then use it in tests:

```typescript
// my-extension.test.ts
import { describe, test, expect } from "bun:test";
import { makeCtx } from "./test-helpers";
import { handleRun } from "./runner";   // extracted handler function

describe("handleRun", () => {
  test("notifies on successful run", async () => {
    const ctx = makeCtx({ cwd: "/tmp" });
    await handleRun(ctx, ["run", "fixtures/dataset.json"]);

    expect(ctx._notifications).toContainEqual(
      expect.objectContaining({ level: "info" })
    );
  });

  test("notifies error when dataset not found", async () => {
    const ctx = makeCtx({ cwd: "/tmp" });
    await handleRun(ctx, ["run", "nonexistent.json"]);

    const errors = ctx._notifications.filter(n => n.level === "error");
    expect(errors.length).toBeGreaterThan(0);
  });

  test("skips UI calls when hasUI is false", async () => {
    const ctx = makeCtx({ hasUI: false });
    // Should not throw even though no ui methods available
    await expect(handleRun(ctx, ["run", "fixtures/dataset.json"])).resolves.not.toThrow();
  });
});
```

**Tip — only stub what's called**: Don't implement the full interface. Use `as unknown as ExtensionCommandContext` to satisfy TypeScript after implementing only what the handler touches. If a test fails with "not a function", add that method to the stub.

**Tip — test hasUI: false paths**: Many handlers have `if (!ctx.hasUI) return;` guards. Test these explicitly — a common bug is handlers that crash in non-interactive mode (`pi -p`).

**Tip — test tool execute() the same way**:

```typescript
import { describe, test, expect } from "bun:test";
import { makeCtx } from "./test-helpers";
import myExtension from "./index";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

describe("my_tool execute", () => {
  test("returns greeting text", async () => {
    let registeredTool: any;
    const fakePi = {
      registerTool: (def: any) => { registeredTool = def; },
      on: () => {},
    } as unknown as ExtensionAPI;

    myExtension(fakePi);

    const ctx = makeCtx();
    const result = await registeredTool.execute("id-1", { name: "Alice" }, undefined, undefined, ctx);

    expect(result.content[0].text).toContain("Alice");
  });
});
```
