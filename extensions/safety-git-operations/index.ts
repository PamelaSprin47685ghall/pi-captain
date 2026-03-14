/**
 * Safety Guard: Git & SCM Operations
 *
 * 🔴 Critical (always confirm, auto-deny 30s): push --force, reset --hard, clean -f,
 *    stash drop/clear, branch -D, reflog expire
 * 🟡 Standard (confirm + session-remember): push, commit, rebase, merge, tag, cherry-pick,
 *    revert; gh/glab PR/issue/release/secrets
 * ⛔ Always-blocked: permanently forbidden destructive ops (no override)
 *
 * Features: per-action session memory, /git-safety command, non-UI auto-block.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { processPatternMatch } from "./handlers.js";
import {
	ALWAYS_BLOCKED_PATTERNS,
	GIT_PATTERNS,
	resetSessionMemory,
	sessionApproved,
	sessionBlocked,
} from "./patterns.js";

// ── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Reset session memory on new/switched sessions
	pi.on("session_start", async (_event, ctx) => {
		resetSessionMemory();
		if (ctx.hasUI) {
			ctx.ui.setStatus(
				"safety-git",
				ctx.ui.theme.fg("success", "🔀 git-guard"),
			);
		}
	});
	pi.on("session_switch", async () => resetSessionMemory());

	// /git-safety command: view status and manage session approvals
	pi.registerCommand("git-safety", {
		description: "View git safety status and reset session approvals",
		handler: async (_args, ctx) => {
			const lines = ["─── Git Safety Status ───", ""];

			if (sessionApproved.size > 0) {
				lines.push("✅ Auto-approved for this session:");
				for (const action of Array.from(sessionApproved))
					lines.push(`   • ${action}`);
				lines.push("");
			}
			if (sessionBlocked.size > 0) {
				lines.push("🚫 Auto-blocked for this session:");
				for (const action of Array.from(sessionBlocked))
					lines.push(`   • ${action}`);
				lines.push("");
			}
			if (sessionApproved.size === 0 && sessionBlocked.size === 0) {
				lines.push(
					"No session overrides active — all operations prompt normally.",
				);
				lines.push("");
			}
			lines.push("Use /git-safety reset to clear all session overrides.");
			lines.push("───────────────────────");

			ctx.ui.notify(lines.join("\n"), "info");

			// Handle "reset" argument
			if (_args.trim().toLowerCase() === "reset") {
				resetSessionMemory();
				ctx.ui.notify("✅ Session git approvals/blocks cleared.", "info");
			}
		},
	});

	// Intercept bash tool calls for git/gh/glab commands
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return undefined;

		const command = event.input.command;

		// Hard blocks — permanently forbidden, no confirmation, no override
		for (const { pattern, action, reason } of ALWAYS_BLOCKED_PATTERNS) {
			if (!pattern.test(command)) continue;
			if (ctx.hasUI)
				ctx.ui.notify(
					`🚫 ${action} is permanently blocked\n\n${reason}`,
					"error",
				);
			return { block: true, reason };
		}

		// Find first matching pattern (patterns are ordered critical-first)
		for (const { pattern, action, severity } of GIT_PATTERNS) {
			if (!pattern.test(command)) continue;
			return await processPatternMatch({ action, severity, command, ctx });
		}

		return undefined;
	});
}
