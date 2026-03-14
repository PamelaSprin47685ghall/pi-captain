/**
 * Mode definitions — pure data, no side-effects
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModeName = "code" | "plan" | "review";

export interface ModeConfig {
	label: string;
	emoji: string;
	statusColor: "success" | "warning" | "accent";
	tools: string[];
	readOnly: boolean;
	systemNote: string | null;
	description: string;
}

// ─── Mode definitions ─────────────────────────────────────────────────────────

export const MODES: Record<ModeName, ModeConfig> = {
	code: {
		label: "Code",
		emoji: "⚡",
		statusColor: "success",
		tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
		readOnly: false,
		systemNote: null,
		description: "Full tools — implement, edit, run commands",
	},
	plan: {
		label: "Plan",
		emoji: "⏸",
		statusColor: "warning",
		tools: ["read", "bash", "grep", "find", "ls"],
		readOnly: true,
		systemNote: `[PLAN MODE ACTIVE]
You are in plan mode — a read-only exploration mode for safe code analysis and planning.

RESTRICTIONS:
- Do NOT modify any files (edit/write tools are disabled)
- Bash is restricted to read-only commands; destructive commands will be blocked
- Only use: read, bash (read-only), grep, find, ls

YOUR TASK:
- Explore and understand the codebase
- Ask clarifying questions as needed
- Produce a clear, numbered action plan under a "Plan:" heading:

  Plan:
  1. First step
  2. Second step
  ...

Do NOT execute changes — just plan them.`,
		description: "Read-only exploration — analyse, then produce a plan",
	},
	review: {
		label: "Review",
		emoji: "🔍",
		statusColor: "accent",
		tools: ["read", "bash", "grep", "find", "ls"],
		readOnly: true,
		systemNote: `[REVIEW MODE ACTIVE]
You are in review mode — a read-only code review assistant.

RESTRICTIONS:
- Do NOT modify any files (edit/write tools are disabled)
- Bash is restricted to read-only commands; destructive commands will be blocked
- Only use: read, bash (read-only), grep, find, ls

YOUR TASK:
- Review the code thoroughly
- Identify bugs, security issues, performance problems, and style violations
- Suggest concrete improvements with code examples
- Summarise findings by severity: 🔴 Critical / 🟡 Warning / 🟢 Suggestion

Do NOT apply changes — only describe what should change and why.`,
		description: "Read-only review — identify issues, suggest improvements",
	},
};

export const MODE_ORDER: ModeName[] = ["code", "plan", "review"];
