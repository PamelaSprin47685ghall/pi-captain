// ─── Text input dialog (reusable) ──────────────────────────────────────────

import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	type TUI,
	truncateToWidth,
} from "@mariozechner/pi-tui";

export function makeTextInputDialog(
	title: string,
	hint: string,
	tui: TUI,
	// biome-ignore lint/suspicious/noExplicitAny: pi theme API is not typed
	theme: any,
	done: (value: string | null) => void,
) {
	let cachedLines: string[] | undefined;

	const editorTheme: EditorTheme = {
		borderColor: (s: string) => theme.fg("accent", s),
		selectList: {
			selectedPrefix: (t: string) => theme.fg("accent", t),
			selectedText: (t: string) => theme.fg("accent", t),
			description: (t: string) => theme.fg("muted", t),
			scrollInfo: (t: string) => theme.fg("dim", t),
			noMatch: (t: string) => theme.fg("warning", t),
		},
	};

	const editor = new Editor(tui, editorTheme);
	editor.onSubmit = (value) => {
		const trimmed = value.trim();
		done(trimmed.length > 0 ? trimmed : null);
	};

	return {
		render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const lines: string[] = [];
			const add = (s: string) => lines.push(truncateToWidth(s, width));
			add(theme.fg("accent", "─".repeat(width)));
			add(theme.fg("accent", theme.bold(`  🔄  ${title}`)));
			if (hint) add(theme.fg("dim", `  ${hint}`));
			lines.push("");
			for (const line of editor.render(width - 4)) add(`  ${line}`);
			lines.push("");
			add(theme.fg("dim", "  Enter to confirm  •  Esc to cancel"));
			add(theme.fg("accent", "─".repeat(width)));
			cachedLines = lines;
			return lines;
		},
		invalidate() {
			// no cache to clear
		},
		handleInput(data: string) {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			editor.handleInput(data);
			cachedLines = undefined;
			tui.requestRender();
		},
	};
}
