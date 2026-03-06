// ── Step: Slice Stories (AI) ──────────────────────────────────────────────
// Stage 2 of req-decompose-ai: Codebase-aware vertical story slicing.
// Extends slice-stories with an upfront codebase scan so every story is
// grounded in real file paths, existing types, and modules — giving the
// downstream contract-tasks step the context it needs for typed signatures.

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const sliceStoriesAi: Step = {
	kind: "step",
	label: "Slice Stories (AI)",
	agent: "decomposer",
	description:
		"Codebase-aware vertical story slicing: EARS reqs → INVEST stories with file area mapping",
	prompt:
		"You are a Story Slicer expert in vertical slicing and the SPIDR technique.\n\n" +
		"EARS requirements:\n$INPUT\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"STEP 1 — Ground yourself in the codebase before slicing:\n" +
		"1. Run: find . -type f \\( -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.rs' \\) | grep -v node_modules | grep -v .git | grep -v dist | head -80\n" +
		"2. Run: cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || cat Cargo.toml 2>/dev/null || echo 'no manifest'\n" +
		"3. Identify the main source directories and any existing modules relevant to these requirements\n\n" +
		"STEP 2 — Slice each EARS requirement into the thinnest possible vertical user stories.\n\n" +
		"Splitting priority order (highest to lowest atomicity):\n" +
		"1. BUSINESS RULES — isolate each validation rule, constraint, or conditional\n" +
		"   e.g. 'calculate shipping' → weight tiers rule | zone rules | free threshold rule\n" +
		"2. RULES (SPIDR R) — split by individual business rules and data validations\n" +
		"3. PATHS (SPIDR P) — split by alternative flows or error paths\n" +
		"4. DATA (SPIDR D) — split by data subsets (admin vs user, empty vs populated)\n" +
		"5. WORKFLOW STEPS — one story per sequential user action\n\n" +
		"INVEST criteria — every story must be:\n" +
		"- Independent (no coupling to other stories)\n" +
		"- Negotiable (implementation details flexible)\n" +
		"- Valuable (delivers user-facing value)\n" +
		"- Estimable (1–3 hours max, 1–3 functions to implement)\n" +
		"- Small (maps to at most one module / one class)\n" +
		"- Testable (clear pass/fail)\n\n" +
		"For each story:\n\n" +
		"### STORY-N: [name]\n" +
		"- As a: [persona]\n" +
		"- I want: [action]\n" +
		"- So that: [value]\n" +
		"- Source REQ: REQ-X\n" +
		"- Splitting pattern: [business rule | SPIDR-R | SPIDR-P | SPIDR-D | workflow step]\n" +
		"- Scope: [1–2 sentence description of exact boundaries]\n" +
		"- File area: [src/path/to/module/ — where this story's code lives]\n" +
		"- Existing modules: [relevant files already in the codebase, or 'none']\n" +
		"- Estimated size: [hours]\n" +
		"- Can deprioritize: [YES/NO — if this is the 20% of functionality with lower value]\n\n" +
		"Flag any story still too large with 'NEEDS FURTHER SPLITTING: YES'.\n\n" +
		"End with:\n" +
		"TOTAL STORIES: N",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
