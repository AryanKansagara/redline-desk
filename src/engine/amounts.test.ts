import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCap } from './playbook.ts'
import { moneyValue, quantChanges, quantities } from './quant.ts'

const change = (a: string, b: string) => quantChanges(`Pay ${a} now.`, `Pay ${b} now.`)

test('unseparated digits, unit words in any case, and currencies are compared', () => {
  for (const [a, b] of [['$50000', '$50090'], ['$1000000', '$1000'], ['$5 Million', '$5 Thousand'], ['$2.5m', '$2.5k'], ['$100', '€100'], ['USD 5M', 'USD 5'], ['£2bn', '£2 million']]) assert.deepEqual(change(a, b), [{ kind: 'money', before: a, after: b }])
})

test('the same amount written another way is not a change', () => {
  for (const [a, b] of [['$50,000', '$50000'], ['$5M', '$5 million'], ['$10MM', '$10 million'], ['US$100', '$100'], ['USD 1,000', '$1,000'], ['$1,00,000', '$100,000']]) assert.deepEqual(change(a, b), [], `${a} ${b}`)
})

test('punctuation and following words are not swallowed', () => {
  assert.deepEqual(quantities('Pay $500, $1,250.50. Then $30 monthly and $7 kits.').map(q => [q.raw, q.value]), [['$500', 500], ['$1,250.50', 1250.5], ['$30', 30], ['$7', 7]])
  assert.equal(moneyValue('$2 billion'), 2e9)
  assert.equal(quantities('Pay €500,00 now.')[0].value, 500)
})

test('liability caps read whole amounts', () => {
  assert.equal(parseCap('will not exceed $1000000.')!.amount, 1e6)
  assert.equal(parseCap('will not exceed $2 billion.')!.amount, 2e9)
  assert.equal(parseCap('will not exceed EUR 250,000.')!.amount, 250_000)
})
