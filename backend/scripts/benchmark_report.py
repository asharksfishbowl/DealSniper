"""Standalone benchmark reporter for OpenWebNinja call/cache instrumentation.

Run from `backend/`:

    python -m scripts.benchmark_report

Reads `benchmark_log.jsonl` (OpenWebNinja call entries + should_fetch_search()
cache-check entries, written by adapters/openwebninja.py and
app/search_cache.py respectively), `quota.py`'s call_counts state, and the
SearchFetch table, then prints a plain-text report. Not wired into
pytest/CI — this is a manually-run tool.

Target thresholds (informational only — no automated pass/fail gating):
  - Cache hit rate should trend toward >= 85%.
  - Calls-per-refresh should trend toward 0 once the cache is warm
    (steady-state operation with no cold queries).
"""

from __future__ import annotations

import json
from pathlib import Path
from statistics import mean

from adapters import STORE_ADAPTERS
from app import quota
from app.database import SessionLocal
from app.models import SearchFetch

_LOG_PATH = Path(__file__).resolve().parent.parent / "benchmark_log.jsonl"

CACHE_HIT_RATE_TARGET = 0.85


def _read_log_lines() -> list[dict]:
    if not _LOG_PATH.exists():
        return []
    lines: list[dict] = []
    for raw in _LOG_PATH.read_text().splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            lines.append(json.loads(raw))
        except ValueError:
            continue
    return lines


def _is_call_entry(entry: dict) -> bool:
    return "outcome" in entry


def _is_fetch_check_entry(entry: dict) -> bool:
    return "may_fetch" in entry


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(round(pct * (len(ordered) - 1))))
    return ordered[idx]


def _print_cache_hit_rate(fetch_checks: list[dict]) -> None:
    print("== Cache hit rate ==")
    total = len(fetch_checks)
    if total == 0:
        print("  No should_fetch_search() log entries yet.")
        print()
        return
    hits = sum(1 for e in fetch_checks if e.get("may_fetch") is False)
    rate = hits / total
    print(f"  {hits}/{total} calls served from cache ({rate:.1%})")
    print(f"  Target: >= {CACHE_HIT_RATE_TARGET:.0%}")
    print()


def _print_calls_per_refresh(call_entries: list[dict]) -> None:
    print("== Calls per refresh ==")
    total = len(call_entries)
    cycle_ids = {e.get("cycle_id") for e in call_entries if e.get("cycle_id")}
    if not cycle_ids:
        print("  No OpenWebNinja call entries yet.")
        print()
        return
    per_refresh = total / len(cycle_ids)
    print(
        f"  {total} calls across {len(cycle_ids)} refresh cycles "
        f"→ {per_refresh:.2f} calls/refresh"
    )
    print("  Target: trend toward 0 once the cache is warm (no cold queries)")
    print()


def _print_quota_burn_rate() -> None:
    print("== Quota burn rate (current month) ==")
    for api_slug in sorted({cls.api_slug for cls in STORE_ADAPTERS.values()}):
        count = quota.get_call_count(api_slug)
        print(f"  {api_slug}: {count} calls")
    print()


def _print_latency(call_entries: list[dict]) -> None:
    print("== Latency (ms) by api_slug / outcome ==")
    if not call_entries:
        print("  No OpenWebNinja call entries yet.")
        print()
        return
    # Never blend outcomes together — a handful of long timeouts would
    # otherwise make a "success" latency distribution meaningless.
    grouped: dict[tuple[str, str], list[float]] = {}
    for e in call_entries:
        key = (e.get("api_slug") or "unknown", e.get("outcome") or "unknown")
        grouped.setdefault(key, []).append(float(e.get("latency_ms") or 0))
    for (api_slug, outcome), values in sorted(grouped.items()):
        avg = mean(values)
        p95 = _percentile(values, 0.95)
        print(f"  {api_slug} / {outcome}: n={len(values)} avg={avg:.0f}ms p95={p95:.0f}ms")
    print()


def main() -> None:
    entries = _read_log_lines()
    call_entries = [e for e in entries if _is_call_entry(e)]
    fetch_checks = [e for e in entries if _is_fetch_check_entry(e)]

    db = SessionLocal()
    try:
        search_fetch_rows = db.query(SearchFetch).count()
    finally:
        db.close()

    print("DealSniper OpenWebNinja Benchmark Report")
    print("=" * 41)
    print(f"SearchFetch rows in DB: {search_fetch_rows}")
    print()

    _print_cache_hit_rate(fetch_checks)
    _print_calls_per_refresh(call_entries)
    _print_quota_burn_rate()
    _print_latency(call_entries)


if __name__ == "__main__":
    main()
