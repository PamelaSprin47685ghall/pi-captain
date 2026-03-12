// ── Custom Merge Examples ─────────────────────────────────────────────────
// A MergeFn combines parallel/pool branch outputs into a single string.
// Signature: (outputs: readonly string[], ctx: MergeCtx) => string | Promise<string>
//
// These examples go beyond the built-in strategies (concat / awaitAll / firstPass / vote / rank).
// Wire one to a `parallel` or `pool` node's `merge` field.
//
// Import the types from the captain public API:
//   import type { MergeFn } from "<path-to>/extensions/captain/index.public.js";
//   import type { MergeCtx } from "<path-to>/extensions/captain/merge.js";

import type { MergeCtx } from "../extensions/captain/core/merge.js";
import type { MergeFn } from "../extensions/captain/index.public.js";

// ── 1. Deduplicated union ─────────────────────────────────────────────────
// Split every branch on newlines, deduplicate, rejoin — great for lists of
// findings where multiple agents may surface the same item.

export const dedupedLines: MergeFn = (outputs) => {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const output of outputs) {
		for (const line of output.split("\n")) {
			const trimmed = line.trim();
			if (trimmed && !seen.has(trimmed)) {
				seen.add(trimmed);
				result.push(trimmed);
			}
		}
	}
	return result.join("\n");
};

// ── 2. Majority-vote on a single token ───────────────────────────────────
// Each branch outputs a single word (e.g. "yes" / "no" / "maybe").
// Returns the most common answer.  Ties go to the first-occurring value.

export const majorityVote: MergeFn = (outputs) => {
	const counts = new Map<string, number>();
	for (const o of outputs) {
		const token = o.trim().toLowerCase();
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}
	return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

// ── 3. Weighted score merge ───────────────────────────────────────────────
// Branches output lines starting with a numeric score, e.g. "8 — great perf".
// Keeps only items scoring above a threshold, sorted highest-first.

export function scoreThreshold(min = 7): MergeFn {
	return (outputs) => {
		const scored: Array<{ score: number; text: string }> = [];
		for (const output of outputs) {
			for (const line of output.split("\n")) {
				const m = line.match(/^(\d+(?:\.\d+)?)\s*[—–-]\s*(.+)/);
				if (m) {
					const score = Number(m[1]);
					if (score >= min) scored.push({ score, text: m[2].trim() });
				}
			}
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.map(({ score, text }) => `${score} — ${text}`).join("\n");
	};
}

// ── 4. LLM synthesis with a custom prompt ────────────────────────────────
// Same power as the built-in `rank` / `vote` strategies but with your own
// framing.  Use when you need domain-specific synthesis language.

export function llmSynthesize(systemPrompt: string): MergeFn {
	return async (outputs: readonly string[], ctx: MergeCtx) => {
		const { complete } = await import("@mariozechner/pi-ai");
		const combined = outputs
			.map((o, i) => `### Branch ${i + 1}\n${o}`)
			.join("\n\n");
		const response = await complete(
			ctx.model,
			{
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: combined }],
						timestamp: Date.now(),
					},
				],
				systemPrompt: systemPrompt,
			},
			{ apiKey: ctx.apiKey, maxTokens: 2048, signal: ctx.signal },
		);
		return response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");
	};
}

// ── 5. Table merge ────────────────────────────────────────────────────────
// Each branch outputs a markdown table.  Merges all rows under a single header.

export const mergeTables: MergeFn = (outputs) => {
	let header = "";
	const rows: string[] = [];
	for (const output of outputs) {
		const lines = output.trim().split("\n");
		for (const [i, line] of lines.entries()) {
			if (line.startsWith("|")) {
				if (!header) {
					header = lines[0]; // first pipe line = header
					// skip separator row (i === 1)
				} else if (i > 1) {
					rows.push(line);
				}
			}
		}
	}
	if (!header) return outputs.join("\n\n");
	const sep = header.replace(/[^|]/g, "-");
	return [header, sep, ...rows].join("\n");
};
