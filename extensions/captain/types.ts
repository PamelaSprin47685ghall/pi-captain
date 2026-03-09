// ── Captain: Pipeline Orchestration Types ──────────────────────────────────

/**
 * Context passed to every gate function.
 * Gates receive the step output plus execution helpers (shell, UI, LLM).
 */
export interface GateCtx {
	/** The step's output text to validate */
	output: string;
	/** Working directory for shell commands */
	cwd: string;
	signal?: AbortSignal;
	/** Run a shell command — resolves with exit code + stdout/stderr */
	exec: (
		cmd: string,
		args: string[],
		opts?: { signal?: AbortSignal },
	) => Promise<{ stdout: string; stderr: string; code: number }>;
	/** Show a confirm dialog (only available in interactive sessions) */
	confirm?: (title: string, body: string) => Promise<boolean>;
	hasUI: boolean;
	/** Current LLM model (used by llm/llmFast/llmStrict gates) */
	// biome-ignore lint/suspicious/noExplicitAny: model type varies by provider
	model?: any;
	apiKey?: string;
	// biome-ignore lint/suspicious/noExplicitAny: registry type lives in executor
	modelRegistry?: any;
}

/**
 * A gate is a plain function: receives context (including step output) and
 * returns true to pass or false to fail.  Any async operation is allowed.
 * Throw to fail with a descriptive error message.
 */
export type Gate = (ctx: GateCtx) => boolean | Promise<boolean>;

/** Failure handling strategy */
export type OnFail =
	| { action: "retry"; max?: number }
	| { action: "skip" }
	| { action: "fallback"; step: Step }
	| { action: "retryWithDelay"; max?: number; delayMs: number } // retry with backoff
	| { action: "warn" }; // log warning but pass through

/** Data transform between steps */
export type Transform =
	| { kind: "full" } // pass entire output
	| { kind: "extract"; key: string } // extract JSON key from output
	| { kind: "summarize" }; // ask LLM to summarize output

/** Merge strategy for combining parallel/pool outputs */
export type MergeStrategy =
	| "vote"
	| "rank"
	| "firstPass"
	| "concat"
	| "awaitAll";

// ── Composition Types (infinitely nestable) ────────────────────────────────

/** Atomic unit — a single `pi --print` invocation */
export interface Step {
	kind: "step";
	label: string;

	// ── Step config ───────────────────────────────────────────────────────
	/** Model identifier (e.g. "sonnet", "flash"). Passed as --model. */
	model?: string;
	/** Tool names to enable. Passed as --tools read,bash,edit. */
	tools?: string[];
	/** Temperature for the LLM call. */
	temperature?: number;
	/** System prompt text. Passed as --system-prompt. */
	systemPrompt?: string;
	/** Skill file paths. Each passed as --skill <path>. */
	skills?: string[];
	/** Extension file paths. Each passed as --extension <path>. */
	extensions?: string[];
	/** If true, pass --mode json to get structured JSON output. */
	jsonOutput?: boolean;

	description?: string;
	prompt: string; // supports $INPUT, $ORIGINAL interpolation

	// Note: to limit step execution, configure model-level or pipeline-level controls.
	// maxTurns / maxTokens were removed — they were declared but never enforced,
	// which was misleading to users. Add back when the SDK supports them natively.

	gate?: Gate;
	onFail?: OnFail;
	transform: Transform;
}

/** Sequential — run in order, output chains via $INPUT */
export interface Sequential {
	kind: "sequential";
	steps: Runnable[];
	gate?: Gate; // validates final output of the sequence
	onFail?: OnFail; // retry = re-run entire sequence from scratch
}

/** Pool — replicate ONE runnable N times with different inputs */
export interface Pool {
	kind: "pool";
	step: Runnable;
	count: number;
	merge: { strategy: MergeStrategy };
	gate?: Gate; // validates merged output
	onFail?: OnFail; // retry = re-run all N branches + re-merge
}

/** Parallel — run DIFFERENT runnables concurrently */
export interface Parallel {
	kind: "parallel";
	steps: Runnable[];
	merge: { strategy: MergeStrategy };
	gate?: Gate; // validates merged output
	onFail?: OnFail; // retry = re-run all branches + re-merge
}

/** Union type — any composable unit */
export type Runnable = Step | Sequential | Pool | Parallel;

// ── Runtime State ──────────────────────────────────────────────────────────

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
	elapsed: number; // ms
	group?: string; // parallel/pool group label this step belongs to
}

export interface PipelineState {
	name: string;
	spec: Runnable;
	status: "idle" | "running" | "completed" | "failed";
	results: StepResult[];
	/** Labels of all steps currently executing (supports concurrent parallel/pool steps) */
	currentSteps: Set<string>;
	/** Accumulated stream text keyed by step label */
	currentStepStreams: Map<string, string>;
	startTime?: number;
	endTime?: number;
	finalOutput?: string;
}

/** Persisted state for session reconstruction */
export interface CaptainDetails {
	pipelines: Record<string, { spec: Runnable }>;
	lastRun?: {
		name: string;
		state: PipelineState;
	};
}
