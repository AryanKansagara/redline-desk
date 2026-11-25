import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wordCounter, type Level, type WordList } from './wordNumbers.ts'

const lvl = (text: string, format = 'decimal', more: Partial<Level> = {}): Level => ({ text, format, start: 1, ...more })
const list = (abstractId: string, levels: Level[], overrides: Record<number, number> = {}): WordList => ({ abstractId, levels: { ...levels }, overrides })
const legal = [lvl('%1.'), lvl('%1.%2'), lvl('(%3)', 'lowerLetter'), lvl('(%4)', 'lowerRoman')]
const run = (lists: Record<string, WordList>, seq: [string, number][]) => { const next = wordCounter(lists); return seq.map(([id, d]) => { const l = next(id, d); return l && (l.word ?? `~${l.plain}`) }) }

test('one list counts on, whatever stands between; nested levels restart', () => {
  assert.deepEqual(run({ 1: list('a', legal) }, [['1', 0], ['1', 1], ['1', 1], ['1', 2], ['1', 2], ['1', 0], ['1', 1], ['1', 2]]), ['1.', '1.1', '1.2', '(a)', '(b)', '2.', '2.1', '(a)'])
})

test('different lists count apart; instances of one list share it unless they restart', () => {
  const lists = { 1: list('a', legal), 2: list('b', legal), 3: list('a', legal), 4: list('a', legal, { 0: 1 }) }
  assert.deepEqual(run(lists, [['1', 0], ['2', 0], ['1', 0], ['3', 0], ['4', 0], ['4', 0], ['2', 0]]), ['1.', '1.', '2.', '3.', '1.', '2.', '2.'])
})

test('start values, skipped levels, levels that never restart, and legal numbering', () => {
  assert.deepEqual(run({ 1: list('a', [lvl('%1.', 'decimal', { start: 5 }), lvl('%1.%2', 'decimal', { restart: 0 })]) }, [['1', 0], ['1', 1], ['1', 0], ['1', 1]]), ['5.', '5.1', '6.', '6.2'])
  assert.deepEqual(run({ 1: list('a', legal) }, [['1', 1], ['1', 0]]), ['1.1', '2.'])
  assert.deepEqual(run({ 1: list('a', [lvl('Article %1', 'upperRoman'), lvl('Section %1.%2', 'decimal', { legal: true })]) }, [['1', 0], ['1', 1], ['1', 0], ['1', 1]]), ['Article I', 'Section 1.1', 'Article II', 'Section 2.1'])
})

test('labels that cannot be read as clause numbers fall back to the depth', () => {
  assert.deepEqual(run({ 1: list('a', [lvl('%1)'), lvl('%2.', 'lowerLetter'), lvl('%3.', 'lowerRoman')]) }, [['1', 0], ['1', 1], ['1', 1], ['1', 2], ['1', 0]]), ['~1.', '~1.1', '~1.2', '~(a)', '~2.'])
})

test('bullets, empty labels and unknown lists have none', () => {
  assert.deepEqual(run({ 1: list('a', [lvl('', 'bullet'), lvl('', 'none')]) }, [['1', 0], ['1', 1], ['1', 7], ['9', 0]]), [null, null, null, null])
})
