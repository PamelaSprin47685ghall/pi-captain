// ── Step: Resolve Dependencies ────────────────────────────────────────────
// Stage 5 of shredder: Parse dependency graph from validated units, detect
// cycles, topological sort into parallelizable execution layers.

import { regexCI, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const resolveDependencies: Step = {
	kind: "step",
	label: "Resolve Dependencies",
	agent: "resolver",
	description:
		"Build adjacency graph, detect cycles, topological sort into parallelizable execution layers",
	prompt:
		"You are the Dependency Resolver. Parse the validated units and produce execution layers.\n\n" +
		"Validated units:\n$INPUT\n\n" +
		"Instructions:\n" +
		'1. Parse each unit\'s "Dependencies" field into an adjacency list\n' +
		"2. Detect cycles — if any exist, list them and output CYCLES DETECTED: YES\n" +
		"3. Topological sort all units\n" +
		"4. Group into execution layers: Layer 0 = units with no dependencies,\n" +
		"   Layer 1 = units whose deps are all in Layer 0, etc.\n" +
		"5. Within each layer, units can run in parallel\n\n" +
		"Output format:\n\n" +
		"## Dependency Graph\n" +
		"(adjacency list: UNIT-N → UNIT-X, UNIT-Y)\n\n" +
		"## Execution Layers\n\n" +
		"### Layer 0 (parallel — no dependencies)\n" +
		"- UNIT-N: name\n" +
		"- UNIT-N: name\n\n" +
		"### Layer 1 (parallel — depends only on Layer 0)\n" +
		"- UNIT-N: name (needs: UNIT-X)\n\n" +
		"(continue for all layers)\n\n" +
		"End with:\n" +
		"TOTAL LAYERS: count\n" +
		"CYCLES DETECTED: NO\n\n" +
		"Also pass through each unit's full details (goal, input, output, acceptance test,\n" +
		"score) grouped under its layer so the next step has everything.\n\n" +
		"Finally, output a JSON summary block:\n" +
		"```json\n" +
		'{"total_layers": N, "cycles_detected": false, "layers": [' +
		'{"id": 0, "units": ["UNIT-1", "UNIT-2"]}, {"id": 1, "units": ["UNIT-3"]}]}\n' +
		"```",
	gate: regexCI("cycles.detected.*no"),
	onFail: retry(2),
	transform: { kind: "full" },
};
