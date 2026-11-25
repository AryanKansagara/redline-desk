import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRule, parseCap, type Rule } from './playbook.ts'
import { parseNumber, quantChanges, quantities } from './quant.ts'
import { segment } from './segment.ts'

const rule = (spec: Partial<Rule> & Pick<Rule, 'kind'>): Rule => ({ id: 'r', name: 'Rule', severity: 'high', fallback: 'fb', enabled: true, ...spec } as Rule)
const run = (r: Rule, text: string) => { const f = checkRule(r, segment(`${text}\n9. Other. Nothing in this clause matters.\n`).clauses)[0]; return `${f.status}: ${f.message}` }
const pay = (body: string, title = 'Payment') => run(rule({ kind: 'paymentDays', maxDays: 30 }), `1. ${title}. ${body}`)
const renew = (body: string) => run(rule({ kind: 'autoRenewal', maxNoticeDays: 60 }), `1. Renewal. This renews automatically ${body}`)

test('number words', () => {
  const n: [string, number | null][] = [['seventeen', 17], ['nineteen', 19], ['twenty-one', 21], ['thirty five', 35], ['one hundred twenty', 120], ['one hundred and twenty', 120], ['one-hundred-eighty', 180], ['a hundred', 100], ['hundred', 100], ['three hundred sixty-five', 365], ['one thousand', 1000], ['1,000', 1000], ['2.5', 2.5], ['ten and thirty', null], ['twenty thirty', null], ['months', null], ['', null]]
  for (const [s, v] of n) assert.equal(parseNumber(s), v, s)
})

test('periods in words, with hyphens and in business days are compared', () => {
  assert.deepEqual(quantChanges('for a 12-month period', 'for a 6-month period'), [{ kind: 'duration', before: '12-month', after: '6-month' }])
  assert.deepEqual(quantChanges('in seventeen days', 'in nineteen days'), [{ kind: 'duration', before: 'seventeen days', after: 'nineteen days' }])
  assert.deepEqual(quantChanges('in 10 business days', 'in 14 days'), [{ kind: 'duration', before: '10 business days', after: '14 days' }])
  assert.equal(quantChanges('in one month', 'in 30 days').length, 1)
  assert.deepEqual(quantChanges('within 30 (thirty) days', 'within thirty (30) days'), [])
  assert.deepEqual(quantChanges('in 2 weeks', 'in 14 days'), [])
  assert.deepEqual(quantities('between ten and thirty days').map(q => q.value), [30])
})

test('payment periods', () => {
  for (const [s, want] of [
    ['Customer will pay within one hundred twenty (120) days.', 'fail: Payment due in 120 days; playbook maximum is 30.'],
    ['Customer will pay within one hundred twenty days.', 'fail: Payment due in 120 days; playbook maximum is 30.'],
    ['Customer will pay within four months.', 'fail: Payment due in four months (about 120 days); playbook maximum is 30.'],
    ['Invoices are due one hundred twenty (120) days after invoice.', 'fail: Payment due in 120 days; playbook maximum is 30.'],
    ['Payment is due no later than 45 days from receipt.', 'fail: Payment due in 45 days; playbook maximum is 30.'],
    ['Client pays invoices net ninety (90).', 'fail: Payment due in 90 days; playbook maximum is 30.'],
    ['Client may dispute an invoice within ten (10) days. Client will pay within 120 days.', 'fail: Payment due in 120 days; playbook maximum is 30.'],
    ['Client will pay within 30 business days.', 'fail: Payment due in 30 business days (about 42 days); playbook maximum is 30.'],
    ['Client pays in thirty (30) days.', 'pass: Payment due in 30 days.'],
    ['Client will pay within two weeks of invoice.', 'pass: Payment due in two weeks (about 14 days).'],
    ['Invoices are payable upon receipt. Interest accrues 30 days after the due date.', 'pass: Payment due at once.'],
    ['Client will pay within a reasonable time.', 'fail: Payment clause found but no payment period could be read.'],
    ['Client will pay within the Payment Period.', 'fail: The payment period is set by “Payment Period”, which is filled in outside this text (cover page or order form). Check it is no more than 30 days.'],
  ]) assert.equal(pay(s), want, s)
})

test('clauses that are not about when to pay do not fail the payment rule', () => {
  assert.equal(pay('Liability will not exceed the fees paid in the twelve (12) months before the claim.', 'Cap'), 'pass: No payment period found.')
  assert.equal(pay('Liability will not exceed fees paid within twelve (12) months preceding the claim.', 'Cap'), 'pass: No payment period found.')
  assert.equal(pay('The losing party shall pay legal fees.', 'Disputes'), 'pass: No payment period found.')
})

test('renewal notice', () => {
  assert.match(renew('unless a party gives notice at least one hundred twenty (120) days before the end of the term.'), /^fail: .*120 days' notice/)
  assert.match(renew('unless a party gives at least one hundred twenty days’ prior written notice.'), /^fail: .*120 days' notice/)
  assert.match(renew('unless notice is given at least three months before the end of the term.'), /^fail: .*three months \(about 90 days\) notice/)
  assert.match(renew('unless notice is given sixty (60) days before the term ends.'), /^pass: 60-day/)
  assert.match(renew('for a minimum of 12 months unless notice is given at least 30 days before renewal.'), /^pass: 30-day/)
  assert.match(renew('for successive 12-month terms.'), /no notice window/)
})

test('caps still read their periods', () => {
  assert.equal(parseCap('the fees paid in the thirty-six (36) months before')!.months, 36)
  assert.equal(parseCap('the fees paid in the twenty four months before')!.months, 24)
  assert.equal(parseCap('two (2) times the fees paid in the 3-month period before')!.months, 6)
})
