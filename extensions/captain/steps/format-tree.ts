// ── Step: Format Tree ────────────────────────────────────────────────────
// Stage 6 of shredder: Structure the layered units into a final nested
// task tree with summary statistics.

import { none, skip } from "../gates/index.js";
import type { Step } from "../types.js";

export const formatTree: Step = {
	kind: "step",
	label: "Format Tree",
	tools: ["read", "bash"],
	model: "sonnet",
	temperature: 0.1,
	description: "Structure layered units into the final nested task tree",
	prompt:
		"You are the Tree Formatter. Take these execution layers and produce the final task tree.\n\n" +
		"Layered units:\n$INPUT\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"Output format:\n\n" +
		"# Task Tree: <title>\n\n" +
		"For each execution layer:\n\n" +
		"## Layer N (parallel | sequential) — <description>\n\n" +
		"For each unit in the layer:\n\n" +
		"### UNIT-N: <name> [score: X]\n" +
		"- Goal: <one sentence>\n" +
		"- Input: <what it receives>\n" +
		"- Output: <what it produces>\n" +
		"- Acceptance Test: <how to verify>\n" +
		"- Depends on: <UNIT-X or none>\n\n" +
		"End with:\n\n" +
		"## Summary\n" +
		"- Total units: N\n" +
		"- Execution layers: N\n" +
		"- Max parallelism: N (largest layer)\n" +
		"- Critical path length: N (longest dependency chain)\n" +
		"- All Haiku-safe: YES",
	gate: none,
	onFail: skip,
	transform: { kind: "full" },
};
