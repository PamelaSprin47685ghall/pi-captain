// validate-rules.ts — Rules-directory checks for validate-skill.ts

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ValidationResult } from "./validate-helpers.js";

function checkRuleFile(rulesDir: string, file: string): ValidationResult[] {
	const results: ValidationResult[] = [];
	const ruleContent = readFileSync(join(rulesDir, file), "utf-8");

	if (ruleContent.startsWith("---")) {
		results.push({
			passed: false,
			message: `rules/${file} has YAML frontmatter (not allowed)`,
		});
	}

	const hasAvoid = /^## Avoid/m.test(ruleContent);
	const hasPrefer = /^## Prefer/m.test(ruleContent);
	if (hasAvoid && hasPrefer) {
		results.push({
			passed: true,
			message: `rules/${file} has Avoid/Prefer sections`,
		});
	} else {
		const missing = [
			...(!hasAvoid ? ["Avoid"] : []),
			...(!hasPrefer ? ["Prefer"] : []),
		];
		results.push({
			passed: false,
			message: `rules/${file} missing section(s): ${missing.join(", ")}`,
		});
	}

	return results;
}

export function checkRulesDirectory(dir: string): ValidationResult[] {
	const results: ValidationResult[] = [];
	const rulesDir = join(dir, "rules");

	if (!existsSync(rulesDir)) {
		results.push({ passed: false, message: "rules/ directory not found" });
		return results;
	}

	results.push({ passed: true, message: "rules/ directory exists" });

	if (existsSync(join(rulesDir, "_template.md"))) {
		results.push({ passed: true, message: "rules/_template.md exists" });
	} else {
		results.push({ passed: false, message: "rules/_template.md not found" });
	}

	const ruleFiles = readdirSync(rulesDir).filter(
		(f) => f.endsWith(".md") && f !== "_template.md",
	);
	for (const file of ruleFiles) {
		results.push(...checkRuleFile(rulesDir, file));
	}

	return results;
}
