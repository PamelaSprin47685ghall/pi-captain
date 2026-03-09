// ── Step: Validate Contracts ─────────────────────────────────────────────
// Stage 6 of req-decompose-ai: Machine-verifiability gate.
// Checks every UNIT-N contract against four hard criteria that determine
// whether an AI can execute it without ambiguity or guesswork:
//   1. Typed signature — no 'any', no vague param names, return type explicit
//   2. Explicit file path — exact path, not "somewhere in src"
//   3. Pre-written test — runnable code, not "write a test that..."
//   4. Runnable verification — a real shell command, not a description
//
// Falls back to re-contracting only the failing units (not a full re-run).

import { fallback, regexCI } from "../gates/index.js";
import type { Step } from "../types.js";
import { contractTasks } from "./contract-tasks.js";

// Targeted fallback: re-contract only the units that failed validation
const reContract: typeof contractTasks = {
	...contractTasks,
	label: "Re-Contract Failing Units",
	description:
		"Re-generate contracts for units that failed machine-verifiability",
	prompt:
		"Some UNIT contracts failed machine-verifiability validation. Re-generate ONLY the failing units.\n\n" +
		"Full contract list (failing units identified below):\n$INPUT\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"For each FAIL unit:\n" +
		"1. Re-read the relevant source files to get accurate types\n" +
		"2. Re-generate the contract with ALL four criteria satisfied:\n" +
		"   - Typed signature (no 'any', explicit return type)\n" +
		"   - Explicit file path (exact path that exists or will be created)\n" +
		"   - Pre-written test (copy-pasteable, concrete values, runnable now)\n" +
		"   - Verification command (exact shell command)\n\n" +
		"Keep all PASS units unchanged. Output the complete merged unit list.\n\n" +
		"End with:\n" +
		"TOTAL UNITS: N\n" +
		"ALL CONTRACTS VALID: YES",
};

export const validateContracts: Step = {
	kind: "step",
	label: "Validate Contracts",
	tools: ["read"],
	model: "flash",
	temperature: 0,
	description:
		"Machine-verifiability gate: typed signature + explicit file + pre-written test + runnable command",
	prompt:
		"You are the Contract Validator. Check every UNIT contract against four hard criteria.\n\n" +
		"Contracts:\n$INPUT\n\n" +
		"For each UNIT, check all four criteria:\n\n" +
		"1. TYPED SIGNATURE — does `Function:` have concrete input types and return type? (no 'any', no 'object')\n" +
		"2. EXPLICIT FILE — does `File:` contain a full path to a specific file? (not 'src/...' or 'somewhere')\n" +
		"3. PRE-WRITTEN TEST — does `Pre-written test:` contain runnable code with concrete values? (not a description)\n" +
		"4. RUNNABLE VERIFICATION — does `Verification:` contain a real shell command? (not 'run the tests')\n\n" +
		"For each unit:\n" +
		"### UNIT-N: [name]\n" +
		"- Typed signature: PASS / FAIL — [reason if FAIL]\n" +
		"- Explicit file: PASS / FAIL — [reason if FAIL]\n" +
		"- Pre-written test: PASS / FAIL — [reason if FAIL]\n" +
		"- Runnable verification: PASS / FAIL — [reason if FAIL]\n" +
		"- Verdict: PASS (all 4) / FAIL (any failed)\n" +
		"- Dependencies: [pass through from input]\n\n" +
		"Then output summary:\n" +
		"VALIDATED: X / Y\n" +
		'FAILED UNITS: (comma-separated list, or "none")\n\n' +
		"If all units passed, end with exactly:\n" +
		"ALL CONTRACTS VALID: YES\n\n" +
		"If any failed, end with exactly:\n" +
		"ALL CONTRACTS VALID: NO",
	gate: regexCI("all.contracts.valid.*yes"),
	onFail: fallback(reContract),
	transform: { kind: "full" },
};
