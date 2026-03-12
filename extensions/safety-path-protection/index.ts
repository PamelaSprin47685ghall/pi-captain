/**
 * Safety Guard: Path Protection
 *
 * Protects sensitive directories and files from unauthorized access:
 *
 * Hard-blocked (read & write):
 *   - .git/ internals — prevents repository corruption
 *
 * Hard-blocked (write only, read allowed):
 *   - node_modules/ — use package manager instead
 *   - .env, .env.local, .env.production, .env.* — secrets files
 *
 * Confirmation required (write):
 *   - Lock files (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lock)
 *   - CI/CD configs (.github/workflows/, .gitlab-ci.yml)
 *   - Docker configs (Dockerfile, docker-compose.yml)
 *
 * Applies to: read, write, edit tools AND bash commands that reference these paths.
 * The bash check uses regex extraction — not a full parser — so it may over-match,
 * which is the safe default.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
	ToolCallEvent,
} from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import {
	classifyReadPath,
	classifyWritePath,
	extractProtectedRefs,
	READ_ONLY_COMMANDS,
} from "./classifiers.js";

// ── Tool call handlers ──────────────────────────────────────────────────────

/** Handle file operations (read, write, edit) with path protection */
async function handleFileTool(event: ToolCallEvent, ctx: ExtensionContext) {
	const isRead = isToolCallEventType("read", event);
	const isWrite =
		isToolCallEventType("write", event) || isToolCallEventType("edit", event);
	if (!(isRead || isWrite)) return undefined;

	const filePath = String(event.input.path ?? "");
	if (!filePath) return undefined;

	// Read vs write classification
	const { action, reason } = isWrite
		? classifyWritePath(filePath)
		: classifyReadPath(filePath);

	if (action === "block") {
		if (ctx.hasUI) ctx.ui.notify(`🔒 Blocked: ${reason}`, "warning");
		return { block: true, reason };
	}

	if (action === "confirm") {
		if (!ctx.hasUI)
			return { block: true, reason: `${reason} (non-interactive)` };
		const ok = await ctx.ui.confirm(
			"🔒 Protected file",
			`${filePath}\n\n${reason}\n\nAllow?`,
		);
		return ok
			? undefined
			: { block: true, reason: `${reason} — blocked by user` };
	}

	return undefined;
}

/** Check a single path reference for bash command protection */
async function checkPathRef(
	ref: string,
	isReadOnly: boolean,
	command: string,
	ctx: ExtensionContext,
) {
	const { action, reason } = isReadOnly
		? classifyReadPath(ref)
		: classifyWritePath(ref);

	if (action === "block") {
		if (ctx.hasUI) ctx.ui.notify(`🔒 Blocked bash access: ${ref}`, "warning");
		return { block: true, reason: `Command references ${ref}: ${reason}` };
	}

	if (action === "confirm") {
		if (!ctx.hasUI)
			return { block: true, reason: `${reason} (non-interactive)` };
		const displayCmd =
			command.length > 100 ? `${command.slice(0, 100)}…` : command;
		const ok = await ctx.ui.confirm(
			"🔒 Protected path in command",
			`${displayCmd}\n\nReferences: ${ref}\n${reason}\n\nAllow?`,
		);
		return ok
			? undefined
			: { block: true, reason: `${reason} — blocked by user` };
	}

	return undefined;
}

/** Handle bash commands with path reference protection */
async function handleBashTool(event: ToolCallEvent, ctx: ExtensionContext) {
	if (!isToolCallEventType("bash", event)) return undefined;

	const command = event.input.command;
	const refs = extractProtectedRefs(command);
	if (refs.length === 0) return undefined;

	// For read-only commands, only block .git/ access
	const isReadOnly = READ_ONLY_COMMANDS.test(command);

	for (const ref of refs) {
		const result = await checkPathRef(ref, isReadOnly, command, ctx);
		if (result) return result;
	}

	return undefined;
}

// ── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// File tool protection (read, write, edit)
	pi.on("tool_call", handleFileTool);

	// Bash command path protection
	pi.on("tool_call", handleBashTool);

	// Show active status on session start
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setStatus(
				"safety-paths",
				ctx.ui.theme.fg("success", "🔒 path-guard"),
			);
		}
	});
}
