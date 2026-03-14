/**
 * Mode picker UI overlay
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
	Container,
	type SelectItem,
	SelectList,
	Text,
} from "@mariozechner/pi-tui";
import { MODE_ORDER, MODES, type ModeName } from "../core/modes.js";

interface PickerOptions {
	ctx: ExtensionContext;
	currentMode: ModeName;
	onSelect: (mode: ModeName) => void;
}

export async function showPicker({
	ctx,
	currentMode,
	onSelect,
}: PickerOptions): Promise<void> {
	if (!ctx.hasUI) return;

	const items: SelectItem[] = MODE_ORDER.map((name) => {
		const cfg = MODES[name];
		return {
			value: name,
			label: `${cfg.emoji} ${cfg.label}${name === currentMode ? " ✓" : ""}`,
			description: cfg.description,
		};
	});

	const chosen = await ctx.ui.custom<ModeName | null>(
		// biome-ignore lint/complexity/useMaxParams: pi SDK ctx.ui.custom callback signature is fixed
		(tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
			container.addChild(
				new Text(
					theme.fg("accent", theme.bold("  Select Mode")) +
						theme.fg(
							"dim",
							`  (current: ${MODES[currentMode].emoji} ${MODES[currentMode].label})`,
						),
					0,
					0,
				),
			);
			const list = new SelectList(items, Math.min(items.length, 6), {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			});
			list.onSelect = (item) => done(item.value as ModeName);
			list.onCancel = () => done(null);
			container.addChild(list);
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (d: string) => {
					list.handleInput(d);
					tui.requestRender();
				},
			};
		},
	);

	if (chosen !== null && chosen !== currentMode) onSelect(chosen);
}
