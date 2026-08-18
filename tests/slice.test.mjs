/**
 * Tests for time-window slicing.
 * @module dsh-trajectory/tests/slice
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sliceTimeline } from '../trajectory.mjs'

const T = (startedAt) => ({ turn: 0, startedAt, endedAt: startedAt + 1000, endReason: 'completed', ask: '', steps: [], toolCalls: [] })
const TIMELINE = { turns: [T(1000), T(2000), T(3000)], totalTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } }

test('sliceTimeline keeps turns inside the window', () => {
  const out = sliceTimeline(TIMELINE, 1500, 2500)
  assert.equal(out.turns.length, 1)
  assert.equal(out.turns[0].startedAt, 2000)
  assert.equal(out.sliced, true)
  assert.equal(out.kept, 1)
})

test('sliceTimeline passes through when no window is given', () => {
  const out = sliceTimeline(TIMELINE, null, null)
  assert.equal(out, TIMELINE)
})

test('sliceTimeline honors only the lower bound', () => {
  const out = sliceTimeline(TIMELINE, 2000, null)
  assert.equal(out.turns.length, 2)
})

test('sliceTimeline honors only the upper bound', () => {
  const out = sliceTimeline(TIMELINE, null, 2000)
  assert.equal(out.turns.length, 2)
})
