---
name: json-canvas
description: >
  JSON Canvas format for creating and editing Obsidian .canvas files
  programmatically. Covers text, group, file, and link node types; edge
  connections with side references; unique ID generation; color presets;
  and layout strategies. Use when working with any .canvas file: creating
  diagrams, flowcharts, mind maps, or kanban boards; adding/removing nodes
  while preserving IDs; positioning nodes inside groups; wiring edges with
  correct fromSide/toSide values; applying color presets for visual hierarchy;
  or generating canvas files programmatically via the generation script.
---

# JSON Canvas

## Script Suite

Three scripts live in `scripts/`:

| Script | Purpose | Key options |
|--------|---------|-------------|
| `generate-canvas.py` | Generate a new `.canvas` from an intermediate JSON description | `--layout`, `--direction`, `--spacing` |
| `validate-canvas.py` | Check a `.canvas` file for 18 structural, reference, geometry, and content issues | `--json` (machine output), `-q` (quiet) |
| `fix-canvas.py` | Auto-repair geometry and spec issues in-place (creates `.bak`) | `--dry-run`, `-o FILE` |

**Recommended workflow**:
```
# Generate → validate → fix if needed
python3 scripts/generate-canvas.py input.json -o out.canvas
python3 scripts/validate-canvas.py out.canvas
python3 scripts/fix-canvas.py out.canvas --dry-run   # preview fixes
python3 scripts/fix-canvas.py out.canvas             # apply fixes (saves .bak)
python3 scripts/validate-canvas.py out.canvas        # confirm clean
```

**What `validate-canvas.py` checks**:
- `S` Structure: JSON validity, required fields, valid type/color/side/end values, positive dimensions
- `R` References: no duplicate IDs, edge refs point to real nodes, 16-char hex IDs
- `G` Geometry: group z-order (groups before children), children overflow bounds, empty groups, exact overlaps
- `C` Content: text too tall for content estimate, Unicode in fenced code blocks

**What `fix-canvas.py` repairs** (F1–F9):
- `F1/F2` Missing or duplicate IDs (regenerates, updates edge refs)
- `F3` Group z-order (moves groups before their children)
- `F4` Group bounds (expands groups that don't fully contain their children — never shrinks)
- `F5` Edge sides (recomputes `fromSide`/`toSide` from centre-to-centre vector)
- `F6` Edge ends (adds `toEnd:"arrow"` when both end fields absent)
- `F7` Node min-size (ensures width/height ≥ 60px)
- `F8` Text node height (expands when < 60% of content estimate)
- `F9` Unicode in code blocks (replaces with ASCII equivalents)

---

## Two-Pass Architecture

This skill uses a **two-pass approach** for canvas generation:

1. **You decide** (semantic): what nodes to create, their content, which layout strategy to use, color assignments, and group membership. Output a lightweight intermediate JSON.
2. **The script computes** (deterministic): unique hex IDs, pixel coordinates from the chosen layout algorithm, group bounds from children, node sizes from content length, edge sides from relative positions, z-index ordering. Run `scripts/generate-canvas.py`.

For simple canvases (< 5 nodes), you can skip the script and write `.canvas` JSON directly using the spec below. For anything larger, always use the script.

### Intermediate Format

Pass this JSON to `scripts/generate-canvas.py`:

```json
{
  "layout": "grid",
  "nodes": [
    { "content": "## Module A\n\nHandles auth and sessions", "color": "4" },
    { "content": "## Module B\n\nHandles data processing", "color": "5" },
    { "content": "## Shared Utils\n\nUsed by both modules", "color": "6" }
  ],
  "edges": [
    { "from": 0, "to": 2, "label": "imports" },
    { "from": 1, "to": 2, "label": "imports" }
  ]
}
```

The script outputs valid `.canvas` JSON with computed IDs, coordinates, sizing, and edge routing. See `scripts/generate-canvas.py --help` for all options.

### Intermediate Format Reference

**Node fields**: `content` (string, required), `type` (text|group|file|link, default "text"), `color` ("1"-"6" or hex), `group` (index of parent group node), `file` (vault path for file nodes), `url` (for link nodes), `label` (for group nodes), `width`/`height` (override auto-sizing).

**Edge fields**: `from` (node index), `to` (node index), `label` (optional annotation), `bidirectional` (boolean, adds arrows on both ends).

**Layout options**: `"grid"`, `"tree"`, `"layered"`, `"radial"`, `"manual"`. See `rules/choose-layout-strategy.md`.

**Top-level options**: `layout` (string), `direction` ("TB"|"BT"|"LR"|"RL", default "TB"), `spacing` (number, override default gaps).


## Core Concepts

**Canvas Structure**: A .canvas file is JSON with two top-level arrays: `nodes` and `edges`. Nodes are ordered by z-index -- first node renders at the bottom, last at the top. Place group nodes before their children so children render on top.

```json
{
  "nodes": [
    { "id": "a1b2c3d4e5f6g7h8", "type": "group", "x": -220, "y": -20, "width": 440, "height": 340, "color": "4", "label": "MY GROUP" },
    { "id": "c3d4e5f6g7h8i9j0", "type": "text", "x": -200, "y": 10, "width": 400, "height": 280, "text": "## Content\n\nInside the group" }
  ],
  "edges": [
    { "id": "e1f2a3b4c5d6e7f8", "fromNode": "c3d4e5f6g7h8i9j0", "toNode": "d4e5f6g7h8i9j0k1", "toEnd": "arrow" }
  ]
}
```

**Node Types**: `text` (markdown content, most common), `group` (visual container with `label`, optional `background`/`backgroundStyle`), `file` (vault-relative path via `file` property, optional `subpath`), `link` (URL via `url` property).

- **`file` subpath format**: `#heading-name` links to a heading; `#^block-id` links to a block reference. Example: `"subpath": "#^b6e0ad"` or `"subpath": "#Introduction"`.
- **`group` background**: `"background": "path/to/image.png"` fills the group with an image. Real-world use: iceberg diagram with photo as group background, text nodes floating on top.
- **Colors are optional** — 28% of real-world canvases use no colors at all. Use color to add semantic hierarchy; don't add it just to add it.

**Color Presets**: Numeric strings `"1"` through `"6"` map to actual colors. Hex strings (e.g., `"#FF0000"`) are also valid.

| Preset | Color | Suggested use |
|--------|-------|---------------|
| `"1"` | Red | Titles, headers, warnings |
| `"2"` | Orange | Commands, actions, processes |
| `"3"` | Yellow | Outputs, highlights, notes |
| `"4"` | Green | Module groups, success states |
| `"5"` | Cyan | Secondary modules, data flows |
| `"6"` | Purple | Shared layers, abstractions |

Assign colors by semantic role, not arbitrarily. Use `## Title` (not `# Title`) in text nodes -- `#` renders very large and wastes vertical space.

**⚠ Code Block Content Must Be ASCII-Only**: Unicode characters (em dash `—`, arrows `→`, emoji, curly quotes) inside a fenced code block cause VSCode canvas extensions to show "Error parsing" on that node. Unicode is fine in prose, headings, and bullet points — only the content *between* ` ``` ` fences must be ASCII. Use `--` for em dash, `->` for arrows, `...` for ellipsis. See `rules/code-block-ascii-only.md`.

**Node Sizing Tiers** — budget **~50 px per line**. Set width first (it drives wrapping), then calculate height from the actual line count at that width:

| Tier | Width | Height | Use for |
|------|-------|--------|---------|
| Label | 100–250 | 60 | Single word or short phrase — no heading |
| Card | 600–700 | 140–160 | `## Heading` + one sentence body (2 lines) — **most common content node** |
| Detail | 600–700 | 200–280 | `## Heading` + 3–6 bullet or list lines |
| Block | 400–700 | 280–380 | 7–10 lines: dense lists, multi-step instructions |
| Hero | 700–900 | 240–320 | Intro node with prose + code block |

⚠️ **Card tier is the most under-sized mistake**: `## Heading` alone is ~50 px, one body sentence adds another ~50 px → minimum **140 px**. Using 80–100 px clips the second line.

Formula: blank lines count as 0.3 lines (paragraph gap, not a full row), `##` headings add 0.5 lines, each code block adds 1.5 lines — then `height = max(60, effective_lines × 50)`. Use **600–700 px width** for any node with prose or a heading; **100–300 px** only for pure labels. See `rules/size-nodes-for-content.md`.

**Edge Defaults**: Per the [spec](https://jsoncanvas.org/spec/1.0/), `fromEnd` defaults to `"none"` and `toEnd` defaults to `"arrow"`. Omitting both produces a standard directional arrow. `fromSide`/`toSide` are optional -- when omitted, Obsidian auto-routes. Set them explicitly only for structured layouts. `fromEnd: "arrow"` (bidirectional) is rare in real files — only ~0.3% of edges use it.

Edges support `color` (same preset/hex as nodes) to visually group edge types. `styleAttributes: {"path": "short-dashed"}` makes a dashed line; omit or use `{}` for solid.

```json
{ "id": "e1a2b3c4d5e6f7g8", "fromNode": "nodeA", "toNode": "nodeB" }
{ "id": "e2b3c4d5e6f7g8h9", "fromNode": "nodeA", "toNode": "nodeB", "fromEnd": "arrow", "toEnd": "arrow", "label": "bidirectional" }
{ "id": "e3c4d5e6f7g8h9i0", "fromNode": "nodeA", "toNode": "nodeB", "color": "5", "label": "Forward Ref", "styleAttributes": {"path": "short-dashed"} }
```

**Kanban Pattern** (no edges needed): Represent a kanban board as columns of text nodes. Use a header node per column (with `### \`Column Name\`` markdown) and card nodes below it. Color encodes status — a common convention from real files:

| Color | Typical kanban meaning |
|-------|----------------------|
| `"4"` green | Sprint ready / To Do |
| `"3"` yellow | In Progress |
| `"2"` orange | Doing / Active |
| `"1"` red | Blocked / Urgent |
| `"5"` cyan | Backlog |

No edges are needed — spatial position communicates the column membership. See `rules/choose-layout-strategy.md` for manual layout.


## Quick Reference

| Element | Required Fields | Optional Fields |
|---------|----------------|-----------------|
| Text node | `id`, `type`, `x`, `y`, `width`, `height`, `text` | `color` |
| Group node | `id`, `type`, `x`, `y`, `width`, `height` | `color`, `label`, `background`, `backgroundStyle` |
| File node | `id`, `type`, `x`, `y`, `width`, `height`, `file` | `color`, `subpath` |
| Link node | `id`, `type`, `x`, `y`, `width`, `height`, `url` | `color` |
| Edge | `id`, `fromNode`, `toNode` | `fromSide`, `toSide`, `fromEnd`, `toEnd`, `label`, `color`, `styleAttributes`, `fromFloating`, `toFloating` |
| Side values | `"top"`, `"bottom"`, `"left"`, `"right"` | |
| Color values | Presets: `"1"` red, `"2"` orange, `"3"` yellow, `"4"` green, `"5"` cyan, `"6"` purple | Hex: `"#RRGGBB"` |
| End values | `"none"`, `"arrow"` | Defaults: `fromEnd`=none, `toEnd`=arrow |
| Background styles | `"cover"`, `"ratio"`, `"repeat"` | For group `backgroundStyle` |
| Edge path styles | `styleAttributes: {"path": "short-dashed"}` | Dashed edge style; `{}` = solid (default) |
| Floating anchors | `fromFloating: false` / `toFloating: false` | When set alongside explicit `fromSide`/`toSide`, pins the anchor to center of that side rather than letting it slide |
| File subpath | `#heading-name` or `#^block-id` | Links to a heading or block ref within the file |
| Edge labels | Any string, may contain `\n` for multi-line | Rendered as a label mid-edge |


## Reference Files

Consult these when you need specific guidance:

- `rules/generate-unique-ids.md` -- when creating canvas JSON directly (without the script) and need collision-free IDs
- `rules/choose-layout-strategy.md` -- when deciding which layout algorithm to use for the canvas
- `rules/size-nodes-for-content.md` -- when sizing nodes manually or overriding script auto-sizing
- `rules/place-nodes-inside-groups.md` -- when computing group bounds from children or nesting groups
- `rules/connect-edges-by-side.md` -- when setting explicit edge attachment sides for structured layouts
- `rules/layout-for-readability.md` -- when fine-tuning spacing, alignment, or layout after script generation
- `rules/update-canvases-safely.md` -- when modifying an existing canvas without breaking edge references
- `rules/code-block-ascii-only.md` -- **always apply**: fenced code blocks must contain only ASCII characters; Unicode (em dashes, arrows, emoji, curly quotes) inside a ` ``` ` fence causes parse errors in VSCode canvas extensions
- `scripts/validate-canvas.py` -- validate any `.canvas` file (18 checks, exit 1 on errors)
- `scripts/fix-canvas.py` -- auto-repair geometry/spec issues (F1–F9, always creates `.bak`)
