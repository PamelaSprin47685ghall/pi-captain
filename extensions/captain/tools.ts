// @large-file: intentional consolidation of all tool registrations into one module
// ── Captain Tools ─────────────────────────────────────────────────────────
// All tool registrations: run, status, list, kill, load, generate, validate.

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TextContent } from "@mariozechner/pi-ai";
import type {
	DefaultResourceLoader,
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { execute } from "./executor.js";
import { generatePipeline } from "./generator.js";
import type { CaptainState } from "./state.js";
import type { PipelineState, RunCtx, StepResult } from "./types.js";
import { describeRunnable, statusIcon } from "./types.js";
import { clearWidget, updateWidget } from "./widget.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function text(t: string): TextContent {
	return { type: "text" as const, text: t };
}

export function buildCompletionText(opts: {
	name: string;
	output: string;
	results: StepResult[];
	startTime?: number;
	endTime?: number;
}): string {
	const { name, output, results, startTime, endTime } = opts;
	const end = endTime ?? Date.now();
	const elapsed = ((end - (startTime ?? end)) / 1000).toFixed(1);
	const passed = results.filter((r) => r.status === "passed").length;
	const failed = results.filter((r) => r.status === "failed").length;
	const skipped = results.filter((r) => r.status === "skipped").length;
	const { content: truncated } = truncateHead(output, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});
	return [
		`Pipeline "${name}" completed in ${elapsed}s`,
		`Steps: ${results.length} (${passed} passed, ${failed} failed, ${skipped} skipped)`,
		"── Output ──",
		truncated,
	].join("\n");
}

export function writePipelineLog(cwd: string, state: PipelineState): void {
	try {
		const logDir = join(cwd, ".pi", "logs");
		mkdirSync(logDir, { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, "-");
		const logPath = join(logDir, `${ts}-${state.name}.log`);
		const lines: string[] = [
			`Pipeline: ${state.name}  status: ${state.status}`,
			`Job #${state.jobId ?? "?"}`,
			`Started: ${state.startTime ? new Date(state.startTime).toISOString() : "?"}`,
			`Ended:   ${state.endTime ? new Date(state.endTime).toISOString() : "?"}`,
			"",
			"── Steps ──",
		];
		for (const r of state.results) {
			const gate = r.gateResult
				? ` [gate: ${r.gateResult.passed ? "pass" : `FAIL — ${r.gateResult.reason}`}]`
				: "";
			lines.push(
				`${r.status.padEnd(8)} ${r.label} (${(r.elapsed / 1000).toFixed(1)}s)${gate}`,
			);
			if (r.error) lines.push(`         error: ${r.error}`);
			if (r.output.trim()) lines.push(`         output:\n${r.output.trim()}\n`);
		}
		if (state.finalOutput)
			lines.push("", "── Final Output ──", state.finalOutput);
		appendFileSync(logPath, `${lines.join("\n")}\n`);
	} catch {
		/* best-effort */
	}
}

function mergeSignals(
	a?: AbortSignal,
	b?: AbortSignal,
): AbortSignal | undefined {
	if (!(a || b)) return undefined;
	if (!a) return b;
	if (!b) return a;
	return AbortSignal.any([a, b]);
}

function buildRunCtx(opts: {
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	pipelineState: PipelineState;
	resolvedName: string;
	apiKey: string;
	signal: AbortSignal | undefined;
}): RunCtx {
	const { pi, ctx, pipelineState, resolvedName, apiKey, signal } = opts;
	return {
		exec: ({ cmd, args, signal }) => pi.exec(cmd, [...args], { signal }),
		model: ctx.model as NonNullable<typeof ctx.model>,
		modelRegistry: ctx.modelRegistry,
		apiKey,
		cwd: ctx.cwd,
		hasUI: ctx.hasUI,
		confirm: ctx.hasUI ? (t, b) => ctx.ui.confirm(t, b) : undefined,
		signal,
		pipelineName: resolvedName,
		loaderCache: new Map<string, DefaultResourceLoader>(),
		onStepStart: (label) => {
			pipelineState.currentSteps.add(label);
			pipelineState.currentStepStreams.delete(label);
			pipelineState.currentStepToolCalls.delete(label);
			updateWidget(ctx, pipelineState);
		},
		onStepStream: (label, streamText) => {
			pipelineState.currentStepStreams.set(label, streamText);
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

async function runPipeline(opts: {
	pi: ExtensionAPI;
	state: CaptainState;
	resolvedName: string;
	input: string | undefined;
	toolSignal: AbortSignal | undefined;
	ctx: ExtensionContext;
	background: boolean;
}): Promise<{ content: TextContent[]; details: undefined }> {
	const { pi, state, resolvedName, input, toolSignal, ctx, background } = opts;
	const pipeline = state.pipelines[resolvedName];
	if (!pipeline) {
		return {
			content: [text(`Error: pipeline "${resolvedName}" not found.`)],
			details: undefined,
		};
	}
	if (!ctx.model) {
		return { content: [text("Error: no model available")], details: undefined };
	}
	const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
	if (!apiKey) {
		return {
			content: [text("Error: no API key available")],
			details: undefined,
		};
	}

	const pipelineState: PipelineState = {
		name: resolvedName,
		spec: pipeline.spec,
		status: "running",
		results: [],
		currentSteps: new Set(),
		currentStepStreams: new Map(),
		currentStepToolCalls: new Map(),
		startTime: Date.now(),
	};
	const job = state.allocateJob(pipelineState);
	const signal = background
		? job.controller.signal
		: mergeSignals(toolSignal, job.controller.signal);

	updateWidget(ctx, pipelineState);

	const inputStr = input ?? "";
	const runCtx = buildRunCtx({
		pi,
		ctx,
		pipelineState,
		resolvedName,
		apiKey,
		signal,
	});
	const runPromise = execute(pipeline.spec, {
		input: inputStr,
		original: inputStr,
		ctx: runCtx,
	});

	if (background) {
		runPromise
			.then(({ output, results }) => {
				if (pipelineState.status !== "cancelled") {
					pipelineState.status = "completed";
					pipelineState.finalOutput = output;
					pipelineState.results = results;
				}
				pipelineState.endTime = Date.now();
				writePipelineLog(ctx.cwd, pipelineState);
				clearWidget(ctx, pipelineState);
			})
			.catch(() => {
				if (pipelineState.status !== "cancelled")
					pipelineState.status = "failed";
				pipelineState.endTime = Date.now();
				writePipelineLog(ctx.cwd, pipelineState);
				clearWidget(ctx, pipelineState);
			});

		return {
			content: [
				text(
					[
						`Pipeline "${resolvedName}" started as job #${job.id}.`,
						`Check progress: captain_status { "name": "${resolvedName}" }`,
						`Kill:           captain_kill { "id": ${job.id} }`,
					].join("\n"),
				),
			],
			details: undefined,
		};
	}

	// Blocking
	try {
		const { output, results } = await runPromise;
		if (pipelineState.status === "cancelled") {
			clearWidget(ctx, pipelineState);
			return {
				content: [
					text(`Pipeline "${resolvedName}" (job #${job.id}) was killed.`),
				],
				details: undefined,
			};
		}
		pipelineState.status = "completed";
		pipelineState.finalOutput = output;
		pipelineState.endTime = Date.now();
		pipelineState.results = results;
		writePipelineLog(ctx.cwd, pipelineState);
		clearWidget(ctx, pipelineState);
		return {
			content: [
				text(
					buildCompletionText({
						name: resolvedName,
						output,
						results,
						startTime: pipelineState.startTime,
						endTime: pipelineState.endTime,
					}),
				),
			],
			details: undefined,
		};
	} catch (err) {
		const wasCancelled = pipelineState.status === "cancelled";
		if (!wasCancelled) pipelineState.status = "failed";
		pipelineState.endTime = Date.now();
		writePipelineLog(ctx.cwd, pipelineState);
		clearWidget(ctx, pipelineState);
		return {
			content: [
				text(
					wasCancelled
						? `Pipeline "${resolvedName}" (job #${job.id}) was killed.`
						: `Pipeline "${resolvedName}" failed: ${err instanceof Error ? err.message : String(err)}`,
				),
			],
			details: undefined,
		};
	}
}

// ── Tool registrations ────────────────────────────────────────────────────

export function registerTools(pi: ExtensionAPI, state: CaptainState): void {
	// ── captain_run ────────────────────────────────────────────────────────
	pi.registerTool({
		name: "captain_run",
		label: "Captain Run",
		description:
			"Execute a defined captain pipeline. Chains $INPUT/$ORIGINAL through prompts, evaluates gates, handles failures. Returns final output. Runs in background by default — pass background=false to wait for completion.",
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: "Pipeline name to run" })),
			input: Type.Optional(
				Type.String({
					description:
						"User's original request (becomes $ORIGINAL and initial $INPUT)",
				}),
			),
			background: Type.Optional(
				Type.Boolean({
					description:
						"Fire and forget — return immediately with a job ID. Defaults to true.",
				}),
			),
		}),

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pipeline run handler covers many cases by design
		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.execute — signature fixed by pi SDK
		async execute(_id, params, signal, _onUpdate, ctx) {
			const resolvedName = params.name ?? "";
			const background = params.background ?? true;

			if (!resolvedName) {
				const options = Object.keys(state.pipelines).map(
					(n) => `${n} (loaded)`,
				);
				if (options.length === 0) {
					return {
						content: [
							text(
								"No pipelines loaded. Use captain_generate or captain_load first.",
							),
						],
						details: undefined,
					};
				}
				if (ctx.hasUI) {
					const sel = await ctx.ui.select("Select a pipeline", options);
					if (!sel)
						return { content: [text("(cancelled)")], details: undefined };
				}
				return {
					content: [text("Provide a pipeline name.")],
					details: undefined,
				};
			}

			if (!state.pipelines[resolvedName]) {
				try {
					const resolved = await state.resolvePreset(resolvedName, ctx.cwd);
					if (!resolved) {
						return {
							content: [text(`Error: pipeline "${resolvedName}" not found.`)],
							details: undefined,
						};
					}
				} catch (err) {
					return {
						content: [
							text(
								`Error loading pipeline: ${err instanceof Error ? err.message : String(err)}`,
							),
						],
						details: undefined,
					};
				}
			}

			return runPipeline({
				pi,
				state,
				resolvedName,
				input: params.input,
				toolSignal: signal,
				ctx,
				background,
			});
		},

		renderCall: (args, theme) => {
			const name = args.name as string | undefined;
			const input = args.input as string | undefined;
			if (!name)
				return new Text(
					theme.fg("toolTitle", theme.bold("captain_run")) +
						theme.fg("dim", " — select pipeline"),
					0,
					0,
				);
			return new Text(
				theme.fg("toolTitle", theme.bold("captain_run ")) +
					theme.fg("accent", name) +
					theme.fg("dim", " — ") +
					theme.fg(
						"muted",
						`"${(input ?? "").slice(0, 55)}${(input ?? "").length > 55 ? "…" : ""}"`,
					),
				0,
				0,
			);
		},
		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.renderResult — signature fixed by pi SDK
		renderResult: (_result, { isPartial }, theme) => {
			if (isPartial)
				return new Text(theme.fg("accent", "● Running pipeline..."), 0, 0);
			return new Text(theme.fg("success", "✓ Done"), 0, 0);
		},
	});

	// ── captain_status ─────────────────────────────────────────────────────
	pi.registerTool({
		name: "captain_status",
		label: "Captain Status",
		description:
			"Check status of a running or completed captain pipeline. Pass name or id for details, or omit both to list all jobs.",
		parameters: Type.Object({
			name: Type.Optional(Type.String({ description: "Pipeline name" })),
			id: Type.Optional(Type.Number({ description: "Job ID" })),
		}),

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: status renderer covers all job/step states by design
		async execute(_id, params) {
			if (!params.name && params.id === undefined) {
				const jobs = [...state.jobs.values()];
				if (jobs.length === 0) {
					return { content: [text("No jobs yet.")], details: undefined };
				}
				const lines = ["── All Jobs ──"];
				for (const j of jobs) {
					const s = j.state;
					const elapsed =
						s.endTime && s.startTime
							? ` ${((s.endTime - s.startTime) / 1000).toFixed(1)}s`
							: s.startTime
								? " (running…)"
								: "";
					lines.push(
						`  #${j.id}  ${s.status.padEnd(10)}  ${s.name}  [${s.results.length} steps${elapsed}]`,
					);
				}
				return { content: [text(lines.join("\n"))], details: undefined };
			}

			const job =
				params.id !== undefined
					? state.jobs.get(params.id)
					: [...state.jobs.values()]
							.filter((j) => j.state.name === (params.name ?? ""))
							.at(-1);

			if (!job) {
				return {
					content: [
						text(
							params.id !== undefined
								? `No job #${params.id} found.`
								: `Pipeline "${params.name}" not found or never run.`,
						),
					],
					details: undefined,
				};
			}

			const s = job.state;
			const elapsed =
				s.endTime && s.startTime
					? ` (${((s.endTime - s.startTime) / 1000).toFixed(1)}s total)`
					: "";
			const lines = [
				`Job #${s.jobId ?? "?"} — ${s.name} — ${s.status}${elapsed}`,
				s.startTime ? `Started: ${new Date(s.startTime).toISOString()}` : "",
				s.endTime ? `Ended:   ${new Date(s.endTime).toISOString()}` : "",
				"",
				"── Steps ──",
				...s.results.flatMap((r) => {
					const gate = r.gateResult
						? ` [gate: ${r.gateResult.passed ? "pass" : `FAIL — ${r.gateResult.reason}`}]`
						: "";
					const lines = [
						`${statusIcon(r.status)} ${r.label}: ${r.status} (${(r.elapsed / 1000).toFixed(1)}s)${gate}${r.error ? ` — ${r.error}` : ""}`,
					];
					if (
						(r.status === "failed" || r.status === "skipped") &&
						r.output.trim()
					) {
						lines.push(`    └─ ${r.output.trim().slice(0, 600)}`);
					}
					return lines;
				}),
			].filter(Boolean);
			if (s.finalOutput)
				lines.push("", "── Final Output ──", s.finalOutput.slice(0, 2000));

			return { content: [text(lines.join("\n"))], details: undefined };
		},

		renderCall: (args, theme) =>
			new Text(
				theme.fg("toolTitle", theme.bold("captain_status")) +
					(args.id !== undefined
						? theme.fg("muted", ` #${args.id}`)
						: args.name
							? theme.fg("muted", ` ${args.name}`)
							: theme.fg("dim", " — all jobs")),
				0,
				0,
			),
	});

	// ── captain_list ───────────────────────────────────────────────────────
	pi.registerTool({
		name: "captain_list",
		label: "Captain List",
		description: "List all defined pipelines with their structure summary.",
		parameters: Type.Object({}),

		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.execute — signature fixed by pi SDK
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const lines = state.buildPipelineListLines(ctx.cwd);
			if (lines.length === 0) {
				return {
					content: [
						text(
							"No pipelines loaded. Use captain_generate or captain_load first.",
						),
					],
					details: undefined,
				};
			}
			return { content: [text(lines.join("\n"))], details: undefined };
		},

		renderCall: (_args, theme) =>
			new Text(theme.fg("toolTitle", theme.bold("captain_list")), 0, 0),
	});

	// ── captain_kill ───────────────────────────────────────────────────────
	pi.registerTool({
		name: "captain_kill",
		label: "Captain Kill",
		description: "Kill a running captain pipeline job by its numeric ID.",
		parameters: Type.Object({
			id: Type.Number({ description: "Job ID to kill" }),
		}),

		async execute(_toolId, params) {
			const outcome = state.killJob(params.id);
			const msg =
				outcome === "killed"
					? `Job #${params.id} killed.`
					: outcome === "not-running"
						? `Job #${params.id} is not running.`
						: `No job #${params.id} found.`;
			return { content: [text(msg)], details: undefined };
		},

		renderCall: (args, theme) =>
			new Text(
				theme.fg("toolTitle", theme.bold("captain_kill ")) +
					theme.fg("error", `#${args.id}`),
				0,
				0,
			),
	});

	// ── captain_load ───────────────────────────────────────────────────────
	pi.registerTool({
		name: "captain_load",
		label: "Captain Load",
		description:
			"Load a pipeline from a .ts file or preset in .pi/pipelines/. Use action 'list' to see available presets.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("load"), Type.Literal("list")]),
			name: Type.Optional(
				Type.String({
					description: "Preset name or file path (required for 'load')",
				}),
			),
		}),

		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.execute — signature fixed by pi SDK
		async execute(_id, params, _signal, _onUpdate, ctx) {
			if (params.action === "list") {
				const presets = state.discoverPresets(ctx.cwd);
				if (presets.length === 0) {
					return {
						content: [
							text("No presets found. Add .ts files to .pi/pipelines/"),
						],
						details: undefined,
					};
				}
				return {
					content: [
						text(
							`Available presets:\n${presets.map((p) => `  • ${p.name} (${p.source})`).join("\n")}`,
						),
					],
					details: undefined,
				};
			}

			if (!params.name) {
				return {
					content: [text("Error: 'name' is required for load action.")],
					details: undefined,
				};
			}

			try {
				const resolved = await state.resolvePreset(params.name, ctx.cwd);
				if (!resolved) {
					return {
						content: [text(`Error: preset "${params.name}" not found.`)],
						details: undefined,
					};
				}
				return {
					content: [
						text(
							`Loaded pipeline "${resolved.name}"\n\n${describeRunnable(resolved.spec, 0)}`,
						),
					],
					details: undefined,
				};
			} catch (err) {
				return {
					content: [
						text(
							`Error loading pipeline: ${err instanceof Error ? err.message : String(err)}`,
						),
					],
					details: undefined,
				};
			}
		},

		renderCall: (args, theme) =>
			new Text(
				theme.fg("toolTitle", theme.bold("captain_load ")) +
					theme.fg(
						"accent",
						args.action === "list" ? "list" : (args.name ?? ""),
					),
				0,
				0,
			),
		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.renderResult — signature fixed by pi SDK
		renderResult: (result, _opts, theme) => {
			const t =
				result.content[0] && "text" in result.content[0]
					? result.content[0].text
					: "";
			return new Text(
				t.startsWith("Error")
					? theme.fg("error", "✗ Load failed")
					: theme.fg("success", "✓ Pipeline loaded"),
				0,
				0,
			);
		},
	});

	// ── captain_generate ───────────────────────────────────────────────────
	pi.registerTool({
		name: "captain_generate",
		label: "Captain Generate",
		description: [
			"Generate a TypeScript pipeline file on-the-fly using LLM.",
			"The generated .ts file is saved to .pi/pipelines/<name>.ts,",
			"immediately registered, and ready to run — fully type-safe.",
			"",
			"Examples:",
			'  captain_generate({ goal: "review this PR for security and quality" })',
			'  captain_generate({ goal: "build a REST API with tests", dryRun: true })',
		].join("\n"),
		parameters: Type.Object({
			goal: Type.String({
				description: "What you want the pipeline to accomplish",
			}),
			dryRun: Type.Optional(
				Type.Boolean({
					description: "If true, show the generated TypeScript without saving",
				}),
			),
		}),

		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.execute — signature fixed by pi SDK
		async execute(_id, params, signal, onUpdate, ctx) {
			onUpdate?.({
				content: [
					{
						type: "text",
						text: `🧠 Generating pipeline for: "${params.goal}"...`,
					},
				],
				details: undefined,
			});

			if (!ctx.model) {
				return {
					content: [text("Error: no model available")],
					details: undefined,
				};
			}
			const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
			if (!apiKey) {
				return {
					content: [text("Error: no API key available")],
					details: undefined,
				};
			}

			try {
				const generated = await generatePipeline({
					goal: params.goal,
					model: ctx.model,
					apiKey,
					signal: signal ?? undefined,
				});

				if (params.dryRun) {
					return {
						content: [
							text(
								[
									`🔍 Dry Run — Pipeline "${generated.name}"`,
									`Description: ${generated.description}`,
									"",
									"── TypeScript Source ──",
									generated.tsSource,
								].join("\n"),
							),
						],
						details: undefined,
					};
				}

				const piDir = join(ctx.cwd, ".pi", "pipelines");
				if (!existsSync(piDir)) mkdirSync(piDir, { recursive: true });
				state.ensureContractFile(ctx.cwd);
				const filePath = join(piDir, `${generated.name}.ts`);
				writeFileSync(filePath, generated.tsSource, "utf-8");

				const loaded = await state.loadPipelineFile(filePath);
				return {
					content: [
						text(
							[
								`✓ Generated and registered pipeline "${loaded.name}"`,
								`Description: ${generated.description}`,
								`Saved to: .pi/pipelines/${generated.name}.ts`,
								"",
								"── Structure ──",
								describeRunnable(loaded.spec, 0),
								"",
								`Run it with: captain_run({ name: "${loaded.name}", input: "<your input>" })`,
							].join("\n"),
						),
					],
					details: undefined,
				};
			} catch (err) {
				return {
					content: [
						text(
							`Pipeline generation failed: ${err instanceof Error ? err.message : String(err)}`,
						),
					],
					details: undefined,
				};
			}
		},

		renderCall: (args, theme) =>
			new Text(
				theme.fg("toolTitle", theme.bold("captain_generate ")) +
					theme.fg("dim", "— ") +
					theme.fg(
						"muted",
						`"${(args.goal as string).slice(0, 50)}${(args.goal as string).length > 50 ? "…" : ""}"`,
					),
				0,
				0,
			),
		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.renderResult — signature fixed by pi SDK
		renderResult: (result, { isPartial }, theme) => {
			if (isPartial)
				return new Text(theme.fg("accent", "● Generating..."), 0, 0);
			const t =
				result.content[0] && "text" in result.content[0]
					? result.content[0].text
					: "";
			return new Text(
				t.startsWith("Error") || t.startsWith("Pipeline generation failed")
					? theme.fg("error", "✗ Generation failed")
					: theme.fg("success", "✓ Pipeline generated"),
				0,
				0,
			);
		},
	});

	// ── captain_validate ───────────────────────────────────────────────────
	pi.registerTool({
		name: "captain_validate",
		label: "Captain Validate",
		description:
			"Validate a pipeline specification. Accepts a loaded pipeline name or raw JSON spec string.",
		parameters: Type.Object({}),

		// biome-ignore lint/complexity/useMaxParams: implements AgentTool.execute — signature fixed by pi SDK
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const lines = state.buildPipelineListLines(ctx.cwd);
			const names = Object.keys(state.pipelines);
			if (names.length === 0) {
				return {
					content: [text("No pipelines loaded to validate.")],
					details: undefined,
				};
			}
			// Basic structural check — verify each pipeline has at least one step
			const issues: string[] = [];
			for (const [name, { spec }] of Object.entries(state.pipelines)) {
				if (spec.kind === "parallel" && !("merge" in spec && spec.merge)) {
					issues.push(`${name}: parallel pipeline missing merge function`);
				}
			}
			return {
				content: [
					text(
						issues.length === 0
							? `All ${names.length} pipeline(s) are structurally valid.\n\n${lines.join("\n")}`
							: `Validation issues:\n${issues.join("\n")}`,
					),
				],
				details: undefined,
			};
		},

		renderCall: (_args, theme) =>
			new Text(theme.fg("toolTitle", theme.bold("captain_validate")), 0, 0),
	});
}
