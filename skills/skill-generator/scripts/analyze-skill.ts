#!/usr/bin/env bun
/**
 * Analyze a skill directory and report metrics.
 *
 * Usage:
 *   bun scripts/analyze-skill.ts <path-to-skill>
 */

import { existsSync } from "node:fs";
import { analyze } from "./analyze-helpers.js";

function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help") {
		// biome-ignore lint/suspicious/noConsole: CLI output
		console.log("Usage: bun scripts/analyze-skill.ts <path-to-skill>");
		process.exit(1);
	}

	const skillPath = args[0];
	if (!existsSync(skillPath)) {
		// biome-ignore lint/suspicious/noConsole: CLI error output
		console.error(`Error: Path not found: ${skillPath}`);
		process.exit(1);
	}

	const r = analyze(skillPath);

	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Skill: ${r.skillName}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log("---");
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`SKILL.md lines:      ${r.skillMdLines}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Total lines:         ${r.totalLines}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Total words:         ${r.totalWords}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Estimated tokens:    ~${r.estimatedTokens}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Rule count:          ${r.ruleCount}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Description words:   ${r.descriptionWordCount}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Has references/:     ${r.hasReferences ? "yes" : "no"}`);
	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log(`Has scripts/:        ${r.hasScripts ? "yes" : "no"}`);

	if (r.missingSections.length > 0) {
		// biome-ignore lint/suspicious/noConsole: CLI output
		console.log(`Missing sections:    ${r.missingSections.join(", ")}`);
	}

	// biome-ignore lint/suspicious/noConsole: CLI output
	console.log("\nFiles:");
	for (const f of r.files.sort((a, b) => b.lines - a.lines)) {
		// biome-ignore lint/suspicious/noConsole: CLI output
		console.log(`  ${String(f.lines).padStart(4)} lines  ${f.path}`);
	}
}

main();
