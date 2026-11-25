import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roundIssues, trackRounds } from './analyze.ts'
import { playbookById } from './playbook.ts'

const L = 'Liability. Each party caps its liability at the yearly fees.', I = 'Insurance. Provider keeps cover in force at all times.', A = 'Audit. Customer may inspect the books once every year.'
const doc = (...parts: string[]) => parts.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n'
const cite = (s: string) => `Remedies. See ${s} for the limit that applies to every claim made here.`
const status = (key: string, ...texts: string[]) => trackRounds(roundIssues(texts, playbookById('msa-customer')!)).find(t => t.key === key)?.status
const S1 = cite('Section 1')

test('a stale reference stays open while nothing is fixed', () => {
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(I, L, S1)), 'open')
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(I, L, S1), doc(I, L, S1)), 'open', 'a fourth round')
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(A, I, L, S1)), 'open', 'renumbered again, still not Liability')
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(I, L.replace('yearly', 'annual'), cite('Section 1').replace('claim', 'loss'))), 'open', 'edits elsewhere')
})

test('fixing the citation or the numbering resolves it', () => {
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(I, L, cite('Section 2'))), 'resolved')
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(L, I, S1)), 'resolved')
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(I, L, cite('Section 1 (Insurance)'))), 'resolved', 'names its target')
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(I, L)), 'resolved', 'the citing clause is gone')
  assert.equal(status('xref:1', doc(L, I, S1), doc(I, L, S1), doc(I, L, S1), doc(I, L, cite('Section 2')), doc(I, L, cite('Section 2'))), 'resolved')
})

test('two swapped citations are fixed by swapping them', () => {
  const both = (x: string) => cite(x)
  const v = [doc(L, I, both('Sections 1 and 2')), doc(I, L, both('Sections 1 and 2'))]
  assert.equal(status('xref:1', ...v, doc(I, L, both('Sections 2 and 1'))), 'resolved')
  assert.equal(status('xref:1', ...v, v[1]), 'open')
  assert.equal(status('xref:2', ...v, v[1]), 'open')
})

test('a reference to a deleted clause stays open until that clause is back', () => {
  const S2 = cite('Section 2')
  const v = [doc(L, I, S2), doc(L, S2)]
  assert.equal(status('xref:2', ...v, v[1]), 'open')
  assert.equal(status('xref:2', ...v, doc(L, A, S2)), 'open', 'another clause took the number')
  assert.equal(status('xref:2', ...v, doc(L, A, S2), doc(L, A, S2)), 'open')
  assert.equal(status('xref:2', ...v, doc(L, I, S2)), 'resolved')
})

test('a removed definition stays open until it is restored or no longer used', () => {
  const D = 'Definitions. "Widget" means a small part.', U = 'Use. Customer uses the Widget daily.', N = 'Definitions. None are needed here.'
  const v = [doc(D, U), doc(N, U)]
  const key = 'def:removed:Widget'
  assert.equal(status(key, ...v, v[1]), 'open')
  assert.equal(status(key, ...v, v[1], v[1]), 'open')
  assert.equal(status(key, ...v, doc(D, U)), 'resolved')
  assert.equal(status(key, ...v, doc(N, 'Use. Customer uses the part daily.')), 'resolved')
})
