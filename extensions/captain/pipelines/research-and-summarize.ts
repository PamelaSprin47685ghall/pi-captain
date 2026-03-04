// ── Pipeline: Research and Summarize ───────────────────────────────────────
// Two-step sequential: deep research → actionable summary
// Agents: researcher, summarizer (from ~/.pi/agent/agents/*.md)
import type { Runnable } from "../types.js";
import { research, summarize } from "../steps/index.js";

/** The pipeline spec — sequential research → summarize */
export const pipeline: Runnable = {
  kind: "sequential",
  steps: [research, summarize],
};
