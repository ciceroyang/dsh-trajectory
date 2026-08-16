# dsh-trajectory

Renders a DeepSeek Harness session log into a **shareable HTML trajectory document** — the offline, zero-dependency cousin of the official Trajectory view. "Every run leaves a trace", made portable.

## Usage

    node trajectory.mjs <session.jsonl.zstd>
    node trajectory.mjs <sessions-dir>      # newest log wins
    node trajectory.mjs <sessions-dir> --all # merge every session into one chronological volume
    node trajectory.mjs <log> --out report.html

Output: one self-contained HTML file (inline CSS, no external assets) plus the first 16 hex chars of its SHA-256.

## What the document contains

- session metadata (id / workspace / time range / turn count / token ledger)
- per-turn timeline: user asks, tool calls (argument briefs + error markers), assistant excerpts
- end-reason annotations (completed / blocked / error / …)

## Technical notes

- multi-frame zstd frame scan + per-frame decode (the single-shot-decompress pitfall, algorithm ported from the official format.ts)
- zero dependencies, plain ESM; the HTML renderer is a pure function, fully unit-testable
- all output is HTML-escaped, so hostile log text cannot become script

## Use cases

- delivery audit: hand the trajectory to a reviewer with a checkable SHA-256
- incident review: tool errors visible in their exact timeline position
- sharing: no DSH installation needed — open in any browser

## Sibling tools

- dsh-report-studio: session → daily/weekly/handoff reports with receipts
- dsh-plugin-starter / dsh-doctor: plugin scaffold / environment doctor
