# pi-captain — TODO & Improvement Backlog

---

## 🏗️ Architecture & Code Quality

- [x] **Split `index.ts`** — 2,111-line god file; break into focused modules (`tools/`, `ui/`, `state/`)
- [x] **Remove or enforce `maxTurns` / `maxTokens`** — currently declared on `Step` but never enforced; enforce via `pi --max-turns` / `pi --max-tokens` or remove to avoid misleading users
- [x] **Audit `OnFail` coverage in executor** — `retryWithDelay` and `warn` are defined in `types.ts` and surfaced in the generator; verify `executor.ts` fully handles them vs. silently falling back

---

## 🧪 Testing — There Are None

- [x] Unit tests for `utils/runnable.ts` — 32 tests covering collectAgentRefs, collectStepLabels, findStepByLabel, statusIcon, containerGateInfo, describeRunnable
- [x] Unit tests for `utils/frontmatter.ts` — 12 tests covering all parsing cases
- [x] Unit tests for `gates.ts` — one test per gate type (none, assert, regex, json, command, file, dir, env, user, multi, timeout, llm)
- [x] Unit tests for `merge.ts` — one test per merge strategy (concat, awaitAll, firstPass, vote, rank, edge cases)
- [x] Integration tests for `executor.ts` — sequential, parallel, pool, gate/onFail, transform, lifecycle callbacks (23 tests, pi SDK fully mocked)
- [x] Mock `pi` subprocess for step execution tests — `mock.module("@mariozechner/pi-coding-agent")` intercepts `createAgentSession`; `mock.module("./worktree.js")` stubs git ops
- [x] Add CI pipeline — `.github/workflows/ci.yml` runs `biome check` + `bun test` on every push/PR

---

## ⚡ Missing Features

- [ ] **Pipeline resume / checkpointing** — persist step results so a failed pipeline can be resumed from where it left off instead of restarting from scratch
- [ ] **Dry-run / preview mode** — `captain_preview` tool that renders the execution plan as a tree without running it
- [ ] **Pre-flight validation** — validate pipeline spec is well-formed before `captain_run` starts; catch typos and schema errors early (`captain_validate` tool or inline check in `captain_run`)
- [ ] **Step-level `timeoutMs`** — a real timeout on individual step execution (not just on gates) to prevent runaway agents from blocking the pipeline

---

## 🔌 Extensibility

- [ ] **Custom merge strategies** — `MergeStrategy` is a closed union; add `{ strategy: "custom"; fn: string }` escape hatch for power users
- [ ] **Custom gate types** — `Gate` is closed; add `{ type: "custom"; fn: string }` for domain-specific validation (e.g. check Postgres row count)
- [ ] **Global step middleware / hooks** — `onBeforeStep` / `onAfterStep` hooks on `ExecutorContext` for logging, metrics, or output caching without forking the executor

---

## 📦 Preset Library

- [ ] `captain:bug-triage` — reproduce → diagnose → fix → verify
- [ ] `captain:doc-sync` — diff code changes → update affected docs → PR
- [ ] `captain:security-audit` — scan → red-team → fix → rescan
- [ ] `captain:migration` — analyze schema → generate migration → test → rollback plan

---

## 📖 Documentation

- [ ] **Add `CHANGELOG.md`** — track what changes between releases
- [ ] **Per-gate examples in README** — runnable end-to-end examples for each gate type (especially the LLM gate)
- [ ] **`examples/` folder** — annotated JSON pipeline files showing real-world patterns (pool vs parallel, gate combos, fallback chains)
- [ ] **Flesh out `skills/captain/SKILL.md`** — prompting patterns, when to use pool vs parallel, gate selection heuristics so the agent is more self-guided

---

## 🔭 Observability

- [ ] **Execution history buffer** — `CaptainDetails` only keeps `lastRun`; store a circular buffer of N recent runs for comparison and replay
- [ ] **Structured telemetry** — emit a structured JSON log of elapsed times, retry counts, gate failures per run for post-run analysis

---

## 🎯 Quick Wins

- [ ] Export `types.ts` as a public package entrypoint so users can type their JSON pipelines
- [ ] Add `captain_clone` tool — duplicate a pipeline under a new name (common workflow)
- [ ] `captain_list` should show last-run status and elapsed time, not just structure
- [ ] Validate `agent` name against known agents at pipeline-define time for better error messages
