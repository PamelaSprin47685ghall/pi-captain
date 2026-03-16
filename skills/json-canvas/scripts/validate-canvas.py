#!/usr/bin/env python3
"""Validate an Obsidian .canvas file for correctness.

Usage:
    python3 validate-canvas.py file.canvas
    python3 validate-canvas.py file.canvas --json        # machine-readable output
    python3 validate-canvas.py *.canvas                  # batch validate
    cat file.canvas | python3 validate-canvas.py -       # from stdin

Exit code:
    0  no errors (warnings may still exist)
    1  one or more errors found
    2  file could not be parsed

Checks performed:
  STRUCTURE  S1  Valid JSON
             S2  Top-level "nodes" and "edges" arrays exist
             S3  Each node has required base fields (id, type, x, y, width, height)
             S4  Each node has type-specific required fields
             S5  Valid type value (text | group | file | link)
             S6  Positive width and height on every node
             S7  Valid color value when present ("1"-"6" or #RRGGBB)
             S8  Valid side values on edges (top|bottom|left|right)
             S9  Valid end values on edges (none|arrow)

  REFERENCES R1  No duplicate node IDs
             R2  No duplicate edge IDs
             R3  All edge fromNode/toNode reference existing node IDs
             R4  16-character hex IDs (warning if not)

  GEOMETRY   G1  Group nodes appear before any of their contained children (z-order)
             G2  Nodes whose center lies inside a group are contained by it (no overflow)
             G3  Groups have at least one child contained (empty group warning)
             G4  No two nodes have identical (x, y, width, height) — exact overlap

  CONTENT    C1  Text node content fits the node height (heuristic)
             C2  Unicode characters inside fenced code blocks (warning)
"""

import json
import re
import sys
import os
import argparse
from dataclasses import dataclass, field
from typing import Optional


# ──────────────────────────── data structures ────────────────────────────────

@dataclass
class Issue:
    code: str          # e.g. "G2"
    severity: str      # "error" | "warning"
    message: str
    node_id: Optional[str] = None
    edge_id: Optional[str] = None

    def label(self):
        icon = "✖" if self.severity == "error" else "⚠"
        target = f" [node {self.node_id}]" if self.node_id else ""
        target += f" [edge {self.edge_id}]" if self.edge_id else ""
        return f"  {icon} {self.code}{target}  {self.message}"


# ──────────────────────────── helpers ────────────────────────────────────────

HEX_RE = re.compile(r'^[0-9a-f]{16}$')
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
VALID_COLORS = {"1", "2", "3", "4", "5", "6"}
VALID_SIDES = {"top", "bottom", "left", "right"}
VALID_ENDS = {"none", "arrow"}
VALID_TYPES = {"text", "group", "file", "link"}


def rect_contains_center(r, node):
    """True if node's centre point lies strictly inside rect r."""
    cx = node["x"] + node["width"] / 2
    cy = node["y"] + node["height"] / 2
    return (r["x"] < cx < r["x"] + r["width"] and
            r["y"] < cy < r["y"] + r["height"])


def rect_overlaps(a, b):
    """True if two rectangles overlap (not just touch)."""
    return (a["x"] < b["x"] + b["width"] and
            a["x"] + a["width"] > b["x"] and
            a["y"] < b["y"] + b["height"] and
            a["y"] + a["height"] > b["y"])


def estimate_min_height(text: str) -> int:
    """Estimate minimum comfortable height: ~50px per line, ## adds 0.5 lines, code blocks add ~80px."""
    all_lines = text.splitlines()
    heading_count = sum(1 for l in all_lines if l.startswith("##"))
    blank_count   = sum(1 for l in all_lines if l.strip() == "")
    code_blocks   = len(re.findall(r"```", text)) // 2
    content_lines = len(all_lines) + 1 - blank_count * 0.7
    effective = content_lines + 0.5 * heading_count + 1.5 * code_blocks
    return max(60, round(effective * 50))


def find_unicode_in_code_blocks(text: str):
    """Return list of (block_index, char, codepoint) for non-ASCII in code blocks."""
    hits = []
    for i, block in enumerate(re.findall(r"```[^\n]*\n(.*?)```", text, re.DOTALL)):
        for ch in block:
            if ord(ch) > 127:
                hits.append((i, ch, f"U+{ord(ch):04X}"))
    return hits


# ──────────────────────────── validators ─────────────────────────────────────

def validate(data: dict) -> list[Issue]:
    issues: list[Issue] = []

    nodes = data.get("nodes", [])
    edges = data.get("edges", [])

    # ── S2: top-level arrays ──────────────────────────────────────────────────
    if "nodes" not in data:
        issues.append(Issue("S2", "error", 'Missing top-level "nodes" array'))
    if "edges" not in data:
        issues.append(Issue("S2", "error", 'Missing top-level "edges" array'))
    if "nodes" not in data or "edges" not in data:
        return issues  # can't continue without structure

    # ── Collect node IDs for reference checks ────────────────────────────────
    seen_node_ids: dict[str, int] = {}  # id → first index
    node_map: dict[str, dict] = {}

    # ── S3/S4/S5/S6/S7 per node ──────────────────────────────────────────────
    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            issues.append(Issue("S3", "error", f"nodes[{idx}] is not an object"))
            continue

        nid = node.get("id", f"<missing id @ index {idx}>")

        # S3: base fields
        for field_name in ("id", "type", "x", "y", "width", "height"):
            if field_name not in node:
                issues.append(Issue("S3", "error",
                    f'Missing required field "{field_name}"', node_id=nid))

        if "id" not in node:
            continue  # can't index without id

        # R1: duplicate IDs
        if nid in seen_node_ids:
            issues.append(Issue("R1", "error",
                f'Duplicate node ID (also at index {seen_node_ids[nid]})', node_id=nid))
        else:
            seen_node_ids[nid] = idx
            node_map[nid] = node

        # R4: 16-char hex
        if not HEX_RE.match(str(nid)):
            issues.append(Issue("R4", "warning",
                f'Node ID "{nid}" is not a 16-character lowercase hex string', node_id=nid))

        # S5: valid type
        ntype = node.get("type")
        if ntype not in VALID_TYPES:
            issues.append(Issue("S5", "error",
                f'Unknown node type "{ntype}" (expected: text|group|file|link)', node_id=nid))
            continue

        # S4: type-specific required fields
        if ntype == "text" and "text" not in node:
            issues.append(Issue("S4", "error",
                'Text node missing "text" field', node_id=nid))
        elif ntype == "file" and "file" not in node:
            issues.append(Issue("S4", "error",
                'File node missing "file" field', node_id=nid))
        elif ntype == "link" and "url" not in node:
            issues.append(Issue("S4", "error",
                'Link node missing "url" field', node_id=nid))

        # S6: positive dimensions
        w = node.get("width", 0)
        h = node.get("height", 0)
        if isinstance(w, (int, float)) and w <= 0:
            issues.append(Issue("S6", "error",
                f'Non-positive width: {w}', node_id=nid))
        if isinstance(h, (int, float)) and h <= 0:
            issues.append(Issue("S6", "error",
                f'Non-positive height: {h}', node_id=nid))

        # S7: color
        color = node.get("color")
        if color is not None:
            if str(color) not in VALID_COLORS and not COLOR_RE.match(str(color)):
                issues.append(Issue("S7", "warning",
                    f'Unusual color value "{color}" (expected "1"-"6" or #RRGGBB)', node_id=nid))

        # C1: text fits height
        if ntype == "text":
            text_content = node.get("text", "")
            min_h = estimate_min_height(text_content)
            actual_h = node.get("height", 0)
            if isinstance(actual_h, (int, float)) and actual_h < min_h * 0.6:
                issues.append(Issue("C1", "warning",
                    f'Node height {actual_h}px may be too small for content '
                    f'(estimated min ~{min_h}px for {text_content.count(chr(10))+1} lines)',
                    node_id=nid))

        # C2: unicode in code blocks
        if ntype == "text":
            hits = find_unicode_in_code_blocks(node.get("text", ""))
            if hits:
                sample = ", ".join(f"{cp} {ch!r}" for _, ch, cp in hits[:3])
                issues.append(Issue("C2", "warning",
                    f'Non-ASCII characters in fenced code block(s): {sample} '
                    f'(may cause VSCode parse errors)',
                    node_id=nid))

    # ── S8/S9/R2/R3 per edge ─────────────────────────────────────────────────
    seen_edge_ids: dict[str, int] = {}

    for idx, edge in enumerate(edges):
        if not isinstance(edge, dict):
            issues.append(Issue("S3", "error", f"edges[{idx}] is not an object"))
            continue

        eid = edge.get("id", f"<missing id @ edge {idx}>")

        # R2: duplicate edge IDs
        if eid in seen_edge_ids:
            issues.append(Issue("R2", "error",
                f'Duplicate edge ID (also at index {seen_edge_ids[eid]})', edge_id=eid))
        else:
            seen_edge_ids[eid] = idx

        # R4
        if not HEX_RE.match(str(eid)):
            issues.append(Issue("R4", "warning",
                f'Edge ID "{eid}" is not a 16-character lowercase hex string', edge_id=eid))

        # R3: dangling references
        for ref_field in ("fromNode", "toNode"):
            ref = edge.get(ref_field)
            if ref is None:
                issues.append(Issue("R3", "error",
                    f'Edge missing "{ref_field}"', edge_id=eid))
            elif ref not in node_map:
                issues.append(Issue("R3", "error",
                    f'Edge {ref_field} "{ref}" does not match any node ID', edge_id=eid))

        # S8: side values
        for side_field in ("fromSide", "toSide"):
            side = edge.get(side_field)
            if side is not None and side not in VALID_SIDES:
                issues.append(Issue("S8", "error",
                    f'Invalid {side_field} value "{side}" (expected top|bottom|left|right)',
                    edge_id=eid))

        # S9: end values
        for end_field in ("fromEnd", "toEnd"):
            end = edge.get(end_field)
            if end is not None and end not in VALID_ENDS:
                issues.append(Issue("S9", "error",
                    f'Invalid {end_field} value "{end}" (expected none|arrow)',
                    edge_id=eid))

    # ── Geometry checks — need all nodes parsed ───────────────────────────────
    group_nodes = [n for n in nodes if isinstance(n, dict) and n.get("type") == "group" and "id" in n]
    non_group_nodes = [n for n in nodes if isinstance(n, dict) and n.get("type") != "group" and "id" in n]

    # Build index position map for z-order check
    node_array_index = {n["id"]: i for i, n in enumerate(nodes)
                        if isinstance(n, dict) and "id" in n}

    # G1: group z-order — group must appear before any node whose centre is inside it
    for group in group_nodes:
        gid = group["id"]
        g_idx = node_array_index.get(gid, 0)
        for node in non_group_nodes:
            if rect_contains_center(group, node):
                n_idx = node_array_index.get(node["id"], 0)
                if n_idx < g_idx:
                    issues.append(Issue("G1", "error",
                        f'Group "{group.get("label","")}" appears at index {g_idx} '
                        f'but child node appears earlier at index {n_idx} '
                        f'(groups must precede their children for correct z-order)',
                        node_id=gid))
                    break  # one report per group is enough

    # G2: overflow — node partially outside its containing group
    for group in group_nodes:
        gid = group["id"]
        for node in non_group_nodes:
            nid = node["id"]
            # Only check nodes whose centre is inside this group
            if not rect_contains_center(group, node):
                continue
            # Check if the node rectangle overflows the group rectangle
            node_right  = node["x"] + node["width"]
            node_bottom = node["y"] + node["height"]
            group_right  = group["x"] + group["width"]
            group_bottom = group["y"] + group["height"]
            overflow_x = max(0, node_right  - group_right)
            overflow_y = max(0, node_bottom - group_bottom)
            overflow_left = max(0, group["x"] - node["x"])
            overflow_top  = max(0, group["y"] - node["y"])
            total = overflow_x + overflow_y + overflow_left + overflow_top
            if total > 0:
                issues.append(Issue("G2", "warning",
                    f'Node overflows group "{group.get("label","")}" by '
                    f'right={overflow_x}px bottom={overflow_y}px '
                    f'left={overflow_left}px top={overflow_top}px',
                    node_id=nid))

    # G3: empty groups
    for group in group_nodes:
        gid = group["id"]
        children = [n for n in non_group_nodes if rect_contains_center(group, n)]
        if not children:
            issues.append(Issue("G3", "warning",
                f'Group "{group.get("label","")}" contains no nodes '
                f'(no node centre lies inside its bounding box)',
                node_id=gid))

    # G4: exact overlaps
    valid_nodes = [n for n in nodes if isinstance(n, dict) and "id" in n
                   and "x" in n and "y" in n and "width" in n and "height" in n]
    seen_rects: dict[tuple, str] = {}
    for node in valid_nodes:
        key = (node["x"], node["y"], node["width"], node["height"])
        if key in seen_rects:
            issues.append(Issue("G4", "warning",
                f'Exact same position/size as node {seen_rects[key]} '
                f'({node["x"]},{node["y"]} {node["width"]}×{node["height"]})',
                node_id=node["id"]))
        else:
            seen_rects[key] = node["id"]

    return issues


# ──────────────────────────── main ───────────────────────────────────────────

def validate_file(path: str, as_json: bool = False) -> tuple[list[Issue], bool]:
    """Returns (issues, parse_error)."""
    if path == "-":
        raw = sys.stdin.read()
        label = "<stdin>"
    else:
        try:
            with open(path) as f:
                raw = f.read()
            label = path
        except FileNotFoundError:
            print(f"✖ File not found: {path}", file=sys.stderr)
            return [], True

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        if as_json:
            print(json.dumps({"file": label, "parse_error": str(e), "issues": []}))
        else:
            print(f"\n{'─'*60}")
            print(f"  {label}")
            print(f"  ✖ S1  Invalid JSON: {e}")
        return [], True

    issues = validate(data)
    return issues, False


def print_report(path: str, issues: list[Issue], verbose: bool = True):
    errors   = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    status = "✖ FAIL" if errors else ("⚠ WARN" if warnings else "✔ OK  ")

    print(f"\n{'─'*60}")
    print(f"  {status}  {path}")
    print(f"         {len(errors)} error(s), {len(warnings)} warning(s)")

    if verbose and issues:
        # Group by category
        for code_prefix in ("S", "R", "G", "C"):
            group = [i for i in issues if i.code.startswith(code_prefix)]
            if group:
                labels = {"S": "Structure", "R": "References",
                          "G": "Geometry", "C": "Content"}
                print(f"\n  [{labels[code_prefix]}]")
                for issue in group:
                    print(issue.label())


def main():
    parser = argparse.ArgumentParser(
        description="Validate Obsidian .canvas files",
        epilog="Use fix-canvas.py to auto-repair geometry and reference issues."
    )
    parser.add_argument("files", nargs="+", metavar="FILE",
                        help=".canvas files to validate (use - for stdin)")
    parser.add_argument("--json", action="store_true",
                        help="Output machine-readable JSON")
    parser.add_argument("-q", "--quiet", action="store_true",
                        help="Only print summary lines, no per-issue details")
    args = parser.parse_args()

    all_issues: list[Issue] = []
    any_parse_error = False
    results = []

    for path in args.files:
        issues, parse_error = validate_file(path, as_json=args.json)
        if parse_error:
            any_parse_error = True
            if args.json:
                results.append({"file": path, "parse_error": True, "issues": []})
            continue

        all_issues.extend(issues)

        if args.json:
            results.append({
                "file": path,
                "errors": len([i for i in issues if i.severity == "error"]),
                "warnings": len([i for i in issues if i.severity == "warning"]),
                "issues": [
                    {"code": i.code, "severity": i.severity, "message": i.message,
                     "node_id": i.node_id, "edge_id": i.edge_id}
                    for i in issues
                ]
            })
        else:
            print_report(path, issues, verbose=not args.quiet)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        # Summary
        total_errors   = len([i for i in all_issues if i.severity == "error"])
        total_warnings = len([i for i in all_issues if i.severity == "warning"])
        print(f"\n{'═'*60}")
        print(f"  Total: {len(args.files)} file(s)  "
              f"{total_errors} error(s)  {total_warnings} warning(s)")
        if total_errors == 0 and not any_parse_error:
            print("  All files valid ✔")

    has_errors = any(i.severity == "error" for i in all_issues) or any_parse_error
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
