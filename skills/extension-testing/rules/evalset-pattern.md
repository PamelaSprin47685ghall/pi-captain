# Test LLM-backed extensions with eval datasets and the evalset pattern

Extensions that call LLMs (via `complete()` or sub-agents) can't be tested with unit tests alone — you need to run the model and check its output. The evalset pattern from `tryingET-pi-evalset-lab` provides a reusable structure: a JSON dataset of input→expected-output pairs, a runner that calls the model, and assertion logic (`expectContains`, `expectNotContains`, `expectRegex`).

Use evalset for: prompt regression testing, system-prompt comparison (baseline vs. candidate), and documenting expected model behavior.

## Avoid

```typescript
// Ad-hoc manual test — no dataset, no reproducibility
test("model responds correctly", async () => {
  const response = await complete(model, { messages: [{ role: "user", content: "..." }] });
  // "Looks good" — no assertion, can't regress
  console.log(response);
});
```

Or hardcoding many assertions inline in test files — these become unreadable and unmaintainable.

## Prefer

**Dataset shape** (save as `fixtures/my-dataset.json`):

```json
{
  "name": "my-extension-smoke",
  "systemPrompt": "Answer concisely and explicitly.",
  "cases": [
    {
      "id": "happy-path",
      "input": "What does pi do?",
      "expectContains": ["terminal", "coding"],
      "expectNotContains": ["I don't know"]
    },
    {
      "id": "boundary-case",
      "input": "List the 3 most important things about pi extensions.",
      "expectRegex": "^(\\d\\.|\\*|-) .+",
      "expectContains": ["tool", "event"]
    },
    {
      "id": "no-assertions",
      "input": "Summarize the project in one sentence."
      // no expects = scored: false, always passes — useful for output inspection
    }
  ]
}
```

**Evaluation logic** (extract as pure function — fully unit-testable):

```typescript
// eval-runner.ts — zero pi imports
export interface EvalCase {
  id?: string;
  input: string;
  expectContains?: string[];
  expectNotContains?: string[];
  expectRegex?: string;
}

export interface CheckResult {
  check: string;
  pass: boolean;
  details: string;
}

export function evaluateCase(
  expected: EvalCase,
  output: string,
): { scored: boolean; pass: boolean; checks: CheckResult[] } {
  const checks: CheckResult[] = [];
  const lower = output.toLowerCase();

  for (const term of expected.expectContains ?? []) {
    checks.push({
      check: "expectContains",
      pass: lower.includes(term.toLowerCase()),
      details: `contains ${JSON.stringify(term)}`,
    });
  }

  for (const term of expected.expectNotContains ?? []) {
    checks.push({
      check: "expectNotContains",
      pass: !lower.includes(term.toLowerCase()),
      details: `does not contain ${JSON.stringify(term)}`,
    });
  }

  if (expected.expectRegex) {
    const regex = new RegExp(expected.expectRegex, "m");
    checks.push({
      check: "expectRegex",
      pass: regex.test(output),
      details: `matches /${expected.expectRegex}/m`,
    });
  }

  const scored = checks.length > 0;
  return { scored, pass: scored ? checks.every(c => c.pass) : true, checks };
}
```

**Unit tests for the evaluator** (fast, no model calls):

```typescript
// eval-runner.test.ts
import { describe, test, expect } from "bun:test";
import { evaluateCase } from "./eval-runner";

describe("evaluateCase", () => {
  test("expectContains passes when term present (case-insensitive)", () => {
    const result = evaluateCase({ input: "x", expectContains: ["Terminal"] }, "I use the terminal daily");
    expect(result.pass).toBe(true);
  });

  test("expectContains fails when term absent", () => {
    const result = evaluateCase({ input: "x", expectContains: ["missing"] }, "no such word");
    expect(result.pass).toBe(false);
  });

  test("no assertions = unscored, always passes", () => {
    const result = evaluateCase({ input: "x" }, "anything");
    expect(result.scored).toBe(false);
    expect(result.pass).toBe(true);
  });

  test("expectRegex validates pattern", () => {
    const result = evaluateCase({ input: "x", expectRegex: "^\\d+" }, "42 things");
    expect(result.pass).toBe(true);
  });

  test("invalid regex is reported as failed check", () => {
    const result = evaluateCase({ input: "x", expectRegex: "[invalid" }, "output");
    expect(result.pass).toBe(false);
    expect(result.checks[0]?.details).toContain("invalid regex");
  });
});
```

**Running against a live model** (use as an integration test, not in CI by default):

```typescript
// Use the /evalset command from tryingET-pi-evalset-lab:
// pi -e evalset.ts -p "/evalset run fixtures/my-dataset.json"

// Or wire your own runner using complete() from @mariozechner/pi-ai:
import { complete } from "@mariozechner/pi-ai";

async function runDataset(dataset, model, apiKey) {
  for (const c of dataset.cases) {
    const response = await complete(model, {
      systemPrompt: dataset.systemPrompt,
      messages: [{ role: "user", content: c.input, timestamp: Date.now() }],
    }, { apiKey });
    const output = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    const result = evaluateCase(c, output);
    console.log(`${c.id ?? "case"}: ${result.pass ? "PASS" : "FAIL"}`);
    if (!result.pass) {
      for (const check of result.checks.filter(ch => !ch.pass)) {
        console.log(`  ✗ ${check.details}`);
      }
    }
  }
}
```

**Tip — compare baseline vs. candidate system prompts**: The `evalset compare` command runs both variants on the full dataset and shows the delta pass rate, latency, and cost diff. Use this when refining your extension's system prompt.
