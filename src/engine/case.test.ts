import assert from 'node:assert/strict'
import { test } from 'node:test'
import { align, summary } from './align.ts'
import { segment } from './segment.ts'

const pairs = (a: string, b: string) => align(segment(a).clauses, segment(b).clauses)
const other = '\n2. Other. Nothing changes here.'

test('a capitalisation-only edit is a modified clause with a word diff', () => {
  const p = pairs(`1. Use. Receiver protects Confidential Information.${other}`, `1. Use. Receiver protects confidential information.${other}`)
  assert.equal(summary(p).modified, 1)
  assert.equal(summary(p).inserted, 0)
  assert.deepEqual(p[0].ops!.filter(o => o.t !== 'eq').map(o => o.s), ['Confidential Information', 'confidential information'])
})

test('a title that only changes case is reported', () => {
  assert.equal(pairs(`1. Fees. Pay.${other}`, `1. FEES. Pay.${other}`)[0].titleWas, 'Fees')
})

test('whitespace is not a change, and exact twins pair before case variants', () => {
  assert.equal(summary(pairs(`1. Use. Receiver  protects\nit.${other}`, `1. Use. Receiver protects it.${other}`)).modified, 0)
  const p = pairs('1. Keep it Safe.\n2. Keep it safe.', '1. Keep it safe.\n2. Keep it Safe.')
  assert.deepEqual([summary(p).modified, summary(p).moved], [0, 1])
})
