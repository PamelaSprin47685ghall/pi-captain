# Write one smoke test that loads the extension via `pi -e`

Unit and integration tests catch logic errors, but they can't catch: bad import paths, missing default exports, wrong TypeScript that jiti rejects at load time, or command registration that silently fails. A single smoke test using `Bun.spawnSync` catches all of these in seconds.

The canonical smoke-test pattern comes from `test.ts` in pi-research: load the extension, send a command, assert the output looks right.

## Avoid

```typescript
// No smoke test at all — extension may fail to load at runtime
// without any test catching it
```

Or testing in an interactive terminal session manually every time — this doesn't scale and doesn't run in CI.

## Prefer

```typescript
// smoke.test.ts  (or in the main *.test.ts file as a final describe block)
import { describe, test, expect } from "bun:test";
import { join } from "node:path";

const EXT_PATH = join(import.meta.dir, "index.ts");

describe("Extension smoke tests", () => {
  test("extension loads without errors", () => {
    // Use print mode (-p) with a simple command — no interactive TTY needed
    const result = Bun.spawnSync({
      cmd: ["pi", "-e", EXT_PATH, "-p", "/hello"],
      env: {
        ...process.env,
        // Ensure a provider is available; use a test API key or mock
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "test-key",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    // Extension loaded if exit code is 0 and no crash in stderr
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).not.toContain("Error:");
    expect(result.stderr.toString()).not.toContain("Cannot find module");
  });

  test("/hello command responds", () => {
    const result = Bun.spawnSync({
      cmd: ["pi", "-e", EXT_PATH, "-p", "/hello"],
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = result.stdout.toString();
    expect(output).toContain("Hello");
  });

  test("extension handles unknown command gracefully", () => {
    const result = Bun.spawnSync({
      cmd: ["pi", "-e", EXT_PATH, "-p", "/nonexistent-command-xyz"],
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });

    // Should not crash — pi handles unknown commands
    expect(result.exitCode).toBe(0);
  });
});
```

**For extensions with no commands** (pure event handlers), the smoke test just verifies it loads:

```typescript
test("event-only extension loads cleanly", () => {
  const result = Bun.spawnSync({
    cmd: ["pi", "-e", EXT_PATH, "-p", "echo test"],
    env: { ...process.env },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });

  expect(result.stderr.toString()).not.toContain("Cannot find module");
  expect(result.stderr.toString()).not.toContain("SyntaxError");
});
```

**The minimal smoke test — from pi-research `test.ts`**:

```typescript
// test.ts (the simplest valid pi extension, usable as a smoke test template)
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("✓ Extension loaded!", "info");
    ctx.ui.setStatus("test-ext", ctx.ui.theme.fg("success", "⚡ test"));
  });

  pi.registerCommand("hello", {
    description: "Ping the test extension",
    handler: async (_args, ctx) => {
      ctx.ui.notify("👋 Extension is alive!", "info");
    },
  });
}
```

Run manually to visually verify: `pi -e test.ts`

**CI tip**: Add `bun test` to your package.json scripts. If the smoke test requires a real API key, skip it in CI with:

```typescript
const skipCI = !process.env.ANTHROPIC_API_KEY;
test.skipIf(skipCI)("extension loads", () => { ... });
```
