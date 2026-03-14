import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

export interface DangerousPattern {
	pattern: RegExp;
	label: string;
	severity: "critical" | "high";
}

export function isSafeCommand(
	command: string,
	safeExceptions: RegExp[],
): boolean {
	return safeExceptions.some((p) => p.test(command));
}

export function findDangerousPattern(
	command: string,
	patterns: DangerousPattern[],
): DangerousPattern | undefined {
	return patterns.find(({ pattern }) => pattern.test(command));
}

export function handleCriticalPattern(label: string, ctx: ExtensionContext) {
	if (ctx.hasUI) ctx.ui.notify(`🚫 Blocked: ${label}`, "error");
	return {
		block: true,
		reason: `CRITICAL: ${label} — command is never allowed`,
	};
}

export function handleNonInteractiveBlock(label: string) {
	return {
		block: true,
		reason: `${label} blocked (non-interactive mode)`,
	};
}

export async function handleUserConfirmation(opts: {
	command: string;
	label: string;
	ctx: ExtensionContext;
}) {
	const { command, label, ctx } = opts;
	const displayCmd =
		command.length > 120 ? `${command.slice(0, 120)}…` : command;
	const ok = await ctx.ui.confirm(
		`⚠️ ${label}`,
		`${displayCmd}\n\nAllow this command?`,
	);
	return ok ? undefined : { block: true, reason: `${label} — blocked by user` };
}
