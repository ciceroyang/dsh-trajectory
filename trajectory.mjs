#!/usr/bin/env node
/**
 * dsh-trajectory — render a DSH session log into a shareable HTML trajectory
 * document: the official Trajectory view's offline, zero-dependency cousin.
 *
 * Usage:
 *   node trajectory.mjs <session.jsonl.zstd>
 *   node trajectory.mjs <workspace-sessions-dir>      # newest log in the tree
 *   node trajectory.mjs <log> --out report.html
 *
 * @module dsh-trajectory
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const ZSTD_MAGIC = 0xFD2FB528

function zstdAvailable() {
  if (typeof process.getBuiltinModule !== 'function') return false
  const zlib = process.getBuiltinModule('node:zlib')
  return zlib !== undefined && typeof zlib.zstdDecompressSync === 'function'
}

export function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return frames
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error('corrupt zstd frame magic at byte ' + offset)
    offset += 4
    if (offset === buffer.length) return frames
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    for (;;) {
      if (buffer.length - offset < 3) return frames
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) throw new Error('reserved zstd block type')
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return frames
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

export function zstdDecompressAll(bytes) {
  if (!zstdAvailable()) return null
  const zlib = process.getBuiltinModule('node:zlib')
  const parts = []
  for (const frame of scanZstdFrames(bytes)) {
    parts.push(zlib.zstdDecompressSync(bytes.subarray(frame.start, frame.end)).toString('utf8'))
  }
  return parts.join('')
}

export function parseSessionLog(text) {
  let header = null
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (!record || typeof record !== 'object') continue
    if (record.type === 'session') { header = record; continue }
    if (typeof record.type === 'string' && typeof record.seq === 'number' && record.data !== undefined) events.push(record)
  }
  return { header, events }
}

function textOfContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (typeof block === 'string') parts.push(block)
    else if (block && typeof block === 'object') {
      if (typeof block.text === 'string') parts.push(block.text)
      else if (typeof block.content === 'string') parts.push(block.content)
    }
  }
  return parts.join('\n').trim()
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtTime(ms) {
  if (!Number.isFinite(ms)) return '-'
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

function fmtTokens(n) {
  if (!Number.isFinite(n)) return String(n ?? '-')
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

export function buildTimeline(events) {
  const turns = []
  let current = null
  const callNames = new Map()
  let totalTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }

  for (const event of events) {
    switch (event.type) {
      case 'turn/start':
        current = { turn: event.data.turn, startedAt: event.time, endedAt: null, endReason: null, ask: '', steps: [], toolCalls: [], tokens: 0 }
        turns.push(current)
        break
      case 'turn/end':
        if (current) { current.endedAt = event.time; current.endReason = event.data.reason?.kind ?? 'unknown' }
        break
      case 'step/start':
        if (current) current.steps.push({ turn: event.data.turn, step: event.data.step, startedAt: event.time })
        break
      case 'user/message': {
        const text = textOfContent(event.data.content)
        if (event.data.source?.kind === 'user' && text && current && current.ask === '') current.ask = text
        break
      }
      case 'assistant/message': {
        const text = textOfContent(event.data.message?.content)
        const usage = event.data.usage
        if (usage) {
          const add = (k, v) => { const n = Number(v); if (Number.isFinite(n)) totalTokens[k] += n }
          add('input', usage.inputTokens); add('output', usage.outputTokens)
          add('cacheRead', usage.cacheReadTokens); add('cacheWrite', usage.cacheWriteTokens); add('reasoning', usage.reasoningTokens)
        }
        if (current && text) current.steps.push({ kind: 'assistant', text: text.slice(0, 4000) })
        break
      }
      case 'tool/call': {
        if (current) {
          let args = {}
          try { args = JSON.parse(event.data.arguments ?? '{}') } catch { args = {} }
          const brief = (args.command ?? args.file_path ?? args.path ?? args.query ?? args.kind ?? '').toString().slice(0, 120)
          const entry = { kind: 'tool', name: event.data.name, brief, error: null }
          current.toolCalls.push(entry)
          callNames.set(event.data.callId, entry)
        }
        break
      }
      case 'tool/result': {
        if (event.data.error) {
          const entry = callNames.get(event.data.message?.content?.[0]?.callId)
          if (entry) entry.error = event.data.error.code ?? 'TOOL_ERROR'
        }
        break
      }
      default:
        break
    }
  }

  return { turns, totalTokens }
}

export function renderHtml(header, timeline) {
  const rows = timeline.turns.map((turn) => {
    const tools = turn.toolCalls.map((t) =>
      '<div class="tool' + (t.error ? ' err' : '') + '">' + escapeHtml(t.name) + ' ' + escapeHtml(t.brief) + (t.error ? ' <b>✗ ' + escapeHtml(t.error) + '</b>' : '') + '</div>',
    ).join('')
    const asks = turn.ask ? '<div class="ask">' + escapeHtml(turn.ask.slice(0, 500)) + '</div>' : ''
    const assistant = turn.steps.filter((s) => s.kind === 'assistant').map((s) => '<div class="assistant">' + escapeHtml(s.text.slice(0, 1200)) + '</div>').join('')
    return '<section class="turn">' +
      '<header>回合 #' + turn.turn + ' · ' + fmtTime(turn.startedAt) + ' → ' + fmtTime(turn.endedAt) +
      ' · ' + turn.steps.length + ' 步 · ' + turn.toolCalls.length + ' 工具 · 结束: ' + escapeHtml(turn.endReason ?? '-') + '</header>' +
      asks + '<div class="tools">' + tools + '</div>' + assistant + '</section>'
  }).join('\n')

  const t = timeline.totalTokens
  const total = t.input + t.output + t.cacheRead + t.cacheWrite + t.reasoning
  return '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>会话轨迹 · ' + escapeHtml(String(header?.id ?? 'unknown').slice(0, 8)) + '</title><style>' +
    'body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;background:#0f1420;color:#dde3ee}' +
    '.wrap{max-width:960px;margin:0 auto;padding:24px}' +
    'h1{font-size:20px;margin:0 0 4px}.meta{color:#8a93a6;font-size:12px;margin-bottom:16px}' +
    '.turn{background:#171d2c;border:1px solid #232c40;border-radius:10px;padding:12px 14px;margin-bottom:12px}' +
    '.turn header{font-size:13px;color:#7ee0ff;margin-bottom:8px}' +
    '.ask{background:#1d2740;border-left:3px solid #4d7cff;padding:8px 10px;border-radius:6px;margin:6px 0;font-size:14px}' +
    '.tool{font-size:12px;color:#aeb8cc;padding:3px 0;border-bottom:1px dashed #232c40;font-family:Menlo,monospace}' +
    '.tool.err{color:#ff9d9d}.assistant{font-size:13px;line-height:1.6;color:#c6cede;margin-top:8px;white-space:pre-wrap}' +
    '</style></head><body><div class="wrap">' +
    '<h1>会话轨迹 Trajectory</h1>' +
    '<div class="meta">session ' + escapeHtml(String(header?.id ?? '-')) + ' · 工作区 ' + escapeHtml(header?.cwd ?? '-') +
    ' · ' + fmtTime(header?.createdAt) + ' · 回合 ' + timeline.turns.length +
    ' · Token 输入 ' + fmtTokens(t.input) + ' / 输出 ' + fmtTokens(t.output) + ' / 合计 ' + fmtTokens(total) +
    ' · 由 dsh-trajectory 生成</div>' +
    rows + '</div></body></html>'
}

function findNewestLog(dir) {
  let best = null
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'session.jsonl.zstd') {
        const mtime = statSync(full).mtimeMs
        if (!best || mtime > best.mtime) best = { path: full, mtime }
      }
    }
  }
  walk(dir)
  return best
}

function main() {
  const argv = process.argv.slice(2)
  const outFlag = argv.indexOf('--out')
  const outPath = outFlag >= 0 && argv[outFlag + 1] ? resolve(argv[outFlag + 1]) : null
  const targetArg = argv.find((a) => !a.startsWith('--') && a !== (outFlag >= 0 ? argv[outFlag + 1] : undefined))
  if (!targetArg) {
    console.error('usage: node trajectory.mjs <session.jsonl.zstd|sessions-dir> [--out file.html]')
    process.exit(2)
  }
  const target = resolve(targetArg)
  let logPath = target
  if (existsSync(target) && statSync(target).isDirectory()) {
    const newest = findNewestLog(target)
    if (!newest) { console.error('no session.jsonl.zstd found under ' + target); process.exit(2) }
    logPath = newest.path
  }
  const bytes = readFileSync(logPath)
  let text
  if (logPath.endsWith('.zstd')) {
    if (!zstdAvailable()) { console.error('this Node has no built-in zstd (>= 22.15 required)'); process.exit(2) }
    text = zstdDecompressAll(bytes)
    if (text === null) { console.error('failed to decode ' + logPath); process.exit(2) }
  } else {
    text = bytes.toString('utf8')
  }
  const { header, events } = parseSessionLog(text)
  const timeline = buildTimeline(events)
  const html = renderHtml(header, timeline)
  const output = outPath ?? join(process.cwd(), 'trajectory-' + String(header?.id ?? 'session').slice(0, 8) + '.html')
  writeFileSync(output, html)
  console.log('rendered ' + timeline.turns.length + ' turns to ' + output)
  const sha = createHash('sha256').update(html, 'utf8').digest('hex').slice(0, 16)
  console.log('html sha256(前16): ' + sha)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main()
