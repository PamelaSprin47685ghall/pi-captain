import { describe, expect, mock, test } from "bun:test";
import {
	allOf,
	anyOf,
	assert,
	command,
	dir,
	envEquals,
	envSet,
	file,
	jsonHasKeys,
	jsonValid,
	llmFast,
	outputIncludesCI,
	outputMinLength,
	regex,
	regexCI,
	user,
	withTimeout,
} from "./gates/index.js";
import { runGate } from "./gates.js";
import type { GateCtx } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeExec(code = 0, stdout = "", stderr = "") {
	return mock(async (_cmd: string, _args: string[], _opts?: unknown) => ({
		code,
		stdout,
		stderr,
	}));
}

function ctx(overrides: Partial<GateCtx> = {}): GateCtx {
	return {
		output: "",
		exec: makeExec(),
		hasUI: false,
		cwd: "/tmp",
		...overrides,
	};
}

// ── runGate wrapper ───────────────────────────────────────────────────────

describe("gate: runGate", () => {
	test("returns passed:true when gate returns true", async () => {
		const result = await runGate(() => true, ctx());
		expect(result.passed).toBe(true);
	});

	test("returns passed:false when gate returns false", async () => {
		const result = await runGate(() => false, ctx());
		expect(result.passed).toBe(false);
	});

	test("returns passed:false with reason when gate throws", async () => {
		const result = await runGate(() => {
			throw new Error("boom");
		}, ctx());
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("boom");
	});
});

// ── assert ────────────────────────────────────────────────────────────────

describe("gate: assert", () => {
	test("output.includes passes when text present", async () => {
		const result = await runGate(
			assert("output.includes('hello')"),
			ctx({ output: "hello world" }),
		);
		expect(result.passed).toBe(true);
	});

	test("output.includes fails when text absent", async () => {
		const result = await runGate(
			assert("output.includes('missing')"),
			ctx({ output: "hello world" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Assertion failed");
	});

	test("!output.includes passes when text absent", async () => {
		const result = await runGate(
			assert("!output.includes('bad')"),
			ctx({ output: "all good" }),
		);
		expect(result.passed).toBe(true);
	});

	test("output.length > N passes", async () => {
		const result = await runGate(
			assert("output.length > 5"),
			ctx({ output: "hello world" }),
		);
		expect(result.passed).toBe(true);
	});

	test("output.length > N fails", async () => {
		const result = await runGate(
			assert("output.length > 100"),
			ctx({ output: "hi" }),
		);
		expect(result.passed).toBe(false);
	});

	test("output.length === N passes", async () => {
		const result = await runGate(
			assert("output.length === 5"),
			ctx({ output: "hello" }),
		);
		expect(result.passed).toBe(true);
	});

	test("|| OR logic passes if one side matches", async () => {
		const result = await runGate(
			assert("output.includes('a') || output.includes('b')"),
			ctx({ output: "b wins" }),
		);
		expect(result.passed).toBe(true);
	});

	test("&& AND logic fails if one side misses", async () => {
		const result = await runGate(
			assert("output.includes('a') && output.includes('b')"),
			ctx({ output: "only a here" }),
		);
		expect(result.passed).toBe(false);
	});

	test("case-insensitive includes via toLowerCase()", async () => {
		const result = await runGate(
			assert("output.toLowerCase().includes('hello')"),
			ctx({ output: "HELLO WORLD" }),
		);
		expect(result.passed).toBe(true);
	});

	test("unsupported expression returns assertion error", async () => {
		const result = await runGate(
			assert("Math.random() > 0"),
			ctx({ output: "x" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Gate error");
	});
});

// ── regex ─────────────────────────────────────────────────────────────────

describe("gate: regex", () => {
	test("passes when pattern matches", async () => {
		const result = await runGate(
			regex("\\d+"),
			ctx({ output: "there are 42 items" }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails when pattern does not match", async () => {
		const result = await runGate(regex("^ERROR"), ctx({ output: "all good" }));
		expect(result.passed).toBe(false);
	});

	test("respects flags (case-insensitive)", async () => {
		const result = await runGate(
			regexCI("hello"),
			ctx({ output: "HELLO WORLD" }),
		);
		expect(result.passed).toBe(true);
	});

	test("invalid regex returns error", async () => {
		const result = await runGate(
			regex("[invalid"),
			ctx({ output: "anything" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Invalid regex");
	});
});

// ── json ──────────────────────────────────────────────────────────────────

describe("gate: json", () => {
	test("passes for valid JSON without schema", async () => {
		const result = await runGate(jsonValid, ctx({ output: '{"a":1}' }));
		expect(result.passed).toBe(true);
	});

	test("fails for invalid JSON", async () => {
		const result = await runGate(jsonValid, ctx({ output: "not json" }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("not valid JSON");
	});

	test("passes when all schema keys present", async () => {
		const result = await runGate(
			jsonHasKeys("name", "age"),
			ctx({ output: '{"name":"Alice","age":30}' }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails when schema key missing", async () => {
		const result = await runGate(
			jsonHasKeys("name", "email"),
			ctx({ output: '{"name":"Alice"}' }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("email");
	});
});

// ── command ───────────────────────────────────────────────────────────────

describe("gate: command", () => {
	test("passes when command exits 0", async () => {
		const exec = makeExec(0, "ok", "");
		const result = await runGate(command("exit 0"), ctx({ exec }));
		expect(result.passed).toBe(true);
	});

	test("fails when command exits non-zero", async () => {
		const exec = makeExec(1, "", "something went wrong");
		const result = await runGate(command("exit 1"), ctx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Command failed");
	});

	test("fails when exec throws", async () => {
		const exec = mock(async () => {
			throw new Error("ENOENT");
		});
		const result = await runGate(command("bad-cmd"), ctx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Gate error");
	});
});

// ── file ──────────────────────────────────────────────────────────────────

describe("gate: file", () => {
	test("passes when exec returns code 0", async () => {
		const exec = makeExec(0);
		const result = await runGate(file("/some/file.txt"), ctx({ exec }));
		expect(result.passed).toBe(true);
	});

	test("fails when exec returns non-zero", async () => {
		const exec = makeExec(1);
		const result = await runGate(file("/missing.txt"), ctx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("File not found");
	});
});

// ── dir ───────────────────────────────────────────────────────────────────

describe("gate: dir", () => {
	test("passes when directory exists", async () => {
		const exec = makeExec(0);
		const result = await runGate(dir("/some/dir"), ctx({ exec }));
		expect(result.passed).toBe(true);
	});

	test("fails when directory missing", async () => {
		const exec = makeExec(1);
		const result = await runGate(dir("/no/dir"), ctx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Directory not found");
	});
});

// ── env ───────────────────────────────────────────────────────────────────

describe("gate: env", () => {
	test("passes when env var is set", async () => {
		const exec = makeExec(0);
		const result = await runGate(envSet("MY_VAR"), ctx({ exec }));
		expect(result.passed).toBe(true);
	});

	test("fails when env var is not set", async () => {
		const exec = makeExec(1);
		const result = await runGate(envSet("MISSING_VAR"), ctx({ exec }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("MISSING_VAR");
	});

	test("passes when env var matches expected value", async () => {
		const exec = makeExec(0);
		const result = await runGate(
			envEquals("NODE_ENV", "production"),
			ctx({ exec }),
		);
		expect(result.passed).toBe(true);
	});
});

// ── user ──────────────────────────────────────────────────────────────────

describe("gate: user", () => {
	test("fails when no UI available", async () => {
		const result = await runGate(user, ctx({ hasUI: false }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("requires interactive UI");
	});

	test("passes when user confirms", async () => {
		const confirm = mock(async () => true);
		const result = await runGate(
			user,
			ctx({ hasUI: true, confirm, output: "step output" }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails when user rejects", async () => {
		const confirm = mock(async () => false);
		const result = await runGate(
			user,
			ctx({ hasUI: true, confirm, output: "step output" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("rejected");
	});
});

// ── multi ─────────────────────────────────────────────────────────────────

describe("gate: multi", () => {
	test("all mode passes when all sub-gates pass", async () => {
		const result = await runGate(
			allOf(outputIncludesCI("a"), outputIncludesCI("b")),
			ctx({ output: "a and b" }),
		);
		expect(result.passed).toBe(true);
	});

	test("all mode fails when one sub-gate fails", async () => {
		const result = await runGate(
			allOf(outputIncludesCI("a"), outputIncludesCI("missing")),
			ctx({ output: "only a" }),
		);
		expect(result.passed).toBe(false);
	});

	test("any mode passes when one sub-gate passes", async () => {
		const result = await runGate(
			anyOf(outputIncludesCI("missing"), outputIncludesCI("b")),
			ctx({ output: "only b here" }),
		);
		expect(result.passed).toBe(true);
	});

	test("any mode fails when all sub-gates fail", async () => {
		const result = await runGate(
			anyOf(outputIncludesCI("x"), outputIncludesCI("y")),
			ctx({ output: "nothing matches" }),
		);
		expect(result.passed).toBe(false);
	});
});

// ── timeout ───────────────────────────────────────────────────────────────

describe("gate: timeout", () => {
	test("passes when inner gate resolves before timeout", async () => {
		const result = await runGate(
			withTimeout(outputIncludesCI("ok"), 1000),
			ctx({ output: "ok" }),
		);
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
		const result = await runGate(
			withTimeout(command("sleep 1"), 10),
			ctx({ exec: slowExec }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("timed out");
	});
});

// ── llm ───────────────────────────────────────────────────────────────────

describe("gate: llm", () => {
	test("fails when model/apiKey not provided in context", async () => {
		const result = await runGate(
			llmFast("Does this look good?"),
			ctx({ output: "some output" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("requires model and apiKey");
	});
});

// ── outputMinLength ───────────────────────────────────────────────────────

describe("gate: outputMinLength", () => {
	test("passes when output exceeds minimum length", async () => {
		const result = await runGate(
			outputMinLength(5),
			ctx({ output: "hello world" }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails when output is too short", async () => {
		const result = await runGate(outputMinLength(100), ctx({ output: "hi" }));
		expect(result.passed).toBe(false);
	});
});
