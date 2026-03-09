import { describe, expect, mock, test } from "bun:test";
import {
	allOf,
	anyOf,
	bunTest,
	command,
	dir,
	file,
	jsonHasKeys,
	jsonValid,
	llmFast,
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

// ── runGate ───────────────────────────────────────────────────────────────

describe("gate: runGate", () => {
	test("returns passed:true when gate returns true", async () => {
		const result = await runGate(() => true, ctx());
		expect(result.passed).toBe(true);
		expect(result.reason).toBe("passed");
	});

	test("returns passed:false with string reason when gate returns a string", async () => {
		const result = await runGate(() => "it was empty", ctx());
		expect(result.passed).toBe(false);
		expect(result.reason).toBe("it was empty");
	});

	test("propagates throw — gate bugs are not silently swallowed", async () => {
		await expect(
			runGate(() => {
				throw new Error("boom");
			}, ctx()),
		).rejects.toThrow("boom");
	});
});

// ── command ───────────────────────────────────────────────────────────────

describe("gate: command", () => {
	test("passes when command exits 0", async () => {
		const result = await runGate(
			command("exit 0"),
			ctx({ exec: makeExec(0, "ok") }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails with reason when command exits non-zero", async () => {
		const result = await runGate(
			command("exit 1"),
			ctx({ exec: makeExec(1, "", "something went wrong") }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Command failed");
		expect(result.reason).toContain("something went wrong");
	});

	test("propagates when exec throws — unexpected errors are not swallowed", async () => {
		const exec = mock(async () => {
			throw new Error("ENOENT");
		});
		await expect(runGate(command("bad-cmd"), ctx({ exec }))).rejects.toThrow(
			"ENOENT",
		);
	});
});

// ── file ──────────────────────────────────────────────────────────────────

describe("gate: file", () => {
	test("passes when file exists", async () => {
		const result = await runGate(
			file("/some/file.txt"),
			ctx({ exec: makeExec(0) }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails with path in reason when file missing", async () => {
		const result = await runGate(
			file("/missing.txt"),
			ctx({ exec: makeExec(1) }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("/missing.txt");
	});
});

// ── dir ───────────────────────────────────────────────────────────────────

describe("gate: dir", () => {
	test("passes when directory exists", async () => {
		const result = await runGate(dir("/some/dir"), ctx({ exec: makeExec(0) }));
		expect(result.passed).toBe(true);
	});

	test("fails with path in reason when directory missing", async () => {
		const result = await runGate(dir("/no/dir"), ctx({ exec: makeExec(1) }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("/no/dir");
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

	test("fails with pattern in reason when no match", async () => {
		const result = await runGate(regex("^ERROR"), ctx({ output: "all good" }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("^ERROR");
	});

	test("regexCI matches case-insensitively", async () => {
		const result = await runGate(
			regexCI("hello"),
			ctx({ output: "HELLO WORLD" }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails with reason on invalid regex", async () => {
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
	test("jsonValid passes for valid JSON", async () => {
		const result = await runGate(jsonValid, ctx({ output: '{"a":1}' }));
		expect(result.passed).toBe(true);
	});

	test("jsonValid fails with reason for invalid JSON", async () => {
		const result = await runGate(jsonValid, ctx({ output: "not json" }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("not valid JSON");
	});

	test("jsonHasKeys passes when all keys present", async () => {
		const result = await runGate(
			jsonHasKeys("name", "age"),
			ctx({ output: '{"name":"Alice","age":30}' }),
		);
		expect(result.passed).toBe(true);
	});

	test("jsonHasKeys fails with missing key names in reason", async () => {
		const result = await runGate(
			jsonHasKeys("name", "email"),
			ctx({ output: '{"name":"Alice"}' }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("email");
	});
});

// ── user ──────────────────────────────────────────────────────────────────

describe("gate: user", () => {
	test("fails with reason when no UI available", async () => {
		const result = await runGate(user, ctx({ hasUI: false }));
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("requires interactive UI");
	});

	test("passes when user confirms", async () => {
		const result = await runGate(
			user,
			ctx({ hasUI: true, confirm: async () => true, output: "output" }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails with reason when user rejects", async () => {
		const result = await runGate(
			user,
			ctx({ hasUI: true, confirm: async () => false, output: "output" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toBe("User rejected");
	});
});

// ── allOf / anyOf ─────────────────────────────────────────────────────────

describe("gate: allOf", () => {
	test("passes when all gates pass", async () => {
		const result = await runGate(
			allOf(
				() => true,
				() => true,
			),
			ctx({ output: "ok" }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails with first failure reason", async () => {
		const result = await runGate(
			allOf(
				() => true,
				() => "second failed",
			),
			ctx({ output: "ok" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toBe("second failed");
	});
});

describe("gate: anyOf", () => {
	test("passes when one gate passes", async () => {
		const result = await runGate(
			anyOf(
				() => "nope",
				() => true,
			),
			ctx({ output: "ok" }),
		);
		expect(result.passed).toBe(true);
	});

	test("fails with all reasons when all gates fail", async () => {
		const result = await runGate(
			anyOf(
				() => "reason A",
				() => "reason B",
			),
			ctx({ output: "ok" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("reason A");
		expect(result.reason).toContain("reason B");
	});
});

// ── withTimeout ───────────────────────────────────────────────────────────

describe("gate: withTimeout", () => {
	test("passes when inner gate resolves in time", async () => {
		const result = await runGate(
			withTimeout(() => true, 1000),
			ctx(),
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
	test("fails with reason when model/apiKey not in context", async () => {
		const result = await runGate(
			llmFast("Does this look good?"),
			ctx({ output: "some output" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("requires model and apiKey");
	});
});

// ── inline gate ───────────────────────────────────────────────────────────

describe("gate: inline", () => {
	test("inline function gate returning true passes", async () => {
		const result = await runGate(
			({ output }) => (output.length > 5 ? true : "too short"),
			ctx({ output: "hello world" }),
		);
		expect(result.passed).toBe(true);
	});

	test("inline function gate returning string fails with that reason", async () => {
		const result = await runGate(
			({ output }) => (output.length > 5 ? true : "too short"),
			ctx({ output: "hi" }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toBe("too short");
	});
});

// ── bunTest preset ────────────────────────────────────────────────────────

describe("gate: bunTest", () => {
	test("passes when bun test exits 0", async () => {
		const result = await runGate(bunTest, ctx({ exec: makeExec(0) }));
		expect(result.passed).toBe(true);
	});

	test("fails with reason when bun test exits non-zero", async () => {
		const result = await runGate(
			bunTest,
			ctx({ exec: makeExec(1, "", "3 tests failed") }),
		);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("Command failed");
	});
});
