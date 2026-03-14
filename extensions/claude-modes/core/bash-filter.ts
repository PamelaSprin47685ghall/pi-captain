/**
 * Bash safety filter — pure logic, no side-effects
 */

import type { ModeName } from "./modes.js";

// ─── Bash safety patterns ─────────────────────────────────────────────────────

const SAFE_PATTERNS: RegExp[] = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*rg\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*ps\b/,
	/^\s*jq\b/,
	/^\s*awk\b/,
	/^\s*sed\s+-n/i,
	/^\s*bat\b/,
	/^\s*fd\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|ls-files|ls-tree)/i,
	/^\s*npm\s+(list|ls|view|info|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python3?\s+--version/i,
	/^\s*curl\b/,
];

const DESTRUCTIVE_PATTERNS: RegExp[] = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bsudo\b/i,
	/\bkill\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/[^<]>(?![>&])/, // stdout redirect
	/>>/, // append redirect
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout\s+-b|stash\s+pop|cherry-pick|revert|tag\s+[^-])/i,
	/\bnpm\s+(install|uninstall|update|ci|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bpip\s+(install|uninstall)/i,
];

export function isSafeCommand(command: string): boolean {
	if (DESTRUCTIVE_PATTERNS.some((p) => p.test(command))) return false;
	return SAFE_PATTERNS.some((p) => p.test(command));
}

// ─── Context-filter helpers ───────────────────────────────────────────────────

export type MessageLike = { role?: unknown; content?: unknown };
type ContentPart = { type?: unknown; text?: unknown };

export function isStaleInjection(m: MessageLike, mode: ModeName): boolean {
	if (m.role !== "user") return false;
	const parts: ContentPart[] = Array.isArray(m.content)
		? (m.content as ContentPart[])
		: [];
	for (const c of parts) {
		if (c.type !== "text") continue;
		const text = typeof c.text === "string" ? c.text : "";
		if (text.includes("[PLAN MODE ACTIVE]") && mode !== "plan") return true;
		if (text.includes("[REVIEW MODE ACTIVE]") && mode !== "review") return true;
	}
	return false;
}
