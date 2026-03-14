// ─── Git commit + push helper ──────────────────────────────────────────────

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { RefactorState } from "./state.js";

export async function commitAndPush(opts: {
	pi: ExtensionAPI;
	state: RefactorState;
}): Promise<string> {
	const { pi, state } = opts;
	// Build a descriptive commit message from all passes
	const passLines = state.passes
		.map((p) => `- Pass ${p.pass}: ${p.change}`)
		.join("\n");
	const commitMsg =
		`refactor: ${state.target} (${state.passes.length} passes)\n\n` +
		`Automated refactoring pipeline — all tests passed.\n\n` +
		`Changes:\n${passLines}`;

	const results: string[] = [];

	// Stage all changes
	const addResult = await pi.exec("git", ["add", "-A"], { timeout: 10_000 });
	if (addResult.code !== 0) {
		return `❌ git add failed: ${addResult.stderr}`;
	}

	// Check if there's anything to commit
	const statusResult = await pi.exec("git", ["status", "--porcelain"], {
		timeout: 10_000,
	});
	if (!statusResult.stdout.trim()) {
		return "ℹ️ Nothing to commit — working tree is clean.";
	}

	// Commit
	const commitResult = await pi.exec("git", ["commit", "-m", commitMsg], {
		timeout: 30_000,
	});
	if (commitResult.code !== 0) {
		return `❌ git commit failed: ${commitResult.stderr}`;
	}
	results.push(`✅ Committed: ${commitResult.stdout.split("\n")[0]}`);

	// Push
	const pushResult = await pi.exec("git", ["push"], { timeout: 60_000 });
	if (pushResult.code !== 0) {
		results.push(`⚠️ git push failed: ${pushResult.stderr}`);
	} else {
		results.push("✅ Pushed to remote");
	}

	return results.join("\n");
}
