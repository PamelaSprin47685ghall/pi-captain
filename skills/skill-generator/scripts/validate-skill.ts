#!/usr/bin/env bun
/**
 * Validate a skill directory for structural correctness.
 *
 * Usage:
 *   bun scripts/validate-skill.ts <path-to-skill>
 *
 * Checks:
 *   - SKILL.md exists with valid YAML frontmatter
 *   - metadata.json exists and is valid JSON
 *   - rules/ directory exists with _template.md
 *   - Frontmatter has name + description fields
 *   - Description is 100+ words
 *   - Name is kebab-case
 *   - Rule files have no YAML frontmatter and use Avoid/Prefer sections
 */

import { existsSync } from "node:fs";
import { validate } from "./validate-helpers.js";

function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help") {
		// biome-ignore lint/suspicious/noConsole: CLI script needs output
		console.log("Usage: bun scripts/validate-skill.ts <path-to-skill>");
		// biome-ignore lint/suspicious/noConsole: CLI script needs output
		console.log("");
		// biome-ignore lint/suspicious/noConsole: CLI script needs output
		console.log("Validates a skill directory for structural correctness.");
		process.exit(1);
	}

	const skillPath = args[0];

	if (!existsSync(skillPath)) {
		// biome-ignore lint/suspicious/noConsole: CLI script needs error output
		console.error(`Error: Path not found: ${skillPath}`);
		process.exit(1);
	}

	const results = validate(skillPath);

	let passCount = 0;
	let failCount = 0;

	for (const r of results) {
		const icon = r.passed ? "PASS" : "FAIL";
		// biome-ignore lint/suspicious/noConsole: CLI script needs output
		console.log(`  [${icon}] ${r.message}`);
		if (r.passed) passCount++;
		else failCount++;
	}

	// biome-ignore lint/suspicious/noConsole: CLI script needs output
	console.log("");
	// biome-ignore lint/suspicious/noConsole: CLI script needs output
	console.log(`Results: ${passCount} passed, ${failCount} failed`);

	process.exit(failCount > 0 ? 1 : 0);
}

main();
