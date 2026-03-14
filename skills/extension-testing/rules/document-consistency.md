# Write document-consistency tests to keep markdown in sync with code

Extensions often ship with documentation (README, SKILL.md, API tables). These drift silently as code evolves — tests catch it. The pattern from `contributing.test.ts` and `readme.test.ts` in pi-research is the reference: read both the markdown and the actual files, then assert they agree.

Use this pattern when: your extension has a SKILL.md listing commands or tools, a README documenting the dataset shape, or a table of API methods that must match the actual implementation.

## Avoid

```markdown
<!-- README.md - updated by hand, drifts over time -->
## Commands
- `/run` — run the dataset
- `/compare` — compare variants
- `/init` — create a sample dataset
```

No test verifies these commands actually exist in the extension. After a refactor, `/compare` is renamed to `/diff` but the README still says `/compare`.

## Prefer

```typescript
// docs.test.ts
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const README = readFileSync(join(ROOT, "README.md"), "utf-8");

// ─── README matches extension source ─────────────────────────────────────────

describe("README.md — command documentation", () => {
  test("documents all registered commands", () => {
    // Commands registered in the extension source
    const registered = ["run", "compare", "init"];
    for (const cmd of registered) {
      expect(README).toContain(`/${cmd}`);
    }
  });

  test("dataset JSON shape in README matches actual sample", async () => {
    // README documents the dataset shape — verify required fields are mentioned
    expect(README).toContain('"cases"');
    expect(README).toContain('"input"');
    expect(README).toContain('"expectContains"');
    expect(README).toContain('"expectRegex"');
  });
});

// ─── SKILL.md matches extension API ──────────────────────────────────────────

describe("SKILL.md — trigger description completeness", () => {
  const SKILL = readFileSync(join(ROOT, "SKILL.md"), "utf-8");

  test("SKILL.md exists", () => {
    expect(existsSync(join(ROOT, "SKILL.md"))).toBe(true);
  });

  test("description is 100+ words", () => {
    const descMatch = SKILL.match(/description: >\n([\s\S]*?)^---/m);
    const words = (descMatch?.[1] ?? "").trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(100);
  });

  test("all rule files referenced in SKILL.md exist", () => {
    const refs = [...SKILL.matchAll(/`rules\/([^`]+)`/g)].map(m => m[1]);
    for (const ref of refs) {
      expect(existsSync(join(ROOT, "rules", ref!))).toBe(true);
    }
  });
});

// ─── Configuration stays in sync ─────────────────────────────────────────────

describe("biome.json — code style consistency", () => {
  test("indent style is tabs (matches README claim)", () => {
    const biome = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf-8"));
    expect(biome.formatter.indentStyle).toBe("tab");
    expect(README).toContain("tab");
  });
});

// ─── Helpers for extracting markdown structure ────────────────────────────────

/** Extract all headings at a specific level */
function headings(md: string, level: number): string[] {
  const prefix = "#".repeat(level) + " ";
  return md.split("\n")
    .filter(l => l.startsWith(prefix) && !l.startsWith(prefix + "#"))
    .map(l => l.slice(prefix.length).trim());
}

/** Verify no broken internal anchor links */
function checkAnchors(md: string): void {
  const anchors = [...md.matchAll(/\(#([^)]+)\)/g)].map(m => m[1]);
  const allHeadings = [...headings(md, 1), ...headings(md, 2), ...headings(md, 3)]
    .map(h => h.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, "-"));
  for (const anchor of anchors) {
    expect(allHeadings).toContain(anchor!);
  }
}

describe("README.md — markdown hygiene", () => {
  test("no broken anchor links", () => checkAnchors(README));

  test("all fenced code blocks are closed", () => {
    const count = (README.match(/^```/gm) ?? []).length;
    expect(count % 2).toBe(0);
  });

  test("file ends with newline", () => {
    expect(README.endsWith("\n")).toBe(true);
  });

  test("no 3+ consecutive blank lines", () => {
    expect(README).not.toMatch(/\n{4,}/);
  });
});
```

**When to add document-consistency tests:**
- When your extension ships a SKILL.md — verify all referenced rule files exist
- When your README documents commands or tools — verify the names match the extension source
- When your extension has a config file (biome.json, tsconfig.json) referenced in docs — verify the actual values match
- When your extension's README lists event names or API method names — extract them and check they appear in the actual extension file

**What NOT to test:**
- Prose quality or grammar — subjective, unstable
- Screenshot accuracy — impossible
- Anything that requires running pi — put that in smoke tests instead
