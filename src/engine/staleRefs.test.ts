import assert from 'node:assert/strict'
import { test } from 'node:test'
import { align } from './align.ts'
import { segment } from './segment.ts'
import { checkRefs } from './xref.ts'

const L = 'Liability. Each party caps its liability at the yearly fees.', I = 'Insurance. Provider keeps cover in force at all times.', A = 'Audit. Customer may inspect the books once every year.'
const doc = (...parts: string[]) => segment(parts.map((p, i) => `${i + 1}. ${p}`).join('\n')).clauses
const cite = (s: string) => `Remedies. See ${s} for the limit that applies to every claim made here.`
const check = (a: string[], b: string[]) => { const x = doc(...a), y = doc(...b); return checkRefs(y, x, align(x, y)).map(r => [r.target, r.status]) }

test('a new clause at the cited number does not hide the stale reference', () => {
  const x = doc(L, I, cite('Section 1')), y = doc(A, L, I, cite('Section 1'))
  const [r] = checkRefs(y, x, align(x, y))
  assert.equal(r.status, 'stale')
  assert.match(r.detail, /Section 1 \(Liability\) is now § 2/)
})

test('a correctly updated reference is ok, whatever its new number used to be', () => {
  assert.deepEqual(check([L, I, cite('Section 1')], [A, L, I, cite('Section 2')]), [['2', 'ok']])
  assert.deepEqual(check([L, I, cite('Sections 1 and 2')], [A, L, I, cite('Sections 2 and 3')]), [['2', 'ok'], ['3', 'ok']])
})

test('only the leftover is stale when one of two references was updated', () => {
  assert.deepEqual(check([L, I, cite('Section 1 and Section 2')], [A, L, I, cite('Section 1 and Section 3')]), [['1', 'stale'], ['3', 'ok']])
})

test('swapped targets with untouched citations are stale', () => {
  assert.deepEqual(check([L, I, cite('Sections 1 and 2')], [I, L, cite('Sections 1 and 2')]), [['1', 'stale'], ['2', 'stale']])
})

test('new references, to new or old clauses, are ok; missing ones are not', () => {
  assert.deepEqual(check([L, I, cite('the schedule')], [A, L, I, cite('Section 1')]), [['1', 'ok']])
  assert.deepEqual(check([L, I, cite('the schedule')], [L, I, cite('Section 9')]), [['9', 'missing']])
  assert.deepEqual(check([L, I, cite('Section 1')], [I, cite('Section 1')]), [['1', 'stale']])
})

test('putting a dropped clause back under the number its citation names is not stale', () => {
  const E = 'Exclusions. The cap does not apply to fraud.', C = 'Cap. Except for the exclusions in Section 2, liability is capped.'
  assert.deepEqual(check([C, I], [C, E, I]), [['2', 'ok']])
  assert.deepEqual(check([C, I], [C, A, I]), [['2', 'stale']])
})
