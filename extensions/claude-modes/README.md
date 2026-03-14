# 🔀 Claude Modes

Switch Claude between three operating modes with a single command, keyboard shortcut, or CLI flag.

## Install

```bash
pi install npm:pi-claude-modes
```

## Modes

| Mode | Emoji | Tools | Purpose |
|------|-------|-------|---------|
| **code** | ⚡ | read, bash, edit, write, grep, find, ls | Default — full access, implementation |
| **plan** | ⏸ | read, bash (safe), grep, find, ls | Read-only exploration, produces a numbered plan |
| **review** | 🔍 | read, bash (safe), grep, find, ls | Read-only code review with severity ratings |

## Usage

```
/mode              → interactive picker (SelectList)
/mode plan         → switch directly by name (tab-complete)
/plan              → toggle plan mode on/off
/review            → toggle review mode on/off
Ctrl+Shift+M       → cycle code → plan → review
pi --plan          → start directly in plan mode from CLI
```

## What each mode does

### ⚡ Code (default)
Full tool access. No restrictions. No status indicator — stays out of your way.

### ⏸ Plan
- Restricts tools to `read`, `bash` (safe commands only), `grep`, `find`, `ls`
- Blocks `edit` and `write` at the tool-call gate, even if other extensions re-enable them
- Filters destructive bash commands (`rm`, `mv`, `git commit`, write redirects `>`, etc.)
- Injects a `[PLAN MODE ACTIVE]` system note telling Claude to explore and produce a numbered plan
- Shows `⏸ Plan` in the footer status bar

### 🔍 Review
- Same tool and bash restrictions as plan mode
- Injects a `[REVIEW MODE ACTIVE]` system note telling Claude to identify issues by severity (🔴 Critical / 🟡 Warning / 🟢 Suggestion)
- Shows `🔍 Review` in the footer status bar

## State persistence

Mode is saved as a session entry on every turn start and on every explicit switch. Branch navigation (`/tree`, `/fork`) restores the mode that was active on that branch.
