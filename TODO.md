# pi-captain — TODO & Improvement Backlog

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
