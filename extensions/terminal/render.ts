/**
 * Terminal extension — rendering helpers.
 * drawBox, buildFinalOutput, and notifyUI are kept here so index.ts stays lean.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateTail } from "@mariozechner/pi-coding-agent";

const HOME = process.env.HOME ?? "";
export const WIDGET_ID = "terminal";
const MAX_WIDGET_LINES = 20; // max lines shown live in the widget
const MAX_OUTPUT_LINES = 200;
const MAX_OUTPUT_BYTES = 20 * 1024;

function shortCwd(cwd: string): string {
	return HOME ? cwd.replace(HOME, "~") : cwd;
}

export function drawBox(opts: {
	cmd: string;
	cwd: string;
	lines: string[];
	status: "running" | "ok" | "error";
	code?: number;
}): string[] {
	const { cmd, cwd, lines, status, code } = opts;
	const icon =
		status === "running" ? "⟳" : status === "ok" ? "✓" : `✗  exit ${code}`;

	const headerText = `❯ ${cmd}`;
	const cwdText = `  ${shortCwd(cwd)}`;
	const footerText = icon;
	const allTexts = [headerText, cwdText, ...lines, footerText];
	const width = Math.min(Math.max(...allTexts.map((l) => l.length)) + 2, 100);

	const pad = (s: string) => s + " ".repeat(Math.max(0, width - s.length - 2));
	const top = `┌${"─".repeat(width)}┐`;
	const sep = `├${"─".repeat(width)}┤`;
	const bottom = `└${"─".repeat(width)}┘`;
	const row = (s: string) => `│ ${pad(s)} │`;

	const result = [top, row(headerText), row(cwdText)];

	if (lines.length > 0) {
		result.push(sep);
		for (const line of lines) result.push(row(line));
	}

	result.push(sep, row(footerText), bottom);
	return result;
}

export function buildFinalOutput(raw: string): string {
	const {
		content,
		truncated,
		totalLines,
		outputLines: shown,
	} = truncateTail(raw, {
		maxLines: MAX_OUTPUT_LINES,
		maxBytes: MAX_OUTPUT_BYTES,
	});
	return (
		content +
		(truncated
			? `\n… truncated — showing last ${shown} of ${totalLines} lines`
			: "")
	);
}

export function notifyUI(opts: {
	ctx: ExtensionContext;
	args: string;
	cwd: string;
	out: string;
	ok: boolean;
	code: number;
}): void {
	const { ctx, args, cwd, out, ok, code } = opts;
	const displayLines = out.trimEnd().split("\n").slice(-MAX_WIDGET_LINES);
	ctx.ui.setWidget(WIDGET_ID, undefined);
	const boxLines = drawBox({
		cmd: args,
		cwd,
		lines: displayLines,
		status: ok ? "ok" : "error",
		code,
	});
	const boxStr = boxLines.join("\n");
	if (boxLines.length <= 35 && boxStr.length < 3000) {
		ctx.ui.notify(boxStr, ok ? "info" : "error");
	} else {
		ctx.ui.notify(
			`Command finished (exit ${code}). Output injected into chat.`,
			ok ? "info" : "warning",
		);
	}
}
