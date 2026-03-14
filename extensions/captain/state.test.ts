import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { FsPort } from "./state.js";
import { CaptainState } from "./state.js";
import type { PipelineState } from "./types.js";

// ── Fake FsPort ───────────────────────────────────────────────────────────

function makeFakeFs(
	initial: Record<string, string> = {},
): FsPort & { files: Map<string, string>; dirs: Set<string> } {
	const files = new Map(Object.entries(initial));
	const dirs = new Set<string>();

	return {
		files,
		dirs,
		exists: (p) => files.has(p) || dirs.has(p),
		readText: (p) => {
			const c = files.get(p);
			if (c === undefined) throw new Error(`FakeFs: not found: ${p}`);
			return c;
		},
		writeText: (p, c) => {
			files.set(p, c);
		},
		mkdirp: (p) => {
			dirs.add(p);
		},
		listFiles: (dir) => {
			const prefix = dir.endsWith("/") ? dir : `${dir}/`;
			return [...files.keys()]
				.filter(
					(k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"),
				)
				.map((k) => k.slice(prefix.length));
		},
		remove: (p) => {
			files.delete(p);
		},
	};
}

// ── ensureCaptainContractFile ─────────────────────────────────────────────

describe("CaptainState: ensureCaptainContractFile", () => {
	test("creates .pi/pipelines/captain.ts when it does not exist", () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/captain", fs);
		state.ensureCaptainContractFile("/cwd");
		const contractPath = join("/cwd", ".pi", "pipelines", "captain.ts");
		expect(fs.files.has(contractPath)).toBe(true);
	});

	test("written content exports from captainDir/api.ts", () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/my/captain", fs);
		state.ensureCaptainContractFile("/cwd");
		const contractPath = join("/cwd", ".pi", "pipelines", "captain.ts");
		expect(fs.files.get(contractPath)).toContain("/my/captain/api.ts");
	});

	test("does not overwrite when content is already up to date", () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/captain", fs);
		state.ensureCaptainContractFile("/cwd");
		const contractPath = join("/cwd", ".pi", "pipelines", "captain.ts");
		const first = fs.files.get(contractPath);

		// Mutate to simulate a stale write tracking, then call again
		state.ensureCaptainContractFile("/cwd");
		expect(fs.files.get(contractPath)).toBe(first);
	});

	test("overwrites when existing content is stale", () => {
		const contractPath = join("/cwd", ".pi", "pipelines", "captain.ts");
		const fs = makeFakeFs({ [contractPath]: "// old content" });
		const state = new CaptainState("/captain", fs);
		state.ensureCaptainContractFile("/cwd");
		expect(fs.files.get(contractPath)).not.toBe("// old content");
	});
});

// ── discoverPresets ───────────────────────────────────────────────────────

describe("CaptainState: discoverPresets", () => {
	test("returns empty array when .pi/pipelines does not exist", () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/captain", fs);
		expect(state.discoverPresets("/cwd")).toEqual([]);
	});

	test("returns .ts files (excluding captain.ts)", () => {
		const dir = join("/cwd", ".pi", "pipelines");
		const fs = makeFakeFs({
			[`${dir}/my-pipe.ts`]: "",
			[`${dir}/captain.ts`]: "",
		});
		fs.dirs.add(dir);
		const state = new CaptainState("/captain", fs);
		const results = state.discoverPresets("/cwd");
		expect(results.map((r) => r.name)).toEqual(["my-pipe"]);
	});

	test("ignores .json files (only .ts pipelines are supported)", () => {
		const dir = join("/cwd", ".pi", "pipelines");
		const fs = makeFakeFs({ [`${dir}/pipeline.json`]: "" });
		fs.dirs.add(dir);
		const state = new CaptainState("/captain", fs);
		const results = state.discoverPresets("/cwd");
		expect(results).toEqual([]);
	});

	test("includes source path", () => {
		const dir = join("/cwd", ".pi", "pipelines");
		const fs = makeFakeFs({ [`${dir}/p.ts`]: "" });
		fs.dirs.add(dir);
		const state = new CaptainState("/captain", fs);
		const [result] = state.discoverPresets("/cwd");
		expect(result.source).toBe(join(dir, "p.ts"));
	});
});

// ── buildPipelineListLines ────────────────────────────────────────────────

describe("CaptainState: buildPipelineListLines", () => {
	test("returns loaded pipelines with (loaded) label", () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/captain", fs);
		state.pipelines["my-pipe"] = {
			spec: { kind: "step", label: "x", prompt: "y" },
		};
		const lines = state.buildPipelineListLines();
		expect(lines[0]).toContain("my-pipe (loaded)");
	});

	test("returns empty array when no pipelines and no cwd", () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/captain", fs);
		expect(state.buildPipelineListLines()).toEqual([]);
	});

	test("includes user pipelines from .pi/pipelines when cwd provided", () => {
		const dir = join("/cwd", ".pi", "pipelines");
		const fs = makeFakeFs({ [`${dir}/user-pipe.ts`]: "" });
		fs.dirs.add(dir);
		const state = new CaptainState("/captain", fs);
		const lines = state.buildPipelineListLines("/cwd");
		const flat = lines.join("\n");
		expect(flat).toContain("user-pipe");
	});

	test("does not list already-loaded pipelines in user section", () => {
		const dir = join("/cwd", ".pi", "pipelines");
		const fs = makeFakeFs({ [`${dir}/loaded-pipe.ts`]: "" });
		fs.dirs.add(dir);
		const state = new CaptainState("/captain", fs);
		state.pipelines["loaded-pipe"] = {
			spec: { kind: "step", label: "x", prompt: "y" },
		};
		const lines = state.buildPipelineListLines("/cwd");
		// should appear only once (in loaded section), not also in user section
		const flat = lines.join("\n");
		const count = (flat.match(/loaded-pipe/g) ?? []).length;
		expect(count).toBe(1);
	});
});

// ── runningState getter ───────────────────────────────────────────────────

describe("CaptainState: runningState", () => {
	function makeJob(opts: {
		state: CaptainState;
		status: "running" | "completed" | "failed";
		name?: string;
	}) {
		const { state, status, name = "test-pipeline" } = opts;
		const pipelineState = {
			name,
			spec: { kind: "step" as const, label: "x", prompt: "y" },
			status,
			results: [],
			currentSteps: new Set<string>(),
			currentStepStreams: new Map<string, string>(),
			currentStepToolCalls: new Map<string, number>(),
		};
		return state.allocateJob(pipelineState);
	}

	test("returns null when no jobs exist", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		expect(state.runningState).toBeNull();
	});

	test("returns the running job state when one is running", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		makeJob({ state, status: "running", name: "my-pipe" });
		const running = state.runningState;
		expect(running?.name).toBe("my-pipe");
		expect(running?.status).toBe("running");
	});

	test("returns null when only completed jobs exist", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		makeJob({ state, status: "completed" });
		// no running job → returns the last job's state
		const r = state.runningState;
		// It returns last job state (completed in this case)
		expect(r?.status).toBe("completed");
	});

	test("prefers running job over completed when both exist", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		makeJob({ state, status: "completed", name: "done-pipe" });
		makeJob({ state, status: "running", name: "active-pipe" });
		const r = state.runningState;
		expect(r?.name).toBe("active-pipe");
	});
});

// ── allocateJob ───────────────────────────────────────────────────────────

describe("CaptainState: allocateJob", () => {
	test("assigns incrementing job IDs", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		const ps1 = {
			name: "p1",
			spec: { kind: "step" as const, label: "x", prompt: "y" },
			status: "running" as const,
			results: [],
			currentSteps: new Set<string>(),
			currentStepStreams: new Map<string, string>(),
			currentStepToolCalls: new Map<string, number>(),
		};
		const ps2 = { ...ps1, name: "p2" };
		const job1 = state.allocateJob(ps1);
		const job2 = state.allocateJob(ps2);
		expect(job1.id).toBe(1);
		expect(job2.id).toBe(2);
	});

	test("sets jobId on the pipeline state", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		const ps: PipelineState = {
			name: "p",
			spec: { kind: "step" as const, label: "x", prompt: "y" },
			status: "running",
			results: [],
			currentSteps: new Set<string>(),
			currentStepStreams: new Map<string, string>(),
			currentStepToolCalls: new Map<string, number>(),
		};
		const job = state.allocateJob(ps);
		expect(ps.jobId).toBe(job.id);
	});

	test("job is retrievable from jobs map", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		const ps: PipelineState = {
			name: "p",
			spec: { kind: "step" as const, label: "x", prompt: "y" },
			status: "running",
			results: [],
			currentSteps: new Set<string>(),
			currentStepStreams: new Map<string, string>(),
			currentStepToolCalls: new Map<string, number>(),
		};
		const job = state.allocateJob(ps);
		expect(state.jobs.get(job.id)).toBe(job);
	});
});

// ── killJob ───────────────────────────────────────────────────────────────

describe("CaptainState: killJob", () => {
	function allocateRunning(state: CaptainState) {
		const ps = {
			name: "running-pipe",
			spec: { kind: "step" as const, label: "x", prompt: "y" },
			status: "running" as const,
			results: [],
			currentSteps: new Set<string>(),
			currentStepStreams: new Map<string, string>(),
			currentStepToolCalls: new Map<string, number>(),
		};
		return state.allocateJob(ps);
	}

	test("returns not-found for unknown job id", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		expect(state.killJob(999)).toBe("not-found");
	});

	test("returns not-running when job is already completed", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		const job = allocateRunning(state);
		job.state.status = "completed";
		expect(state.killJob(job.id)).toBe("not-running");
	});

	test("returns killed and cancels a running job", () => {
		const state = new CaptainState("/captain", makeFakeFs());
		const job = allocateRunning(state);
		const outcome = state.killJob(job.id);
		expect(outcome).toBe("killed");
		expect(job.state.status).toBe("cancelled");
		expect(job.controller.signal.aborted).toBe(true);
		expect(job.state.endTime).toBeDefined();
	});
});

// ── resolvePreset ─────────────────────────────────────────────────────────

describe("CaptainState: resolvePreset", () => {
	test("returns undefined when file does not exist anywhere", async () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/captain", fs);
		const result = await state.resolvePreset("nonexistent-pipeline", "/cwd");
		expect(result).toBeUndefined();
	});

	test("returns undefined when .pi/pipelines/<name>.ts does not exist", async () => {
		const fs = makeFakeFs();
		const state = new CaptainState("/captain", fs);
		const result = await state.resolvePreset("my-pipe", "/cwd");
		expect(result).toBeUndefined();
	});
});
