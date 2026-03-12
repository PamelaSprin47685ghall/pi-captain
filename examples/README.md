# Captain Examples

Sample pipelines, steps, gates, transforms, and merge functions to copy and remix.  
These are **not** part of the captain engine — they are reference implementations that
show what's possible. You are not limited to the built-in presets: anything that
matches the type signature works.

## Structure

```
examples/
├── steps/              Reusable step definitions (one atomic LLM call each)
├── pipelines/          Full pipeline definitions (compose steps into workflows)
│
├── custom-gate.ts      Custom Gate examples  — word-count, JSON validity, TS compile…
├── custom-transform.ts Custom Transform examples — strip fences, reshape JSON, shell post-process…
└── custom-merge.ts     Custom MergeFn examples — dedup lines, majority vote, LLM synthesis…
```

## Built-in presets vs. custom functions

Captain ships a handful of presets for the most common patterns:

| Concept | Built-in presets | Where to look |
|---|---|---|
| `Gate` | `command`, `file`, `regexCI`, `user`, `allOf`, `llmFast` | `gates/` |
| `OnFail` | `retry`, `retryWithDelay`, `skip`, `warn`, `fallback` | `gates/on-fail.ts` |
| `Transform` | `full`, `extract`, `summarize` | `transforms/presets.ts` |
| `MergeFn` | `concat`, `awaitAll`, `firstPass`, `vote`, `rank` | `merge.ts` |

**You are not stuck with these.** Every concept is just a typed function — write your
own inline or in a shared file, no registration needed:

```ts
// inline custom gate — just a function
const gate: Gate = ({ output }) =>
  output.includes("LGTM") ? true : "Missing LGTM approval";

// inline custom transform
const transform: Transform = ({ output, original }) =>
  `Context: ${original}\n\nResult: ${output}`;

// inline custom merge
const merge: MergeFn = (outputs) => outputs.join("\n---\n");
```

## How to use the examples

1. **Browse** `examples/pipelines/` for a full workflow close to your use case.
2. **Copy** it to `.pi/pipelines/` in your project.
3. **Swap** steps, gates, or transforms from `custom-gate.ts` / `custom-transform.ts` / `custom-merge.ts`.
4. **Load** it: `captain_load` → action `load` → name or file path.

All sample files import from `../../extensions/captain/` — adjust the path to wherever
the captain extension is installed (e.g. `~/.pi/agent/extensions/captain/`).

## Public API barrel

Prefer the public barrel over deep relative paths:

```ts
import {
  retry, full, bunTest, concat,
  type Step, type Gate, type Transform, type MergeFn, type Runnable
} from "/path/to/extensions/captain/index.public.js";
```
