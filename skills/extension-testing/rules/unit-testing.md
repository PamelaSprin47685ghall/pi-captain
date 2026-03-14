# Extract and unit-test pure logic without importing pi

Extension modules wire pi's API to your business logic. The business logic itself — parsers, validators, formatters, state reducers — should live in separate modules with zero pi imports. These modules are trivially testable with `bun:test` and run in milliseconds.

The pattern from `tryingET-pi-evalset-lab` is the gold standard: `evalset.ts` is ~800 lines of pure business logic (parseArgs, evaluateCase, hashObject, mergeSystemPrompt) tested independently of pi.

## Avoid

```typescript
// everything in index.ts, mixed with pi API calls
export default function (pi: ExtensionAPI) {
  pi.registerCommand("run", {
    handler: async (args, ctx) => {
      // 200 lines of logic here — untestable without pi runtime
      const tokens = args.split(/\s+/);
      const path = tokens[1];
      if (!path) throw new Error("Missing path");
      const data = JSON.parse(await readFile(path, "utf8"));
      // ...
    },
  });
}
```

No test file. All logic is entangled with pi's handler signature.

## Prefer

```
my-extension/
├── index.ts         # thin pi shell — no logic
├── parser.ts        # pure: parseArgs, validateConfig
├── runner.ts        # pure: evaluateCase, mergePrompt
└── runner.test.ts   # bun:test, no pi imports
```

```typescript
// parser.ts — zero pi imports
export function parseArgs(raw: string): string[] {
  const tokens: string[] = [];
  const regex = /"((?:\\.|[^"\\])*)"|(\S+)/g;
  for (const match of raw.matchAll(regex)) {
    tokens.push(match[1] ?? match[2] ?? "");
  }
  return tokens;
}

export function validateConfig(tokens: string[]): { path: string; limit?: number } {
  if (tokens.length < 2) throw new Error("Missing path argument");
  const path = tokens[1]!;
  let limit: number | undefined;
  for (let i = 2; i < tokens.length; i++) {
    if (tokens[i] === "--limit") {
      const n = Number(tokens[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error("--limit must be positive");
      limit = n;
    }
  }
  return { path, limit };
}

// runner.test.ts — fast, no pi
import { describe, test, expect } from "bun:test";
import { parseArgs, validateConfig } from "./parser";

describe("parseArgs", () => {
  test("splits simple tokens", () => {
    expect(parseArgs("run dataset.json")).toEqual(["run", "dataset.json"]);
  });

  test("handles quoted paths with spaces", () => {
    expect(parseArgs(`run "my data/set.json"`)).toEqual(["run", "my data/set.json"]);
  });

  test("empty string returns empty array", () => {
    expect(parseArgs("")).toEqual([]);
  });
});

describe("validateConfig", () => {
  test("throws on missing path", () => {
    expect(() => validateConfig(["run"])).toThrow("Missing path");
  });

  test("throws on non-positive limit", () => {
    expect(() => validateConfig(["run", "file.json", "--limit", "0"])).toThrow("positive");
  });

  test("parses valid config", () => {
    const cfg = validateConfig(["run", "data.json", "--limit", "5"]);
    expect(cfg).toEqual({ path: "data.json", limit: 5 });
  });
});
```

**What belongs in pure modules:**
- CLI argument parsers
- JSON/data validators and parsers
- Output formatters and summarizers
- Hash/ID generators
- State reducers (given old state + event → new state)
- String transformers (slug, truncate, sanitize)
- Evaluation logic (`expectContains`, `expectRegex`)

**What does NOT belong in pure modules** (stays in index.ts or needs mocks):
- `ctx.ui.*` calls
- `ctx.model` reads
- `pi.exec()` or `readFile()` calls
- `ctx.sessionManager` access
