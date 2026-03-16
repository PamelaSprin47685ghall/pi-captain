/**
 * Recording overlay UI widget for the voice extension.
 */

import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import {
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

export type OverlayResult = "done" | "cancel";

const WAVE_FRAMES = [
	"▁▂▃▄▅▆▇█▇▆▅▄▃▂▁",
	"▂▃▄▅▆▇█▇▆▅▄▃▂▁▂",
	"▃▄▅▆▇█▇▆▅▄▃▂▁▂▃",
	"▄▅▆▇█▇▆▅▄▃▂▁▂▃▄",
	"▅▆▇█▇▆▅▄▃▂▁▂▃▄▅",
	"▆▇█▇▆▅▄▃▂▁▂▃▄▅▆",
	"▇█▇▆▅▄▃▂▁▂▃▄▅▆▇",
	"█▇▆▅▄▃▂▁▂▃▄▅▆▇█",
	"▇▆▅▄▃▂▁▂▃▄▅▆▇█▇",
	"▆▅▄▃▂▁▂▃▄▅▆▇█▇▆",
	"▅▄▃▂▁▂▃▄▅▆▇█▇▆▅",
	"▄▃▂▁▂▃▄▅▆▇█▇▆▅▄",
	"▃▂▁▂▃▄▅▆▇█▇▆▅▄▃",
	"▂▁▂▃▄▅▆▇█▇▆▅▄▃▂",
];

interface BuildOverlayOpts {
	tui: TUI;
	theme: Theme;
	done: (result: OverlayResult) => void;
	deviceName: string;
	startTime: number;
}

function buildOverlayComponent({
	tui,
	theme,
	done,
	deviceName,
	startTime,
}: BuildOverlayOpts) {
	let frame = 0;
	let animInterval: ReturnType<typeof setInterval> | null = null;

	animInterval = setInterval(() => {
		frame++;
		tui.requestRender();
	}, 80);

	return {
		render(width: number): string[] {
			const lines: string[] = [];
			const add = (s: string) => lines.push(truncateToWidth(s, width));
			const innerW = Math.max(4, width - 2);
			const acc = (s: string) => theme.fg("accent", s);
			const dim = (s: string) => theme.fg("dim", s);
			const warn = (s: string) => theme.fg("warning", s);

			const label = " 🎙 voice ";
			const lDash = 3;
			const rDash = Math.max(0, innerW - lDash - visibleWidth(label));
			add(
				`${acc("╭")}${acc("─".repeat(lDash))}${dim(label)}${acc("─".repeat(rDash))}${acc("╮")}`,
			);

			const elapsed = Math.floor((Date.now() - startTime) / 1000);
			const elapsedStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;
			add(`${acc("│")}${" ".repeat(innerW)}${acc("│")}`);
			const recLine = `${warn("● REC")}  ${dim(elapsedStr)}  ${dim(`[${deviceName}]`)}`;
			add(`${acc("│")} ${truncateToWidth(recLine, innerW - 1)}${acc("│")}`);

			add(`${acc("│")}${" ".repeat(innerW)}${acc("│")}`);
			const wave =
				WAVE_FRAMES[frame % WAVE_FRAMES.length] ?? WAVE_FRAMES[0] ?? "";
			const wavePad = Math.max(0, innerW - wave.length);
			const waveLeft = Math.floor(wavePad / 2);
			add(
				`${acc("│")}${" ".repeat(waveLeft)}${theme.fg("accent", wave)}${" ".repeat(wavePad - waveLeft)}${acc("│")}`,
			);
			add(`${acc("│")}${" ".repeat(innerW)}${acc("│")}`);

			const hintL = dim("  Esc: stop & send");
			const hintR = dim("Ctrl+C: cancel ");
			const hintPad = Math.max(
				0,
				innerW - visibleWidth(hintL) - visibleWidth(hintR),
			);
			add(`${acc("│")}${hintL}${" ".repeat(hintPad)}${hintR}${acc("│")}`);
			add(`${acc("╰")}${acc("─".repeat(innerW))}${acc("╯")}`);
			return lines;
		},

		invalidate() {
			// no-op: animation is driven by setInterval above
		},

		handleInput(data: string) {
			if (matchesKey(data, "escape") || matchesKey(data, "return")) {
				done("done");
			} else if (matchesKey(data, "ctrl+c") || data === "\x03") {
				done("cancel");
			}
		},

		dispose() {
			if (animInterval) {
				clearInterval(animInterval);
				animInterval = null;
			}
		},
	};
}

export async function showRecordingOverlay(
	ctx: ExtensionContext,
	deviceName: string,
): Promise<OverlayResult> {
	const startTime = Date.now();

	const result = await ctx.ui.custom<OverlayResult>(
		// biome-ignore lint/complexity/useMaxParams: pi SDK's ctx.ui.custom callback signature is fixed
		(tui: TUI, theme: Theme, _kb: unknown, done: (r: OverlayResult) => void) =>
			buildOverlayComponent({ tui, theme, done, deviceName, startTime }),
		{ overlay: true, overlayOptions: { anchor: "center", width: 52 } },
	);

	return result;
}
