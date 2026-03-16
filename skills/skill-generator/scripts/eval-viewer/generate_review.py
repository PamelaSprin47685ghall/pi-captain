#!/usr/bin/env python3
"""Generate and serve a review page for pi evalset results.

Reads .evalset/reports/*.json files produced by the /evalset extension,
embeds all data into a self-contained HTML page, and serves it via a tiny
HTTP server. Feedback auto-saves to feedback.json in the report directory.

Usage:
    python generate_review.py [--reports-dir <path>] [--port PORT] [--static <output.html>]
    python generate_review.py --report <single-report.json>

No dependencies beyond the Python stdlib are required.
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import webbrowser
from functools import partial
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path


def find_reports(reports_dir: Path) -> list[dict]:
    """Find all evalset run/compare reports in the reports directory."""
    reports = []
    if not reports_dir.is_dir():
        return reports
    for f in sorted(reports_dir.glob("*.json"), reverse=True):
        if f.name == "feedback.json":
            continue
        try:
            data = json.loads(f.read_text())
            if data.get("kind") in ("evalset-run", "evalset-compare"):
                reports.append({"path": str(f), "data": data})
        except (json.JSONDecodeError, OSError):
            pass
    return reports


def build_run_summary(report: dict) -> dict:
    """Build a flat summary object from an evalset-run or evalset-compare report."""
    kind = report.get("kind")
    if kind == "evalset-run":
        return _build_single_run(report)
    elif kind == "evalset-compare":
        return _build_compare(report)
    return {}


def _build_single_run(report: dict) -> dict:
    cases = []
    for c in report.get("cases", []):
        cases.append({
            "id": c.get("id", ""),
            "input": c.get("input", ""),
            "scored": c.get("scored", False),
            "pass": c.get("pass", True),
            "checks": c.get("checks", []),
            "failedChecks": c.get("failedChecks", []),
            "outputPreview": c.get("outputPreview", ""),
            "latencyMs": c.get("latencyMs", 0),
            "error": c.get("error"),
        })
    totals = report.get("totals", {})
    return {
        "kind": "run",
        "runId": report.get("run", {}).get("runId", ""),
        "createdAt": report.get("createdAt", ""),
        "dataset": report.get("dataset", {}).get("name", ""),
        "model": f"{report.get('model', {}).get('provider', '')}/{report.get('model', {}).get('id', '')}",
        "variant": report.get("variant", {}).get("name", ""),
        "passRate": totals.get("passRate"),
        "scoredCases": totals.get("scoredCases", 0),
        "passedCases": totals.get("passedCases", 0),
        "totalCost": totals.get("usage", {}).get("cost", {}).get("total", 0),
        "avgLatencyMs": totals.get("avgLatencyMs", 0),
        "cases": cases,
    }


def _build_compare(report: dict) -> dict:
    baseline = report.get("baseline", {})
    candidate = report.get("candidate", {})
    delta = report.get("delta", {})

    def extract_cases(run):
        cases = []
        for c in run.get("cases", []):
            cases.append({
                "id": c.get("id", ""),
                "input": c.get("input", ""),
                "scored": c.get("scored", False),
                "pass": c.get("pass", True),
                "checks": c.get("checks", []),
                "failedChecks": c.get("failedChecks", []),
                "outputPreview": c.get("outputPreview", ""),
                "latencyMs": c.get("latencyMs", 0),
                "error": c.get("error"),
            })
        return cases

    return {
        "kind": "compare",
        "runId": report.get("run", {}).get("runId", ""),
        "createdAt": report.get("createdAt", ""),
        "dataset": report.get("dataset", {}).get("name", ""),
        "model": f"{report.get('model', {}).get('provider', '')}/{report.get('model', {}).get('id', '')}",
        "baseline": {
            "name": baseline.get("variant", {}).get("name", "baseline"),
            "passRate": baseline.get("totals", {}).get("passRate"),
            "passedCases": baseline.get("totals", {}).get("passedCases", 0),
            "scoredCases": baseline.get("totals", {}).get("scoredCases", 0),
            "totalCost": baseline.get("totals", {}).get("usage", {}).get("cost", {}).get("total", 0),
            "cases": extract_cases(baseline),
        },
        "candidate": {
            "name": candidate.get("variant", {}).get("name", "candidate"),
            "passRate": candidate.get("totals", {}).get("passRate"),
            "passedCases": candidate.get("totals", {}).get("passedCases", 0),
            "scoredCases": candidate.get("totals", {}).get("scoredCases", 0),
            "totalCost": candidate.get("totals", {}).get("usage", {}).get("cost", {}).get("total", 0),
            "cases": extract_cases(candidate),
        },
        "delta": {
            "passRate": delta.get("passRate"),
            "avgLatencyMs": delta.get("avgLatencyMs", 0),
            "totalCost": delta.get("totalCost", 0),
        },
    }


def load_feedback(feedback_path: Path) -> dict:
    if feedback_path.exists():
        try:
            return json.loads(feedback_path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"reviews": []}


def generate_html(reports_data: list[dict], feedback: dict, skill_name: str) -> str:
    template_path = Path(__file__).parent / "viewer.html"
    template = template_path.read_text()

    summaries = [build_run_summary(r["data"]) for r in reports_data]
    report_paths = [r["path"] for r in reports_data]

    feedback_map = {
        rev["run_id"]: rev["feedback"]
        for rev in feedback.get("reviews", [])
        if rev.get("feedback", "").strip()
    }

    embedded = {
        "skill_name": skill_name,
        "reports": summaries,
        "report_paths": report_paths,
        "feedback": feedback_map,
    }

    return template.replace("/*__EMBEDDED_DATA__*/", f"const EMBEDDED_DATA = {json.dumps(embedded)};")


def _kill_port(port: int) -> None:
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True, timeout=5,
        )
        for pid_str in result.stdout.strip().split("\n"):
            if pid_str.strip():
                try:
                    os.kill(int(pid_str.strip()), signal.SIGTERM)
                except (ProcessLookupError, ValueError):
                    pass
        if result.stdout.strip():
            time.sleep(0.5)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


class ReviewHandler(BaseHTTPRequestHandler):
    def __init__(self, reports_dir: Path, feedback_path: Path, skill_name: str, *args, **kwargs):
        self.reports_dir = reports_dir
        self.feedback_path = feedback_path
        self.skill_name = skill_name
        super().__init__(*args, **kwargs)

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            reports = find_reports(self.reports_dir)
            feedback = load_feedback(self.feedback_path)
            html = generate_html(reports, feedback, self.skill_name)
            content = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        elif self.path == "/api/feedback":
            data = b"{}"
            if self.feedback_path.exists():
                data = self.feedback_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_error(404)

    def do_POST(self) -> None:
        if self.path == "/api/feedback":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                if not isinstance(data, dict) or "reviews" not in data:
                    raise ValueError("Expected JSON object with 'reviews' key")
                self.feedback_path.write_text(json.dumps(data, indent=2) + "\n")
                resp = b'{"ok":true}'
                self.send_response(200)
            except (json.JSONDecodeError, OSError, ValueError) as e:
                resp = json.dumps({"error": str(e)}).encode()
                self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
        else:
            self.send_error(404)

    def log_message(self, format: str, *args: object) -> None:
        pass  # Suppress request logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate and serve pi evalset review")
    parser.add_argument(
        "--reports-dir", "-d", type=Path, default=None,
        help="Path to .evalset/reports/ directory (default: auto-detect from cwd)"
    )
    parser.add_argument(
        "--report", type=Path, default=None,
        help="Path to a single evalset report JSON file"
    )
    parser.add_argument("--port", "-p", type=int, default=3117, help="Server port (default: 3117)")
    parser.add_argument("--skill-name", "-n", type=str, default=None, help="Skill/project name for header")
    parser.add_argument(
        "--static", "-s", type=Path, default=None,
        help="Write standalone HTML to this path instead of starting a server"
    )
    args = parser.parse_args()

    # Resolve reports directory
    if args.report:
        report_file = args.report.resolve()
        if not report_file.exists():
            print(f"Error: {report_file} not found", file=sys.stderr)
            sys.exit(1)
        reports_dir = report_file.parent
    else:
        cwd = Path.cwd()
        reports_dir = args.reports_dir.resolve() if args.reports_dir else cwd / ".evalset" / "reports"
        if not reports_dir.is_dir():
            # Try current directory if no .evalset found
            reports_dir = cwd

    reports = find_reports(reports_dir)
    if not reports:
        print(f"No evalset reports found in {reports_dir}", file=sys.stderr)
        print("Run /evalset run <dataset.json> first to generate a report.", file=sys.stderr)
        sys.exit(1)

    skill_name = args.skill_name or Path.cwd().name
    feedback_path = reports_dir / "feedback.json"
    feedback = load_feedback(feedback_path)

    if args.static:
        html = generate_html(reports, feedback, skill_name)
        args.static.parent.mkdir(parents=True, exist_ok=True)
        args.static.write_text(html)
        print(f"\n  Static viewer written to: {args.static}\n")
        sys.exit(0)

    port = args.port
    _kill_port(port)
    handler = partial(ReviewHandler, reports_dir, feedback_path, skill_name)
    try:
        server = HTTPServer(("127.0.0.1", port), handler)
    except OSError:
        server = HTTPServer(("127.0.0.1", 0), handler)
        port = server.server_address[1]

    url = f"http://localhost:{port}"
    print(f"\n  Pi Evalset Viewer")
    print(f"  ─────────────────────────────────")
    print(f"  URL:       {url}")
    print(f"  Reports:   {reports_dir} ({len(reports)} found)")
    print(f"  Feedback:  {feedback_path}")
    print(f"\n  Press Ctrl+C to stop.\n")

    webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
