#!/usr/bin/env python3
"""Auto-repair an Obsidian .canvas file using geometry and content analysis.

Usage:
    python3 fix-canvas.py file.canvas                   # fix in-place (creates .bak)
    python3 fix-canvas.py file.canvas -o fixed.canvas   # write to new file
    python3 fix-canvas.py file.canvas --dry-run         # show what would change
    python3 fix-canvas.py *.canvas                      # batch fix in-place
    cat file.canvas | python3 fix-canvas.py - -o out.canvas

What this script fixes (and in what order):
    F1  Duplicate IDs         — regenerate IDs for duplicates, update edge refs
    F2  Missing IDs           — generate IDs for nodes/edges that lack them
    F3  Group z-order         — move group nodes before their children in the array
    F4  Group bounds          — expand groups that don't fully contain their children
    F5  Edge sides            — recompute fromSide/toSide from centre-to-centre vector
    F6  Edge ends             — add missing toEnd:"arrow" only when both ends absent
    F7  Node min-size         — resize nodes whose width/height is 0 or negative
    F8  Text node height      — expand text nodes whose height is < 60% of content estimate
    F9  Unicode in code blocks — replace non-ASCII chars inside ``` fences with ASCII

What this script does NOT fix (requires human judgment):
    - Wrong content in text nodes
    - Semantic meaning of group membership (only expands, never reassigns)
    - Layout / overall positioning
    - Missing required type-specific fields (text, file, url)

Group membership detection (used by F3 and F4):
    A node is considered a child of a group when its centre point
    (x + width/2, y + height/2) lies inside the group's bounding box.
    When multiple groups qualify, the smallest enclosing group wins.
"""

import json
import math
import os
import re
import sys
import argparse
from copy import deepcopy


# ──────────────────────────── helpers ────────────────────────────────────────

def gen_id() -> str:
    return os.urandom(8).hex()


def rect_contains_center(group: dict, node: dict) -> bool:
    cx = node["x"] + node["width"] / 2
    cy = node["y"] + node["height"] / 2
    return (group["x"] < cx < group["x"] + group["width"] and
            group["y"] < cy < group["y"] + group["height"])


def group_area(g: dict) -> float:
    return g.get("width", 0) * g.get("height", 0)


def node_center(n: dict) -> tuple[float, float]:
    return (n["x"] + n["width"] / 2, n["y"] + n["height"] / 2)


def best_side_from_vector(dx: float, dy: float) -> tuple[str, str]:
    """Return (from_side, to_side) for an edge whose target is (dx,dy) from source centre."""
    if abs(dx) >= abs(dy):
        return ("right", "left") if dx >= 0 else ("left", "right")
    else:
        return ("bottom", "top") if dy >= 0 else ("top", "bottom")


UNICODE_REPLACEMENTS = [
    ("\u2014", "--"),    # em dash  —
    ("\u2013", "-"),     # en dash  –
    ("\u2026", "..."),   # ellipsis …
    ("\u2192", "->"),    # right arrow →
    ("\u2190", "<-"),    # left arrow ←
    ("\u2191", "^"),     # up arrow ↑
    ("\u2193", "v"),     # down arrow ↓
    ("\u201c", '"'),     # left double quote "
    ("\u201d", '"'),     # right double quote "
    ("\u2018", "'"),     # left single quote '
    ("\u2019", "'"),     # right single quote '
]


def sanitize_code_blocks(text: str) -> tuple[str, int]:
    """Replace non-ASCII in fenced code blocks. Returns (new_text, num_replacements)."""
    count = [0]

    def clean_block(m):
        fence_open, body, fence_close = m.group(1), m.group(2), m.group(3)
        original = body
        for uni, asc in UNICODE_REPLACEMENTS:
            body = body.replace(uni, asc)
        # remaining non-ASCII → replace with "?"
        cleaned = ""
        for ch in body:
            if ord(ch) > 127:
                cleaned += "?"
                count[0] += 1
            else:
                cleaned += ch
        if cleaned != original:
            count[0] += 1  # count at least one hit per block
        return fence_open + cleaned + fence_close

    result = re.sub(r"(```[^\n]*\n)(.*?)(```)", clean_block, text, flags=re.DOTALL)
    return result, count[0]


def estimate_min_height(text: str) -> int:
    all_lines = text.splitlines()
    heading_count = sum(1 for l in all_lines if l.startswith("##"))
    blank_count   = sum(1 for l in all_lines if l.strip() == "")
    code_blocks   = len(re.findall(r"```", text)) // 2
    content_lines = len(all_lines) + 1 - blank_count * 0.7
    effective = content_lines + 0.5 * heading_count + 1.5 * code_blocks
    return max(60, round(effective * 50))


# ──────────────────────────── fix passes ─────────────────────────────────────

class Fixer:
    def __init__(self, data: dict):
        self.data = deepcopy(data)
        self.changes: list[str] = []

    def log(self, msg: str):
        self.changes.append(msg)

    # ── F1/F2: IDs ───────────────────────────────────────────────────────────

    def fix_ids(self):
        """F1+F2: Fix duplicate and missing node/edge IDs, update edge references."""
        nodes = self.data.get("nodes", [])
        edges = self.data.get("edges", [])

        # Nodes
        seen: dict[str, int] = {}
        remap: dict[str, str] = {}   # old_id → new_id (for duplicates)

        for idx, node in enumerate(nodes):
            old_id = node.get("id")
            if old_id is None:
                new_id = gen_id()
                node["id"] = new_id
                self.log(f"F2: Added missing ID to nodes[{idx}] → {new_id}")
            elif old_id in seen:
                new_id = gen_id()
                remap[old_id] = new_id        # note: only last duplicate gets remapped
                node["id"] = new_id
                self.log(f"F1: Duplicate node ID '{old_id}' at index {idx} → {new_id}")
            else:
                seen[old_id] = idx

        # Edges: fix duplicate IDs, update dangling node refs
        seen_edges: set[str] = set()
        for idx, edge in enumerate(edges):
            eid = edge.get("id")
            if eid is None:
                edge["id"] = gen_id()
                self.log(f"F2: Added missing ID to edges[{idx}]")
            elif eid in seen_edges:
                new_eid = gen_id()
                self.log(f"F1: Duplicate edge ID '{eid}' at index {idx} → {new_eid}")
                edge["id"] = new_eid
            else:
                seen_edges.add(eid)

            # Update remapped node references
            for ref_field in ("fromNode", "toNode"):
                ref = edge.get(ref_field)
                if ref and ref in remap:
                    edge[ref_field] = remap[ref]
                    self.log(f"F1: Updated edge {idx} {ref_field} {ref} → {remap[ref]}")

    # ── F3: group z-order ─────────────────────────────────────────────────────

    def fix_group_zorder(self):
        """F3: Ensure group nodes appear before their contained children."""
        nodes = self.data["nodes"]
        groups = [n for n in nodes if isinstance(n, dict) and n.get("type") == "group"
                  and "id" in n and "x" in n]

        if not groups:
            return

        # Build current index map
        def index_of(nid):
            return next((i for i, n in enumerate(nodes)
                         if isinstance(n, dict) and n.get("id") == nid), -1)

        # Repeatedly check and fix — may need multiple passes for nested groups
        for _ in range(10):
            moved = False
            for group in groups:
                gidx = index_of(group["id"])
                for i, node in enumerate(nodes):
                    if not isinstance(node, dict) or node.get("type") == "group":
                        continue
                    if not rect_contains_center(group, node):
                        continue
                    if i < gidx:
                        # Move group just before this child
                        nodes.pop(gidx)
                        insert_at = index_of(node["id"])
                        nodes.insert(insert_at, group)
                        self.log(f"F3: Moved group '{group.get('label',group['id'][:8])}' "
                                 f"before its child '{node.get('id','')[:8]}'")
                        moved = True
                        break
                if moved:
                    break
            if not moved:
                break

    # ── F4: group bounds ──────────────────────────────────────────────────────

    def fix_group_bounds(self, padding: int = 20, label_offset: int = 30):
        """F4: Expand group bounds so all contained children fit inside."""
        nodes = self.data["nodes"]
        groups = [n for n in nodes if isinstance(n, dict) and n.get("type") == "group"
                  and "x" in n and "width" in n]

        # Process innermost groups first (smallest area → outermost last)
        # so nested groups get fixed before their parent is measured
        groups_sorted = sorted(groups, key=group_area)

        for group in groups_sorted:
            children = [
                n for n in nodes
                if isinstance(n, dict) and n.get("type") != "group"
                and "x" in n and "width" in n
                and rect_contains_center(group, n)
            ]
            if not children:
                continue

            min_x = min(c["x"] for c in children)
            min_y = min(c["y"] for c in children)
            max_x = max(c["x"] + c["width"]  for c in children)
            max_y = max(c["y"] + c["height"] for c in children)

            needed_x = min_x - padding
            needed_y = min_y - label_offset
            needed_w = (max_x - min_x) + 2 * padding
            needed_h = (max_y - min_y) + padding + label_offset

            changed = False
            # Only expand, never shrink (shrinking might hide deliberately small groups)
            if group["x"] > needed_x:
                group["x"] = needed_x;  changed = True
            if group["y"] > needed_y:
                group["y"] = needed_y;  changed = True
            if group.get("width", 0) < needed_w:
                group["width"] = needed_w;  changed = True
            if group.get("height", 0) < needed_h:
                group["height"] = needed_h;  changed = True

            if changed:
                self.log(f"F4: Expanded group '{group.get('label', group['id'][:8])}' "
                         f"to x={group['x']} y={group['y']} "
                         f"w={group['width']} h={group['height']}")

    # ── F5: edge sides ────────────────────────────────────────────────────────

    def fix_edge_sides(self):
        """F5: Recompute fromSide/toSide from node centre-to-centre geometry."""
        nodes = self.data["nodes"]
        edges = self.data["edges"]

        node_map = {n["id"]: n for n in nodes
                    if isinstance(n, dict) and "id" in n and "x" in n}

        for edge in edges:
            if not isinstance(edge, dict):
                continue
            fn = node_map.get(edge.get("fromNode"))
            tn = node_map.get(edge.get("toNode"))
            if not fn or not tn:
                continue

            fcx, fcy = node_center(fn)
            tcx, tcy = node_center(tn)
            dx, dy = tcx - fcx, tcy - fcy

            new_from, new_to = best_side_from_vector(dx, dy)

            old_from = edge.get("fromSide")
            old_to   = edge.get("toSide")

            if old_from != new_from or old_to != new_to:
                edge["fromSide"] = new_from
                edge["toSide"]   = new_to
                self.log(f"F5: Edge {edge['id'][:8]}: sides "
                         f"{old_from}→{old_to} corrected to "
                         f"{new_from}→{new_to}")

    # ── F6: edge ends ─────────────────────────────────────────────────────────

    def fix_edge_ends(self):
        """F6: When both fromEnd and toEnd are absent, add toEnd:'arrow' (spec default)."""
        for edge in self.data.get("edges", []):
            if not isinstance(edge, dict):
                continue
            if "fromEnd" not in edge and "toEnd" not in edge:
                edge["toEnd"] = "arrow"
                self.log(f"F6: Edge {edge.get('id','?')[:8]}: added toEnd:arrow (spec default)")

    # ── F7: node min-size ─────────────────────────────────────────────────────

    def fix_node_min_size(self, min_w: int = 60, min_h: int = 60):
        """F7: Ensure width and height are at least min_w / min_h."""
        for node in self.data.get("nodes", []):
            if not isinstance(node, dict):
                continue
            nid = node.get("id", "?")[:8]
            if node.get("width", min_w) < min_w:
                self.log(f"F7: Node {nid}: width {node['width']} → {min_w}")
                node["width"] = min_w
            if node.get("height", min_h) < min_h:
                self.log(f"F7: Node {nid}: height {node['height']} → {min_h}")
                node["height"] = min_h

    # ── F8: text node height ──────────────────────────────────────────────────

    def fix_text_heights(self, threshold: float = 0.6):
        """F8: Expand text nodes whose height is less than threshold × estimated minimum."""
        for node in self.data.get("nodes", []):
            if not isinstance(node, dict) or node.get("type") != "text":
                continue
            text = node.get("text", "")
            min_h = estimate_min_height(text)
            current_h = node.get("height", 0)
            if current_h < min_h * threshold:
                new_h = min_h
                self.log(f"F8: Node {node.get('id','?')[:8]}: height {current_h} → {new_h} "
                         f"(content ~{text.count(chr(10))+1} lines)")
                node["height"] = new_h

    # ── F9: unicode in code blocks ────────────────────────────────────────────

    def fix_unicode_code_blocks(self):
        """F9: Strip non-ASCII from fenced code blocks in text nodes."""
        for node in self.data.get("nodes", []):
            if not isinstance(node, dict) or node.get("type") != "text":
                continue
            original = node.get("text", "")
            fixed, count = sanitize_code_blocks(original)
            if fixed != original:
                node["text"] = fixed
                self.log(f"F9: Node {node.get('id','?')[:8]}: removed {count} "
                         f"non-ASCII character(s) from code block(s)")

    # ── run all ───────────────────────────────────────────────────────────────

    def run_all(self):
        self.fix_ids()
        self.fix_group_zorder()
        self.fix_group_bounds()
        self.fix_edge_sides()
        self.fix_edge_ends()
        self.fix_node_min_size()
        self.fix_text_heights()
        self.fix_unicode_code_blocks()
        return self.data, self.changes


# ──────────────────────────── diff summary ───────────────────────────────────

def diff_summary(original: dict, fixed: dict) -> list[str]:
    """High-level diff: what changed between original and fixed canvas."""
    lines = []
    on = len(original.get("nodes", []))
    fn = len(fixed.get("nodes", []))
    oe = len(original.get("edges", []))
    fe = len(fixed.get("edges", []))
    if on != fn:
        lines.append(f"  nodes: {on} → {fn}")
    if oe != fe:
        lines.append(f"  edges: {oe} → {fe}")
    return lines


# ──────────────────────────── main ───────────────────────────────────────────

def fix_file(path: str, output: str | None, dry_run: bool) -> bool:
    """Returns True if changes were made."""
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
            return False

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"✖ {label}: Invalid JSON — {e}")
        return False

    fixer = Fixer(data)
    fixed_data, changes = fixer.run_all()

    if not changes:
        print(f"✔  {label}: no fixes needed")
        return False

    print(f"\n{'─'*60}")
    print(f"  {label}")
    for c in changes:
        print(f"  → {c}")
    for d in diff_summary(data, fixed_data):
        print(f"  Δ {d}")

    if dry_run:
        print(f"  [dry-run] {len(changes)} fix(es) — file not modified")
        return True

    output_json = json.dumps(fixed_data, indent="\t", ensure_ascii=False)

    if output:
        dest = output
    elif path == "-":
        print(output_json)
        return True
    else:
        # Backup original
        backup = path + ".bak"
        with open(backup, "w") as f:
            f.write(raw)
        dest = path

    with open(dest, "w") as f:
        f.write(output_json)
    print(f"  Saved → {dest}" + (f"  (backup: {path}.bak)" if not output and path != "-" else ""))
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Auto-repair Obsidian .canvas files",
        epilog="Run validate-canvas.py afterwards to confirm all issues are resolved."
    )
    parser.add_argument("files", nargs="+", metavar="FILE",
                        help=".canvas files to fix (use - for stdin)")
    parser.add_argument("-o", "--output", metavar="FILE",
                        help="Write fixed output here (single-file mode only)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing files")
    parser.add_argument("--no-edge-sides", action="store_true",
                        help="Skip F5: don't recompute edge sides")
    args = parser.parse_args()

    if args.output and len(args.files) > 1:
        print("✖ --output can only be used with a single input file", file=sys.stderr)
        sys.exit(1)

    fixed_count = 0
    for path in args.files:
        changed = fix_file(path, args.output if len(args.files) == 1 else None,
                           dry_run=args.dry_run)
        if changed:
            fixed_count += 1

    print(f"\n{'═'*60}")
    if args.dry_run:
        print(f"  [dry-run] {fixed_count}/{len(args.files)} file(s) have fixable issues")
    else:
        print(f"  {fixed_count}/{len(args.files)} file(s) fixed")


if __name__ == "__main__":
    main()
