import { describe, expect, mock, test } from "bun:test";
import { evaluateGate } from "./gates.js";
import type { Gate } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeExec(code = 0, stdout = "", stderr = "") {
	return mock(async (_cmd: string, _args: string[], _opts?: unknown) => ({
		code,
		stdout,
		stderr,
	}));
}

function baseCtx(overrides: Partial<Parameters<typeof evaluateGate>[2]> = {}) {
	return {
		exec: makeExec(),
		hasUI: false,
		cwd: "/tmp",
		...overrides,
	};
}

// ── none ──────────────────────────────────────────────────────────────────

describe("gate: none", () => {
	test("always passes", async () => {
		const result = await evaluateGate({ type: "none" }, "", baseCtx());
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("No gate");
	});
});

// ── assert ────────────────────────────────────────────────────────────────

describe("gate: assert", () => {
	test("output.includes passes when text present", async () => {
		const gate: Gate = { type: "assert", fn: "output.includes('hello')" };
		const result = await evaluateGate(gate, "hello world", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("output.includes fails when text absent", async () => {
		const gate: Gate = { type: "assert", fn: "output.includes('missing')" };
		const result = await evaluateGate(gate, "hello world", baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Assertion failed");
	});

	test("!output.includes passes when text absent", async () => {
		const gate: Gate = { type: "assert", fn: "!output.includes('bad')" };
		const result = await evaluateGate(gate, "all good", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("output.length > N passes", async () => {
		const gate: Gate = { type: "assert", fn: "output.length > 5" };
		const result = await evaluateGate(gate, "hello world", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("output.length > N fails", async () => {
		const gate: Gate = { type: "assert", fn: "output.length > 100" };
		const result = await evaluateGate(gate, "hi", baseCtx());
		expect(result.passed).toBe(false);
	});

	test("output.length === N passes", async () => {
		const gate: Gate = { type: "assert", fn: "output.length === 5" };
		const result = await evaluateGate(gate, "hello", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("|| OR logic passes if one side matches", async () => {
		const gate: Gate = {
			type: "assert",
			fn: "output.includes('a') || output.includes('b')",
		};
		const result = await evaluateGate(gate, "b wins", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("&& AND logic fails if one side misses", async () => {
		const gate: Gate = {
			type: "assert",
			fn: "output.includes('a') && output.includes('b')",
		};
		const result = await evaluateGate(gate, "only a here", baseCtx());
		expect(result.passed).toBe(false);
	});

	test("case-insensitive includes via toLowerCase()", async () => {
		const gate: Gate = {
			type: "assert",
			fn: "output.toLowerCase().includes('hello')",
		};
		const result = await evaluateGate(gate, "HELLO WORLD", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("unsupported expression returns assertion error", async () => {
		const gate: Gate = { type: "assert", fn: "Math.random() > 0" };
		const result = await evaluateGate(gate, "x", baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Assertion error");
	});
});

// ── regex ─────────────────────────────────────────────────────────────────

describe("gate: regex", () => {
	test("passes when pattern matches", async () => {
		const gate: Gate = { type: "regex", pattern: "\\d+" };
		const result = await evaluateGate(gate, "there are 42 items", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("fails when pattern does not match", async () => {
		const gate: Gate = { type: "regex", pattern: "^ERROR" };
		const result = await evaluateGate(gate, "all good", baseCtx());
		expect(result.passed).toBe(false);
	});

	test("respects flags (case-insensitive)", async () => {
		const gate: Gate = { type: "regex", pattern: "hello", flags: "i" };
		const result = await evaluateGate(gate, "HELLO WORLD", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("invalid regex returns error", async () => {
		const gate: Gate = { type: "regex", pattern: "[invalid" };
		const result = await evaluateGate(gate, "anything", baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Invalid regex");
	});
});

// ── json ──────────────────────────────────────────────────────────────────

describe("gate: json", () => {
	test("passes for valid JSON without schema", async () => {
		const gate: Gate = { type: "json" };
		const result = await evaluateGate(gate, '{"a":1}', baseCtx());
		expect(result.passed).toBe(true);
	});

	test("fails for invalid JSON", async () => {
		const gate: Gate = { type: "json" };
		const result = await evaluateGate(gate, "not json", baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("not valid JSON");
	});

	test("passes when all schema keys present", async () => {
		const gate: Gate = { type: "json", schema: "name, age" };
		const result = await evaluateGate(
			gate,
			'{"name":"Alice","age":30}',
			baseCtx(),
		);
		expect(result.passed).toBe(true);
	});

	test("fails when schema key missing", async () => {
		const gate: Gate = { type: "json", schema: "name, email" };
		const result = await evaluateGate(gate, '{"name":"Alice"}', baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("email");
	});
});

// ── command ───────────────────────────────────────────────────────────────

describe("gate: command", () => {
	test("passes when command exits 0", async () => {
		const exec = makeExec(0, "ok", "");
		const gate: Gate = { type: "command", value: "exit 0" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("Command passed");
	});

	test("fails when command exits non-zero", async () => {
		const exec = makeExec(1, "", "something went wrong");
		const gate: Gate = { type: "command", value: "exit 1" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Command failed");
	});

	test("fails when exec throws", async () => {
		const exec = mock(async () => {
			throw new Error("ENOENT");
		});
		const gate: Gate = { type: "command", value: "bad-cmd" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Command error");
	});
});

// ── file ──────────────────────────────────────────────────────────────────

describe("gate: file", () => {
	test("passes when exec returns code 0", async () => {
		const exec = makeExec(0);
		const gate: Gate = { type: "file", value: "/some/file.txt" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("File exists");
	});

	test("fails when exec returns non-zero", async () => {
		const exec = makeExec(1);
		const gate: Gate = { type: "file", value: "/missing.txt" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("File not found");
	});
});

// ── dir ───────────────────────────────────────────────────────────────────

describe("gate: dir", () => {
	test("passes when directory exists", async () => {
		const exec = makeExec(0);
		const gate: Gate = { type: "dir", value: "/some/dir" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("Directory exists");
	});

	test("fails when directory missing", async () => {
		const exec = makeExec(1);
		const gate: Gate = { type: "dir", value: "/no/dir" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Directory not found");
	});
});

// ── env ───────────────────────────────────────────────────────────────────

describe("gate: env", () => {
	test("passes when env var is set", async () => {
		const exec = makeExec(0);
		const gate: Gate = { type: "env", name: "MY_VAR" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("MY_VAR");
	});

	test("fails when env var is not set", async () => {
		const exec = makeExec(1);
		const gate: Gate = { type: "env", name: "MISSING_VAR" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("MISSING_VAR");
	});

	test("passes when env var matches expected value", async () => {
		const exec = makeExec(0);
		const gate: Gate = { type: "env", name: "NODE_ENV", value: "production" };
		const result = await evaluateGate(gate, "", baseCtx({ exec }));
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("NODE_ENV");
	});
});

// ── user ──────────────────────────────────────────────────────────────────

describe("gate: user", () => {
	test("fails when no UI available", async () => {
		const gate: Gate = { type: "user" };
		const result = await evaluateGate(
			gate,
			"output",
			baseCtx({ hasUI: false }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("requires interactive UI");
	});

	test("passes when user confirms", async () => {
		const gate: Gate = { type: "user" };
		const confirm = mock(async () => true);
		const result = await evaluateGate(
			gate,
			"step output",
			baseCtx({ hasUI: true, confirm }),
		);
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("approved");
	});

	test("fails when user rejects", async () => {
		const gate: Gate = { type: "user" };
		const confirm = mock(async () => false);
		const result = await evaluateGate(
			gate,
			"step output",
			baseCtx({ hasUI: true, confirm }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("rejected");
	});
});

// ── multi ─────────────────────────────────────────────────────────────────

describe("gate: multi", () => {
	test("all mode passes when all sub-gates pass", async () => {
		const gate: Gate = {
			type: "multi",
			mode: "all",
			gates: [
				{ type: "assert", fn: "output.includes('a')" },
				{ type: "assert", fn: "output.includes('b')" },
			],
		};
		const result = await evaluateGate(gate, "a and b", baseCtx());
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("All 2 gates passed");
	});

	test("all mode fails when one sub-gate fails", async () => {
		const gate: Gate = {
			type: "multi",
			mode: "all",
			gates: [
				{ type: "assert", fn: "output.includes('a')" },
				{ type: "assert", fn: "output.includes('missing')" },
			],
		};
		const result = await evaluateGate(gate, "only a", baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("1/2 gates failed");
	});

	test("any mode passes when one sub-gate passes", async () => {
		const gate: Gate = {
			type: "multi",
			mode: "any",
			gates: [
				{ type: "assert", fn: "output.includes('missing')" },
				{ type: "assert", fn: "output.includes('b')" },
			],
		};
		const result = await evaluateGate(gate, "only b here", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("any mode fails when all sub-gates fail", async () => {
		const gate: Gate = {
			type: "multi",
			mode: "any",
			gates: [
				{ type: "assert", fn: "output.includes('x')" },
				{ type: "assert", fn: "output.includes('y')" },
			],
		};
		const result = await evaluateGate(gate, "nothing matches", baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("All 2 gates failed");
	});
});

// ── timeout ───────────────────────────────────────────────────────────────

describe("gate: timeout", () => {
	test("passes when inner gate resolves before timeout", async () => {
		const gate: Gate = {
			type: "timeout",
			ms: 1000,
			gate: { type: "assert", fn: "output.includes('ok')" },
		};
		const result = await evaluateGate(gate, "ok", baseCtx());
		expect(result.passed).toBe(true);
	});

	test("fails with timeout reason when inner gate is too slow", async () => {
		const slowExec = mock(
			async () =>
				new Promise<{ code: number; stdout: string; stderr: string }>(
					(resolve) =>
						setTimeout(() => resolve({ code: 0, stdout: "", stderr: "" }), 200),
				),
		);
		const gate: Gate = {
			type: "timeout",
			ms: 10,
			gate: { type: "command", value: "sleep 1" },
		};
		const result = await evaluateGate(gate, "", baseCtx({ exec: slowExec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("timed out");
	});
});

// ── llm ───────────────────────────────────────────────────────────────────

describe("gate: llm", () => {
	test("fails when model/apiKey not provided in context", async () => {
		const gate: Gate = {
			type: "llm",
			prompt: "Does this look good?",
		};
		const result = await evaluateGate(gate, "some output", baseCtx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("requires model and apiKey");
	});
});
