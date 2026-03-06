// ── Step: Render Canvas ──────────────────────────────────────────────────
// Stage 8 of shredder: Convert the task tree into a visual Obsidian
// backlog.canvas file with layered groups, unit nodes, and dependency edges.

import os from "node:os";
import path from "node:path";
import { command, retry } from "../gates/index.js";
import type { Step } from "../types.js";

const piHome = process.env.PI_HOME ?? path.join(os.homedir(), ".pi");
const canvasValidator = path.join(
	piHome,
	"agent/skills/json-canvas/scripts/validate-canvas.ts",
);

const CANVAS_PROMPT =
	"You are the Canvas Renderer. Convert the task tree into a JSON Canvas file named backlog.canvas.\n\n" +
	"Task tree:\n$INPUT\n\n" +
	"Original requirement:\n$ORIGINAL\n\n" +
	"## JSON Canvas Format Rules\n\n" +
	"The canvas is JSON with two arrays: `nodes` and `edges`.\n" +
	"Node types: `text` (markdown content), `group` (visual container with `label`).\n" +
	"Every element needs a unique `id` — use 16-char hex strings for nodes, `edge-NNN` for edges.\n" +
	"Property order: `type`, `id`, `x`, `y`, `width`, `height`, then optional fields (`color`, `text`, `label`).\n\n" +
	"## Color Scheme\n" +
	'- `"1"` (red) = title/header node\n' +
	'- `"4"` (green) = parallel layer groups\n' +
	'- `"5"` (purple) = sequential layer groups\n' +
	'- `"6"` (cyan) = summary node\n' +
	"- No color = unit text nodes (default canvas color)\n\n" +
	"## Layout Strategy — Top-Down Layer Flow\n\n" +
	'1. **Title node** at top: the requirement title, color `"1"`, width 700, height 120\n' +
	"2. **One group node per execution layer**, stacked vertically with 60px gaps between groups\n" +
	'   - Group label = `"Layer N (parallel)"` or `"Layer N (sequential)"`\n' +
	'   - Group color = `"4"` for parallel, `"5"` for sequential\n' +
	"3. **Text nodes inside each group** — one per unit, arranged in a grid:\n" +
	"   - Max 3 columns, each unit node width = 340, height = 200\n" +
	"   - 20px padding from group edges, 20px gap between unit nodes\n" +
	"   - Unit text format: `## UNIT-N: name\\n\\n**Score:** X\\n**Goal:** ...\\n**Test:** ...`\n" +
	"   - Group width = min(unitCount, 3) * (340 + 20) + 20\n" +
	"   - Group height = ceil(unitCount / 3) * (200 + 20) + 60 (label + padding)\n" +
	'4. **Summary node** at bottom: color `"6"`, width 700, height 160\n' +
	"5. **Edges**: connect each group to the next group (top-down flow):\n" +
	'   - `fromSide: "bottom"`, `toSide: "top"`, `toEnd: "arrow"`\n' +
	"   Also add dependency edges between unit nodes across layers:\n" +
	'   - `fromSide: "bottom"`, `toSide: "top"`, `toEnd: "arrow"`, `color: "3"`\n\n' +
	"## Coordinate Math\n" +
	"- Start title at x=0, y=0\n" +
	"- First group at y = title.height + 60\n" +
	"- Each subsequent group at y = previousGroup.y + previousGroup.height + 60\n" +
	"- Child nodes inside group: x = group.x + 20, y = group.y + 40 (clear label)\n" +
	"- Column offset: col * (340 + 20)\n" +
	"- Row offset: row * (200 + 20)\n\n" +
	"## Instructions\n" +
	"1. Parse all layers and units from the task tree\n" +
	"2. Calculate layout coordinates using the math above\n" +
	"3. Write the canvas file using the write tool to `backlog.canvas`\n" +
	`4. Run the validator: \`bun ${canvasValidator} backlog.canvas\`\n` +
	"5. If the validator reports errors (exit 1), fix them and re-write\n" +
	"6. Output the path to the canvas file and a brief summary\n\n" +
	"IMPORTANT: Ensure all child nodes are fully contained within their group bounds. " +
	"Ensure no nodes overlap. Double-check coordinates before writing.";

export const renderCanvas: Step = {
	kind: "step",
	label: "Render Canvas",
	agent: "canvas-renderer",
	description:
		"Convert the layered task tree into a backlog.canvas file for Obsidian",
	prompt: CANVAS_PROMPT,
	gate: command(`bun ${canvasValidator} backlog.canvas`),
	onFail: retry(3),
	transform: { kind: "full" },
};
