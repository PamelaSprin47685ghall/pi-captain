// ── Step: Prepare PR ─────────────────────────────────────────────────────
// Stage 5 of spec-tdd: Creates a feature branch, stages changes selectively,
// writes a conventional commit, pushes, and optionally creates a GitHub PR.
// Gated on tests passing + human approval before push.

import { allOf, bunTest, retry, user } from "../gates/index.js";
import type { Step } from "../types.js";

export const preparePR: Step = {
	kind: "step",
	label: "Prepare PR",
	agent: "pr-preparer",
	description:
		"Create a feature branch, stage changes, write a conventional commit, and push",
	prompt:
		"You are the PR Preparer. Prepare a clean PR for the completed work.\n\n" +
		"Context from previous steps:\n$INPUT\n\n" +
		"Original Requirement:\n$ORIGINAL\n\n" +
		"Instructions:\n" +
		"1. Run `bun test` one final time to confirm everything passes\n" +
		"2. Run `git status` to see all changes\n" +
		"3. Create a feature branch:\n" +
		"   - Name format: `feat/<short-description>` or `fix/<short-description>`\n" +
		"   - Run: `git checkout -b feat/<name>`\n" +
		"4. Stage all relevant files (implementation + tests + docs):\n" +
		"   - Do NOT stage unrelated files\n" +
		"   - Use `git add <specific-files>` not `git add .`\n" +
		"5. Write a conventional commit message:\n" +
		"   ```\n" +
		"   feat: <short summary>\n" +
		"   \n" +
		"   <body explaining what and why>\n" +
		"   \n" +
		"   - <bullet points of changes>\n" +
		"   \n" +
		"   Closes #<issue> (if applicable)\n" +
		"   ```\n" +
		"6. Commit: `git commit -m '<message>'`\n" +
		"7. Push: `git push -u origin <branch-name>`\n" +
		"8. If `gh` CLI is available, create a PR:\n" +
		"   `gh pr create --title '<title>' --body '<body>'`\n\n" +
		"Report:\n" +
		"- BRANCH: <branch-name>\n" +
		"- COMMIT: <commit-hash>\n" +
		"- FILES COMMITTED: N\n" +
		"- PR CREATED: YES/NO (+ URL if yes)",
	// Gate: tests must pass + human must approve before push
	gate: allOf(bunTest, user),
	onFail: retry(1),
	transform: { kind: "full" },
	maxTurns: 10,
};
