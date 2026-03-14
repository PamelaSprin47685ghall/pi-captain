// @large-file: intentional consolidation of TUI widget logic into one module
// ── Captain Widget ────────────────────────────────────────────────────────
// Live progress widget for pipeline execution.

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import type { PipelineState, Runnable, StepResult } from "./types.js";

// ── Step line rendering ───────────────────────────────────────────────────

export function statusColor(status: string): string {
	if (status === "passed") return "success";
	if (status === "failed") return "error";
	if (status === "running") return "accent";
	return "dim";
}

export function statusDot(status: string): string {
	if (status === "passed") return "✓";
	if (status === "failed") return "✗";
	if (status === "skipped") return "⊘";
	if (status === "running") return "●";
	return "○";
}

function shortenModelId(id: string): string {
	const m = id.match(/^claude-([a-z]+)-(\d+)-(\d+)(?:-\d{8})?$/i);
	if (m) return `${m[1]} ${m[2]}.${m[3]}`;
	return id.replace(/^claude-/i, "");
}

function stepDetail(r: StepResult): string {
	if (r.output)
		return (
			r.output
				.split("\n")
				.filter((l) => l.trim())
				.at(-1) ?? ""
		);
	return r.error ?? "";
}

/** Render one step as a single line: ● name  model  🔨 2/4  1.2s  detail… */
export function renderStepLine(
	r: StepResult,
	// biome-ignore lint/suspicious/noExplicitAny: pi theme API is not typed
	opts: { width: number; indent: number; theme: any },
): string {
	const { width, indent, theme } = opts;
	const pad = " ".repeat(indent);
	const dot = theme.fg(statusColor(r.status), statusDot(r.status));
	const name = theme.fg(r.status === "running" ? "accent" : "dim", r.label);

	const modelRaw = r.model ? shortenModelId(r.model) : "";
	const model = modelRaw ? `  ${theme.fg("dim", modelRaw)}` : "";

	let hammerRaw = "";
	if (r.toolCount !== undefined) {
		hammerRaw = `🔨 ${r.toolCallCount ?? 0}/${r.toolCount}`;
	}
	const hammer = hammerRaw ? `  ${theme.fg("dim", hammerRaw)}` : "";

	const timeRaw = r.elapsed > 0 ? `${(r.elapsed / 1000).toFixed(1)}s` : "";
	const time = timeRaw ? `  ${theme.fg("dim", timeRaw)}` : "";

	const fixedLen =
		indent +
		2 +
		r.label.length +
		(modelRaw ? 2 + modelRaw.length : 0) +
		(hammerRaw ? 2 + hammerRaw.length : 0) +
		(timeRaw ? 2 + timeRaw.length : 0);

	const available = width - fixedLen - 2;
	const detail = stepDetail(r);
	const detailTrunc =
		detail && available > 6
			? `  ${theme.fg("muted", detail.length > available ? `${detail.slice(0, available - 3)}...` : detail)}`
			: "";

	return truncateToWidth(
		`${pad}${dot} ${name}${model}${hammer}${time}${detailTrunc}`,
		width,
	);
}

// ── Pending step computation ──────────────────────────────────────────────

interface PendingEntry {
	label: string;
	group?: string;
	toolCount: number;
	model?: string;
}

/** Recursively enumerate all expected steps from the spec. */
function flattenSpec(r: Runnable, group?: string): PendingEntry[] {
	switch (r.kind) {
		case "step":
			return [
				{
					label: r.label,
					group,
					toolCount: (r.tools ?? ["read", "bash", "edit", "write"]).length,
					model: r.model,
				},
			];
		case "sequential":
			return r.steps.flatMap((s) => flattenSpec(s, group));
		case "parallel": {
			const parGroup = `parallel ×${r.steps.length}`;
			return r.steps.flatMap((s) => flattenSpec(s, parGroup));
		}
		default:
			return [];
	}
}

function computePendingSteps(opts: {
	spec: Runnable;
	results: StepResult[];
	currentSteps: Set<string>;
}): PendingEntry[] {
	const { spec, results, currentSteps } = opts;
	const all = flattenSpec(spec);
	const seen = new Map<string, number>();
	for (const r of results) seen.set(r.label, (seen.get(r.label) ?? 0) + 1);
	for (const label of currentSteps) seen.set(label, (seen.get(label) ?? 0) + 1);

	const consumed = new Map<string, number>();
	const pending: PendingEntry[] = [];
	for (const entry of all) {
		const alreadySeen = seen.get(entry.label) ?? 0;
		const alreadyConsumed = consumed.get(entry.label) ?? 0;
		if (alreadyConsumed < alreadySeen) {
			consumed.set(entry.label, alreadyConsumed + 1);
		} else {
			pending.push(entry);
		}
	}
	return pending;
}

// ── Step list rendering ───────────────────────────────────────────────────

function renderStepList(opts: {
	results: StepResult[];
	currentSteps: Set<string>;
	currentStepStreams: Map<string, string>;
	currentStepToolCalls: Map<string, number>;
	spec: Runnable;
	width: number;
	// biome-ignore lint/suspicious/noExplicitAny: pi theme API is not typed
	theme: any;
}): string[] {
	const {
		results,
		currentSteps,
		currentStepStreams,
		currentStepToolCalls,
		spec,
		width,
		theme,
	} = opts;
	// Build running step results from streaming state
	const runningSteps: StepResult[] = [...currentSteps].map((label) => {
		const stream = currentStepStreams.get(label) ?? "";
		const streamTail =
			stream
				.split("\n")
				.filter((l) => l.trim())
				.at(-1) ?? "";
		const existing = results.findLast((r) => r.label === label);
		return {
			label,
			status: "running" as const,
			output: streamTail,
			elapsed: 0,
			toolCallCount: currentStepToolCalls.get(label) ?? 0,
			toolCount: existing?.toolCount,
			model: existing?.model,
			group: existing?.group,
		};
	});

	const active = [...results, ...runningSteps];
	const pending = computePendingSteps({ spec, results, currentSteps });

	if (active.length === 0 && pending.length === 0)
		return [theme.fg("dim", "  Waiting for steps...")];

	const lines: string[] = [];
	let lastGroup: string | undefined;

	const appendLine = (r: StepResult) => {
		if (r.group && r.group !== lastGroup) {
			lines.push(theme.fg("dim", `  ┬ ${r.group}`));
			lastGroup = r.group;
		} else if (!r.group) {
			lastGroup = undefined;
		}
		if (r.group) {
			lines.push(
				`${theme.fg("dim", "  │")}${renderStepLine(r, { width: width - 3, indent: 1, theme })}`,
			);
		} else {
			lines.push(renderStepLine(r, { width, indent: 2, theme }));
		}
	};

	for (const r of active) appendLine(r);

	for (const entry of pending) {
		const pendingResult: StepResult = {
			label: entry.label,
			status: "pending",
			output: "",
			elapsed: 0,
			group: entry.group,
			toolCount: entry.toolCount,
			model: entry.model,
		};
		appendLine(pendingResult);
	}

	return lines;
}

// ── Widget lifecycle ──────────────────────────────────────────────────────

function widgetKey(state: PipelineState): string {
	return `captain-${state.jobId ?? 0}`;
}

export function updateWidget(ctx: ExtensionContext, state: PipelineState) {
	ctx.ui.setWidget(widgetKey(state), (_tui, theme) => {
		const text = new Text("", 0, 1);
		return {
			render(width: number): string[] {
				const elapsed = state.startTime
					? ((Date.now() - state.startTime) / 1000).toFixed(1)
					: "0";
				const jobId = state.jobId !== undefined ? ` #${state.jobId}` : "";
				const headerLabel = `  Captain: ${state.name}${jobId}`;
				const killHint =
					state.jobId !== undefined ? `  /captain-kill ${state.jobId}` : "";
				const headerRight = `${elapsed}s `;
				const headerPad = " ".repeat(
					Math.max(
						1,
						width - headerLabel.length - killHint.length - headerRight.length,
					),
				);
				const header =
					theme.fg("accent", theme.bold(headerLabel)) +
					theme.fg("dim", killHint) +
					headerPad +
					theme.fg("dim", headerRight);
				const lines: string[] = [
					theme.fg("accent", "─".repeat(width)),
					truncateToWidth(header, width),
					theme.fg("accent", "─".repeat(width)),
					...renderStepList({
						results: state.results,
						currentSteps: state.currentSteps,
						currentStepStreams: state.currentStepStreams,
						currentStepToolCalls: state.currentStepToolCalls,
						spec: state.spec,
						width,
						theme,
					}),
				];
				text.setText(lines.join("\n"));
				return text.render(width);
			},
			invalidate() {
				text.invalidate();
			},
		};
	});
}

export function clearWidget(ctx: ExtensionContext, state: PipelineState) {
	setTimeout(() => ctx.ui.setWidget(widgetKey(state), undefined), 5000);
}
