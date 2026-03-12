// ─── Progress widget ───────────────────────────────────────────────────────

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { RefactorState } from "./state.js";

function renderHeader(
	// biome-ignore lint/suspicious/noExplicitAny: pi theme API is not typed
	theme: any,
	width: number,
	passCount: number,
	maxPasses: number,
	target: string,
): string[] {
	const lines: string[] = [];
	const add = (s: string) => lines.push(truncateToWidth(s, width));

	add(theme.fg("accent", "─".repeat(width)));
	add(
		theme.fg("accent", theme.bold("  🔄 Refactor Pipeline")) +
			theme.fg("muted", `  Pass ${passCount}/${maxPasses}`),
	);
	add(theme.fg("dim", `  Target: ${target}`));
	return lines;
}

function renderStatus(
	// biome-ignore lint/suspicious/noExplicitAny: pi theme API is not typed
	theme: any,
	width: number,
	state: RefactorState,
	lastPass: RefactorState["passes"][0] | undefined,
): string[] {
	const lines: string[] = [];
	const add = (s: string) => lines.push(truncateToWidth(s, width));

	if (state.testCommand) {
		add(theme.fg("dim", `  Tests: ${state.testCommand}`));
	}

	if (lastPass) {
		add(theme.fg("success", `  ✓ ${lastPass.change}`));
		if (lastPass.remaining && !lastPass.done) {
			add(theme.fg("warning", `  → Next: ${lastPass.remaining}`));
		}
		if (lastPass.done) {
			add(
				theme.fg(
					"success",
					theme.bold("  ✅ Pipeline complete — code is clean!"),
				),
			);
			if (state.autoCommit) {
				add(theme.fg("accent", "  📦 Committing & pushing changes..."));
			}
		}
	} else {
		add(theme.fg("warning", "  ⏳ Starting first pass..."));
	}

	return lines;
}

export function updateWidget(ctx: ExtensionContext, state: RefactorState) {
	ctx.ui.setWidget("refactor-loop", (_tui, theme) => ({
		render(width: number): string[] {
			if (!state.active) return [];

			const passCount = state.passes.length;
			const lastPass = state.passes[passCount - 1];

			const lines: string[] = [
				...renderHeader(theme, width, passCount, state.maxPasses, state.target),
				...renderStatus(theme, width, state, lastPass),
			];

			lines.push(theme.fg("accent", "─".repeat(width)));
			return lines;
		},
		invalidate() {
			// no cache to clear
		},
	}));
}
