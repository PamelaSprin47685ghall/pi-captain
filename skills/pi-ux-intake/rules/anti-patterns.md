# Avoid these UX anti-patterns in pi intake flows

Good intake UX is invisible: it collects what's needed, when it's needed, in a way that doesn't surprise or block the user. The patterns below are the most common ways extensions break user experience — sourced from real bugs in the sources/ corpus.

## Avoid

### 1 — Stacking modals without context

```typescript
// ❌ Three blocking prompts in sequence with no explanation of the overall goal
const framework = await ctx.ui.select("Framework?", ["react", "vue", "svelte"]);
const db = await ctx.ui.select("Database?", ["postgres", "sqlite", "mysql"]);
const auth = await ctx.ui.select("Auth?", ["none", "jwt", "oauth"]);
// User answers 3 modals with no idea why or what happens next
```

**Fix**: use `questionnaire` tool for batching, or explain the goal first with `ctx.ui.notify()`.

---

### 2 — Blocking in non-interactive mode without a hasUI guard

```typescript
// ❌ Crashes or hangs in pi -p, SDK, RPC modes
async execute(_id, params, _signal, _onUpdate, ctx) {
  const ok = await ctx.ui.confirm("Proceed?", "Are you sure?");
  // Throws: "Cannot call confirm in non-interactive mode"
}
```

**Fix**: Always check `if (!ctx.hasUI)` before any blocking call and return a sensible fallback.

---

### 3 — Intercepting ALL input instead of only special cases

```typescript
// ❌ User can never have a normal conversation with the LLM
pi.on("input", async (event, ctx) => {
  if (event.source === "extension") return { action: "continue" };
  doSomethingWithEverything(event.text);
  return { action: "handled" };  // ❌ Always handled
});
```

**Fix**: `handled` should only apply to: first-message routing, instant-response shortcuts (`ping`, `time`), or explicit opt-in prefixes (`?brief`). Everything else: `{ action: "continue" }`.

---

### 4 — Forgetting the source guard on input events (infinite loop)

```typescript
// ❌ Extension sends a message; input fires; extension handles it; sends again...
pi.on("input", async (event, ctx) => {
  // Missing: if (event.source === "extension") return { action: "continue" };
  pi.sendUserMessage("Routing: " + event.text);
  return { action: "handled" };
});
```

**Fix**: The FIRST line of every `input` handler must be:
```typescript
if (event.source === "extension") return { action: "continue" };
```

---

### 5 — Silently prefilling the editor mid-conversation

```typescript
// ❌ User was drafting a message; extension overwrites it with no notice
pi.on("tool_execution_end", async (event, ctx) => {
  ctx.ui.setEditorText("Next: run the tests");
  // No notify — user looks down, their draft is gone
});
```

**Fix**: Always pair `setEditorText()` with `ctx.ui.notify()`:
```typescript
ctx.ui.setEditorText("Next: run the tests");
ctx.ui.notify("Suggested next step loaded — edit or submit.", "info");
```

---

### 6 — Injecting context in before_agent_start unconditionally

```typescript
// ❌ Adds ~200 tokens to EVERY turn even when the user hasn't activated anything
pi.on("before_agent_start", async (event) => ({
  systemPrompt: event.systemPrompt + "\n\n[CONTEXT: user is working in TypeScript]",
}));
```

**Fix**: Guard on active state:
```typescript
pi.on("before_agent_start", async (event) => {
  if (!activeMode) return;   // Only inject when activated
  return { systemPrompt: event.systemPrompt + "\n\n" + activeMode.instructions };
});
```

---

### 7 — Using ctx.ui.input() for free-text when options are predictable

```typescript
// ❌ Makes the user type when they could click
const mode = await ctx.ui.input("Mode?", "Type: plan, implement, or review");
```

**Fix**: use `ctx.ui.select()` when the option list is known and finite:
```typescript
const mode = await ctx.ui.select("Mode?", ["plan", "implement", "review"]);
```

Reserve `input()` for genuinely free-form answers: task description, branch name, custom label.

---

### 8 — Omitting cancellation handling

```typescript
const mode = await ctx.ui.select("Mode?", ["plan", "review"]);
// ❌ mode can be undefined if user hits Esc — accessing it will crash
pi.setActiveTools(modeToTools[mode]);   // TypeError: undefined is not a key
```

**Fix**: always check for undefined/null:
```typescript
const mode = await ctx.ui.select("Mode?", ["plan", "review"]);
if (!mode) {
  ctx.ui.notify("Mode selection cancelled.", "info");
  return;
}
```

## Prefer

Intake that is **minimal, guarded, announced, and recoverable**:

```typescript
// ✅ Minimal: only ask what you can't infer
// ✅ Guarded: hasUI check before every blocking call
// ✅ Announced: notify the user what's happening
// ✅ Recoverable: handle undefined/null returns gracefully
async execute(_id, params, _signal, _onUpdate, ctx) {
  if (!ctx.hasUI) {
    return { content: [{ type: "text", text: `Auto-selecting default (headless). Task: ${params.name}` }], details: {} };
  }

  ctx.ui.notify(`Preparing task: ${params.name}`, "info");

  const ok = await ctx.ui.confirm("Start task?", `Task: "${params.name}"`);
  if (!ok) return { content: [{ type: "text", text: "User declined." }], details: {} };

  const description = (await ctx.ui.input("Context", "Optional context:")) ?? "";

  return { content: [{ type: "text", text: `Task started: ${params.name}` }], details: { description } };
}
```
