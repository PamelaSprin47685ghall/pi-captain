// ── Gate Presets ──────────────────────────────────────────────────────────
// Each factory returns a Gate: ({ output, ctx? }) => true | string | Promise<true | string>
// Return true to pass. Return a string to fail — the string is the reason.

import type { Gate } from "./types.js";

// ── Shell ─────────────────────────────────────────────────────────────────

/** Run a shell command — exit 0 passes, non-zero returns stderr/stdout as reason */
export function command(cmd: string): Gate {
	return async ({ ctx }) => {
		if (!ctx) return "command gate requires execution context";
		const { code, stdout, stderr } = await ctx.exec("bash", ["-c", cmd], {
			signal: ctx.signal,
		});
		if (code !== 0)
			return `Command failed (exit ${code}): ${(stderr || stdout).trim().slice(0, 200)}`;
		return true;
	};
}

// ── Filesystem ────────────────────────────────────────────────────────────

/** File must exist */
export function file(path: string): Gate {
	return async ({ ctx }) => {
		if (!ctx) return "file gate requires execution context";
		const { code } = await ctx.exec("test", ["-f", path], {
			signal: ctx.signal,
		});
		return code === 0 ? true : `File not found: ${path}`;
	};
}

// ── Output ────────────────────────────────────────────────────────────────

/** Output must match a regex */
function regex(pattern: string, flags?: string): Gate {
	return ({ output }) => {
		let re: RegExp;
		try {
			re = new RegExp(pattern, flags ?? "");
		} catch (err) {
			return `Invalid regex /${pattern}/: ${err instanceof Error ? err.message : String(err)}`;
		}
		return re.test(output)
			? true
			: `Output did not match /${pattern}/${flags ?? ""}`;
	};
}

/** Output must match a regex (case-insensitive) */
export function regexCI(pattern: string): Gate {
	return regex(pattern, "i");
}

// ── Combinators ───────────────────────────────────────────────────────────

/** All gates must pass */
export function allOf(...gates: Gate[]): Gate {
	return async (params) => {
		for (const g of gates) {
			const result = await g(params);
			if (result !== true) return result;
		}
		return true;
	};
}

// ── Human approval ────────────────────────────────────────────────────────

/** Require human confirmation via the interactive UI */
export const user: Gate = async ({ output, ctx }) => {
	if (!(ctx?.hasUI && ctx?.confirm)) return "User gate requires interactive UI";
	const approved = await ctx.confirm(
		"🚦 Step Gate — Approve?",
		output.slice(0, 500) + (output.length > 500 ? "\n…(truncated)" : ""),
	);
	return approved ? true : "User rejected";
};

// ── Presets ───────────────────────────────────────────────────────────────

export const bunTest: Gate = command("bun test");
