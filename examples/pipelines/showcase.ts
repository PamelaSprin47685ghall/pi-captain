import {
	concat,
	extract,
	full,
	llmFast,
	fallback as onFailFallback,
	rank,
	regexCI,
	retry,
	summarize,
	warn,
} from "../../extensions/captain/api.js";
import type {
	Gate,
	OnFail,
	Parallel,
	Sequential,
	Step,
} from "../../extensions/captain/types.js";

const flash = "flash";
const noTools: string[] = [];
const noGate: Gate = () => true;
const noFail: OnFail = warn;

const brainstorm: Step = {
	kind: "step",
	label: "brainstorm",
	model: "sonnet",
	tools: noTools,
	prompt: `Given: "$INPUT" Output a numbered list of 5 ideas.`,
	gate: ({ output }) => output.length > 10 || "not long enough",
	onFail: retry(2),
	transform: full,
};

const challenge: Step = {
	kind: "step",
	label: "challenge",
	model: flash,
	tools: noTools,
	prompt: `Review: $INPUT`,
	gate: ({ output }: Parameters<Gate>[0]) =>
		output.includes("1.") ? true : ('must include "1."' as ReturnType<Gate>),
	onFail: retry(3),
	transform: full,
};

const expandPractical: Step = {
	kind: "step",
	label: "expand-practical",
	model: flash,
	tools: noTools,
	prompt: `Practical: $INPUT`,
	gate: noGate,
	onFail: noFail,
	transform: full,
};
const expandCreative: Step = {
	kind: "step",
	label: "expand-creative",
	model: flash,
	tools: noTools,
	prompt: `Creative: $INPUT`,
	gate: noGate,
	onFail: noFail,
	transform: full,
};
const expandParallel: Parallel = {
	kind: "parallel",
	steps: [expandPractical, expandCreative],
	merge: concat,
};

const ranker: Step = {
	kind: "step",
	label: "ranker",
	model: flash,
	tools: noTools,
	prompt: `Rank: $INPUT`,
	gate: regexCI("^1\\."),
	onFail: warn,
	transform: full,
};
const rankPool: Parallel = {
	kind: "parallel",
	steps: [ranker, ranker, ranker],
	merge: rank,
};

const summarizeStep: Step = {
	kind: "step",
	label: "summarize",
	model: flash,
	tools: noTools,
	prompt: `Summarize: $INPUT`,
	gate: noGate,
	onFail: noFail,
	transform: summarize(),
};
const formatStep: Step = {
	kind: "step",
	label: "format-json",
	model: flash,
	tools: noTools,
	prompt: `JSON: $INPUT`,
	gate: ({ output }) => {
		try {
			JSON.parse(output.trim());
			return true;
		} catch {
			return "not json";
		}
	},
	onFail: warn,
	transform: extract("winner"),
};

const warnDemo: Step = {
	kind: "step",
	label: "warn-demo",
	model: flash,
	tools: noTools,
	prompt: `Say: "The winner is: $INPUT. Great choice!"`,
	gate: ({ output }) => (output.trim() === "42" ? true : "must be '42'"),
	onFail: warn,
	transform: full,
};

const fallbackStep: Step = {
	kind: "step",
	label: "fallback-recovery",
	model: flash,
	tools: noTools,
	prompt: `Closing message for: "$INPUT"`,
	gate: noGate,
	onFail: noFail,
	transform: full,
};
const fallbackDemo: Step = {
	kind: "step",
	label: "fallback-demo",
	model: flash,
	tools: noTools,
	prompt: `Output ONLY "FAIL"`,
	gate: ({ output }) => (output.trim() !== "FAIL" ? true : "must not be FAIL"),
	onFail: onFailFallback(fallbackStep),
	transform: full,
};

const toolDemo: Step = {
	kind: "step",
	label: "tool-demo",
	model: flash,
	tools: ["bash"],
	prompt: `Run: echo "Winner: $INPUT" then node --version. Output: "Tool demo complete. Winner: $INPUT. Node: <version>"`,
	gate: ({ output, ctx }) => {
		if (!output.toLowerCase().includes("tool demo complete"))
			return "must contain 'Tool demo complete'";
		if (!ctx?.toolsUsed?.includes("bash")) return "bash not called";
		return true;
	},
	onFail: warn,
	transform: full,
};

const webSearchDemo: Step = {
	kind: "step",
	label: "web-search-demo",
	model: flash,
	tools: ["web_search"],
	prompt: `Search "best hobbies 2025". Output: "Web search complete: <top 3>"`,
	gate: ({ output, ctx }) => {
		if (!output.toLowerCase().includes("web search complete"))
			return "must contain 'Web search complete'";
		if (!ctx?.toolsUsed?.includes("web_search")) return "web_search not called";
		return true;
	},
	onFail: warn,
	transform: full,
};

const llmFastDemo: Step = {
	kind: "step",
	label: "llm-fast-gate-demo",
	model: flash,
	tools: noTools,
	prompt: `Congratulate the user on their hobby idea: "$INPUT". One sentence, under 20 words.`,
	gate: llmFast(
		"Single enthusiastic congratulatory sentence, under 20 words, mentions hobby.",
		0.7,
	),
	onFail: warn,
	transform: full,
};

const retryDemo: Step = {
	kind: "step",
	label: "retry-demo",
	model: flash,
	tools: noTools,
	prompt: `Reply with just: hello`,
	gate: ({ output }) => `Gate always fails — got: "${output.trim()}"`,
	onFail: retry(3),
	transform: full,
};

export const pipeline: Sequential = {
	kind: "sequential",
	steps: [
		brainstorm,
		challenge,
		expandParallel,
		rankPool,
		summarizeStep,
		formatStep,
		warnDemo,
		fallbackDemo,
		toolDemo,
		webSearchDemo,
		llmFastDemo,
		retryDemo,
	],
	gate: noGate,
} satisfies Sequential;
