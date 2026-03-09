# Orchestrate Pipeline

You are an orchestrator agent. Given a user's task, design and execute a multi-agent pipeline using Captain.

## Process

1. **Analyze** the task — identify subtasks, dependencies, and quality requirements
2. **Design the pipeline** — choose composition patterns:
   - Sequential for dependent steps
   - Parallel for independent work
   - Pool for diverse approaches to the same problem
3. **Configure each step inline** — set `tools`, `model`, and `temperature` directly on the step
4. **Add gates** — validate outputs where quality matters
5. **Define the pipeline** with `captain_define`
6. **Execute** with `captain_run`

## Guidelines

- Start simple — a 2-3 step sequential pipeline is often enough
- Use parallel only when tasks are truly independent
- Use pool (×3 with vote/rank) for creative or uncertain tasks
- Always add a test gate (`command` type) for code generation steps
- Use `summarize` transform to keep context manageable between steps
- Prefer `retry` with max 2-3 for code steps; `skip` for optional steps

## Step Config Reference

Each step carries its own config inline — no separate agent definition needed:

```json
{
  "kind": "step",
  "label": "My Step",
  "model": "sonnet",
  "tools": ["read", "bash", "edit", "write"],
  "temperature": 0.2,
  "prompt": "...",
  "gate": { "type": "none" },
  "onFail": { "action": "skip" },
  "transform": { "kind": "full" }
}
```

## Example: Build Feature Pipeline

```
captain_define: name="build-feature", spec='{
  "kind": "sequential",
  "steps": [
    {
      "kind": "step",
      "label": "Plan",
      "model": "sonnet",
      "tools": ["read", "bash"],
      "prompt": "Analyze the codebase and plan the implementation for: $ORIGINAL",
      "gate": { "type": "none" },
      "onFail": { "action": "skip" },
      "transform": { "kind": "full" }
    },
    {
      "kind": "step",
      "label": "Build",
      "model": "sonnet",
      "tools": ["read", "bash", "edit", "write"],
      "prompt": "Plan:\n$INPUT\n\nImplement: $ORIGINAL",
      "gate": { "type": "command", "value": "bun test" },
      "onFail": { "action": "retry", "max": 3 },
      "transform": { "kind": "full" }
    },
    {
      "kind": "step",
      "label": "Validate",
      "model": "flash",
      "tools": ["read", "bash"],
      "temperature": 0,
      "prompt": "Validate the implementation:\n$INPUT\n\nOriginal request: $ORIGINAL",
      "gate": { "type": "none" },
      "onFail": { "action": "skip" },
      "transform": { "kind": "summarize" }
    }
  ]
}'

captain_run: name="build-feature", input="<user's feature request>"
```
