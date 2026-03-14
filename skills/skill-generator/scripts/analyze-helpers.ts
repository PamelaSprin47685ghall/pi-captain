// analyze-helpers.ts — Core analysis logic for analyze-skill.ts

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface AnalysisReport {
	skillName: string;
	totalLines: number;
	totalWords: number;
	estimatedTokens: number;
	skillMdLines: number;
	ruleCount: number;
	descriptionWordCount: number;
	hasReferences: boolean;
	hasScripts: boolean;
	missingSections: string[];
	files: { path: string; lines: number }[];
}

function countLines(content: string): number {
	return content.split("\n").length;
}

function countWords(content: string): number {
	return content.split(/\s+/).filter((w) => w.length > 0).length;
}

function walkDirectory(opts: {
	dirPath: string;
	report: AnalysisReport;
	rootDir: string;
}): void {
	const { dirPath, report, rootDir } = opts;
	if (!existsSync(dirPath)) return;
	for (const entry of readdirSync(dirPath)) {
		const fullPath = join(dirPath, entry);
		if (statSync(fullPath).isDirectory()) {
			walkDirectory({ dirPath: fullPath, report, rootDir });
		} else if (/\.(md|json|ts|py|sh)$/.test(entry)) {
			const content = readFileSync(fullPath, "utf-8");
			report.totalLines += countLines(content);
			report.totalWords += countWords(content);
			report.files.push({
				path: fullPath.replace(`${rootDir}/`, ""),
				lines: countLines(content),
			});
		}
	}
}

function extractDescriptionWordCount(content: string): number {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) return 0;
	const fmText = fmMatch[1];
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
	return countWords(descLines.join(" "));
}

function checkMissingSections(content: string): string[] {
	return ["Core Concepts", "Quick Patterns", "Reference Files"].filter(
		(s) => !content.includes(`## ${s}`),
	);
}

function countRuleFiles(dir: string): number {
	const rulesDir = join(dir, "rules");
	if (!existsSync(rulesDir)) return 0;
	return readdirSync(rulesDir).filter(
		(f) => f.endsWith(".md") && f !== "_template.md",
	).length;
}

export function analyze(skillPath: string): AnalysisReport {
	const dir = resolve(skillPath);
	const report: AnalysisReport = {
		skillName: dir.split("/").pop() ?? "unknown",
		totalLines: 0,
		totalWords: 0,
		estimatedTokens: 0,
		skillMdLines: 0,
		ruleCount: 0,
		descriptionWordCount: 0,
		hasReferences: existsSync(join(dir, "references")),
		hasScripts: existsSync(join(dir, "scripts")),
		missingSections: [],
		files: [],
	};

	walkDirectory({ dirPath: dir, report, rootDir: dir });

	const skillMdPath = join(dir, "SKILL.md");
	if (existsSync(skillMdPath)) {
		const content = readFileSync(skillMdPath, "utf-8");
		report.skillMdLines = countLines(content);
		report.descriptionWordCount = extractDescriptionWordCount(content);
		report.missingSections = checkMissingSections(content);
	}

	report.ruleCount = countRuleFiles(dir);
	report.estimatedTokens = Math.round(report.totalWords * 0.75);
	return report;
}
