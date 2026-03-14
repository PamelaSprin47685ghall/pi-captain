/** Claude Mode Switcher — /mode, /plan, /review, Ctrl+Shift+M, --plan flag */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import {
	isSafeCommand,
	isStaleInjection,
	type MessageLike,
} from "./core/bash-filter.js";
import { MODE_ORDER, MODES, type ModeName } from "./core/modes.js";
import { showPicker } from "./ui/picker.js";

export default function (pi: ExtensionAPI) {
	let currentMode: ModeName = "code";
	let previousMode: ModeName = "code";

	// ── Internal helpers ──────────────────────────────────────────────────────

	function applyMode(ctx: ExtensionContext, mode: ModeName): void {
		previousMode = currentMode;
		currentMode = mode;
		const cfg = MODES[mode];
		pi.setActiveTools(cfg.tools);
		updateStatus(ctx);
		pi.appendEntry("claude-mode", { mode: currentMode });
		if (ctx.hasUI) {
			ctx.ui.notify(
				`${cfg.emoji} ${cfg.label} mode — ${cfg.description}`,
				"info",
			);
		}
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		const cfg = MODES[currentMode];
		if (currentMode === "code") {
			ctx.ui.setStatus("claude-mode", undefined);
		} else {
			ctx.ui.setStatus(
				"claude-mode",
				ctx.ui.theme.fg(cfg.statusColor, `${cfg.emoji} ${cfg.label}`),
			);
		}
	}

	function restoreFromBranch(ctx: ExtensionContext): void {
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== "claude-mode")
				continue;
			const data = entry.data as { mode?: unknown } | undefined;
			if (typeof data?.mode === "string" && data.mode in MODES) {
				currentMode = data.mode as ModeName;
			}
		}
	}

	function initSession(ctx: ExtensionContext, checkFlag = false): void {
		restoreFromBranch(ctx);
		if (checkFlag && pi.getFlag("plan") === true) currentMode = "plan";
		pi.setActiveTools(MODES[currentMode].tools);
		updateStatus(ctx);
	}

	// ── CLI flag ──────────────────────────────────────────────────────────────

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	// ── Commands ──────────────────────────────────────────────────────────────

	pi.registerCommand("mode", {
		description: "Switch Claude operating mode (code / plan / review)",
		getArgumentCompletions: (prefix) =>
			MODE_ORDER.filter((m) => m.startsWith(prefix)).map((m) => ({
				value: m,
				label: `${MODES[m].emoji} ${MODES[m].label} — ${MODES[m].description}`,
			})),
		handler: async (args, ctx) => {
			const arg = args.trim();
			if (arg in MODES) {
				applyMode(ctx, arg as ModeName);
			} else {
				await showPicker({
					ctx,
					currentMode,
					onSelect: (mode) => applyMode(ctx, mode),
				});
			}
		},
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration + planning)",
		handler: async (_args, ctx) => {
			applyMode(
				ctx,
				currentMode === "plan"
					? previousMode === "plan"
						? "code"
						: previousMode
					: "plan",
			);
		},
	});

	pi.registerCommand("review", {
		description: "Toggle review mode (read-only code review)",
		handler: async (_args, ctx) => {
			applyMode(
				ctx,
				currentMode === "review"
					? previousMode === "review"
						? "code"
						: previousMode
					: "review",
			);
		},
	});

	// ── Shortcut ──────────────────────────────────────────────────────────────

	pi.registerShortcut(Key.ctrlShift("m"), {
		description: "Cycle Claude mode (code → plan → review)",
		handler: async (ctx) => {
			const idx = MODE_ORDER.indexOf(currentMode);
			const next = MODE_ORDER.at((idx + 1) % MODE_ORDER.length);
			if (next) applyMode(ctx, next);
		},
	});

	// ── Tool-call gate ────────────────────────────────────────────────────────

	pi.on("tool_call", async (event) => {
		if (!MODES[currentMode].readOnly) return;
		if (event.toolName === "edit" || event.toolName === "write") {
			const cfg = MODES[currentMode];
			return {
				block: true,
				reason: `${cfg.emoji} ${cfg.label} mode: "${event.toolName}" is disabled. Use /mode to switch to Code mode.`,
			};
		}
		if (event.toolName === "bash") {
			const command = event.input.command as string;
			if (!isSafeCommand(command)) {
				const cfg = MODES[currentMode];
				return {
					block: true,
					reason:
						`${cfg.emoji} ${cfg.label} mode: command blocked.\n` +
						`Command: ${command}\n` +
						`Use /mode, /plan, or /review to exit read-only mode.`,
				};
			}
		}
	});

	pi.on("input", async (_event, ctx) => {
		pi.setActiveTools(MODES[currentMode].tools);
		updateStatus(ctx);
	}); // re-enforce tools on every user input

	pi.on("before_agent_start", async () => {
		const { systemNote } = MODES[currentMode];
		if (!systemNote) return;
		return {
			message: {
				customType: `claude-mode-${currentMode}`,
				content: systemNote,
				display: false,
			},
		};
	});

	pi.on("context", async (event) => {
		// filter stale mode injections from LLM context
		const mode = currentMode;
		return {
			messages: event.messages.filter(
				(m) => !isStaleInjection(m as MessageLike, mode),
			),
		};
	});

	pi.on("session_start", async (_e, ctx) => initSession(ctx, true));
	pi.on("session_switch", async (_e, ctx) => initSession(ctx));
	pi.on("session_fork", async (_e, ctx) => initSession(ctx));
	pi.on("session_tree", async (_e, ctx) => initSession(ctx));
	pi.on("turn_start", async () => {
		pi.appendEntry("claude-mode", { mode: currentMode });
	});
}
