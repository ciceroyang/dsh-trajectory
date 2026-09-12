/**
 * CLI integration tests.
 * @module dsh-trajectory/tests/cli
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

test('CLI runs when invoked through an npm-style bin symlink', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-trajectory-cli-'))
  try {
    const source = fileURLToPath(new URL('../trajectory.mjs', import.meta.url))
    const bin = join(dir, 'dsh-trajectory')
    const input = join(dir, 'session.jsonl')
    const output = join(dir, 'report.html')

    symlinkSync(source, bin)
    writeFileSync(input, [
      JSON.stringify({ type: 'session', version: 0, id: 'symlink-session', cwd: '/work', createdAt: 1 }),
      JSON.stringify({ type: 'turn/start', seq: 0, time: 2, data: { turn: 0 } }),
      JSON.stringify({ type: 'turn/end', seq: 1, time: 3, data: { turn: 0, reason: { kind: 'completed' } } }),
    ].join('\n'))

    const result = spawnSync(process.execPath, [bin, input, '--out', output], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /rendered 1 turns/)
    assert.equal(existsSync(output), true)
    assert.match(readFileSync(output, 'utf8'), /symlink-session/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
