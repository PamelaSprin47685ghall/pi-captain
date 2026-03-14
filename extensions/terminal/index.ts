import { spawn } from "node:child_process";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { buildFinalOutput, drawBox, notifyUI, WIDGET_ID } from "./render.js";

function handleClose(opts: {
	code: number | null;
	args: string;
	cwd: string;
	outputLines: string[];
	ctx: ExtensionContext;
	pi: ExtensionAPI;
}): void {
	const { code, args, cwd, outputLines, ctx, pi } = opts;
	const exitCode = code ?? 1;
	const success = exitCode === 0;
	const finalOutput = buildFinalOutput(outputLines.join("\n").trimEnd());

	if (ctx.hasUI)
		notifyUI({ ctx, args, cwd, out: finalOutput, ok: success, code: exitCode });

	if (finalOutput.trim()) {
		const full = drawBox({
			cmd: args,
			cwd,
			lines: finalOutput.trimEnd().split("\n"),
			status: success ? "ok" : "error",
			code: exitCode,
		}).join("\n");
		pi.sendMessage(
			{
				customType: "terminal-result",
				content: `\`\`\`\n${full}\n\`\`\``,
				display: false,
			},
			{ triggerTurn: false },
		);
	}
}

function runCommand(opts: {
	pi: ExtensionAPI;
	args: string;
	ctx: ExtensionContext;
}): void {
	const { pi, args, ctx } = opts;
	const cwd = ctx.cwd;
	const outputLines: string[] = [];

	const updateWidget = (status: "running" | "ok" | "error", code?: number) => {
		if (!ctx.hasUI) return;
		// Show only the last output line live — widget area is too small for a full box
		const lastLine = outputLines.filter((l) => l.trim()).at(-1) ?? "";
		const icon =
			status === "running" ? "⟳" : status === "ok" ? "✓" : `✗ exit ${code}`;
		ctx.ui.setWidget(WIDGET_ID, [
			`${icon}  ❯ ${args}`,
			lastLine ? `   ${lastLine}` : "",
		]);
	};

	const proc = spawn("bash", ["-c", args], { cwd });

	const onData = (chunk: Buffer) => {
		const text = chunk.toString();
		const newLines = text.split("\n");
		// merge first new line onto last existing line (handles partial chunks)
		if (outputLines.length > 0 && newLines.length > 0) {
			outputLines[outputLines.length - 1] += newLines.shift() ?? "";
		}
		outputLines.push(...newLines);
		updateWidget("running");
	};

	proc.stdout.on("data", onData);
	proc.stderr.on("data", onData);

	updateWidget("running");

	proc.on("close", (code) =>
		handleClose({ code, args, cwd, outputLines, ctx, pi }),
	);

	proc.on("error", (err) => {
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			ctx.ui.notify(`Error: ${err.message}`, "error");
		}
	});
}

export default function (pi: ExtensionAPI) {
	const handler = (args: string, ctx: ExtensionContext) => {
		if (!args.trim()) {
			ctx.ui.notify("Usage: /t <command>", "warning");
			return Promise.resolve();
		}
		// Fire-and-forget — spawn runs in background, handler returns immediately
		runCommand({ pi, args, ctx });
		return Promise.resolve();
	};

	pi.registerCommand("terminal", {
		description: "Run a shell command. Usage: /terminal <command>",
		handler,
	});

	pi.registerCommand("t", {
		description: "Run a shell command. Usage: /t <command>",
		handler,
	});

	pi.registerCommand("$", {
		description: "Run a shell command. Usage: /$ <command>",
		handler,
	});
}
