// @large-file: intentional consolidation of agent session creation and prompt execution into one module
// ── Agent Session ─────────────────────────────────────────────────────────
// Session creation and prompt execution against a pi agent.

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import {
	createAgentSession,
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { RunCtx, Step } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: tool schema types vary per tool
type AnyAgentTool = AgentTool<any>;

export type AgentSession = Awaited<
	ReturnType<typeof createAgentSession>
>["session"];

// Good practice even without worktrees — keeps agent behaviour consistent.
const RELATIVE_PATHS_INSTRUCTION =
	"Always use relative paths for file operations (read, write, edit, bash). " +
	"Relative paths resolve to the current working directory shown above.";

/** Map tool name strings to SDK tool instances for the given cwd. */
export function resolveTools(
	names: readonly string[],
	cwd: string,
): AnyAgentTool[] {
	return names.flatMap((name): AnyAgentTool[] => {
		switch (name) {
			case "read":
				return [createReadTool(cwd)];
			case "bash":
				return [createBashTool(cwd)];
			case "edit":
				return [createEditTool(cwd)];
			case "write":
				return [createWriteTool(cwd)];
			case "grep":
				return [createGrepTool(cwd)];
			case "find":
				return [createFindTool(cwd)];
			case "ls":
				return [createLsTool(cwd)];
			default:
				return [];
		}
	});
}

/** Create (or return a cached) DefaultResourceLoader for the given config. */
async function getLoader(opts: {
	ctx: RunCtx;
	systemPrompt?: string;
	extensions?: readonly string[];
	skills?: readonly string[];
}): Promise<DefaultResourceLoader> {
	const { ctx, systemPrompt, extensions, skills } = opts;
	const agentDir = getAgentDir();
	const key = JSON.stringify({
		cwd: ctx.cwd,
		agentDir,
		systemPrompt: systemPrompt ?? null,
		extensions: extensions ?? [],
		skills: skills ?? [],
	});

	if (ctx.loaderCache?.has(key)) {
		return ctx.loaderCache.get(key) as DefaultResourceLoader;
	}

	const loader = new DefaultResourceLoader({
		cwd: ctx.cwd,
		agentDir,
		...(systemPrompt && { systemPrompt }),
		appendSystemPrompt: RELATIVE_PATHS_INSTRUCTION,
		...((extensions?.length ?? 0) > 0 && {
			additionalExtensionPaths: [...(extensions ?? [])],
		}),
		...((skills?.length ?? 0) > 0 && {
			additionalSkillPaths: [...(skills ?? [])],
		}),
	});
	await loader.reload();
	ctx.loaderCache?.set(key, loader);
	return loader;
}

/** Create a fresh agent session for the given step. */
export async function createSession(
	step: Step,
	opts: { ctx: RunCtx; model: Model<Api> },
): Promise<AgentSession> {
	const { ctx, model } = opts;
	const toolNames = step.tools ?? ["read", "bash", "edit", "write"];
	const tools = resolveTools(toolNames, ctx.cwd);
	const loader = await getLoader({
		ctx,
		systemPrompt: step.systemPrompt,
		extensions: step.extensions,
		skills: step.skills,
	});
	const { session } = await createAgentSession({
		cwd: ctx.cwd,
		model,
		tools,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(),
		settingsManager: SettingsManager.inMemory({
			compaction: { enabled: false },
		}),
	});
	return session;
}

/**
 * Send a prompt to a session and collect the output text.
 * Fires ctx callbacks for streaming, tool calls, and step hooks.
 */
export async function runPrompt(opts: {
	session: AgentSession;
	prompt: string;
	step: Step;
	ctx: RunCtx;
	input: string;
	original: string;
}): Promise<{ output: string; toolCallCount: number }> {
	const { session, prompt, step, ctx } = opts;
	const toolNames = step.tools ?? ["read", "bash", "edit", "write"];
	session.setActiveToolsByName([...toolNames]);

	const onAbort = () => session.abort();
	ctx.signal?.addEventListener("abort", onAbort);

	let output = "";
	let toolCallCount = 0;
	const toolOutputs: string[] = [];

	// biome-ignore lint/suspicious/noExplicitAny: session event shape varies by SDK version
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: event dispatch fan-out is inherently branchy
	const unsub = session.subscribe((event: any) => {
		if (
			event.type === "message_update" &&
			event.assistantMessageEvent?.type === "text_delta"
		) {
			output += event.assistantMessageEvent.delta;
			ctx.onStepStream?.(step.label, output);
		} else if (event.type === "tool_execution_start") {
			ctx.onStepStream?.(step.label, output || `[calling ${event.toolName}…]`);
			void step.hooks?.onToolCallStart?.({
				label: step.label,
				toolName: event.toolName as string,
				toolInput: event.toolInput as unknown,
			});
		} else if (event.type === "tool_execution_end") {
			toolCallCount++;
			ctx.onStepToolCall?.(step.label, toolCallCount);
			void step.hooks?.onToolCallEnd?.({
				label: step.label,
				toolName: event.toolName as string,
				toolInput: event.toolInput as unknown,
				output: event.result as unknown,
				isError: event.isError as boolean,
			});
			if (!event.isError) {
				const text =
					typeof event.result === "string"
						? event.result
						: ((event.result as { output?: string; content?: string })
								?.output ??
							(event.result as { output?: string; content?: string })?.content);
				if (text?.trim())
					toolOutputs.push(`[${event.toolName}]\n${text.trim()}`);
			}
		}
	});

	try {
		await session.prompt(prompt);
	} finally {
		unsub();
		ctx.signal?.removeEventListener("abort", onAbort);
	}

	output = output.trim();
	if (!output) output = session.getLastAssistantText()?.trim() ?? "";
	if (!output && toolOutputs.length > 0) output = toolOutputs.join("\n\n");

	await session.dispose();
	return { output, toolCallCount };
}
