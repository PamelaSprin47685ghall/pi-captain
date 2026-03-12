// ── Pipeline Select Helpers ─────────────────────────────────────────────────
// Utility functions for building and parsing dropdown options for pipeline
// selection in the captain_run tool's interactive UI flow.

import type { CaptainState } from "../state.js";

/**
 * Build the list of select options to present to the user.
 * Loaded pipelines appear first (labeled "(loaded)").
 */
export function buildPipelineSelectOptions(state: CaptainState): string[] {
	return Object.keys(state.pipelines).map((name) => `${name} (loaded)`);
}

/**
 * Strip the " (loaded)" suffix from a select option to recover the pipeline name.
 */
export function parsePipelineSelectOption(option: string): string {
	return option.replace(/\s+\((loaded)\)$/, "");
}
