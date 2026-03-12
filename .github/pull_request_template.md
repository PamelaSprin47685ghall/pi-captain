# Pull Request

## Linked issue / spec
<!-- Every PR must trace back to an issue or spec. No link = no merge. -->
Closes #

## What changed and why
<!-- Describe the intent, not the diff. -->

## Checklist

### Code quality
- [ ] `bun run typecheck` passes locally
- [ ] `bun run check` (Biome) passes with no errors
- [ ] No file in `extensions/` or `skills/` exceeds 200 lines (`bun run line-limit`)
- [ ] All new `.test.ts` files are co-located next to their source file

### Tests
- [ ] New behaviour is covered by tests
- [ ] `bun test extensions/` passes locally
- [ ] Coverage stays at or above **80%**

### Design
- [ ] Business logic lives in pure functions (Functional Core / Imperative Shell)
- [ ] Errors are typed `Result<T, E>` values — no bare `try/catch` swallowing exceptions
- [ ] No secrets, tokens, or credentials committed (use env vars)
- [ ] Prompts live in versioned `.md` files — no inline prompt strings in source

### Docs
- [ ] `README.md` updated if public API or usage changed
- [ ] Canvas / diagram updated if architecture changed
