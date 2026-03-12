// ── ui/commands-register-a.ts — /captain /captain-run /captain-load ─────────
// Extracted from commands.ts (Basic_knowledge.md ≤200 lines rule).
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { CaptainState } from "../state.js";
import type { PipelineState } from "../types.js";
import {
	runInteractivePipelineLauncher,
	runRunnableFromCommand,
	showPipelineDetails,
} from "./commands-exec.js";
import { parseCaptainRunArgs } from "./commands-parse.js";
import { updateWidget } from "./widget.js";

export function registerCommandsA(pi: ExtensionAPI, state: CaptainState): void {
	// /captain — interactive: select pipeline then enter input, or show details
	pi.registerCommand("captain", {
		description:
			"Interactive pipeline launcher (/captain) or show details (/captain <name>)",
		getArgumentCompletions: (prefix) => {
			const presets = state.discoverPresets(process.cwd());
			const allNames = new Set([
				...Object.keys(state.pipelines),
				...presets.map((p) => p.name),
			]);
			return [...allNames]
				.filter((n) => n.startsWith(prefix))
				.map((n) => ({
					value: n,
					label: state.pipelines[n]
						? n
						: `${n} (${presets.find((p) => p.name === n)?.source ?? "preset"})`,
				}));
		},
		handler: async (args, ctx) => {
			const name = args?.trim();
			if (!name) {
				await runInteractivePipelineLauncher(pi, state, ctx);
			} else {
				await showPipelineDetails(name, state, ctx);
			}
		},
	});

	// /captain-agents — list all available agents
	// /captain-run — run a pipeline or single step
	pi.registerCommand("captain-run", {
		description:
			"Run a pipeline directly: /captain-run <name> [--step <label>] <input>",
		getArgumentCompletions: (prefix) =>
			Object.keys(state.pipelines)
				.filter((n) => n.startsWith(prefix))
				.map((n) => ({ value: n, label: n })),
		handler: async (args, ctx) => {
			const parsed = await parseCaptainRunArgs(
				args,
				state,
				ctx.cwd,
				(msg, level) => ctx.ui.notify(msg, level),
			);
			if (!parsed) return;
			const { name, input, stepFilter, specToRun } = parsed;
			if (stepFilter)
				ctx.ui.notify(`Running single step: "${stepFilter}"`, "info");
			const stateName = stepFilter ? `${name}/${stepFilter}` : name;
			const pipelineState: PipelineState = {
				name: stateName,
				spec: specToRun,
				status: "running",
				results: [],
				currentSteps: new Set(),
				currentStepStreams: new Map(),
				currentStepToolCalls: new Map(),
				startTime: Date.now(),
			};
			state.runningState = pipelineState;
			updateWidget(ctx, pipelineState);
			await runRunnableFromCommand(
				pi,
				specToRun,
				input,
				pipelineState,
				state,
				ctx,
			);
		},
	});

	// /captain-load — load a preset pipeline
	pi.registerCommand("captain-load", {
		description:
			"Load a pipeline preset or file (/captain-load <name|path>). No args to list available presets.",
		getArgumentCompletions: (prefix) => {
			const presets = state.discoverPresets(process.cwd());
			return presets
				.filter((p) => p.name.startsWith(prefix))
				.map((p) => ({ value: p.name, label: `${p.name} (${p.source})` }));
		},
		handler: async (args, ctx) => {
			const name = args?.trim();
			if (!name) {
				const presets = state.discoverPresets(ctx.cwd);
				if (presets.length === 0) {
					ctx.ui.notify(
						"No pipeline presets found. Place .ts/.json files in .pi/pipelines/ or provide a file path.",
						"info",
					);
					return;
				}
				ctx.ui.notify(
					`Available presets:\n${presets.map((p) => `• ${p.name} (${p.source})`).join("\n")}`,
					"info",
				);
				return;
			}
			try {
				const result = await state.resolvePreset(name, ctx.cwd);
				if (!result) {
					ctx.ui.notify(
						`Preset or file "${name}" not found. Run /captain-load to see available presets, or provide a valid file path.`,
						"error",
					);
					return;
				}
				ctx.ui.notify(
					`✓ Loaded "${result.name}"${result.source ? ` from ${result.source}` : ""}\nRun with: /captain-run ${result.name} <input>`,
					"info",
				);
			} catch (err) {
				ctx.ui.notify(
					`Failed to load: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
	});
}
