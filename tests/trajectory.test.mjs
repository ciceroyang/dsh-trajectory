/**
 * Unit tests for the trajectory renderer.
 * @module dsh-trajectory/tests/trajectory
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSessionLog, buildTimeline, renderHtml, scanZstdFrames } from '../trajectory.mjs'

function ev(seq, type, data, time = seq * 1000) {
  return { seq, type, time, data }
}

test('scanZstdFrames rejects corrupt magic', () => {
  assert.throws(() => scanZstdFrames(Buffer.from([1, 2, 3, 4])), /corrupt zstd frame magic/)
})

test('parseSessionLog keeps events and skips chunk packs', () => {
  const text = [
    JSON.stringify({ type: 'session', version: 0, id: 's1', createdAt: 1 }),
    JSON.stringify({ type: 'user/message', seq: 0, time: 2, data: { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } } }),
    JSON.stringify({ type: 'reasoning-chunks', seq0: 1, data: {} }),
  ].join('\n')
  const parsed = parseSessionLog(text)
  assert.equal(parsed.header.id, 's1')
  assert.equal(parsed.events.length, 1)
})

test('buildTimeline groups turns, tools, tokens and end reasons', () => {
  const events = [
    ev(0, 'turn/start', { turn: 0 }),
    ev(1, 'user/message', { content: [{ type: 'text', text: '写个日报' }], source: { kind: 'user' } }),
    ev(2, 'tool/call', { turn: 0, step: 0, callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' }),
    ev(3, 'tool/result', { turn: 0, step: 0, message: { content: [{ callId: 'c1' }] }, error: { name: 'X', code: 'EXIT_1' } }),
    ev(4, 'assistant/message', { turn: 0, step: 0, message: { content: [{ type: 'text', text: '完成' }] }, usage: { inputTokens: 100, outputTokens: 50 } }),
    ev(5, 'turn/end', { turn: 0, reason: { kind: 'completed' } }),
  ]
  const timeline = buildTimeline(events)
  assert.equal(timeline.turns.length, 1)
  assert.equal(timeline.turns[0].ask, '写个日报')
  assert.equal(timeline.turns[0].toolCalls[0].name, 'bash')
  assert.equal(timeline.turns[0].toolCalls[0].error, 'EXIT_1')
  assert.equal(timeline.turns[0].endReason, 'completed')
  assert.equal(timeline.totalTokens.input, 100)
  assert.equal(timeline.totalTokens.output, 50)
})

test('renderHtml embeds the filter toolbar and error flags', () => {
  const header = { id: 'session-x', cwd: '/work', createdAt: 1700000000000 }
  const timeline = {
    turns: [
      { turn: 0, startedAt: 1, endedAt: 2, endReason: 'completed', ask: 'ok', steps: [], toolCalls: [{ name: 'bash', brief: 'ls', error: null }] },
      { turn: 1, startedAt: 3, endedAt: 4, endReason: 'completed', ask: 'bad', steps: [], toolCalls: [{ name: 'bash', brief: 'rm', error: 'EXIT_1' }] },
    ],
    totalTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
  }
  const html = renderHtml(header, timeline)
  assert.ok(html.includes('id="err-only"'))
  assert.ok(html.includes('id="kw"'))
  assert.ok(html.includes('data-error="1"'))
  assert.ok(html.includes('has-err'))
  assert.ok(html.includes('data-error="0"'))
})

test('renderHtml embeds meta, turns and escapes markup', () => {
  const header = { id: 'session-abc123', cwd: '/work', createdAt: 1700000000000 }
  const timeline = {
    turns: [{ turn: 0, startedAt: 1700000000000, endedAt: 1700001000000, endReason: 'completed', ask: '<script>alert(1)</script>', steps: [{ kind: 'assistant', text: 'ok' }], toolCalls: [{ name: 'bash', brief: 'ls', error: null }] }],
    totalTokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
  }
  const html = renderHtml(header, timeline)
  assert.ok(html.includes('会话轨迹 Trajectory'))
  assert.ok(html.includes('session-abc123'))
  assert.ok(html.includes('回合 #0'))
  assert.ok(!html.includes('<script>alert'))
  assert.ok(html.includes('&lt;script&gt;'))
})
