import assert from 'node:assert/strict'
import { test } from 'node:test'
import { segment } from './segment.ts'

const nums = (s: string) => segment(s).clauses.map(c => c.num)

test('wrapped reference lines stay in their sentence', () => {
  const d = segment('1. Term. The agreement ends as set out in\nSection 5 of this Agreement and the fees under Sections 3.1 and\n3.2 shall apply.\n2. Fees. Customer pays.')
  assert.deepEqual(d.clauses.map(c => [c.num, c.body]), [['1', 'The agreement ends as set out in Section 5 of this Agreement and the fees under Sections 3.1 and 3.2 shall apply.'], ['2', 'Customer pays.']])
  assert.deepEqual(d.warnings, [])
  for (const s of ['1. A. Subject to\nSection 2, the fee is due.\n2. B. Done.', '1. A. As required by\nArticle 2.\n2. B. Done.', '1. A. Under Sections 1.2,\n1.1 and 1.3 the fee is due.\n2. B. Done.', '1. A. A fee of not more than\n2.5 times the amount.\n2. B. Done.', '1. A. The duties in this deed and\nSection 2(a) survive.\n2. B. Done.']) assert.deepEqual(nums(s), ['1', '2'], s)
})

test('real clause starts are kept', () => {
  assert.deepEqual(nums('Section 1. Term. One year.\nSection 2. Confidentiality\nSecrets stay secret.\nSection 3 Fees\nPay.'), ['1', '2', '3'])
  assert.deepEqual(nums('MASTER AGREEMENT\nSection 1 term of years\nOne.'), [null, '1'])
  assert.deepEqual(nums('ARTICLE I\nTerms apply.\nARTICLE II\nMore apply.'), ['I', 'II'])
  // Lower-case list items without end punctuation, in sequence.
  assert.deepEqual(nums('1. Duties. Provider will\n1.1 keep records, and\n1.2 pay taxes\n1.2.1 on time\n2. Term. One.'), ['1', '1.1', '1.2', '1.2.1', '2'])
  assert.deepEqual(nums('1. A. First.\n\n1.3 starts after a blank line.\n2. B. Two.'), ['1', '1.3', '2'])
  assert.deepEqual(nums('1. Fees. Customer pays; and\n3.2 Support. Provider helps.'), ['1', '3.2'])
})
