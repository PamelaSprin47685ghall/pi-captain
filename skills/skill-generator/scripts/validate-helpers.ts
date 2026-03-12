// validate-helpers.ts — Core validation logic for validate-skill.ts

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkRulesDirectory } from "./validate-rules.js";

export interface ValidationResult {
	passed: boolean;
	message: string;
}

function checkSkillMarkdown(skillMdPath: string): ValidationResult[] {
	if (!existsSync(skillMdPath)) {
		return [{ passed: false, message: "SKILL.md not found" }];
	}
	return [{ passed: true, message: "SKILL.md exists" }];
}

function checkFrontmatter(content: string): ValidationResult[] {
	const results: ValidationResult[] = [];

	if (!content.startsWith("---")) {
		results.push({
			passed: false,
			message: "SKILL.md missing YAML frontmatter",
		});
		return results;
	}

	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) {
		results.push({
			passed: false,
			message: "SKILL.md has invalid frontmatter format",
		});
		return results;
	}
	results.push({ passed: true, message: "Frontmatter format valid" });

	const fmText = fmMatch[1];
	results.push(...checkNameField(fmText));
	results.push(...checkDescriptionField(fmText));
	return results;
}

function checkNameField(fmText: string): ValidationResult[] {
	const results: ValidationResult[] = [];
	if (!/^name:\s*.+/m.test(fmText)) {
		results.push({
			passed: false,
			message: "Frontmatter missing 'name' field",
		});
		return results;
	}
	results.push({ passed: true, message: "Frontmatter has 'name' field" });
	const nameMatch = fmText.match(/^name:\s*(.+)$/m);
	if (nameMatch) {
		const name = nameMatch[1].trim();
		const valid = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
		results.push({
			passed: valid,
			message: valid
				? `Name "${name}" is valid kebab-case`
				: `Name "${name}" is not kebab-case`,
		});
	}
	return results;
}

function checkDescriptionField(fmText: string): ValidationResult[] {
	const results: ValidationResult[] = [];
	if (!/^description:\s*/m.test(fmText)) {
		results.push({
			passed: false,
			message: "Frontmatter missing 'description' field",
		});
		return results;
	}
	results.push({
		passed: true,
		message: "Frontmatter has 'description' field",
	});

	const afterDesc = fmText.substring(
		fmText.indexOf("description:") + "description:".length,
	);
	const descLines: string[] = [];
	for (const [i, line] of afterDesc.split("\n").entries()) {
		if (i === 0) {
			const t = line.trim();
			if (t === ">" || t === "|" || t === "") continue;
			descLines.push(t);
		} else if (/^\s+/.test(line) || line.trim() === "") {
			descLines.push(line.trim());
		} else {
			break;
		}
	}
	const wordCount = descLines
		.join(" ")
		.trim()
		.split(/\s+/)
		.filter((w) => w.length > 0).length;
	results.push({
		passed: wordCount >= 20,
		message:
			wordCount >= 20
				? `Description has ${wordCount} words`
				: `Description has only ${wordCount} words (aim for 100+)`,
	});
	return results;
}

function checkMetadata(dir: string): ValidationResult[] {
	const metaPath = join(dir, "metadata.json");
	if (!existsSync(metaPath)) {
		return [{ passed: false, message: "metadata.json not found" }];
	}
	try {
		const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
		const ok = Array.isArray(meta.triggers) && meta.triggers.length > 0;
		return [
			{
				passed: ok,
				message: ok
					? `metadata.json has ${meta.triggers.length} triggers`
					: "metadata.json missing or empty 'triggers' array",
			},
		];
	} catch {
		return [{ passed: false, message: "metadata.json is not valid JSON" }];
	}
}

export function validate(skillPath: string): ValidationResult[] {
	const dir = resolve(skillPath);
	const skillMdPath = join(dir, "SKILL.md");
	const results = checkSkillMarkdown(skillMdPath);

	if (!existsSync(skillMdPath)) return results;

	const content = readFileSync(skillMdPath, "utf-8");
	results.push(...checkFrontmatter(content));
	results.push(...checkMetadata(dir));
	results.push(...checkRulesDirectory(dir));
	return results;
}
