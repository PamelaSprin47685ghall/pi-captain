# Captain — Pipeline Orchestration

## Overview

Captain turns pi into a multi-agent orchestration platform. Define typed pipeline specs with sequential, parallel, and pool composition patterns, then execute them with automatic git worktree isolation, gate validation, failure handling, and merge strategies.

## When to Use

- Multi-step workflows: research → synthesize → review
- Parallel exploration: run the same task N ways and merge results
- Quality gates: validate outputs with shell commands, file checks, or human approval
- Complex code generation: plan → implement → test → fix loops

## Available Tools

| Tool | Purpose |
|------|---------|
| `captain_agent` | Define a reusable named agent (model, tools, systemPrompt) |
| `captain_define` | Define a pipeline from a JSON Runnable spec |
| `captain_load` | Load a precreated pipeline from a preset or JSON file |
| `captain_run` | Execute a defined pipeline with input |
| `captain_status` | Check step-by-step results of a pipeline |
| `captain_list` | List all defined pipelines |
| `captain_generate` | Auto-generate a pipeline from a goal description |

## Step Fields

Each step runs `pi --print` as a subprocess. All config fields are optional — defaults are sensible.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `label` | string | required | Display name for the step |
| `prompt` | string | required | Prompt sent to pi. Supports `$INPUT`, `$ORIGINAL` |
| `agent` | string | — | Named agent (model/tools/systemPrompt from its definition) |
| `model` | string | `"sonnet"` | Model to use (`--model`). Overrides agent default |
| `tools` | string[] | `["read","bash","edit","write"]` | Tools to enable (`--tools`). Overrides agent default |
| `systemPrompt` | string | — | System prompt text (`--system-prompt`). Overrides agent default |
| `skills` | string[] | — | Skill file paths, each passed as `--skill` |
| `extensions` | string[] | — | Extension file paths, each passed as `--extension` |
| `jsonOutput` | boolean | `false` | Pass `--mode json` — step output is structured JSON |
| `gate` | Gate | required | Validation after the step runs |
| `onFail` | OnFail | required | What to do when the gate fails |
| `transform` | Transform | required | How to pass output to the next step |

## Quick Start

Each step runs `pi --print` under the hood. You can configure the step inline or reference a named agent — or both (inline fields override agent defaults).

### Option A — Inline steps (no agent setup needed)

```json
{
  "kind": "sequential",
  "steps": [
    {
      "kind": "step",
      "label": "Research",
      "model": "sonnet",
      "tools": ["read", "bash"],
      "systemPrompt": "You are a thorough researcher.",
      "prompt": "Research the following topic:\n$ORIGINAL",
      "gate": { "type": "none" },
      "onFail": { "action": "skip" },
      "transform": { "kind": "full" }
    },
    {
      "kind": "step",
      "label": "Implement",
      "model": "sonnet",
      "tools": ["read", "bash", "edit", "write"],
      "prompt": "Based on this research:\n$INPUT\n\nImplement the solution for:\n$ORIGINAL",
      "gate": { "type": "command", "value": "bun test" },
      "onFail": { "action": "retry", "max": 3 },
      "transform": { "kind": "full" }
    },
    {
      "kind": "step",
      "label": "Review",
      "model": "flash",
      "tools": ["read"],
      "jsonOutput": true,
      "prompt": "Review this implementation:\n$INPUT\n\nOriginal request: $ORIGINAL\n\nReturn JSON: {score, issues[], verdict}",
      "gate": { "type": "user", "value": true },
      "onFail": { "action": "skip" },
      "transform": { "kind": "summarize" }
    }
  ]
}
```

### Option B — Named agents (reusable across pipelines)

Define once, reference by name in any step:

```
captain_agent: name="researcher", description="Web research agent", tools="read,bash", model="sonnet"
captain_agent: name="coder", description="Implementation agent", tools="read,bash,edit,write", model="sonnet"
captain_agent: name="reviewer", description="Code review agent", tools="read,bash", model="flash"
```

```json
{
  "kind": "sequential",
  "steps": [
    {
      "kind": "step",
      "label": "Research",
      "agent": "researcher",
      "prompt": "Research the following topic thoroughly:\n$ORIGINAL",
      "gate": { "type": "none" },
      "onFail": { "action": "skip" },
      "transform": { "kind": "full" }
    },
    {
      "kind": "step",
      "label": "Implement",
      "agent": "coder",
      "prompt": "Based on this research:\n$INPUT\n\nImplement: $ORIGINAL",
      "gate": { "type": "command", "value": "bun test" },
      "onFail": { "action": "retry", "max": 3 },
      "transform": { "kind": "full" }
    }
  ]
}
```

### Option C — Mixed (agent defaults + inline overrides)

```json
{
  "kind": "step",
  "label": "Fast review",
  "agent": "reviewer",
  "model": "flash",
  "jsonOutput": true,
  "prompt": "Review $INPUT. Return JSON: {score, issues[]}",
  "gate": { "type": "none" },
  "onFail": { "action": "skip" },
  "transform": { "kind": "full" }
}
```

### Run it

```
captain_run: name="my-pipeline", input="Build a REST API for user management"
```

## Loading Pipeline Presets

Instead of defining agents and pipelines manually, load precreated presets:

### List available presets
```
captain_load: action="list"
```

### Load a builtin preset
```
captain_load: action="load", name="research-and-summarize"
captain_load: action="load", name="full-feature-build"
```

### Load from a file path
```
captain_load: action="load", name="./my-pipeline.json"
```

### Preset file format
```json
{
  "agents": {
    "researcher": {
      "name": "researcher",
      "description": "Gathers information",
      "tools": ["read", "bash"],
      "model": "sonnet"
    }
  },
  "pipeline": {
    "kind": "sequential",
    "steps": [...]
  }
}
```

### Preset locations
- **Builtin**: `~/.pi/agent/extensions/captain/samples/*.json` — shipped with Captain
- **Project-local**: `.pi/pipelines/*.json` — per-project presets (create this directory)

### Slash command
- `/captain-load` — list available presets
- `/captain-load <name>` — load a preset (with tab completion)

## Composition Patterns

### Sequential (steps chain via $INPUT)
Each step's output becomes the next step's `$INPUT`. Use for linear workflows.

### Parallel (different tasks concurrently)
Run different agents on the same input simultaneously. Each gets its own git worktree. Results are merged via strategy.

```json
{
  "kind": "parallel",
  "steps": [
    { "kind": "step", "label": "Frontend", "agent": "coder", ... },
    { "kind": "step", "label": "Backend", "agent": "coder", ... },
    { "kind": "step", "label": "Tests", "agent": "reviewer", ... }
  ],
  "merge": { "strategy": "concat" }
}
```

### Pool (same task × N with voting)
Replicate one step N times for diverse solutions, then merge. Great for brainstorming or reducing variance.

```json
{
  "kind": "pool",
  "step": { "kind": "step", "label": "Solve", "agent": "solver", ... },
  "count": 3,
  "merge": { "strategy": "vote" }
}
```

### Nested Composition
Any slot that accepts a step also accepts sequential, pool, or parallel — infinite nesting:

```json
{
  "kind": "sequential",
  "steps": [
    { "kind": "step", "label": "Plan", ... },
    {
      "kind": "parallel",
      "steps": [
        { "kind": "step", "label": "Module A", ... },
        {
          "kind": "pool",
          "step": { "kind": "step", "label": "Module B attempt", ... },
          "count": 2,
          "merge": { "strategy": "rank" }
        }
      ],
      "merge": { "strategy": "concat" }
    },
    { "kind": "step", "label": "Integration test", ... }
  ]
}
```

## Merge Strategies

| Strategy | Behavior |
|----------|----------|
| `concat` | Join all outputs with separators |
| `awaitAll` | Wait for all, then concatenate |
| `firstPass` | Take the first successful output |
| `vote` | LLM picks the best/most common answer |
| `rank` | LLM ranks outputs and synthesizes top ones |

## Gate Types

Gates can be attached to individual steps **or** to composition nodes (sequential, pool, parallel).
When a composition gate fails, the entire scope is retried/skipped/fallback'd.

| Gate | Use When |
|------|----------|
| `{ "type": "none" }` | No validation needed |
| `{ "type": "command", "value": "bun test" }` | Code must pass tests |
| `{ "type": "file", "value": "dist/index.js" }` | Build output must exist |
| `{ "type": "user", "value": true }` | Human must approve (risky ops) |
| `{ "type": "assert", "fn": "output.includes('SUCCESS')" }` | Output must match condition |

## Failure Handling

| OnFail | Behavior |
|--------|----------|
| `{ "action": "retry", "max": 3 }` | Re-run step with failure feedback, up to N times |
| `{ "action": "skip" }` | Mark as skipped, pass empty $INPUT to next |
| `{ "action": "fallback", "step": {...} }` | Run an alternative step instead |

## Composition Gates

Gates can be attached to any composition node, not just individual steps.
When a composition gate fails, the entire scope is retried/skipped/fallback'd.

### Gate a whole sequence
```json
{
  "kind": "sequential",
  "steps": [
    { "kind": "step", "label": "Plan", "agent": "planner", "..." : "..." },
    { "kind": "step", "label": "Build", "agent": "coder", "..." : "..." },
    { "kind": "step", "label": "Test", "agent": "tester", "..." : "..." }
  ],
  "gate": { "type": "command", "value": "bun test" },
  "onFail": { "action": "retry", "max": 2 }
}
```
If `bun test` fails after the last step, re-run the entire Plan → Build → Test sequence.

### Gate merged parallel output
```json
{
  "kind": "parallel",
  "steps": [
    { "kind": "step", "label": "Frontend", "agent": "coder", "..." : "..." },
    { "kind": "step", "label": "Backend", "agent": "coder", "..." : "..." }
  ],
  "merge": { "strategy": "concat" },
  "gate": { "type": "command", "value": "bun typecheck" },
  "onFail": { "action": "retry", "max": 2 }
}
```
If typecheck fails after merge, re-run both branches and re-merge.

### Gate a pool
```json
{
  "kind": "pool",
  "step": { "kind": "step", "label": "Solve", "agent": "solver", "..." : "..." },
  "count": 3,
  "merge": { "strategy": "vote" },
  "gate": { "type": "assert", "fn": "output.includes('SOLUTION')" },
  "onFail": { "action": "retry", "max": 2 }
}
```
If the merged output doesn't contain 'SOLUTION', re-run all 3 branches and re-merge.

## Gate Factories (TypeScript pipelines)

When building pipelines as `.ts` modules, import parameterized gate factories from `gates/index.js`:

```ts
import { command, outputIncludes, outputMinLength, bunTest, none } from "../gates/index.js";
import { retry, skip, fallback } from "../gates/index.js";
```

### Available gate factories

| Factory | Example | Gate produced |
|---------|---------|---------------|
| `none` | `gate: none` | Always passes |
| `user` | `gate: user` | Human approval |
| `command(cmd)` | `command("bun test")` | Shell command, exit 0 = pass |
| `file(path)` | `file("dist/index.js")` | File existence check |
| `assert(expr)` | `assert("output.length > 100")` | JS assert expression |
| `outputIncludes(s)` | `outputIncludes("SUCCESS")` | Output contains string |
| `outputIncludesCI(s)` | `outputIncludesCI("file")` | Case-insensitive contains |
| `outputMinLength(n)` | `outputMinLength(100)` | Output at least N chars |
| `commandAll(...cmds)` | `commandAll("bun test", "tsc --noEmit")` | All commands must pass |

### Preset constants

| Constant | Equivalent |
|----------|------------|
| `bunTest` | `command("bun test")` |
| `bunTypecheck` | `command("bunx tsc --noEmit")` |
| `bunLint` | `command("bun run lint")` |
| `distExists` | `file("dist/index.js")` |
| `testAndTypecheck` | `commandAll("bun test", "bunx tsc --noEmit")` |

### OnFail factories

| Factory | Example |
|---------|---------|
| `retry(max?)` | `retry(3)` — retry up to 3 times |
| `skip` | `skip` — mark as skipped, pass empty downstream |
| `fallback(step)` | `fallback(myFallbackStep)` — run alternative step |

### Example: using factories in a step

```ts
import { command, retry } from "../../gates/index.js";

export const buildStep: Step = {
  kind: "step",
  label: "Build",
  agent: "coder",
  description: "Build the project",
  prompt: "...",
  gate: command("bun build"),     // ← parameterized
  onFail: retry(2),               // ← parameterized
  transform: { kind: "full" },
};
```

### Example: using factories on a composition node

```ts
import { bunTest, testAndTypecheck, retry } from "../gates/index.js";

const pipeline: Runnable = {
  kind: "sequential",
  steps: [planStep, buildStep, testStep],
  gate: testAndTypecheck,   // ← validates the whole sequence
  onFail: retry(2),         // ← retries ALL steps if gate fails
};
```

## Prompt Variables

- `$INPUT` — Output of the previous step (or user input for the first step)
- `$ORIGINAL` — The user's original request (preserved through the entire pipeline)

## Slash Commands

- `/captain` — List all pipelines
- `/captain <name>` — Show pipeline details
- `/captain-load` — List available pipeline presets
- `/captain-load <name>` — Load a preset (tab-completable)
- `/captain-run <name> <input>` — Quick-run a pipeline
