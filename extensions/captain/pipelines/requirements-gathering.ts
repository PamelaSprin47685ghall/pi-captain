// ── Pipeline: Requirements Gathering ──────────────────────────────────────
// A multi-phase discovery pipeline that goes back and forth with the user
// to deeply understand their needs through progressive question narrowing.
// Produces a comprehensive, professional REQUIREMENTS.md document.
//
// Flow:
//   1. EXPLORE     → explorer asks broad open-ended questions to map the
//                    problem space, vision, goals, and stakeholders
//                    ⏸ user gate — human answers discovery questions
//   2. DEEP DIVE   → deep-diver drills into specifics with a mix of
//                    closed (yes/no) and targeted open questions
//                    ⏸ user gate — human answers focused questions
//   3. CHALLENGE   → challenger plays devil's advocate — finds contradictions,
//                    exposes assumptions, runs completeness checklist
//                    ⏸ user gate — human confirms/corrects final items
//   4. SYNTHESIZE  → req-synthesizer produces a full REQUIREMENTS.md with
//                    user stories, MoSCoW priorities, NFRs, and risks
//                    🤖 LLM quality gate ensures document completeness
//
// Design principles:
//   - Progressive narrowing: open → targeted → closed → synthesis
//   - User gates at every discovery phase force real back-and-forth dialogue
//   - Challenger phase prevents groupthink and catches blind spots
//   - LLM quality gate on final output ensures professional-grade document
//   - Every question has a rationale — no filler questions
//
// Preset: captain:requirements-gathering (load with: captain_load { action: "load", name: "captain:requirements-gathering" })
// Agents: explorer, deep-diver, challenger, req-synthesizer
//         (bundled in extensions/captain/agents/)
// Steps:  extensions/captain/steps/{explore-requirements,deep-dive-requirements,
//         challenge-requirements,synthesize-requirements}.ts

import {
	challengeRequirements,
	deepDiveRequirements,
	exploreRequirements,
	synthesizeRequirements,
} from "../steps/index.js";
import type { Runnable } from "../types.js";

// ── Pipeline Spec ────────────────────────────────────────────────────────

export const pipeline: Runnable = {
	kind: "sequential",
	steps: [
		exploreRequirements, //  1️⃣  EXPLORE   — broad open-ended discovery
		deepDiveRequirements, //  2️⃣  DEEP DIVE — closed + targeted questions
		challengeRequirements, //  3️⃣  CHALLENGE — devil's advocate validation
		synthesizeRequirements, //  4️⃣  SYNTHESIZE — produce REQUIREMENTS.md
	],
};
