# Test state reconstruction by replaying session branch entries

Stateful pi extensions reconstruct their in-memory state on `session_start`, `session_switch`, `session_fork`, and `session_tree` by scanning the session branch. If reconstruction is wrong, the extension shows stale or incorrect state after the user forks or resumes a session. Test this by building a fake branch and running your reconstruct function against it.

## Avoid

```typescript
// Only testing the "fresh session" path
test("state starts empty", () => {
  const state = reconstruct([]);
  expect(state.items).toEqual([]);
});

// Never testing: what happens after fork? After resume with existing entries?
```

## Prefer

Extract your reconstruct function so it takes a `branch: SessionEntry[]` array directly — this makes it trivially testable:

```typescript
// state.ts — no pi imports
import type { SessionEntry, SessionMessageEntry } from "@mariozechner/pi-coding-agent";

export interface MyState { items: string[]; }

export function reconstruct(branch: SessionEntry[]): MyState {
  const state: MyState = { items: [] };
  for (const entry of branch) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (msg.role === "toolResult" && msg.toolName === "my_tool") {
      const details = msg.details as MyState | undefined;
      if (details?.items) state.items = [...details.items];
    }
  }
  return state;
}
```

Then wire it in the extension (thin shell):

```typescript
// index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { reconstruct, type MyState } from "./state";

export default function (pi: ExtensionAPI) {
  let state: MyState = { items: [] };

  const sync = (ctx: any) => { state = reconstruct(ctx.sessionManager.getBranch()); };
  pi.on("session_start",  async (_, ctx) => sync(ctx));
  pi.on("session_switch", async (_, ctx) => sync(ctx));
  pi.on("session_fork",   async (_, ctx) => sync(ctx));
  pi.on("session_tree",   async (_, ctx) => sync(ctx));
  // ...
}
```

**Test helpers for building fake branches:**

```typescript
// test-helpers.ts
import type { SessionEntry, SessionMessageEntry } from "@mariozechner/pi-coding-agent";

export function makeToolResultEntry(toolName: string, details: unknown): SessionMessageEntry {
  return {
    type: "message",
    id: Math.random().toString(36).slice(2),
    message: {
      role: "toolResult",
      toolCallId: "tc-1",
      toolName,
      content: [{ type: "text", text: "ok" }],
      details,
    },
  } as SessionMessageEntry;
}

export function makeUserEntry(content: string): SessionMessageEntry {
  return {
    type: "message",
    id: Math.random().toString(36).slice(2),
    message: {
      role: "user",
      content,
      timestamp: Date.now(),
    },
  } as SessionMessageEntry;
}
```

**Tests covering all reconstruction scenarios:**

```typescript
// state.test.ts
import { describe, test, expect } from "bun:test";
import { reconstruct } from "./state";
import { makeToolResultEntry, makeUserEntry } from "./test-helpers";

describe("reconstruct", () => {
  test("empty branch → empty state", () => {
    expect(reconstruct([])).toEqual({ items: [] });
  });

  test("single tool result restores items", () => {
    const branch = [makeToolResultEntry("my_tool", { items: ["a", "b"] })];
    expect(reconstruct(branch).items).toEqual(["a", "b"]);
  });

  test("last tool result wins (most recent snapshot)", () => {
    const branch = [
      makeToolResultEntry("my_tool", { items: ["a"] }),
      makeUserEntry("add b"),
      makeToolResultEntry("my_tool", { items: ["a", "b"] }),
    ];
    expect(reconstruct(branch).items).toEqual(["a", "b"]);
  });

  test("entries from other tools are ignored", () => {
    const branch = [makeToolResultEntry("other_tool", { items: ["x"] })];
    expect(reconstruct(branch).items).toEqual([]);
  });

  test("non-message entries are skipped", () => {
    const customEntry = { type: "custom", customType: "my-state", data: { items: ["z"] } };
    expect(reconstruct([customEntry as any]).items).toEqual([]);
  });

  test("missing details doesn't throw", () => {
    const branch = [makeToolResultEntry("my_tool", undefined)];
    expect(() => reconstruct(branch)).not.toThrow();
    expect(reconstruct(branch).items).toEqual([]);
  });
});
```

**Tip — test the fork scenario explicitly**: After a fork, the branch may be shorter than the full session. Build a branch that simulates a mid-session fork point (only entries up to that point) and verify the state is correct for that snapshot.
