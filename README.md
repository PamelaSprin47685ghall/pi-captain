# pi-captain

Multi-agent pipeline orchestrator for [pi](https://github.com/badlogic/pi-mono). Define specialized agents, wire them into sequential/parallel/pool pipelines with quality gates, and run complex workflows.

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
| `captain_agent` | Define a reusable named agent (model, tools, systemPrompt) |
| `captain_define` | Wire steps into a pipeline (sequential / parallel / pool) |
| `captain_run` | Execute a pipeline with input, gates enforce quality |
| `captain_status` | Check pipeline progress and results |
| `captain_list` | List all defined pipelines |
| `captain_load` | Load a builtin pipeline preset |
| `captain_generate` | Auto-generate a pipeline from a goal description |

### Builtin Pipeline Presets

All builtin presets are prefixed with `captain:` to avoid naming collisions with your own pipelines.

| Preset | Description |
|--------|-------------|
| `captain:shredder` | Clarify → decompose → shred to atomic units → validate → resolve deps → generate pipeline spec → Obsidian canvas |
| `captain:spec-tdd` | Spec → TDD red → TDD green + docs (parallel) → review → PR |
| `captain:requirements-gathering` | Explore → deep-dive → challenge → synthesize REQUIREMENTS.md |

All 23 agents used by these pipelines are **bundled in the repo** under `extensions/captain/agents/` — no external setup needed. Your own agents (in `~/.pi/agent/agents/` or `.claude/agents/`) take precedence and can override bundled ones.

### How Steps Work

Each step runs as an in-process pi SDK session (`createAgentSession`) — no subprocess overhead, direct access to the agent lifecycle.

You can configure a step **inline** (no agent file needed), **by name** (reusable agent), or **both** (inline overrides named defaults):

```json
{ "kind": "step", "label": "Analyze", "model": "flash", "tools": ["read","bash"],
  "jsonOutput": true, "prompt": "Analyze $INPUT and return JSON {score, issues[]}", ... }

{ "kind": "step", "label": "Implement", "agent": "coder",
  "prompt": "Implement: $ORIGINAL\n\nContext: $INPUT", ... }

{ "kind": "step", "label": "Fast review", "agent": "reviewer", "model": "flash",
  "prompt": "Quick review of $INPUT", ... }
```

| Field | Default | Description |
|-------|---------|-------------|
| `agent` | — | Named agent (optional) |
| `model` | `"sonnet"` | Model identifier (resolved via pattern matching, e.g. `"flash"`, `"claude-opus-4-5"`) |
| `tools` | `["read","bash","edit","write"]` | Tool names to enable (`"read"`, `"bash"`, `"edit"`, `"write"`, `"grep"`, `"find"`, `"ls"`) |
| `systemPrompt` | — | System prompt override for this step |
| `skills` | — | Additional skill file paths to inject |
| `extensions` | — | Additional extension file paths to load |
| `jsonOutput` | `false` | Ask the agent to produce structured JSON output |

### Pipeline Composition

```
sequential  — A then B then C  ($INPUT chains between steps)
parallel    — A + B + C simultaneously, each in its own git worktree, merge results
pool        — Run same step N times, pick best
```

**Merge strategies:** `concat` | `rank` | `vote` | `firstPass` | `awaitAll`

**Gate types:** `command` (run tests) | `llm` (AI judges quality) | `assert` | `user` | `file` | `none`

**Failure handling:** `retry` (with max attempts) | `skip` | `fallback`

## Quick Start

```
# Load and run a builtin preset
> Use captain to review my PR

# Generate a custom pipeline on the fly
> Use captain to refactor the auth module and ensure all tests pass

# Define a custom inline pipeline (no agent setup needed)
> Define a captain pipeline: first analyze the codebase with flash+read, then implement with sonnet+all tools, then run bun test as a gate
```

## Development

```bash
# Clone and develop locally
git clone https://github.com/Pierre-Mike/pi-captain.git
cd pi-captain
npm install          # installs deps + sets up Husky git hooks via `prepare`

# Add as local package for development
# In ~/.pi/agent/settings.json or .pi/settings.json:
{ "packages": ["/path/to/pi-captain"] }

# Edit files, then /reload in pi to pick up changes
```

### Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run check` | `biome check extensions/ skills/` | Lint & format check (CI / pre-push) |
| `npm run fix` | `biome check --write extensions/ skills/` | Auto-fix lint & format issues |
| `npm run format` | `biome format --write extensions/ skills/` | Format only |

### Git Hooks

Git hooks are managed by [Husky](https://typicode.github.io/husky/) and run automatically after `npm install`.

| Hook | What runs | Purpose |
|------|-----------|---------|
| **pre-commit** | `lint-staged` → `biome check --write` on staged `*.{ts,js,json}` | Auto-fix and gate staged files before commit |
| **pre-push** | `npm run check` | Full lint & format check on the entire codebase before push |

## License

MIT
