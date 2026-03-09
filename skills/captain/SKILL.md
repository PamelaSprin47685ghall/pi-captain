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

## Quick Start

### 1. Define a pipeline

Each step declares its own `tools`, `model`, and `temperature` inline — no separate agent setup needed.

```
captain_define: name="my-pipeline", spec='{
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
      "prompt": "Based on this research:\n$INPUT\n\nImplement: $ORIGINAL",
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
      "prompt": "Review this implementation:\n$INPUT\n\nOriginal: $ORIGINAL",
      "gate": { "type": "user", "value": true },
      "onFail": { "action": "skip" },
      "transform": { "kind": "summarize" }
    }
  ]
}'
```

### 2. Run it

```
captain_run: name="my-pipeline", input="Build a REST API for user management"
```

## Step Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `label` | string | required | Display name shown in UI |
| `prompt` | string | required | Instructions for the step. Supports `$INPUT`, `$ORIGINAL` |
| `model` | string | session model | e.g. `"sonnet"`, `"flash"` |
| `tools` | string[] | `["read","bash","edit","write"]` | Tool names to enable |
| `temperature` | number | — | Sampling temperature (0–1) |
| `systemPrompt` | string | — | System prompt for the LLM session |
| `skills` | string[] | — | Additional skill file paths to inject |
| `extensions` | string[] | — | Additional extension file paths to load |
| `jsonOutput` | boolean | `false` | Instructs step to produce structured JSON |
| `gate` | Gate | required | Validation after step runs |
| `onFail` | OnFail | required | What to do when gate fails |
| `transform` | Transform | required | How to pass output to the next step |

## Loading Pipeline Presets

```
captain_load: action="list"
captain_load: action="load", name="research-and-summarize"
captain_load: action="load", name="./my-pipeline.json"
```

Preset file format:
```json
{
  "pipeline": {
    "kind": "sequential",
    "steps": [...]
  }
}
```

## Composition Patterns

### Sequential — chain via $INPUT
```json
{ "kind": "sequential", "steps": [...] }
```

### Parallel — different steps concurrently (each in own git worktree)
```json
{
  "kind": "parallel",
  "steps": [
    { "kind": "step", "label": "Frontend", "tools": ["read","bash","edit","write"], "..." : "..." },
    { "kind": "step", "label": "Backend",  "tools": ["read","bash","edit","write"], "..." : "..." }
  ],
  "merge": { "strategy": "concat" }
}
```

### Pool — same step × N (each in own git worktree)
```json
{
  "kind": "pool",
  "step": { "kind": "step", "label": "Solve", "tools": ["read","bash","edit","write"], "..." : "..." },
  "count": 3,
  "merge": { "strategy": "vote" }
}
```

## Merge Strategies

| Strategy | Behavior |
|----------|----------|
| `concat` | Join all outputs with separators |
| `awaitAll` | Wait for all, concatenate |
| `firstPass` | Take the first successful output |
| `vote` | LLM picks the best/most common answer |
| `rank` | LLM ranks outputs and returns the top one |

## Gate Types

| Gate | Use When |
|------|----------|
| `{ "type": "none" }` | No validation needed |
| `{ "type": "command", "value": "bun test" }` | Code must pass tests |
| `{ "type": "file", "value": "dist/index.js" }` | Build output must exist |
| `{ "type": "user", "value": true }` | Human must approve |
| `{ "type": "assert", "fn": "output.includes('OK')" }` | Output must match condition |
| `{ "type": "llm", "prompt": "Is this production-ready?", "threshold": 0.8 }` | LLM evaluation |

## Failure Handling

| OnFail | Behavior |
|--------|----------|
| `{ "action": "retry", "max": 3 }` | Re-run up to N times |
| `{ "action": "skip" }` | Pass empty downstream |
| `{ "action": "warn" }` | Log warning, continue |
| `{ "action": "fallback", "step": {...} }` | Run alternative step |

## Prompt Variables

- `$INPUT` — Output of the previous step (or user input for the first step)
- `$ORIGINAL` — The user's original request (preserved throughout the pipeline)

## Slash Commands

- `/captain` — List all pipelines
- `/captain <name>` — Show pipeline structure
- `/captain-load` — List available presets
- `/captain-load <name>` — Load a preset (tab-completable)
- `/captain-run <name> <input>` — Quick-run a pipeline
- `/captain-step <prompt> --model <id> --tools <t1,t2>` — Run a single ad-hoc step
