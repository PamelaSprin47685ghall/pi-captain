---
name: captain
description: >
  Orchestrate multi-step workflows using Captain pipelines. Each step declares
  its own model, tools, and temperature inline — no separate agent setup needed.
  Supports sequential, parallel, and pool composition with quality gates,
  failure handling, and merge strategies. Use when building research, code
  generation, review, or any multi-step LLM workflow.
---

# Captain — Pipeline Orchestration

## Overview

Captain turns pi into a pipeline orchestration platform. Define typed pipeline specs with sequential, parallel, and pool composition patterns, then execute them with automatic git worktree isolation, gate validation, failure handling, and merge strategies.

## When to Use

- Multi-step workflows: research → synthesize → review
- Parallel exploration: run the same task N ways and merge results
- Quality gates: validate outputs with shell commands, file checks, or human approval
- Complex code generation: plan → implement → test → fix loops

## Available Tools

| Tool | Purpose |
|------|---------|
| `captain_define` | Define a pipeline from a JSON Runnable spec |
| `captain_load` | Load a precreated pipeline from a preset or JSON file |
| `captain_run` | Execute a defined pipeline with input |
| `captain_status` | Check step-by-step results of a pipeline |
| `captain_list` | List all defined pipelines |
| `captain_generate` | Auto-generate a pipeline from a goal description |

## Step Fields

Each step runs as an in-process pi SDK session. All config fields are optional — defaults are sensible.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `label` | string | required | Display name for the step |
| `prompt` | string | required | Prompt sent to the step. Supports `$INPUT`, `$ORIGINAL` |
| `model` | string | session model | Model identifier (e.g. `"flash"`, `"sonnet"`) |
| `tools` | string[] | `["read","bash","edit","write"]` | Tool names to enable |
| `temperature` | number | — | Sampling temperature (0–1) |
| `systemPrompt` | string | — | System prompt for the LLM session |
| `skills` | string[] | — | Additional skill file paths to inject |
| `extensions` | string[] | — | Additional extension file paths to load |
| `jsonOutput` | boolean | `false` | Ask the step to produce structured JSON output |
| `gate` | Gate | required | Validation after the step runs |
| `onFail` | OnFail | required | What to do when the gate fails |
| `transform` | Transform | required | How to pass output to the next step |

## Quick Start

### 1. Define a pipeline

```json
{
  "kind": "sequential",
  "steps": [
    {
      "kind": "step",
      "label": "Research",
      "model": "sonnet",
      "tools": ["read", "bash"],
      "prompt": "Research the following topic thoroughly:\n$ORIGINAL",
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
      "tools": ["read", "bash"],
      "temperature": 0.3,
      "jsonOutput": true,
      "prompt": "Review this implementation:\n$INPUT\n\nOriginal request: $ORIGINAL\n\nReturn JSON: {score, issues[], verdict}",
      "gate": { "type": "user", "value": true },
      "onFail": { "action": "skip" },
      "transform": { "kind": "summarize" }
    }
  ]
}
```

### 2. Run it

```
captain_run: name="my-pipeline", input="Build a REST API for user management"
```

## Loading Pipeline Presets

Instead of defining pipelines manually, load precreated presets:

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
  "pipeline": {
    "kind": "sequential",
    "steps": [...]
  }
}
```

### Slash command
- `/captain-load` — list available presets
- `/captain-load <name>` — load a preset (with tab completion)

## Composition Patterns

### Sequential (steps chain via $INPUT)
Each step's output becomes the next step's `$INPUT`. Use for linear workflows.

### Parallel (different tasks concurrently)
Run different steps on the same input simultaneously. Each gets its own git worktree. Results are merged via strategy.

```json
{
  "kind": "parallel",
  "steps": [
    { "kind": "step", "label": "Frontend", "tools": ["read","bash","edit","write"], "..." : "..." },
    { "kind": "step", "label": "Backend", "tools": ["read","bash","edit","write"], "..." : "..." },
    { "kind": "step", "label": "Tests", "tools": ["read","bash"], "..." : "..." }
  ],
  "merge": { "strategy": "concat" }
}
```

### Pool (same task × N with voting)
Replicate one step N times for diverse solutions, then merge. Great for brainstorming or reducing variance.

```json
{
  "kind": "pool",
  "step": { "kind": "step", "label": "Solve", "tools": ["read","bash","edit","write"], "..." : "..." },
  "count": 3,
  "merge": { "strategy": "vote" }
}
```

### Nested Composition
Any slot that accepts a step also accepts sequential, pool, or parallel — infinite nesting.

## Merge Strategies

| Strategy | Behavior |
|----------|----------|
| `concat` | Join all outputs with separators |
| `awaitAll` | Wait for all, then concatenate |
| `firstPass` | Take the first successful output |
| `vote` | LLM picks the best/most common answer |
| `rank` | LLM ranks outputs and synthesizes top ones |

## Gate Types

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

## Gate Factories (TypeScript pipelines)

When building pipelines as `.ts` modules, import parameterized gate factories:

```ts
import { command, outputMinLength, bunTest, none, retry, skip } from "../gates/index.js";
```

| Factory | Gate produced |
|---------|---------------|
| `none` | Always passes |
| `user` | Human approval |
| `command(cmd)` | Shell command, exit 0 = pass |
| `file(path)` | File existence check |
| `outputMinLength(n)` | Output at least N chars |
| `bunTest` | `command("bun test")` |
| `testAndTypecheck` | `commandAll("bun test", "bunx tsc --noEmit")` |

## Prompt Variables

- `$INPUT` — Output of the previous step (or user input for the first step)
- `$ORIGINAL` — The user's original request (preserved through the entire pipeline)

## Slash Commands

- `/captain` — List all pipelines
- `/captain <name>` — Show pipeline details
- `/captain-load` — List available pipeline presets
- `/captain-load <name>` — Load a preset (tab-completable)
- `/captain-run <name> <input>` — Quick-run a pipeline
