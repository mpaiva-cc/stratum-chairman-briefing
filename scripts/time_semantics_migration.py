#!/usr/bin/env python3
"""
A11Y-Mn08 — <time> element migration for /briefings/
WCAG 1.3.1 (Info and Relationships)

Wraps date/time strings in <time datetime="YYYY-MM-DD"> so screen readers
and machines can parse them. The visible text is preserved exactly as-is.

T+0d = 2026-05-06 (Stratum incorporation date).

Wrapping targets:
  - <span class="dateline"> compilation timestamps
  - <span class="signoff-meta"> briefing dates
  - <div class="date"> timeline entry dates
  - <div class="ts"> entries with day-notation (T+Xd), not duration HH:MM:SS ones
  - Footer colophon T+Xd references
  - Inline prose T+Xd in body copy
  - index.html entry-stat-value and entry-num T+Xd spans

Not wrapped:
  - CSS/JS comments (inside <style>/<script>)
  - <div class="ts"> entries with duration notation (T+HH:MM:SS)
  - rt-stamp pill (explicitly excluded)
  - HTML tag attributes
  - Already-wrapped <time> elements
"""

import re
import os
from datetime import date, timedelta

T0 = date(2026, 5, 6)
BRIEFINGS_DIR = "/Users/mp/git-repos/poc-autonomous-hcm/briefings"


def t_plus_to_date(days: int) -> str:
    """Return ISO 8601 YYYY-MM-DD for T+Xd."""
    return str(T0 + timedelta(days=days))


# Pre-build full lookup for every T+Xd that appears in the briefings.
T_PLUS_MAP = {d: t_plus_to_date(d) for d in range(0, 300)}


# ── rt-stamp data-this values → UTC datetime for dateline attrs ──────────────
DATELINE_DATETIME = {
    "001": "2026-05-13T02:25:46Z",
    "002": "2026-05-13T02:45:43Z",
    "003": "2026-05-13T02:54:43Z",
    "004": "2026-05-13T03:03:13Z",
    "005": "2026-05-13T03:11:19Z",
    "006": "2026-05-13T10:37:13Z",
    "007": "2026-05-13T11:16:08Z",
    "008": "2026-05-13T11:32:27Z",
    "009": "2026-05-13T11:44:33Z",
    "010": "2026-05-13T12:22:38Z",
    "011": "2026-05-13T13:37:44Z",
    "012": "2026-05-13T22:49:47Z",
    "013": "2026-05-13T23:35:14Z",
    "014": "2026-05-15",
    "015": "2026-05-15",
    "index": "2026-05-13T10:37:13Z",
}

# ── Exact dateline token per briefing ────────────────────────────────────────
DATELINE_TOKENS = {
    "001": "T+00:00:00.000",
    "002": "T+00:19:57.000",
    "003": "T+00:28:57.000",
    "004": "T+00:37:27.000",
    "005": "T+00:45:33.000",
    "006": "T+08:11:27.000",
    "007": "T+08:50:22.000",
    "008": "T+09:06:41.000",
    "009": "T+09:18:47.000",
    "010": "T+09:56:52.000",
    "011": "T+11:11:58.000",
    "012": "T+20:24:01.000",
    "013": "T+21:09:28.000",
    "014": "T+2d 07:19:39.000",
    "015": "T+~13d real-elapsed",
}


def wrap_time(visible: str, dt: str) -> str:
    return f'<time datetime="{dt}">{visible}</time>'


# ─────────────────────────────────────────────────────────────────────────────
# Transformation functions
# ─────────────────────────────────────────────────────────────────────────────

def apply_dateline(html: str, file_key: str) -> tuple[str, int]:
    """
    Wrap the compilation timestamp token inside the dateline span.
    'Compiled at T+HH:MM:SS.000 · Palo Alto' → wrap the token.
    Also catches the colophon footer duplication of the same string.
    """
    token = DATELINE_TOKENS.get(file_key)
    if not token:
        return html, 0
    dt = DATELINE_DATETIME.get(file_key, "2026-05-13")

    old = f"Compiled at {token} · Palo Alto"
    new = f"Compiled at {wrap_time(token, dt)} · Palo Alto"
    html = html.replace(old, new)
    count = html.count(f'<time datetime="{dt}">{token}</time>')
    return html, count


def apply_date_divs(html: str) -> tuple[str, int]:
    """
    Wrap T+Xd inside <div class="date">...</div>.
    Handles simple form (T+Xd) and range form (T+Xd–T+Yd).
    """
    count = 0

    def replace_div(m):
        nonlocal count
        inner = m.group(1)
        new_inner = re.sub(
            r"T\+(\d+)d",
            lambda sm: wrap_time(f"T+{sm.group(1)}d", T_PLUS_MAP.get(int(sm.group(1)), "2026-05-06")),
            inner,
        )
        count += new_inner.count("<time ")
        return f'<div class="date">{new_inner}</div>'

    # Match T+Xd or T+Xd–T+Yd (en-dash U+2013 or regular hyphen)
    html = re.sub(r'<div class="date">(T\+[\d]+d(?:[–\-]T\+[\d]+d)?)</div>', replace_div, html)
    return html, count


def apply_ts_day_divs(html: str) -> tuple[str, int]:
    """
    Wrap T+Xd inside <div class="ts"> entries that use day-notation.
    These represent the calendar date of a meeting/event.

    Skips ts divs with duration notation T+HH:MM:SS (those are elapsed
    minutes within a session transcript, not calendar dates).

    The ts div content format is: T+Xd<br />HH:MM<br />location
    We wrap only the T+Xd token at the start.
    """
    count = 0

    def replace_ts(m):
        nonlocal count
        inner = m.group(1)
        # Only wrap if starts with T+Xd (day notation)
        # Duration format is T+HH:MM:SS or T+D:HH:MM:SS — digits only, no 'd'
        day_match = re.match(r"(T\+(\d+)d)", inner)
        if day_match:
            days = int(day_match.group(2))
            dt = T_PLUS_MAP.get(days, "2026-05-06")
            wrapped_token = wrap_time(day_match.group(1), dt)
            new_inner = wrapped_token + inner[day_match.end():]
            count += 1
            return f'<div class="ts">{new_inner}</div>'
        return m.group(0)

    # Use DOTALL to handle <br /> within the content
    html = re.sub(r'<div class="ts">(T\+[^<]*(?:<br[^/]*/>[^<]*)*)</div>', replace_ts, html, flags=re.DOTALL)
    return html, count


def apply_real_elapsed_dates(html: str, file_key: str) -> tuple[str, int]:
    """
    Handle real-elapsed T+ markers in briefings 014 and 015.
    Wraps specific key markers with datetime="2026-05-15".
    """
    count = 0

    if file_key == "014":
        replacements = [
            # signoff-meta and spans
            ("T+55h real-elapsed", "2026-05-15"),
            ("T+55:12:38 real-elapsed", "2026-05-15"),
        ]
        for old_token, dt in replacements:
            new_token = wrap_time(old_token, dt)
            occurrences = html.count(old_token)
            if occurrences > 0 and f'<time datetime="{dt}">{old_token}</time>' not in html:
                html = html.replace(old_token, new_token)
                count += html.count(f'<time datetime="{dt}">{old_token}</time>')

        # dd element: "T+~55h · 2026-05-15"
        old_dd = "T+~55h · 2026-05-15"
        if old_dd in html:
            new_dd = wrap_time("T+~55h", "2026-05-15") + " · " + wrap_time("2026-05-15", "2026-05-15")
            html = html.replace(old_dd, new_dd, 1)
            count += 2

    elif file_key == "015":
        replacements = [
            ("T+~13d real-elapsed", "2026-05-15"),
        ]
        for old_token, dt in replacements:
            new_token = wrap_time(old_token, dt)
            if old_token in html and f'<time datetime="{dt}">{old_token}</time>' not in html:
                html = html.replace(old_token, new_token)
                count += html.count(f'<time datetime="{dt}">{old_token}</time>')

        # dd element: "T+~13d · 2026-05-26"
        old_dd = "T+~13d · 2026-05-26"
        if old_dd in html:
            # T+~13d real-elapsed already wrapped; the dd version is separate
            # Use datetime 2026-05-15 for the ~13d token and the explicit date for 2026-05-26
            new_dd = wrap_time("T+~13d", "2026-05-15") + " · " + wrap_time("2026-05-26", "2026-05-26")
            html = html.replace(old_dd, new_dd, 1)
            count += 2

    return html, count


def apply_index_entry_stats(html: str) -> tuple[str, int]:
    """
    Wrap T+Xd inside entry-stat-value divs in index.html.
    Pattern: <div class="entry-stat-value">T+155<span class="unit">d</span></div>
    """
    count = 0

    def replace_stat(m):
        nonlocal count
        days = int(m.group(1))
        dt = T_PLUS_MAP.get(days, "2026-05-06")
        count += 1
        return (
            f'<div class="entry-stat-value">'
            f'<time datetime="{dt}">T+{days}<span class="unit">d</span></time>'
            f"</div>"
        )

    html = re.sub(
        r'<div class="entry-stat-value">T\+(\d+)<span class="unit">d</span></div>',
        replace_stat,
        html,
    )
    return html, count


def build_skip_ranges(html: str) -> list:
    """
    Build list of (start, end) ranges in html that should NOT be processed
    by apply_inline_prose. Includes:
    - <style>...</style> blocks
    - <script>...</script> blocks
    - HTML comments
    - Already-wrapped <time>...</time> elements
    - rt-stamp div
    - <div class="ts"> entries (handled separately by apply_ts_day_divs)
    - <div class="date"> entries (handled by apply_date_divs)
    - HTML tag attributes (tag bodies)
    """
    skip = []

    patterns = [
        r"<style\b[^>]*>.*?</style>",
        r"<script\b[^>]*>.*?</script>",
        r"<!--.*?-->",
        r"<time\b[^>]*>.*?</time>",
        r'<div class="rt-stamp"[^>]*>.*?</div>',
        r'<div class="ts">.*?</div>',
        r'<div class="date">.*?</div>',
        r"<[^>]+>",  # All HTML tags (to protect attributes)
    ]

    for pat in patterns:
        for m in re.finditer(pat, html, re.DOTALL | re.IGNORECASE):
            skip.append((m.start(), m.end()))

    # Merge overlapping ranges
    skip.sort()
    merged = []
    for start, end in skip:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])

    return merged


def apply_inline_prose(html: str) -> tuple[str, int]:
    """
    Wrap T+Xd tokens in text nodes only — outside of style blocks, script
    blocks, HTML comments, already-wrapped <time> elements, rt-stamp,
    ts divs, and date divs.
    """
    count = 0
    merged = build_skip_ranges(html)

    result = []
    pos = 0
    for skip_start, skip_end in merged:
        if pos < skip_start:
            segment = html[pos:skip_start]

            def replace_t(sm, _count=None):
                nonlocal count
                d = int(sm.group(1))
                dt = T_PLUS_MAP.get(d, "2026-05-06")
                count += 1
                return wrap_time(f"T+{d}d", dt)

            segment = re.sub(r"T\+(\d+)d", replace_t, segment)
            result.append(segment)

        result.append(html[skip_start:skip_end])
        pos = skip_end

    if pos < len(html):
        segment = html[pos:]

        def replace_t2(sm):
            nonlocal count
            d = int(sm.group(1))
            dt = T_PLUS_MAP.get(d, "2026-05-06")
            count += 1
            return wrap_time(f"T+{d}d", dt)

        segment = re.sub(r"T\+(\d+)d", replace_t2, segment)
        result.append(segment)

    return "".join(result), count


# ─────────────────────────────────────────────────────────────────────────────
# Per-file orchestration
# ─────────────────────────────────────────────────────────────────────────────

def migrate_file(filepath: str, file_key: str) -> int:
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    original_count = html.count("<time ")

    if file_key == "index":
        html, _ = apply_index_entry_stats(html)
        html, _ = apply_inline_prose(html)

    elif file_key in ("014", "015"):
        html, _ = apply_dateline(html, file_key)
        html, _ = apply_real_elapsed_dates(html, file_key)
        # Wrap any remaining narrative T+Xd in prose (e.g., "narrative T+172d")
        html, _ = apply_inline_prose(html)

    else:
        # Standard narrative briefings 001–013
        html, _ = apply_dateline(html, file_key)
        html, _ = apply_date_divs(html)
        html, _ = apply_ts_day_divs(html)
        html, _ = apply_inline_prose(html)

    new_count = html.count("<time ")
    added = new_count - original_count

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"  {file_key}.html: {added:3d} <time> elements added  (total in file: {new_count})")
    return added


def main():
    files = [
        ("001", "001.html"),
        ("002", "002.html"),
        ("003", "003.html"),
        ("004", "004.html"),
        ("005", "005.html"),
        ("006", "006.html"),
        ("007", "007.html"),
        ("008", "008.html"),
        ("009", "009.html"),
        ("010", "010.html"),
        ("011", "011.html"),
        ("012", "012.html"),
        ("013", "013.html"),
        ("014", "014.html"),
        ("015", "015.html"),
        ("index", "index.html"),
    ]

    total = 0
    print("A11Y-Mn08 <time> migration\n")
    for file_key, filename in files:
        filepath = os.path.join(BRIEFINGS_DIR, filename)
        if os.path.exists(filepath):
            n = migrate_file(filepath, file_key)
            total += n
        else:
            print(f"  MISSING: {filename}")

    print(f"\nTotal <time> elements added across all briefings: {total}")


if __name__ == "__main__":
    main()
