# omp-auto-loop

General-purpose agent loop extension for the Oh-My-Pi coding agent. When you send a normal (non-slash) message it becomes the loop goal and the extension runs repeated agent turns until the goal is finished or you stop the loop.

## Install

```bash
omp plugin install omp-auto-loop
```

## Overview

- Starts a loop when the user sends a normal message (one that does NOT start with `/`). That message becomes the loop `goal`.
- Injects a short loop-focused system prompt so the agent knows the current iteration and goal.
- Provides a tool named `loop_control` which the agent must call to indicate progress: use `status: "next"` to continue, or `status: "done"` to finish.
- Registers a `loop-stop` command and a `Ctrl+Shift+X` shortcut to stop the active loop from the UI.

## Usage

- Start a loop: send a normal message like `Refactor all test files to use the new assertion API` (do NOT prefix with `/`). The extension will begin iterating on that goal.
- One-off message: prefix with `/once ` to send a single, non-looping turn (e.g. `/once Quick status check`).
- Stop loop: run the `loop-stop` command or press `Ctrl+Shift+X` to abort the active loop immediately.

## Tool: `loop_control`

Call this tool from the assistant to signal what happened during the iteration. The tool is only meaningful while a loop is active.

Parameters:

- `status` — string: either `"next"` or `"done"`.
- `summary` — string: brief summary of what was accomplished this iteration.
- `reason` — optional string: a reason explaining why the goal is complete (used with `"done"`).

Behavior notes:

- When the model calls `loop_control` with `status: "next"`, the extension advances the iteration count and schedules the next iteration (it sends a steer message with the updated loop prompt).
- When the model calls `loop_control` with `status: "done"`, the extension asks for confirmation (it sets a `confirmingDone` flag and returns a prompt asking the model to either call `loop_control` again or finish the response). The loop is finalized if the model finishes the response (skips calling `loop_control` again) or explicitly confirms by calling `loop_control` with `done` again.

Fallbacks:

- If the agent ends its turn without calling `loop_control` and without scheduling the next step, the extension increments the iteration count and sends a steer message reminding the agent to call `loop_control` (so work won't silently stop).

## Examples

- Start by sending a goal (normal message):

```
Refactor all test files to use the new assertion API
```

- Example tool call (assistant -> tool):

```json
{
	"toolName": "loop_control",
	"params": { "status": "next", "summary": "Refactored 3 files; more work remains" }
}
```

- Marking completion (assistant -> tool):

```json
{
	"toolName": "loop_control",
	"params": { "status": "done", "summary": "All tests updated and passing" }
}
```

If the extension asks for confirmation after a `done` call, finish the response (or call `loop_control` with `done` again) to finalize the loop.

## UI

- While a loop is active the status bar and a small widget show the current iteration and provide the `Ctrl+Shift+X` stop shortcut.

## Notes

- Package name: `omp-auto-loop` (see `package.json`).
- Peer-dep: this extension expects to run within `@oh-my-pi/pi-coding-agent`.
