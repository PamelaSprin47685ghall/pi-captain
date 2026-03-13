// @large-file: intentional consolidation of all type definitions into one module
// ── Captain Types ──────────────────────────────────────────────────────────
// All types in one place. Extension points (Gate, OnFail, Transform, MergeFn)
// are plain functions — inline or import presets from ./presets.ts

import type { Api, Model } from "@mariozechner/pi-ai";
import type { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

// ── Model ─────────────────────────────────────────────────────────────────

export type ModelId = "sonnet" | "flash" | "haiku" | "opus" | (string & {});

export interface ModelRegistryLike {
	getAll(): Model<Api>[];
	find(provider: string, modelId: string): Model<Api> | undefined;
	getApiKey(model: Model<Api>): Promise<string | undefined>;
}

export type ExecFn = (
	cmd: string,
	args: readonly string[],
	opts?: { signal?: AbortSignal },
) => Promise<{ stdout: string; stderr: string; code: number }>;

// ── Extension point contexts ───────────────────────────────────────────────

export interface GateCtx {
	readonly cwd: string;
	readonly signal?: AbortSignal;
	readonly exec: ExecFn;
	readonly confirm?: (title: string, body: string) => Promise<boolean>;
	readonly hasUI: boolean;
	readonly model?: Model<Api>;
	readonly apiKey?: string;
	readonly modelRegistry?: ModelRegistryLike;
	/** Names of tools actually called during the step (available in gate context). */
	readonly toolsUsed?: readonly string[];
}

// ── Extension point types ─────────────────────────────────────────────────

/** Return true to pass, a string reason to fail, or throw to fail. */
export type Gate = (params: {
	readonly output: string;
	readonly ctx?: GateCtx;
}) => true | string | Promise<true | string>;

export interface OnFailCtx {
	readonly reason: string;
	readonly retryCount: number;
	/** Total times the step has run so far (retryCount + 1). */
	readonly stepCount: number;
	readonly output: string;
}

export type OnFailResult =
	| { readonly action: "retry" }
	| { readonly action: "fail" }
	| { readonly action: "skip" }
	| { readonly action: "warn" }
	| { readonly action: "fallback"; readonly step: Step };

export type OnFail = (ctx: OnFailCtx) => OnFailResult | Promise<OnFailResult>;

export type Transform = (params: {
	readonly output: string;
	readonly original: string;
	readonly ctx: GateCtx;
}) => string | Promise<string>;

export interface MergeCtx {
	model: Model<Api>;
	apiKey: string;
	signal?: AbortSignal;
}

export type MergeFn = (
	outputs: readonly string[],
	ctx: MergeCtx,
) => string | Promise<string>;

// ── Step hooks ────────────────────────────────────────────────────────────

/** Per-step lifecycle hooks — plain functions to run at key moments. */
export interface StepHooks {
	onStart?: (ctx: {
		label: string;
		input: string;
		original: string;
	}) => void | Promise<void>;
	onFinish?: (ctx: {
		label: string;
		input: string;
		original: string;
		result: StepResult;
	}) => void | Promise<void>;
	onToolCallStart?: (ctx: {
		label: string;
		toolName: string;
		toolInput?: unknown;
	}) => void | Promise<void>;
	onToolCallEnd?: (ctx: {
		label: string;
		toolName: string;
		toolInput?: unknown;
		output: unknown;
		isError: boolean;
	}) => void | Promise<void>;
}

// ── Runnables ─────────────────────────────────────────────────────────────

/** Atomic unit — one pi agent invocation. */
export interface Step {
	readonly kind: "step";
	readonly label: string;
	readonly prompt: string;
	readonly model?: ModelId;
	readonly tools?: readonly string[];
	readonly systemPrompt?: string;
	readonly skills?: readonly string[];
	readonly extensions?: readonly string[];
	readonly jsonOutput?: boolean;
	readonly description?: string;
	readonly gate?: Gate;
	readonly onFail?: OnFail;
	readonly transform?: Transform;
	readonly hooks?: StepHooks;
}

/** Run steps in order, chaining output via $INPUT. */
export interface Sequential {
	readonly kind: "sequential";
	readonly steps: readonly Runnable[];
	readonly gate?: Gate;
	readonly onFail?: OnFail;
	readonly transform?: Transform;
}

/** Run different steps concurrently then merge their outputs. */
export interface Parallel {
	readonly kind: "parallel";
	readonly steps: readonly Runnable[];
	readonly merge: MergeFn;
	readonly gate?: Gate;
	readonly onFail?: OnFail;
	readonly transform?: Transform;
}

/** Union of all composable units. */
export type Runnable = Step | Sequential | Parallel;

/**
 * @deprecated Pool is removed. Use `parallel` with repeated steps:
 * `{ kind: "parallel", steps: [step, step, step], merge: vote }`
 * This type is kept for migration compatibility only.
 */
export interface Pool {
	readonly kind: "pool";
	readonly step: Runnable;
	readonly count: number;
	readonly merge: MergeFn;
	readonly gate?: Gate;
	readonly onFail?: OnFail;
	readonly transform?: Transform;
}

// ── Session factory (injection seam for tests) ────────────────────────────

/**
 * Optional injection seam on RunCtx. When provided, executor uses these
 * instead of the real `createSession`/`runPrompt` from session.ts.
 * Keeps executor unit-testable without the @mariozechner/pi-ai dependency.
 * Both functions use `unknown` for the session type to avoid circular imports
 * between types.ts and session.ts.
 */
export interface SessionFactory {
	// biome-ignore lint/suspicious/noExplicitAny: session type is opaque (defined in session.ts)
	createSession(step: Step, ctx: RunCtx, model: Model<Api>): Promise<any>;
	runPrompt(
		// biome-ignore lint/suspicious/noExplicitAny: session type is opaque (defined in session.ts)
		session: any,
		prompt: string,
		step: Step,
		ctx: RunCtx,
		input: string,
		original: string,
	): Promise<{ output: string; toolCallCount: number }>;
}

// ── Runtime context ───────────────────────────────────────────────────────

export interface RunCtx {
	exec: ExecFn;
	model: Model<Api>;
	modelRegistry: ModelRegistryLike;
	readonly apiKey: string;
	cwd: string;
	hasUI: boolean;
	confirm?: (title: string, body: string) => Promise<boolean>;
	signal?: AbortSignal;
	pipelineName: string;
	stepGroup?: string;
	loaderCache?: Map<string, DefaultResourceLoader>;
	/** Injection seam: override session creation/prompt for testing. */
	sessionFactory?: SessionFactory;
	onStepStart?: (label: string) => void;
	onStepEnd?: (result: StepResult) => void;
	onStepStream?: (label: string, text: string) => void;
	onStepToolCall?: (label: string, n: number) => void;
}

// ── Runtime state ─────────────────────────────────────────────────────────

export type StepStatus =
	| "pending"
	| "running"
	| "passed"
	| "failed"
	| "skipped";

export interface StepResult {
	label: string;
	status: StepStatus;
	output: string;
	gateResult?: { passed: boolean; reason: string };
	error?: string;
	elapsed: number;
	group?: string;
	toolCount?: number;
	toolCallCount?: number;
	model?: string;
}

export interface PipelineState {
	readonly name: string;
	readonly spec: Runnable;
	status: "idle" | "running" | "completed" | "failed" | "cancelled";
	results: StepResult[];
	readonly currentSteps: Set<string>;
	readonly currentStepStreams: Map<string, string>;
	readonly currentStepToolCalls: Map<string, number>;
	startTime?: number;
	endTime?: number;
	finalOutput?: string;
	jobId?: number;
}

// ── Pure utilities ────────────────────────────────────────────────────────

const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

export function statusIcon(status: string): string {
	if (status === "passed") return "✓";
	if (status === "failed") return "✗";
	if (status === "skipped") return "⊘";
	if (status === "running") return "⏳";
	return "○";
}

/** Human-readable summary of a Runnable tree. */
export function describeRunnable(r: Runnable, indent: number): string {
	const pad = " ".repeat(indent);
	switch (r.kind) {
		case "step": {
			const who = `model: ${r.model ?? "default"}, tools: ${(r.tools ?? DEFAULT_TOOLS).join(",")}`;
			const gateInfo = r.gate ? `, gate: ${r.gate.name || "fn"}` : "";
			return `${pad}→ [step] "${r.label}" (${who}${gateInfo})`;
		}
		case "sequential":
			return [
				`${pad}⟶ [sequential] (${r.steps.length} steps)`,
				...r.steps.map((s) => describeRunnable(s, indent + 2)),
			].join("\n");
		case "parallel":
			return [
				`${pad}⫸ [parallel] (${r.steps.length} branches, merge: ${r.merge.name || "fn"})`,
				...r.steps.map((s) => describeRunnable(s, indent + 2)),
			].join("\n");
		default:
			return `${pad}? unknown`;
	}
}

/** Collect all step labels from a Runnable tree (depth-first). */
export function collectStepLabels(r: Runnable): string[] {
	switch (r.kind) {
		case "step":
			return [r.label];
		case "sequential":
		case "parallel":
			return r.steps.flatMap(collectStepLabels);
		default:
			return [];
	}
}

/** Resolve a model shorthand (e.g. "sonnet") to a Model object via the registry. */
export function resolveModel(
	pattern: string,
	registry: ModelRegistryLike,
	fallback: Model<Api>,
): Model<Api> {
	const all = registry.getAll();
	const lower = pattern.toLowerCase();
	const sameProvider = (m: Model<Api>) => m.provider === fallback.provider;

	const exactSameProvider = all.find(
		(m) => m.id.toLowerCase() === lower && sameProvider(m),
	);
	if (exactSameProvider) return exactSameProvider;

	const partialMatches = all.filter(
		(m) =>
			sameProvider(m) &&
			(m.id.toLowerCase().includes(lower) ||
				(m as { name?: string }).name?.toLowerCase().includes(lower)),
	);
	if (partialMatches.length > 0) {
		// Prefer current (non-dated) aliases over snapshots
		partialMatches.sort((a, b) => {
			const score = (id: string): number => {
				const isNew = /^claude-(?!\d)/.test(id.toLowerCase());
				const isDated = /\d{8}$/.test(id.toLowerCase());
				if (isNew && !isDated) return 3;
				if (isNew && isDated) return 2;
				if (!isDated) return 1;
				return 0;
			};
			return score(b.id) - score(a.id);
		});
		return partialMatches[0];
	}
	return fallback;
}
