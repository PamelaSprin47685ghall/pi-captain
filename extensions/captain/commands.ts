// @large-file: intentional consolidation of all slash commands into one module
// ── Slash Commands ────────────────────────────────────────────────────────
// All captain slash commands in one file.

import type {
	DefaultResourceLoader,
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { execute } from "./executor.js";
import type { CaptainJob, CaptainState } from "./state.js";
import { writePipelineLog } from "./tools.js";
import type { PipelineState, RunCtx, Runnable, StepResult } from "./types.js";
import { describeRunnable } from "./types.js";
import { clearWidget, updateWidget } from "./widget.js";

// ── Execution helpers ──────────────────────────────────────────────────────

async function buildRunCtx(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	pipelineName: string,
	pipelineState: PipelineState,
	signal?: AbortSignal,
): Promise<RunCtx | undefined> {
	const model = ctx.model;
	if (!model) {
		ctx.ui.notify("No model available.", "error");
		return undefined;
	}
	const apiKey = (await ctx.modelRegistry.getApiKey(model)) ?? "";
	return {
		exec: (cmd, args, opts) => pi.exec(cmd, [...args], opts),
		model,
		modelRegistry: ctx.modelRegistry,
		apiKey,
		cwd: ctx.cwd,
		hasUI: ctx.hasUI,
		confirm: ctx.hasUI ? (t, b) => ctx.ui.confirm(t, b) : undefined,
		signal,
		pipelineName,
		loaderCache: new Map<string, DefaultResourceLoader>(),
		onStepStart: (label) => {
			pipelineState.currentSteps.add(label);
			pipelineState.currentStepStreams.delete(label);
			pipelineState.currentStepToolCalls.delete(label);
			updateWidget(ctx, pipelineState);
		},
		onStepStream: (label, text) => {
			pipelineState.currentStepStreams.set(label, text);
			updateWidget(ctx, pipelineState);
		},
		onStepToolCall: (label, n) => {
			pipelineState.currentStepToolCalls.set(label, n);
			updateWidget(ctx, pipelineState);
		},
		onStepEnd: (result: StepResult) => {
			pipelineState.currentSteps.delete(result.label);
			pipelineState.currentStepStreams.delete(result.label);
			pipelineState.currentStepToolCalls.delete(result.label);
			pipelineState.results.push(result);
			updateWidget(ctx, pipelineState);
		},
	};
}

async function runPipelineFromCommand(
	pi: ExtensionAPI,
	spec: Runnable,
	input: string,
	pipelineState: PipelineState,
	job: CaptainJob,
	_state: CaptainState,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const model = ctx.model;
	if (!model) return;
	const runCtx = await buildRunCtx(
		pi,
		ctx,
		pipelineState.name,
		pipelineState,
		job.controller.signal,
	);
	if (!runCtx) return;

	try {
		const { output, results } = await execute(spec, input, input, runCtx);
		pipelineState.endTime = Date.now();
		clearWidget(ctx, pipelineState);
		if (pipelineState.status === "cancelled") {
			ctx.ui.notify(
				`✗ "${pipelineState.name}" (job #${pipelineState.jobId}) was killed.`,
				"error",
			);
			return;
		}
		pipelineState.status = "completed";
		pipelineState.finalOutput = output;
		pipelineState.results = results;
		writePipelineLog(ctx.cwd, pipelineState);
		const elapsed = (
			(pipelineState.endTime -
				(pipelineState.startTime ?? pipelineState.endTime)) /
			1000
		).toFixed(1);
		const passed = results.filter((r) => r.status === "passed").length;
		const failed = results.filter((r) => r.status === "failed").length;
		ctx.ui.notify(
			`✓ "${pipelineState.name}" completed in ${elapsed}s — ${passed} passed, ${failed} failed\n\n${output.slice(0, 800)}${output.length > 800 ? "\n…(truncated)" : ""}`,
			failed > 0 ? "error" : "info",
		);
	} catch (err) {
		pipelineState.endTime = Date.now();
		clearWidget(ctx, pipelineState);
		const cancelled = pipelineState.status === "cancelled";
		if (!cancelled) pipelineState.status = "failed";
		writePipelineLog(ctx.cwd, pipelineState);
		ctx.ui.notify(
			cancelled
				? `✗ "${pipelineState.name}" (job #${pipelineState.jobId}) was killed.`
				: `✗ "${pipelineState.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
	}
}

function fireAndForget(
	pi: ExtensionAPI,
	spec: Runnable,
	name: string,
	input: string,
	state: CaptainState,
	ctx: ExtensionCommandContext,
): void {
	const pipelineState: PipelineState = {
		name,
		spec,
		status: "running",
		results: [],
		currentSteps: new Set(),
		currentStepStreams: new Map(),
		currentStepToolCalls: new Map(),
		startTime: Date.now(),
	};
	const job = state.allocateJob(pipelineState);
	updateWidget(ctx, pipelineState);
	void runPipelineFromCommand(pi, spec, input, pipelineState, job, state, ctx);
}

// ── Input parsing ─────────────────────────────────────────────────────────

export function parsePipelineAndInput(raw: string): {
	pipeline: string;
	input: string;
} {
	const tokens: string[] = [];
	const re = /(['"])(.*?)\1|(\S+)/gs;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic while loop
	while ((m = re.exec(raw)) !== null)
		tokens.push(m[2] !== undefined ? m[2] : m[3]);
	if (tokens.length === 0) return { pipeline: "", input: "" };
	const [pipeline, ...rest] = tokens;
	return { pipeline, input: rest.join(" ") };
}

export function parseInlineFlags(input: string): {
	flags: Record<string, string>;
	prompt: string;
} {
	const flags: Record<string, string> = {};
	const flagRe = /--(\w+)\s+([^-][^\s]*(?:\s+[^-][^\s]*)*?)(?=\s+--|$)/g;
	let m: RegExpExecArray | null;
	const toRemove: string[] = [];
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic while loop
	while ((m = flagRe.exec(input)) !== null) {
		flags[m[1]] = m[2].trim();
		toRemove.push(m[0]);
	}
	let rest = input;
	for (const rm of toRemove) rest = rest.replace(rm, "");
	return { flags, prompt: rest.trim() };
}

async function ensurePipelineLoaded(
	name: string,
	cwd: string,
	state: CaptainState,
	notify: (msg: string, level: "info" | "error") => void,
): Promise<string | undefined> {
	if (state.pipelines[name]) return name;
	try {
		const resolved = await state.resolvePreset(name, cwd);
		if (!resolved) {
			notify(
				`Pipeline "${name}" not found. Place .ts files in .pi/pipelines/ or pass a valid file path.`,
				"error",
			);
			return undefined;
		}
		notify(`Auto-loaded "${resolved.name}"`, "info");
		return resolved.name;
	} catch (err) {
		notify(
			`Failed to load "${name}": ${err instanceof Error ? err.message : String(err)}`,
			"error",
		);
		return undefined;
	}
}

// ── Command registration ──────────────────────────────────────────────────

export function registerCommands(pi: ExtensionAPI, state: CaptainState): void {
	const allPipelineNames = (cwd: string) => {
		const presets = state.discoverPresets(cwd);
		return [
			...new Set([
				...Object.keys(state.pipelines),
				...presets.map((p) => p.name),
			]),
		];
	};

	// /captain — interactive launcher or show pipeline details
	pi.registerCommand("captain", {
		description:
			"Run a pipeline (/captain <name|path> <input>) or list pipelines (/captain)",
		getArgumentCompletions: (prefix) =>
			allPipelineNames(process.cwd())
				.filter((n) => n.startsWith(prefix))
				.map((n) => ({ value: n, label: n })),
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: command handler branches across many UX paths by design
		handler: async (args, ctx) => {
			const raw = args?.trim() ?? "";

			if (!raw) {
				// No args → interactive launcher
				const names = allPipelineNames(ctx.cwd);
				if (names.length === 0) {
					ctx.ui.notify(
						"No pipelines defined. Place .ts files in .pi/pipelines/ or use /captain-generate.",
						"info",
					);
					return;
				}
				const selected = await ctx.ui.select("Select a pipeline:", names);
				if (!selected) return;
				const input = await ctx.ui.input(`Input for "${selected}":`, "");
				if (input === undefined) return;
				if (!input.trim()) {
					ctx.ui.notify("No input provided.", "error");
					return;
				}
				const resolvedName = await ensurePipelineLoaded(
					selected,
					ctx.cwd,
					state,
					(msg, lvl) => ctx.ui.notify(msg, lvl),
				);
				if (!resolvedName) return;
				fireAndForget(
					pi,
					state.pipelines[resolvedName].spec,
					resolvedName,
					input.trim(),
					state,
					ctx,
				);
				return;
			}

			const { pipeline, input } = parsePipelineAndInput(raw);

			if (!input) {
				// Name only → show details
				const resolvedName = await ensurePipelineLoaded(
					pipeline,
					ctx.cwd,
					state,
					(msg, lvl) => ctx.ui.notify(msg, lvl),
				);
				if (!resolvedName) return;
				const spec = state.pipelines[resolvedName].spec;
				ctx.ui.notify(
					`Pipeline: ${resolvedName}\n\n${describeRunnable(spec, 0)}`,
					"info",
				);
				return;
			}

			// Both name and input → load and run
			const resolvedName = await ensurePipelineLoaded(
				pipeline,
				ctx.cwd,
				state,
				(msg, lvl) => ctx.ui.notify(msg, lvl),
			);
			if (!resolvedName) return;
			fireAndForget(
				pi,
				state.pipelines[resolvedName].spec,
				resolvedName,
				input,
				state,
				ctx,
			);
		},
	});

	// /captain-generate — generate a pipeline with LLM
	pi.registerCommand("captain-generate", {
		description: "Generate a pipeline with LLM (/captain-generate <goal>)",
		handler: async (args, ctx) => {
			const goal = args?.trim();
			if (!goal) {
				ctx.ui.notify(
					"Usage: /captain-generate <what you want the pipeline to do>",
					"error",
				);
				return;
			}
			pi.sendUserMessage(
				`Generate a captain pipeline for this goal: ${goal}\nUse captain_generate tool with goal="${goal}".`,
			);
		},
	});

	// /captain-step — run a single ad-hoc step
	pi.registerCommand("captain-step", {
		description:
			"Run an ad-hoc step: /captain-step <prompt> [--model <id>] [--tools <t1,t2>] [--label <text>]",
		getArgumentCompletions: (prefix) =>
			["--model ", "--tools ", "--label "]
				.filter((f) => f.startsWith(prefix))
				.map((f) => ({ value: f, label: f.trim() })),
		handler: async (args, ctx) => {
			const raw = args?.trim() ?? "";
			if (!raw) {
				ctx.ui.notify(
					"Usage: /captain-step <prompt> [--model <id>] [--tools <t1,t2>] [--label <text>]",
					"info",
				);
				return;
			}
			const { flags, prompt } = parseInlineFlags(raw);
			if (!prompt) {
				ctx.ui.notify("Provide a prompt.", "error");
				return;
			}

			const { skip } = await import("./presets.js");
			const { full } = await import("./presets.js");
			const stepSpec = {
				kind: "step" as const,
				label: flags.label ?? "ad-hoc step",
				prompt,
				model: flags.model,
				tools: flags.tools?.split(",").map((t) => t.trim()) ?? [
					"read",
					"bash",
					"edit",
					"write",
				],
				gate: undefined,
				onFail: skip,
				transform: full,
			};
			fireAndForget(pi, stepSpec, `step:${stepSpec.label}`, prompt, state, ctx);
		},
	});

	// /captain-help — show all commands
	pi.registerCommand("captain-help", {
		description: "Show all captain commands",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				[
					`Captain — Pipeline Orchestrator  (${Object.keys(state.pipelines).length} loaded)`,
					"",
					"  /captain                            Interactive launcher",
					"  /captain <name>                     Show pipeline structure",
					"  /captain <name|path> <input>        Load & run",
					"",
					"  /captain-step <prompt>              Run a single ad-hoc step",
					"  /captain-generate <goal>            Generate a pipeline with LLM",
					"  /captain-kill [id]                  Kill a running job",
					"  /captain-jobs                       List all jobs",
					"  /captain-help                       Show this help",
				].join("\n"),
				"info",
			);
		},
	});

	// /captain-kill — kill a running job
	pi.registerCommand("captain-kill", {
		description: "Kill a running pipeline job: /captain-kill <id>",
		getArgumentCompletions: () =>
			[...state.jobs.values()]
				.filter((j) => j.state.status === "running")
				.map((j) => ({
					value: String(j.id),
					label: `#${j.id} — ${j.state.name}`,
				})),
		handler: async (args, ctx) => {
			const raw = args?.trim() ?? "";
			if (!raw) {
				const running = [...state.jobs.values()].filter(
					(j) => j.state.status === "running",
				);
				ctx.ui.notify(
					running.length === 0
						? "No running jobs."
						: `Running: ${running.map((j) => `#${j.id} ${j.state.name}`).join(", ")}`,
					"info",
				);
				return;
			}
			const id = Number(raw);
			if (Number.isNaN(id)) {
				ctx.ui.notify(`Invalid job ID: "${raw}"`, "error");
				return;
			}
			const outcome = state.killJob(id);
			ctx.ui.notify(
				outcome === "killed"
					? `Job #${id} killed.`
					: outcome === "not-running"
						? `Job #${id} is not running.`
						: `No job #${id} found.`,
				outcome === "killed" ? "info" : "error",
			);
		},
	});

	// /captain-jobs — list all jobs
	pi.registerCommand("captain-jobs", {
		description: "List all pipeline jobs",
		handler: async (_args, ctx) => {
			const jobs = [...state.jobs.values()];
			if (jobs.length === 0) {
				ctx.ui.notify("No jobs yet.", "info");
				return;
			}
			const icons: Record<string, string> = {
				running: "⏳",
				completed: "✓",
				failed: "✗",
				cancelled: "⊘",
				idle: "·",
			};
			const lines = [
				"── Captain Jobs ──────────────────────────────────",
				...jobs.map((j) => {
					const s = j.state;
					const elapsed =
						s.endTime && s.startTime
							? ` ${((s.endTime - s.startTime) / 1000).toFixed(1)}s`
							: s.startTime
								? " (running…)"
								: "";
					return `  ${icons[s.status] ?? "?"} #${j.id}  ${s.status.padEnd(10)}  ${s.name}${elapsed}`;
				}),
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
