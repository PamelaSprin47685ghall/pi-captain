// ── Step: Contract Tasks ─────────────────────────────────────────────────
// Stage 4 of req-decompose-ai: The critical last-mile step.
// Converts each BDD scenario into a fully typed AI execution contract
// using the "prompt as contract" pattern (input schema + constraints +
// output shape + verification command + pre-written test stub).
//
// Output is UNIT-N compatible so shredder's shredAndScore, resolveDependencies,
// generateExecutionSpec, and renderCanvas all work unchanged downstream.
//
// This replaces tddTaskList: instead of "fn: functionName(), Est: 10 min"
// for a human, it produces a machine-actionable contract an AI can execute
// deterministically without any guesswork.

import { none, retry } from "../gates/index.js";
import type { Step } from "../types.js";

export const contractTasks: Step = {
	kind: "step",
	label: "Contract Tasks",
	agent: "decomposer",
	description:
		"Convert BDD scenarios into typed AI execution contracts (prompt-as-contract pattern, UNIT-N format)",
	prompt:
		"You are a Contract Generator applying the 'prompt as contract' pattern.\n\n" +
		"BDD scenarios:\n$INPUT\n\n" +
		"Original requirement:\n$ORIGINAL\n\n" +
		"STEP 1 — Ground yourself in the codebase to extract real types and signatures:\n" +
		"1. Run: find . -type f \\( -name '*.ts' -o -name '*.py' -o -name '*.go' -o -name '*.rs' \\) | grep -v node_modules | grep -v dist | grep -v .git | head -80\n" +
		"2. For each file area mentioned in the stories, read the relevant source files to extract:\n" +
		"   - Existing type/interface definitions\n" +
		"   - Existing function signatures\n" +
		"   - Test framework in use (jest/vitest/pytest/etc)\n" +
		"3. Run: cat package.json 2>/dev/null | grep -E '(test|jest|vitest|mocha)' || echo 'check other manifest'\n\n" +
		"STEP 2 — For each BDD scenario, produce ONE UNIT-N contract.\n\n" +
		"Rules:\n" +
		"- One unit = one function = one test = one commit\n" +
		"- Use REAL types from the codebase (no 'any', no 'object', no vague names)\n" +
		"- File paths must be explicit and grounded in the actual directory structure\n" +
		"- Pre-written test must be copy-pasteable and immediately runnable\n" +
		"- Verification command must be a real shell command\n\n" +
		"For each BDD scenario produce exactly:\n\n" +
		"### UNIT-N: [functionName]\n" +
		"- Goal: [one sentence — what this function does]\n" +
		"- Traceability: STORY-X → SCENARIO N.X → [scenario name]\n" +
		"- Function: `[functionName]([param]: [InputType]): [ReturnType]`\n" +
		"- File: `[src/path/to/file.ts]` [create | modify]\n" +
		"- Layer: [business-logic | data-access | api | ui | utility]\n" +
		"- Input schema:\n" +
		"  ```\n" +
		"  { field: Type, field2: Type, ... }\n" +
		"  ```\n" +
		"- Output shape:\n" +
		"  ```\n" +
		"  { field: Type } | throws [ErrorType]\n" +
		"  ```\n" +
		"- Constraints:\n" +
		"  1. [invariant or rule that must hold]\n" +
		"  2. [error case to handle]\n" +
		"  (one line per constraint — these are the guard rails for the AI)\n" +
		"- Pre-written test:\n" +
		"  ```[language]\n" +
		"  describe('[functionName]', () => {\n" +
		"    it('[scenario name]', () => {\n" +
		"      // Given\n" +
		"      const input = [concrete value, not abstract placeholder]\n" +
		"      // When\n" +
		"      const result = [functionName](input)\n" +
		"      // Then\n" +
		"      expect(result).[matcher]([expected concrete value])\n" +
		"    })\n" +
		"  })\n" +
		"  ```\n" +
		"- Verification: `[exact shell command to run this test]`\n" +
		"- Acceptance Test: [Given/When/Then from BDD — one line summary]\n" +
		"- Dependencies: [UNIT-X, UNIT-Y or none]\n\n" +
		"After all units end with:\n" +
		"TOTAL UNITS: N\n" +
		"ALL CONTRACTS TYPED: YES / NO",
	gate: none,
	onFail: retry(2),
	transform: { kind: "full" },
};
