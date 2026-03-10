# Gates — Reusable Validation Factories

Parameterized gate and failure-handling constructors for Captain pipelines.
Import from `gates/index.js` into any `.ts` pipeline or step definition.

```ts
import { command, bunTest, outputMinLength, none, allOf, httpOk, regex } from "../gates/index.js";
import { retry, retryWithDelay, skip, warn, fallback } from "../gates/index.js";
```

---

## Gate Factories

Gates validate step or composition node output. A gate either **passes** or **fails**.

### Atomic Gates

| Export | Type | Params | Description |
|--------|------|--------|-------------|
| `none` | constant | — | Always passes. No validation. |
| `user` | constant | — | Human approval via UI confirm dialog. |
| `command(cmd)` | function | `cmd: string` | Run a shell command. Exit 0 = pass. |
| `file(path)` | function | `path: string` | Check file exists (relative to cwd). |
| `dir(path)` | function | `path: string` | Check directory exists (relative to cwd). |
| `assert(expr)` | function | `expr: string` | Evaluate a JS expression against `output`. |

```ts
// Examples
gate: none
gate: user
gate: command("bun test")
gate: file("dist/index.js")
gate: dir("dist")
gate: assert("output.length > 50 && output.includes('done')")
```

### String / Content Gates

Higher-level factories that build `assert` gates from common patterns.

| Export | Params | Description |
|--------|--------|-------------|
| `outputIncludes(s)` | `s: string` | Output contains string (case-sensitive). |
| `outputIncludesCI(s)` | `s: string` | Output contains string (case-insensitive). |
| `outputMinLength(n)` | `n: number` | Output is at least N characters long. |

```ts
gate: outputIncludes("SUCCESS")
gate: outputIncludesCI("file")
gate: outputMinLength(100)
```

### Regex Gates

Match output against regular expression patterns.

| Export | Params | Description |
|--------|--------|-------------|
| `regex(pattern, flags?)` | `pattern: string, flags?: string` | Output must match regex. |
| `regexCI(pattern)` | `pattern: string` | Case-insensitive regex match. |
| `regexExcludes(pattern)` | `pattern: string` | Output must NOT match regex. |

```ts
gate: regex("\\d+ tests? passed")           // match a test count
gate: regexCI("success|completed")           // case-insensitive alternatives
gate: regex("^\\{.*\\}$", "s")              // output looks like JSON (dotall flag)
```

### JSON Gates

Validate output as JSON with optional shape checking.

| Export | Params | Description |
|--------|--------|-------------|
| `jsonValid` | constant | Output must be valid JSON. |
| `jsonHasKeys(...keys)` | `...keys: string[]` | Valid JSON with required top-level keys. |

```ts
gate: jsonValid                              // just valid JSON
gate: jsonHasKeys("id", "name", "status")    // valid JSON with those keys present
```

### HTTP / Service Gates

Check network endpoints and running services.

| Export | Params | Description |
|--------|--------|-------------|
| `httpOk(url)` | `url: string` | GET returns 200. |
| `httpStatus(url, status, method?)` | `url, status, method?` | Check specific HTTP status. |
| `httpPostOk(url)` | `url: string` | POST returns 200. |
| `portListening(port, host?)` | `port: number, host?: string` | TCP port is open. |
| `dockerRunning(name)` | `name: string` | Docker container is running. |

```ts
gate: httpOk("http://localhost:3000/health")
gate: httpStatus("http://localhost:3000/api", 201, "POST")
gate: portListening(5432)                    // postgres is up
gate: dockerRunning("my-redis")
```

### Combinator Gates

Compose multiple gates with boolean logic. Infinitely nestable.

| Export | Params | Description |
|--------|--------|-------------|
| `allOf(...gates)` | `...gates: Gate[]` | All sub-gates must pass (AND). |
| `anyOf(...gates)` | `...gates: Gate[]` | At least one must pass (OR). |

```ts
// All must pass: tests + typecheck + build artifact
gate: allOf(bunTest, bunTypecheck, distExists)

// At least one health endpoint must be up
gate: anyOf(httpOk("http://localhost:3000"), httpOk("http://localhost:3001"))

// Nested: (tests pass AND (server is up OR build exists))
gate: allOf(bunTest, anyOf(httpOk("http://localhost:3000"), distExists))
```

### Environment Gates

Check environment variable state.

| Export | Params | Description |
|--------|--------|-------------|
| `envSet(name)` | `name: string` | Env var is set and non-empty. |
| `envEquals(name, value)` | `name, value: string` | Env var equals a specific value. |
| `prodEnv` | constant | `NODE_ENV === "production"`. |

```ts
gate: envSet("DATABASE_URL")
gate: envEquals("NODE_ENV", "test")
gate: prodEnv
```

### Timeout Wrapper

Wrap any gate with a time limit.

| Export | Params | Description |
|--------|--------|-------------|
| `withTimeout(gate, ms)` | `gate: Gate, ms: number` | Fails if gate takes longer than ms. |

```ts
gate: withTimeout(httpOk("http://localhost:3000"), 5000)  // 5s max
gate: withTimeout(bunTest, 30000)                          // 30s test timeout
gate: withTimeout(allOf(bunTest, bunTypecheck), 60000)     // 1min for full CI
```

### Git Gates

Validate git repository state.

| Export | Params | Description |
|--------|--------|-------------|
| `gitClean` | constant | Working directory has no uncommitted changes. |
| `gitBranch(name)` | `name: string` | Current branch matches name. |
| `noConflicts` | constant | No merge conflict markers in source files. |

```ts
gate: gitClean
gate: gitBranch("main")
gate: noConflicts
```

### Chained Command Gates

Run multiple shell commands — all must pass.

| Export | Params | Description |
|--------|--------|-------------|
| `commandAll(...cmds)` | `...cmds: string[]` | Join commands with `&&`. All must exit 0. |

```ts
gate: commandAll("bun test", "bunx tsc --noEmit", "bun run lint")
```

### Preset Constants

Pre-built gates for common CI tasks. Zero configuration.

| Export | Equivalent | Description |
|--------|------------|-------------|
| `bunTest` | `command("bun test")` | Run bun test suite. |
| `bunTypecheck` | `command("bunx tsc --noEmit")` | TypeScript type checking. |
| `bunLint` | `command("bun run lint")` | Run linter. |
| `distExists` | `file("dist/index.js")` | Build output exists. |
| `distDirExists` | `dir("dist")` | Build directory exists. |
| `nodeModulesExists` | `dir("node_modules")` | Dependencies installed. |
| `testAndTypecheck` | `commandAll(...)` | Tests + types in one gate. |
| `fullCI` | `commandAll(...)` | Test + typecheck + lint. |
| `prodReady` | `allOf(...)` | Tests + typecheck + build artifact. |

```ts
gate: bunTest
gate: fullCI
gate: prodReady
gate: apiReady("http://localhost:3000/health")
```

---

## OnFail Strategies

What to do when a gate fails. Works on both individual steps and composition nodes.

| Export | Type | Params | Description |
|--------|------|--------|-------------|
| `retry(max?)` | function | `max: number` (default 3) | Re-run the scope up to N times. |
| `retryWithDelay(delayMs, max?)` | function | `delayMs: number, max?: number` | Retry with a pause between attempts. |
| `skip` | constant | — | Mark as skipped, pass empty `$INPUT` downstream. |
| `warn` | constant | — | Log warning but pass through output (non-blocking). |
| `fallback(step)` | function | `step: Step` | Run an alternative step instead. |

```ts
onFail: retry(2)                    // retry up to 2 times
onFail: retry()                     // retry up to 3 times (default)
onFail: retryWithDelay(2000, 3)     // retry 3x with 2s delay (rate limits, flaky services)
onFail: skip                        // skip and continue
onFail: warn                        // gate failed? log it, keep going
onFail: fallback(myStep)            // run myStep as a replacement
```

### When to use `warn` vs `skip`

- **`warn`**: Gate failed but the output is still useful — pass it through. Good for
  advisory gates (e.g., lint warnings, optional type checks).
- **`skip`**: Gate failed and the output is unreliable — discard it. Good for mandatory
  validation where downstream steps can't use bad input.

### When to use `retryWithDelay` vs `retry`

- **`retry`**: Immediate retry, good for LLM flakiness or deterministic fixes.
- **`retryWithDelay`**: Delayed retry, good for rate limits, service startup, or external APIs.

---

## Scope Rules

Gates can be attached at two levels:

### Step-level (required)

Validates a single agent invocation. On retry, re-runs that one step with failure feedback.

```ts
const buildStep: Step = {
  kind: "step",
  label: "Build",
  model: "sonnet",
  tools: ["read", "bash", "edit", "write"],
  prompt: "...",
  gate: allOf(bunTest, bunTypecheck),   // ← both must pass
  onFail: retry(2),
  transform: full,
};
```

### Composition-level (optional)

Validates the final/merged output of a `sequential`, `pool`, or `parallel` node.
On retry, **re-runs the entire scope** — that's the key difference.

```ts
// Gate a whole sequence with a timeout — retry all steps if tests fail at the end
const pipeline: Sequential = {
  kind: "sequential",
  steps: [planStep, buildStep, testStep],
  gate: withTimeout(bunTest, 30000),
  onFail: retry(2),
};

// Gate merged parallel output — tests + server health
const impl: Parallel = {
  kind: "parallel",
  steps: [frontendStep, backendStep],
  merge: { strategy: "concat" },
  gate: allOf(bunTest, httpOk("http://localhost:3000/health")),
  onFail: retryWithDelay(3000, 2),
};

// Gate a pool — output must be valid JSON with specific keys
const brainstorm: Pool = {
  kind: "pool",
  step: solveStep,
  count: 3,
  merge: { strategy: "vote" },
  gate: jsonHasKeys("solution", "confidence"),
  onFail: retry(2),
};
```

---

## Composing Complex Gates

Gates can be nested arbitrarily deep for sophisticated validation:

```ts
// Production deploy gate: everything must pass, with a 2 minute timeout
const deployGate = withTimeout(
  allOf(
    bunTest,                                           // tests pass
    bunTypecheck,                                      // types check
    gitClean,                                          // no uncommitted changes
    gitBranch("main"),                                 // on main branch
    noConflicts,                                       // no merge conflicts
    distExists,                                        // build artifact exists
    httpOk("http://localhost:3000/health"),             // server responds
    envEquals("NODE_ENV", "production"),                // correct env
    jsonValid,                                         // output is valid JSON
    regex("\"version\":\\s*\"\\d+\\.\\d+\\.\\d+\""),   // has semver
  ),
  120000,  // 2 minute timeout for the whole check
);

// Flexible API gate: at least one endpoint must be healthy
const apiGate = anyOf(
  httpOk("http://localhost:3000/api/v1/health"),
  httpOk("http://localhost:3000/api/v2/health"),
  httpOk("http://localhost:3001/health"),
);
```

---

## Writing Custom Gate Factories

Add new factories to `presets.ts`. A gate factory is just a function that returns a `Gate` object:

```ts
import type { Gate } from "../types.js";

/** Output matches a semver pattern */
export function hasSemver(): Gate {
  return regex("\\d+\\.\\d+\\.\\d+");
}

/** Check a specific endpoint returns 200 with timeout */
export function healthCheck(url: string, timeoutMs: number = 5000): Gate {
  return withTimeout(httpOk(url), timeoutMs);
}

/** Full deploy readiness */
export function deployReady(healthUrl: string): Gate {
  return allOf(bunTest, bunTypecheck, gitClean, httpOk(healthUrl));
}
```

Then export from `index.ts` and use anywhere:

```ts
import { healthCheck, deployReady } from "../gates/index.js";

const deployStep: Step = {
  ...
  gate: deployReady("http://localhost:3000/health"),
  onFail: retryWithDelay(5000, 3),
};
```
