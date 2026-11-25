import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRule, parseCap, type Rule } from './playbook.ts'
import { segment } from './segment.ts'

const cap = (text: string, spec: { minMonths: number; minAmount?: number } = { minMonths: 12 }) =>
  checkRule({ id: 'r', name: 'Cap', severity: 'high', fallback: '', enabled: true, kind: 'liabilityCap', ...spec } as Rule, segment(`1. Limitation of Liability. Total liability will not exceed ${text}.\n2. Other. Nothing.`).clauses)[0]

test('a multiple applies to the period it names', () => {
  const m = (s: string) => parseCap(s)?.months
  assert.equal(m('two (2) times the fees paid in the three (3) months before the claim'), 6)
  assert.equal(m('2x the fees paid in the 3-month period before the claim'), 6)
  assert.equal(m('two times the fees paid in the twelve (12) months before the claim'), 24)
  assert.equal(m('two times the fees paid during the preceding year'), 24)
  assert.equal(m('two (2) times the annual fees, if notified within thirty (30) days'), 24)
  assert.equal(m('two times the fees'), 24)
  assert.equal(m('three times the monthly fees'), 3)
  assert.equal(cap('two (2) times the fees paid in the three (3) months before the claim').status, 'fail')
  assert.equal(cap('two times the fees paid in the preceding quarter').status, 'fail')
})

test('a fixed amount does not pass a rule set in months', () => {
  assert.match(cap('$100').message, /Cap is \$100, a fixed amount.*Set a minimum amount/)
  assert.equal(cap('$100').status, 'fail')
  assert.equal(cap('$100', { minMonths: 12, minAmount: 50_000 }).status, 'fail')
  assert.equal(cap('$100,000', { minMonths: 12, minAmount: 50_000 }).status, 'pass')
  assert.equal(cap('$100', { minMonths: 0 }).status, 'pass')
})

test('"lesser of" is judged on both arms, "greater of" on the fees', () => {
  assert.equal(cap('the lesser of $500 and the fees paid in the twelve (12) months before the claim').status, 'fail')
  assert.equal(cap('the fees paid in the twelve (12) months before the claim or $500, whichever is less', { minMonths: 12, minAmount: 1000 }).status, 'fail')
  assert.equal(cap('the lesser of $5,000 and the fees paid in the twelve (12) months before the claim', { minMonths: 12, minAmount: 1000 }).status, 'pass')
  assert.equal(cap('the greater of $500 and the fees paid in the twelve (12) months before the claim').status, 'pass')
})

test('months and years are exact', () => {
  const m = (s: string) => parseCap(`fees paid in the ${s} before the claim`)!.months
  assert.deepEqual(['forty-eight (48) months', '49 months', '60 months', '120 months', '12 months', 'two (2) years', '12-month period', '90 days'].map(m), [48, 49, 60, 120, 12, 24, 12, 3])
  assert.equal(cap('the fees paid in the forty-eight (48) months before the claim', { minMonths: 48 }).status, 'pass')
})
