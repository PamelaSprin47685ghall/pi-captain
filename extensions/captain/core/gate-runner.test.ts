import { describe, expect, test } from "bun:test";
import type { Gate, GateCtx } from "../core/types.js";
import { runGate } from "./gate-runner.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function ctx(overrides: Partial<GateCtx> = {}): GateCtx {
	return {
		exec: async () => ({ code: 0, stdout: "", stderr: "" }),
		hasUI: false,
		cwd: "/tmp",
		...overrides,
	};
}

// ── Core runGate functionality ────────────────────────────────────────────

describe("gate-runner: runGate", () => {
	test("returns passed:true when sync gate returns true", async () => {
		const gate: Gate = () => true;
		const result = await runGate(gate, "test output");

		expect(result.passed).toBe(true);
		expect(result.reason).toBe("passed");
	});

	test("returns passed:false with reason when sync gate returns string", async () => {
		const gate: Gate = () => "validation failed";
		const result = await runGate(gate, "test output");

		expect(result.passed).toBe(false);
		expect(result.reason).toBe("validation failed");
	});

	test("returns passed:true when async gate resolves true", async () => {
		const gate: Gate = (): Promise<true> => Promise.resolve(true as true);
		const result = await runGate(gate, "test output");

		expect(result.passed).toBe(true);
		expect(result.reason).toBe("passed");
	});

	test("returns passed:false with reason when async gate resolves string", async () => {
		const gate: Gate = (): Promise<string> =>
			Promise.resolve("async validation failed");
		const result = await runGate(gate, "test output");

		expect(result.passed).toBe(false);
		expect(result.reason).toBe("async validation failed");
	});

	test("catches thrown Error and converts to failed result", async () => {
		const gate: Gate = () => {
			throw new Error("something went wrong");
		};
		const result = await runGate(gate, "test output");

		expect(result.passed).toBe(false);
		expect(result.reason).toBe("something went wrong");
	});

	test("catches async thrown Error and converts to failed result", async () => {
		const gate: Gate = async () => {
			throw new Error("async error");
		};
		const result = await runGate(gate, "test output");

		expect(result.passed).toBe(false);
		expect(result.reason).toBe("async error");
	});

	test("passes output to gate function", async () => {
		let receivedOutput = "";
		const gate: Gate = ({ output }) => {
			receivedOutput = output;
			return true;
		};

		await runGate(gate, "test content");
		expect(receivedOutput).toBe("test content");
	});

	test("passes context to gate function when provided", async () => {
		let receivedCtx: GateCtx | undefined;
		const gate: Gate = ({ ctx: c }) => {
			receivedCtx = c;
			return true;
		};

		const testCtx = ctx({ cwd: "/custom" });
		await runGate(gate, "test output", testCtx);
		expect(receivedCtx).toBe(testCtx);
	});

	test("works when no context provided", async () => {
		let receivedCtx: GateCtx | undefined;
		const gate: Gate = ({ ctx: c }) => {
			receivedCtx = c;
			return true;
		};

		await runGate(gate, "test output");
		expect(receivedCtx).toBeUndefined();
	});

	test("handles gate that checks output content", async () => {
		const gate: Gate = ({ output }) =>
			output.includes("success") ? true : "missing success indicator";

		const passResult = await runGate(gate, "operation was a success");
		expect(passResult.passed).toBe(true);

		const failResult = await runGate(gate, "operation failed");
		expect(failResult.passed).toBe(false);
		expect(failResult.reason).toBe("missing success indicator");
	});

	test("never throws — Error exceptions become failed results", async () => {
		const errorGates: Gate[] = [
			() => {
				throw new Error("sync error");
			},
			async () => {
				throw new Error("async error");
			},
		];

		for (const gate of errorGates) {
			const result = await runGate(gate, "test");
			expect(result).toMatchObject({
				passed: false,
				reason: expect.any(String),
			});
		}
	});
});
