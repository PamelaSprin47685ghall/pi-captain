# pi-captain

Pipeline orchestrator for [pi](https://github.com/badlogic/pi-mono). Wire steps into sequential/parallel/pool pipelines with quality gates and run complex workflows — each step declares its own model, tools, and temperature inline.

## Install

```bash
# Project-local (recommended — auto-installs for teammates)
pi install -l git:github.com/Pierre-Mike/pi-captain

# Global
pi install git:github.com/Pierre-Mike/pi-captain
```

## What You Get

### Tools

| Tool | Description |
|------|-------------|
| `captain_define` | Wire steps into a pipeline (sequential / parallel / pool) |
| `captain_run` | Execute a pipeline with input |
| `captain_status` | Check pipeline progress and results |
| `captain_list` | List all defined pipelines |
| `captain_load` | Load a builtin pipeline preset |
| `captain_generate` | Auto-generate a pipeline from a goal description |

### Builtin Pipeline Presets

| Preset | Description |
|--------|-------------|
| `captain:shredder` | Clarify → decompose → shred to atomic units → validate → resolve deps → generate pipeline spec → Obsidian canvas |
| `captain:spec-tdd` | Spec → TDD red → TDD green + docs (parallel) → review → PR |
| `captain:requirements-gathering` | Explore → deep-dive → challenge → synthesize REQUIREMENTS.md |

---

## Type Reference

This section is the authoritative schema for the pipeline spec. Every field is described with its type, whether it is required or optional, and its default value.

---

### `Runnable` (union)

A `Runnable` is anything that can be placed inside a pipeline. All four variants are infinitely nestable.

```
Runnable = Step | Sequential | Pool | Parallel
```

---

### `Step` — atomic LLM invocation

Each step runs as an in-process pi SDK session. All config is declared inline on the step.

```ts
{
  kind: "step",                    // required — literal "step"
  label: string,                   // required — human-readable name shown in UI
  prompt: string,                  // required — instructions for the step
                                   //   $INPUT    → output of the previous step (or user input on step 1)
                                   //   $ORIGINAL → the original user request, always unchanged

  // ── Step config ───────────────────────────────────────────────────────
  model?: string,                  // optional — model identifier; default: current session model
                                   //   Examples: "sonnet", "flash", "claude-opus-4-5"
  tools?: string[],                // optional — tool names to enable
                                   //   Default: ["read","bash","edit","write"]
                                   //   Available: "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls"
  temperature?: number,            // optional — sampling temperature (0–1)
  systemPrompt?: string,           // optional — system prompt for the LLM session
  skills?: string[],               // optional — absolute paths to .md skill files to inject
  extensions?: string[],           // optional — absolute paths to .ts extension files to load
  jsonOutput?: boolean,            // optional — if true, instructs step to return structured JSON; default: false

  // ── Step metadata ─────────────────────────────────────────────────────
  description?: string,            // optional — longer description (defaults to label)

  // ── Lifecycle ─────────────────────────────────────────────────────────
  gate: Gate,                      // required — validation after this step runs
  onFail: OnFail,                  // required — what to do if gate fails or step errors
  transform: Transform,            // required — how to pass output to the next step
}
```

**Example step:**
```json
{
  "kind": "step",
  "label": "Analyze codebase",
  "model": "flash",
  "tools": ["read", "bash"],
  "prompt": "Analyze $ORIGINAL and summarize the architecture.",
  "gate": { "type": "none" },
  "onFail": { "action": "skip" },
  "transform": { "kind": "full" }
}
```

**Step with temperature:**
```json
{
  "kind": "step",
  "label": "Implement feature",
  "model": "sonnet",
  "tools": ["read", "bash", "edit", "write"],
  "temperature": 0.2,
  "prompt": "Implement: $ORIGINAL\n\nContext:\n$INPUT",
  "gate": { "type": "command", "value": "bun test" },
  "onFail": { "action": "retry", "max": 3 },
  "transform": { "kind": "full" }
}
```

---

### `Sequential` — ordered chain

Steps run one after another. The output of each step becomes `$INPUT` for the next.

```ts
{
  kind: "sequential",              // required — literal "sequential"
  steps: Runnable[],               // required — non-empty array of any Runnable
  gate?: Gate,                     // optional — validates the FINAL output of the whole sequence
  onFail?: OnFail,                 // optional — retry = re-run the entire sequence from scratch
}
```

```json
{
  "kind": "sequential",
  "steps": [
    { "kind": "step", "label": "Plan", "tools": ["read","bash"], "..." : "..." },
    { "kind": "step", "label": "Implement", "tools": ["read","bash","edit","write"], "..." : "..." },
    { "kind": "step", "label": "Test", "tools": ["read","bash"], "..." : "..." }
  ],
  "gate": { "type": "command", "value": "bun test" },
  "onFail": { "action": "retry", "max": 2 }
}
```

---

### `Pool` — same step, N times in parallel

Runs ONE runnable `count` times simultaneously (each in its own git worktree for isolation), then merges results.

```ts
{
  kind: "pool",                    // required — literal "pool"
  step: Runnable,                  // required — the runnable to replicate
  count: number,                   // required — number of parallel instances (>= 1)
  merge: { strategy: MergeStrategy }, // required — how to combine the N outputs
  gate?: Gate,                     // optional — validates the merged output
  onFail?: OnFail,                 // optional — retry = re-run all N branches + re-merge
}
```

```json
{
  "kind": "pool",
  "step": {
    "kind": "step",
    "label": "Generate solution",
    "model": "sonnet",
    "tools": ["read", "bash", "edit", "write"],
    "prompt": "Implement $ORIGINAL",
    "gate": { "type": "none" },
    "onFail": { "action": "skip" },
    "transform": { "kind": "full" }
  },
  "count": 3,
  "merge": { "strategy": "rank" }
}
```

---

### `Parallel` — different steps concurrently

Runs DIFFERENT runnables at the same time (each in its own git worktree), then merges results.

```ts
{
  kind: "parallel",                // required — literal "parallel"
  steps: Runnable[],               // required — non-empty array, each runs concurrently
  merge: { strategy: MergeStrategy }, // required — how to combine all outputs
  gate?: Gate,                     // optional — validates the merged output
  onFail?: OnFail,                 // optional — retry = re-run all branches + re-merge
}
```

```json
{
  "kind": "parallel",
  "steps": [
    { "kind": "step", "label": "Security review", "tools": ["read","bash","grep","find","ls"], "..." : "..." },
    { "kind": "step", "label": "Performance review", "tools": ["read","bash"], "..." : "..." }
  ],
  "merge": { "strategy": "concat" }
}
```

---

### `Gate` — output validation

A gate runs after a step completes. If it fails, `onFail` is triggered.

```ts
type Gate =
  | { type: "none" }
  | { type: "user"; value: true }
  | { type: "command"; value: string }
  //   Exit code 0 = pass. Examples:
  //     { type: "command", value: "bun test" }
  //     { type: "command", value: "bun test && bunx tsc --noEmit" }
  | { type: "file"; value: string }
  | { type: "dir"; value: string }
  | { type: "assert"; fn: string }
  //   `fn` is a JS expression; `output` is the step's output string.
  //   Example: { type: "assert", fn: "output.includes('LGTM')" }
  | { type: "regex"; pattern: string; flags?: string }
  | { type: "json" }
  | { type: "json"; schema: string }
  //   Comma-separated top-level keys that must be present.
  | { type: "http"; url: string; method?: string; expectedStatus?: number }
  | { type: "env"; name: string; value?: string }
  | { type: "llm"; prompt: string; model?: string; threshold?: number }
  //   Asks an LLM to evaluate output against `prompt`. Passes if score >= threshold (default 0.7).
  //   Example: { type: "llm", prompt: "Is the output well documented?", threshold: 0.8 }
  | { type: "timeout"; gate: Gate; ms: number }
  | { type: "multi"; mode: "all" | "any"; gates: Gate[] }
```

---

### `OnFail` — failure handling

```ts
type OnFail =
  | { action: "retry"; max?: number }
  | { action: "retryWithDelay"; max?: number; delayMs: number }
  | { action: "skip" }
  | { action: "warn" }
  | { action: "fallback"; step: Step }
```

---

### `Transform` — output shaping

```ts
type Transform =
  | { kind: "full" }                        // pass entire raw output
  | { kind: "extract"; key: string }        // parse JSON, extract key
  | { kind: "summarize" }                   // LLM-summarize before passing downstream
```

---

### `MergeStrategy` — combining parallel/pool outputs

| Strategy | Behaviour |
|----------|-----------|
| `"concat"` | Concatenate all outputs in order |
| `"awaitAll"` | Wait for all, return as structured list |
| `"firstPass"` | Return the first output that passes its gate |
| `"vote"` | LLM picks the single best output |
| `"rank"` | LLM ranks all outputs and returns the top one |

---

## Complete Pipeline Example

```json
{
  "pipeline": {
    "kind": "sequential",
    "steps": [
      {
        "kind": "step",
        "label": "Explore codebase",
        "model": "flash",
        "tools": ["read", "bash", "grep", "find", "ls"],
        "prompt": "Explore the codebase and understand how to implement: $ORIGINAL. Identify relevant files, patterns, and constraints.",
        "gate": { "type": "none" },
        "onFail": { "action": "skip" },
        "transform": { "kind": "full" }
      },
      {
        "kind": "parallel",
        "steps": [
          {
            "kind": "step",
            "label": "Write tests",
            "model": "sonnet",
            "tools": ["read", "bash", "edit", "write", "grep", "find", "ls"],
            "temperature": 0.2,
            "prompt": "Based on this analysis:\n$INPUT\n\nWrite failing tests for: $ORIGINAL",
            "gate": { "type": "command", "value": "bun test --bail 2>&1 | grep -q 'fail'" },
            "onFail": { "action": "retry", "max": 2 },
            "transform": { "kind": "full" }
          },
          {
            "kind": "step",
            "label": "Write docs",
            "model": "sonnet",
            "tools": ["read", "bash", "edit", "write", "grep", "find", "ls"],
            "prompt": "Based on this analysis:\n$INPUT\n\nDraft documentation for: $ORIGINAL",
            "gate": { "type": "none" },
            "onFail": { "action": "warn" },
            "transform": { "kind": "full" }
          }
        ],
        "merge": { "strategy": "concat" }
      },
      {
        "kind": "step",
        "label": "Implement",
        "model": "sonnet",
        "tools": ["read", "bash", "edit", "write"],
        "temperature": 0.2,
        "prompt": "Context:\n$INPUT\n\nImplement: $ORIGINAL\nMake all tests pass.",
        "gate": { "type": "command", "value": "bun test" },
        "onFail": { "action": "retry", "max": 3 },
        "transform": { "kind": "full" }
      },
      {
        "kind": "step",
        "label": "Review",
        "model": "flash",
        "tools": ["read", "bash", "grep", "find", "ls"],
        "temperature": 0.3,
        "prompt": "Review the implementation for $ORIGINAL. Focus on correctness, security, and maintainability.",
        "gate": {
          "type": "llm",
          "prompt": "Does the review indicate the implementation is ready for production?",
          "threshold": 0.8
        },
        "onFail": { "action": "retry", "max": 1 },
        "transform": { "kind": "summarize" }
      }
    ]
  }
}
```

---

## Gate Factories (TypeScript pipelines)

When building pipelines as `.ts` modules, import parameterized gate factories from `gates/index.js`:

```ts
import { command, outputMinLength, bunTest, none, retry, skip, fallback } from "../gates/index.js";
```

| Factory | Gate produced |
|---------|---------------|
| `none` | Always passes |
| `user` | Human approval |
| `command(cmd)` | Shell command, exit 0 = pass |
| `file(path)` | File existence check |
| `assert(expr)` | JS assert on output |
| `outputMinLength(n)` | Output at least N chars |
| `bunTest` | `command("bun test")` |
| `testAndTypecheck` | `commandAll("bun test", "bunx tsc --noEmit")` |

| OnFail Factory | Behavior |
|----------------|----------|
| `retry(max?)` | Retry up to N times |
| `skip` | Mark skipped, pass empty downstream |
| `fallback(step)` | Run alternative step |

---

## Quick Start

```
# Load and run a builtin preset
> Use captain to review my PR

# Generate a custom pipeline on the fly
> Use captain to refactor the auth module and ensure all tests pass

# Define a custom inline pipeline
> Define a captain pipeline: first analyze with flash+read tools,
  then implement with sonnet+all tools, then run bun test as a gate
```

---

## Development

```bash
git clone https://github.com/Pierre-Mike/pi-captain.git
cd pi-captain
npm install
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run check` | Lint & format check |
| `npm run fix` | Auto-fix lint & format issues |
| `npm test` | Run all tests |

## License

MIT
