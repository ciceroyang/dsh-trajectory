# dsh-trajectory

Renders a DeepSeek Harness session log into a **shareable HTML trajectory document** — the offline, zero-dependency cousin of the official Trajectory view. "Every run leaves a trace", made portable.

## Quick start

Node.js 18 or later can render a single uncompressed `.jsonl` file. Node.js 22.15 or later is required for `.jsonl.zstd` input and directory mode because those paths use Node's built-in zstd decoder.

Run the pinned v0.4.2 release directly from GitHub without cloning:

    npx --yes github:ciceroyang/dsh-trajectory#v0.4.2 ./session.jsonl --out report.html

On Node.js 22.15 or later, compressed input works the same way:

    npx --yes github:ciceroyang/dsh-trajectory#v0.4.2 ./session.jsonl.zstd --out report.html

Or clone the source:

    git clone https://github.com/ciceroyang/dsh-trajectory.git
    cd dsh-trajectory

    node trajectory.mjs ./session.jsonl
    node trajectory.mjs ./session.jsonl.zstd # Node.js >= 22.15
    node trajectory.mjs ./sessions          # newest log wins
    node trajectory.mjs ./sessions --all    # merge every session into one chronological volume
    node trajectory.mjs ./session.jsonl --since 2026-08-11 --until 2026-08-17 # time-window slice
    node trajectory.mjs ./session.jsonl --out report.html

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
