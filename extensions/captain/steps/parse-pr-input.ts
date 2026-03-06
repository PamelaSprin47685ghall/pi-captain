// ── Step: Parse PR Input ──────────────────────────────────────────────────
// Stage 1 of github-pr-review: parse a canonical 'owner/repo#number' string
// into its three components so every downstream step has clean references.

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const parsePrInput: Step = {
	kind: "step",
	label: "Parse PR Input",
	agent: "builder",
	description: "Parse 'owner/repo#N' into owner, repo, and PR number",
	prompt:
		"You have received a PR reference string. It is in $INPUT.\n\n" +
		"The string must follow the format: owner/repo#N  (e.g. 'octocat/hello-world#42').\n\n" +
		"Parse it now:\n" +
		"1. Split on '/' → left side is the owner, right side is 'repo#N'\n" +
		"2. Split 'repo#N' on '#' → left side is the repo name, right side is the PR number\n" +
		"3. Confirm the PR number is a positive integer\n\n" +
		"If the format is correct, output exactly:\n\n" +
		"## PR Reference\n" +
		"- Owner: [owner]\n" +
		"- Repo: [repo]\n" +
		"- PR Number: [N]\n" +
		"- Full ref: [owner/repo#N]\n\n" +
		"If the format is wrong (missing '/', missing '#', non-numeric PR number, empty string, PR number ≤ 0), output exactly:\n\n" +
		"ERROR: [reason]\n\n" +
		"Do not output anything else.",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
