import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRule, type Rule } from './playbook.ts'
import { segment } from './segment.ts'

const check = (body: string, kind: 'noncompete' | 'nonsolicit') => checkRule({ id: 'r', name: 'R', severity: 'high', fallback: '', enabled: true, kind: 'restrictive', forbid: [kind] } as Rule, segment(`1. Conduct. ${body}\n2. Other. Nothing.\n`).clauses)[0].status

test('non-competes in every usual form', () => {
  for (const s of ['Contractor will not compete with Client.', 'Contractor agrees not to compete.', 'Contractor may not compete with Client.', 'Contractor must not engage in a competing business.', 'Contractor cannot compete.', 'Contractor agrees that it will not compete.', 'Contractor covenants and agrees to not compete.', 'Contractor shall refrain from competing.', 'Contractor shall not provide services to any competing business.', 'This is a non-compete.', 'Contractor shall not be prevented from publishing, but must not compete.'])
    assert.equal(check(s, 'noncompete'), 'fail', s)
})

test('non-solicits in every usual form', () => {
  for (const s of ['Contractor will not solicit employees.', 'Contractor agrees not to solicit employees.', 'Contractor may not directly or indirectly solicit customers.', 'Contractor shall not solicit customers.'])
    assert.equal(check(s, 'nonsolicit'), 'fail', s)
})

test('the opposite is not a restriction', () => {
  for (const s of ['Contractor shall not be prevented from competing.', 'Contractor will not be restricted from competing with Client.', 'This Agreement shall not, in any way, prevent Contractor from competing.', 'Contractor may compete with Client.', 'Fees are not to exceed competitive rates.', 'Contractor will not disclose secrets. Contractor may compete.'])
    assert.equal(check(s, 'noncompete'), 'pass', s)
  for (const s of ['Contractor shall not be prohibited from soliciting customers.', 'This clause will not apply to general solicitations.'])
    assert.equal(check(s, 'nonsolicit'), 'pass', s)
})
