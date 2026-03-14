// ── Custom Transform Examples ─────────────────────────────────────────────
// A Transform maps one step's output to the next step's $INPUT.
// It's just a function: ({ output, original, ctx }) => string | Promise<string>
//
// These examples show patterns beyond the built-in presets (full / extract / summarize).
// Copy any of these into your pipeline file and wire them to a step's `transform` field.
//
// Import the Transform type from the captain public API:
//   import type { Transform } from "<path-to>/extensions/captain/index.public.js";

import type { Transform } from "../extensions/captain/api.js";

// ── 1. Strip markdown fences ──────────────────────────────────────────────
// Useful when a step returns a fenced code block and the next step needs raw code.

export const stripMarkdownFences: Transform = ({ output }) =>
	output
		.replace(/^```[\w]*\n?/gm, "")
		.replace(/^```$/gm, "")
		.trim();

// ── 2. Prepend original request ───────────────────────────────────────────
// Keeps the user's original intent visible to downstream steps.

export const prependOriginal: Transform = ({ output, original }) =>
	`## Original request\n${original}\n\n## Step output\n${output}`;

// ── 3. Take only the first N lines ───────────────────────────────────────
// Truncate long outputs before passing to a slow / expensive model.

export function firstLines(n: number): Transform {
	return ({ output }) => output.split("\n").slice(0, n).join("\n");
}

// ── 4. JSON field rename / reshape ────────────────────────────────────────
// Parse a JSON blob, reshape it, re-serialise — useful when two steps speak
// different JSON schemas.

export function reshapeJson(fn: (parsed: unknown) => unknown): Transform {
	return ({ output }) => {
		try {
			const parsed = JSON.parse(output);
			return JSON.stringify(fn(parsed), null, 2);
		} catch {
			return output; // fall back to raw text on parse error
		}
	};
}

// ── 5. Async: shell command post-processing ───────────────────────────────
// Run an arbitrary shell command on the output (e.g. lint, format, validate).
// ctx.exec is available when the step runs inside the pi agent.

export const runPrettier: Transform = async ({ output, ctx }) => {
	try {
		const { stdout } = await ctx.exec({
			cmd: "prettier",
			args: ["--parser", "typescript", "--stdin-filepath", "input.ts"],
			signal: ctx.signal,
		});
		return stdout || output;
	} catch {
		return output; // prettier not installed — pass through unchanged
	}
};
