import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRule, type Rule } from './playbook.ts'
import { segment } from './segment.ts'

const check = (law: string, ...allowed: string[]) => {
  const r = { id: 'r', name: 'Law', severity: 'high', fallback: '', enabled: true, kind: 'governingLaw', allowed } as Rule
  return checkRule(r, segment(`1. Law. This Agreement is governed by the laws of ${law}, without regard to conflicts.\n2. Other. Nothing.\n`).clauses)[0].status
}

test('a name inside another name is a different jurisdiction', () => {
  for (const [a, b] of [['Kansas', 'Arkansas'], ['Virginia', 'West Virginia'], ['Ireland', 'Northern Ireland']]) {
    assert.equal(check(`the State of ${a}`, b), 'fail', `${a} vs ${b}`)
    assert.equal(check(`the State of ${b}`, a), 'fail', `${b} vs ${a}`)
    assert.equal(check(`the State of ${a}`, a), 'pass')
    assert.equal(check(`the State of ${b}`, b), 'pass')
  }
})

test('the same jurisdiction in other words still matches', () => {
  for (const [law, allowed] of [
    ['England', 'England and Wales'], ['England and Wales', 'England'], ['the State of New York', 'New York'], ['New York', 'State of New York'], ['the State of Delaware', 'delaware law'],
    ['the Commonwealth of Massachusetts', 'Massachusetts'], ['the Province of Ontario and Canada', 'Ontario'], ['the State of New York USA', 'New York'], ['New York City', 'New York'],
    ['the Republic of Ireland', 'Ireland'], ['the Republic of Singapore', 'Republic of Singapore'], ["the People's Republic of China", "People's Republic of China"], ['the District of Columbia', 'District of Columbia'], ['Canada', 'Canada'],
  ]) assert.equal(check(law, allowed), 'pass', `${law} / ${allowed}`)
})

test('every named law must be allowed', () => {
  assert.equal(check('Delaware and Texas', 'Delaware'), 'fail')
  assert.equal(check('Delaware and Texas', 'Delaware', 'Texas'), 'pass')
  assert.equal(check('Delaware', ''), 'fail')
})
