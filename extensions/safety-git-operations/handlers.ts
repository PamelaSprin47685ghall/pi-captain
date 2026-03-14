/**
 * Confirmation dialog handlers for git safety guard.
 * Handles critical (auto-deny 30s) and standard (session-remember) flows.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { sessionApproved, sessionBlocked } from "./patterns.js";

export async function processPatternMatch(opts: {
	action: string;
	severity: string;
	command: string;
	ctx: ExtensionContext;
}) {
	const { action, severity, command, ctx } = opts;
	// Check session memory first
	if (sessionBlocked.has(action)) {
		if (ctx.hasUI)
			ctx.ui.notify(`🚫 ${action} — auto-blocked (session)`, "warning");
		return { block: true, reason: `${action} blocked (session setting)` };
	}
	if (sessionApproved.has(action)) {
		return undefined; // silently approved
	}
	// No UI? Block everything
	if (!ctx.hasUI) {
		return {
			block: true,
			reason: `${action} requires confirmation (no UI)`,
		};
	}
	// Build confirmation dialog
	const displayCmd =
		command.length > 120 ? `${command.slice(0, 120)}…` : command;

	if (severity === "critical") {
		return await handleCritical({ action, displayCmd, ctx });
	}
	return await handleStandard({ action, displayCmd, ctx });
}

async function handleCritical(opts: {
	action: string;
	displayCmd: string;
	ctx: ExtensionContext;
}) {
	const { action, displayCmd, ctx } = opts;
	// Critical: simple confirm with auto-deny timeout (30s)
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30_000);

	const choice = await ctx.ui.select(
		`🔴 CRITICAL: ${action}\n\n  ${displayCmd}\n\nAllow? (auto-deny in 30s)`,
		["✅ Allow once", "🚫 Block"],
		{ signal: controller.signal },
	);

	clearTimeout(timeout);
	if (controller.signal.aborted || choice !== "✅ Allow once") {
		const reason = controller.signal.aborted
			? "Timed out (30s)"
			: "Blocked by user";
		return { block: true, reason: `${action}: ${reason}` };
	}
	return undefined;
}

async function handleStandard(opts: {
	action: string;
	displayCmd: string;
	ctx: ExtensionContext;
}) {
	const { action, displayCmd, ctx } = opts;
	// Standard: offer session-remember options
	const choice = await ctx.ui.select(
		`🟡 ${action}\n\n  ${displayCmd}\n\nAllow?`,
		[
			"✅ Allow once",
			"🚫 Block once",
			`✅✅ Auto-approve "${action}" for this session`,
			`🚫🚫 Auto-block "${action}" for this session`,
		],
	);

	if (!choice || choice.startsWith("🚫🚫")) {
		sessionBlocked.add(action);
		ctx.ui.notify(
			`🚫 All "${action}" commands auto-blocked for this session`,
			"warning",
		);
		return { block: true, reason: `${action} blocked by user (session)` };
	}
	if (choice.startsWith("🚫")) {
		return { block: true, reason: `${action} blocked by user` };
	}
	if (choice.startsWith("✅✅")) {
		sessionApproved.add(action);
		ctx.ui.notify(
			`✅ All "${action}" commands auto-approved for this session`,
			"info",
		);
	}
	return undefined;
}
