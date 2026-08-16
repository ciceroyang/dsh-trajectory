/**
 * Tests for the merged-volume renderer.
 * @module dsh-trajectory/tests/merged
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderHtmlMerged } from '../trajectory.mjs'

test('renderHtmlMerged renders chapters with totals and escaping', () => {
  const chapters = [
    {
      header: { id: 'session-aaaa1111', createdAt: 1700000000000 },
      timeline: {
        turns: [{ turn: 0, startedAt: 1700000000000, endedAt: 1700001000000, endReason: 'completed', ask: '任务A', steps: [{ kind: 'assistant', text: 'done' }], toolCalls: [] }],
        totalTokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
      },
    },
    {
      header: { id: 'session-bbbb2222', createdAt: 1700002000000 },
      timeline: {
        turns: [{ turn: 0, startedAt: 1700002000000, endedAt: 1700003000000, endReason: 'completed', ask: '<b>任务B</b>', steps: [], toolCalls: [{ name: 'bash', brief: 'ls', error: null }] }],
        totalTokens: { input: 200, output: 100, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
      },
    },
  ]
  const html = renderHtmlMerged(chapters)
  assert.ok(html.includes('会话轨迹合订'))
  assert.ok(html.includes('2 个会话'))
  assert.ok(html.includes('合计回合 2'))
  assert.ok(html.includes('session-aaaa'))
  assert.ok(html.includes('session-bbbb'))
  assert.ok(html.includes('&lt;b&gt;任务B'))
  assert.ok(!html.includes('<b>任务B'))
})
