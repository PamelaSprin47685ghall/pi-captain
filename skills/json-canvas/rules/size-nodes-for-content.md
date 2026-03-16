# Size Nodes Based on Content Length

When writing canvas JSON directly (without the script), choose node dimensions based on content. Incorrectly sized nodes are the most visible rendering issue — text gets clipped or nodes have excessive whitespace.

**Budget ~50 px per line of content.** This is the reliable baseline across label nodes, prose nodes, and list nodes. A `##` heading line counts as ~1.5 lines. Each fenced code block adds ~80 px on top of its line count.

**Width drives wrapping** — a line that fits at 700 px will wrap into 2+ lines at 300 px, making the height too short. Set width first, then calculate height from the actual line count at that width.

## Sizing tiers

| Tier | Width | Height | Use for |
|------|-------|--------|---------|
| Label | 100–250 | 60 | Single word or short phrase — the most common node type |
| Card | 600–700 | 140–160 | `## Heading` + one sentence body (2 lines) |
| Detail | 600–700 | 200–280 | `## Heading` + 3–6 bullet / list lines |
| Block | 400–700 | 280–380 | 7–10 lines: dense lists, multi-step instructions |
| Hero | 700–900 | 240–320 | Intro text with code block; 6–9 lines |

> ⚠️ **The Card tier is the most commonly under-sized.** A `## Heading` line alone is ~50 px, plus one sentence of body wraps to 2 lines at 700 px → 2 × 50 + padding = **140 px minimum**. Using 80–100 px clips the second line.

## Height formula

```
all_lines     = text.splitlines()
blank_count   = count of lines where line.strip() == ""
heading_count = count of lines starting with "##"
code_blocks   = count of ``` pairs

# Blank lines render as small paragraph gaps, not full rows
content_lines = len(all_lines) + 1 - blank_count * 0.7
effective     = content_lines + 0.5 * heading_count + 1.5 * code_blocks
height        = max(60, round(effective * 50))
```

Width: use **600–700 px** for any node with prose or a heading. Use **100–300 px** only for pure labels (single word/phrase, no heading).

## Avoid

```json
{ "type": "text", "width": 400, "height": 80,
  "text": "## native-web-search/\n`web_search` tool -- live internet search via Anthropic beta" }
// 80px clips the second line entirely at 400px width
// Heading alone needs ~50px, body line needs another ~50px = 100px minimum

{ "type": "text", "width": 250, "height": 120,
  "text": "## captain_load\nLoad a preset or .ts pipeline file\ncaptain_run\nExecute pipeline with input\ncaptain_status\nCheck progress and cost" }
// 250px width causes every line to wrap -> 12+ rendered lines -> severe clipping
// Should be width=600, height=300
```

## Prefer

```json
{ "type": "text", "width": 700, "height": 140,
  "text": "## native-web-search/\n`web_search` tool -- live internet search via Anthropic beta" }
// 2 lines * 50px = 100px + heading bonus -> 140px, 700px width prevents wrapping

{ "type": "text", "width": 700, "height": 280,
  "text": "`captain_load`     load a preset or .ts pipeline file\n`captain_run`      execute pipeline with input\n`captain_status`   check progress, tokens, cost\n`captain_list`     list all defined pipelines\n`captain_generate` generate TS pipeline on-the-fly\n`captain_validate` validate pipeline spec" }
// 6 lines * 50px = 300px; 280 works because backtick lines are compact
// 700px width keeps each line on one row

{ "type": "text", "width": 140, "height": 60,
  "text": "User" }
// Single word -> label tier: 140x60
```

## Group sizing

Group bounds are computed from children (see `rules/place-nodes-inside-groups.md`). The only thing to set manually is inner padding: **24–30 px** on each side, **36–40 px** top (to clear the label text). Groups never need an explicit height guess — let the children determine it.
