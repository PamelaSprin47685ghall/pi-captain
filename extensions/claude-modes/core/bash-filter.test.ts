import { describe, expect, test } from "bun:test";
import { isSafeCommand, isStaleInjection } from "./bash-filter.js";

// ─── isSafeCommand ────────────────────────────────────────────────────────────

describe("isSafeCommand — safe commands", () => {
	const safe = [
		"cat README.md",
		"head -n 20 file.ts",
		"tail -f log.txt",
		"grep -r 'foo' src/",
		"find . -name '*.ts'",
		"ls -la",
		"pwd",
		"echo hello",
		"wc -l index.ts",
		"git status",
		"git log --oneline",
		"git diff HEAD",
		"npm list",
		"curl https://example.com",
		"jq '.name' package.json",
		"bat src/index.ts",
		"fd '\\.ts$'",
	];

	for (const cmd of safe) {
		test(`allows: ${cmd}`, () => {
			expect(isSafeCommand(cmd)).toBe(true);
		});
	}
});

describe("isSafeCommand — destructive commands", () => {
	const destructive = [
		"rm -rf node_modules",
		"rmdir dist",
		"mv file.ts other.ts",
		"cp src dst",
		"mkdir new-dir",
		"touch newfile.ts",
		"chmod 755 script.sh",
		"chown root file",
		"sudo apt-get install curl",
		"kill -9 1234",
		"echo hi > file.txt",
		"echo hi >> file.txt",
		"git add .",
		"git commit -m 'msg'",
		"git push origin main",
		"npm install lodash",
		"npm uninstall lodash",
		"yarn add react",
		"brew install jq",
		"pip install requests",
	];

	for (const cmd of destructive) {
		test(`blocks: ${cmd}`, () => {
			expect(isSafeCommand(cmd)).toBe(false);
		});
	}
});

// ─── isStaleInjection ─────────────────────────────────────────────────────────

describe("isStaleInjection", () => {
	function makeMsg(role: string, text: string) {
		return { role, content: [{ type: "text", text }] };
	}

	test("returns false for assistant messages", () => {
		const m = makeMsg("assistant", "[PLAN MODE ACTIVE]");
		expect(isStaleInjection(m, "code")).toBe(false);
	});

	test("returns false when plan injection matches plan mode", () => {
		const m = makeMsg("user", "[PLAN MODE ACTIVE] explore the code");
		expect(isStaleInjection(m, "plan")).toBe(false);
	});

	test("returns false when review injection matches review mode", () => {
		const m = makeMsg("user", "[REVIEW MODE ACTIVE] review the code");
		expect(isStaleInjection(m, "review")).toBe(false);
	});

	test("returns true for stale plan injection in code mode", () => {
		const m = makeMsg("user", "[PLAN MODE ACTIVE] explore the code");
		expect(isStaleInjection(m, "code")).toBe(true);
	});

	test("returns true for stale plan injection in review mode", () => {
		const m = makeMsg("user", "[PLAN MODE ACTIVE]");
		expect(isStaleInjection(m, "review")).toBe(true);
	});

	test("returns true for stale review injection in code mode", () => {
		const m = makeMsg("user", "[REVIEW MODE ACTIVE] review this");
		expect(isStaleInjection(m, "code")).toBe(true);
	});

	test("returns false when content is a string, not array", () => {
		const m = { role: "user", content: "[PLAN MODE ACTIVE]" };
		expect(isStaleInjection(m, "code")).toBe(false);
	});

	test("returns false for user message without mode markers", () => {
		const m = makeMsg("user", "Please help me with this code");
		expect(isStaleInjection(m, "code")).toBe(false);
	});
});
