import assert from 'node:assert/strict'
import { test } from 'node:test'
import { migrateKeys, roundIssues, trackRounds, versionIssues, type Issue } from './analyze.ts'
import { playbookById } from './playbook.ts'
import { segment } from './segment.ts'

const nda = playbookById('nda-mutual')!, fl = playbookById('freelancer')!
const t = (s: string, title = 'Memory') => `1. ${title}. Receiver may use ${s} freely.\n2. Other. Nothing in this clause changes at all.\n`
const of = (text: string, id: string, pb = nda) => versionIssues(segment(text), pb).filter(i => i.key.startsWith(id))
const status = (texts: string[], conceded: string[]) => Object.fromEntries(trackRounds(roundIssues(texts, nda), conceded).filter(x => x.key.startsWith('nda-residuals')).map(x => [x.detail, x.status]))

test('a concession does not cover a different phrase, or the same phrase in another clause', () => {
  const [old] = of(t('residuals'), 'nda-residuals')
  assert.deepEqual(status([t('residuals'), t('its unaided memory')], [old.key]), { 'Contains “unaided memory”.': 'new', 'Contains “residuals”.': 'resolved' })
  assert.deepEqual(status([t('residuals'), t('residuals')], [old.key]), { 'Contains “residuals”.': 'conceded' })
  const both = of(t('residuals') + '3. Extra. Residuals and unaided memory.\n', 'nda-residuals')
  assert.equal(new Set(both.map(i => i.key)).size, 3)
  assert.equal(both.filter(i => i.key === old.key).length, 1)
})

test('inserting a clause does not move a concession', () => {
  const [old] = of(t('residuals'), 'nda-residuals')
  const v2 = '1. Audit. A new clause in front.\n' + t('residuals').replace('2. Other', '3. Other').replace('1. Memory', '2. Memory')
  assert.deepEqual(of(v2, 'nda-residuals').map(i => i.key), [old.key])
})

test('single-finding rules keep their keys; two non-competes are two findings', () => {
  assert.ok(versionIssues(segment(t('x')), nda).some(i => i.key === 'nda-law'))
  const keys = of('1. A. Contractor will not compete.\n2. B. Contractor may not compete.\n', 'fl-noncompete', fl).map(i => i.key)
  assert.equal(new Set(keys).size, 2)
})

const saved = (texts: string[], conceded: string[], notes: Record<string, string> = {}) => ({
  playbook: nda, conceded, notes,
  versions: texts.map(x => ({ issues: of(x, 'nda-residuals').map((i, n): Issue => ({ ...i, key: n ? `nda-residuals:${i.clauseId}` : 'nda-residuals' })) })),
})

test('saved concessions and notes move to what they were about', () => {
  const key = of(t('residuals'), 'nda-residuals')[0].key
  const m = migrateKeys(saved([t('residuals'), t('residuals')], ['nda-law', 'nda-residuals'], { 'nda-residuals': 'ok', 'nda-law': 'n' }))
  assert.deepEqual(m.conceded, ['nda-law', key])
  assert.deepEqual(m.notes, { [key]: 'ok', 'nda-law': 'n' })
  assert.equal(m.versions[1].issues[0].key, key)
  assert.equal(migrateKeys(m), m, 'nothing left to move')
  assert.deepEqual(migrateKeys({ ...m, conceded: ['nda-residuals'] }).conceded, [key], 'an old concession synced in later')
})

test('a saved concession that covered different phrases is dropped; its note is not', () => {
  const m = migrateKeys(saved([t('residuals'), t('its unaided memory')], ['nda-residuals'], { 'nda-residuals': 'ok' }))
  assert.deepEqual(m.conceded, [])
  assert.deepEqual(Object.values(m.notes), ['ok'])
})
