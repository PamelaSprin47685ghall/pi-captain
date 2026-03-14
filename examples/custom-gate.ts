// ── Custom Gate Examples ──────────────────────────────────────────────────
// A Gate checks step output and returns `true` to pass or a string (reason) to fail.
// It's just a function: ({ output, ctx? }) => true | string | Promise<true | string>
//
// These examples go beyond the built-in presets (command / file / regexCI / user / allOf).
// Copy any into your pipeline and wire to a step's `gate` field.
//
// Import the Gate type from the captain public API:
//   import type { Gate } from "<path-to>/extensions/captain/index.public.js";

import type { Gate } from "../extensions/captain/api.js";

// ── 1. Word-count threshold ───────────────────────────────────────────────
// Ensure the output is substantial enough before moving on.

export function minWords(n: number): Gate {
	return ({ output }) => {
		const count = output.trim().split(/\s+/).length;
		return count >= n
			? true
			: `Output too short: got ${count} words, need at least ${n}`;
	};
}

// ── 2. JSON validity ─────────────────────────────────────────────────────
// Ensure the step produced parseable JSON (useful after jsonOutput steps).

export const validJson: Gate = ({ output }) => {
	try {
		JSON.parse(output);
		return true;
	} catch (e) {
		return `Output is not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
	}
};

// ── 3. No forbidden strings ───────────────────────────────────────────────
// Block outputs that contain phrases you never want to reach the next step.

export function noForbidden(...phrases: string[]): Gate {
	return ({ output }) => {
		const lower = output.toLowerCase();
		const hit = phrases.find((p) => lower.includes(p.toLowerCase()));
		return hit ? `Output contains forbidden phrase: "${hit}"` : true;
	};
}

// ── 4. HTTP reachability ─────────────────────────────────────────────────
// Verify a URL extracted from the output is actually reachable.

export function urlReachable(extractUrl: (output: string) => string): Gate {
	return async ({ output, ctx }) => {
		const url = extractUrl(output);
		if (!url) return "Could not extract a URL from output";
		try {
			const { code } = (await ctx?.exec({
				cmd: "curl",
				args: ["-sf", "--head", url],
				signal: ctx?.signal,
			})) ?? { code: 1 };
			return code === 0 ? true : `URL not reachable: ${url}`;
		} catch {
			return `Failed to check URL: ${url}`;
		}
	};
}

// ── 5. TypeScript compilation check ──────────────────────────────────────
// Write the output to a temp file and verify it compiles cleanly.

export const tsCompiles: Gate = async ({ output, ctx }) => {
	const tmp = `/tmp/captain-gate-check-${Date.now()}.ts`;
	try {
		await ctx?.exec({
			cmd: "bash",
			args: ["-c", `echo ${JSON.stringify(output)} > ${tmp}`],
			signal: ctx?.signal,
		});
		const { code, stderr } = (await ctx?.exec({
			cmd: "npx",
			args: ["tsc", "--noEmit", "--allowJs", "--checkJs", "false", tmp],
			signal: ctx?.signal,
		})) ?? { code: 1, stderr: "ctx unavailable" };
		return code === 0 ? true : `TypeScript errors:\n${stderr.slice(0, 400)}`;
	} finally {
		// best-effort cleanup
		await ctx
			?.exec({ cmd: "rm", args: ["-f", tmp], signal: ctx?.signal })
			.catch((_e: unknown) => undefined);
	}
};
