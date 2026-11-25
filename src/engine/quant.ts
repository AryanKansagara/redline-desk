// Amounts, percentages, durations and dates found in clause text, and how they changed.

export type QuantKind = 'money' | 'percent' | 'duration' | 'date' | 'multiple'
export interface Quant { kind: QuantKind; raw: string; value: number; index: number }
export interface QuantChange { kind: QuantKind; before: string | null; after: string | null }

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, 'twenty-four': 24, thirty: 30, 'thirty-six': 36,
  forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, 'one hundred twenty': 120, 'one hundred eighty': 180,
}

export function parseNumber(s: string): number | null {
  const t = s.toLowerCase().trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  return NUM_WORDS[t] ?? null
}

const UNIT_DAYS: Record<string, number> = { day: 1, days: 1, 'business day': 1.4, 'business days': 1.4, 'calendar day': 1, 'calendar days': 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365 }
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'

const RE_MONEY = /(?:US)?[$€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s?(?:million|thousand|billion|[MK]\b))?|\b(?:USD|EUR|GBP)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|thousand|billion))?/g
const RE_PCT = /\b\d+(?:\.\d+)?\s?(?:%|percent\b)/g
const RE_DUR = /\b(\d+|one hundred (?:twenty|eighty)|[a-z]+(?:-[a-z]+)?)\s*(?:\((\d+)\)\s*)?(business days?|calendar days?|days?|weeks?|months?|years?)\b/gi
const RE_DATE = new RegExp(`\\b(?:(?:${MONTHS})\\s+\\d{1,2},\\s+\\d{4}|\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})\\b`, 'g')
const RE_MULT = /\b(\d+(?:\.\d+)?|[a-z]+)\s*(?:\((\d+(?:\.\d+)?)\)\s*)?(?:times|x)\b/gi

export function moneyValue(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ''))
  const mult = /billion/i.test(raw) ? 1e9 : /million|M\b/.test(raw) ? 1e6 : /thousand|K\b/.test(raw) ? 1e3 : 1
  return n * mult
}

/** Duration in days, or null if the phrase is not a duration ("of months"). */
export function durationDays(num: string, paren: string | undefined, unit: string): number | null {
  const n = paren ? Number(paren) : parseNumber(num)
  if (n === null || !Number.isFinite(n)) return null
  return n * UNIT_DAYS[unit.toLowerCase()]
}

export function quantities(text: string): Quant[] {
  const out: Quant[] = []
  for (const m of text.matchAll(RE_MONEY)) out.push({ kind: 'money', raw: m[0].trim(), value: moneyValue(m[0]), index: m.index! })
  for (const m of text.matchAll(RE_PCT)) out.push({ kind: 'percent', raw: m[0], value: parseFloat(m[0]), index: m.index! })
  for (const m of text.matchAll(RE_DUR)) {
    const d = durationDays(m[1], m[2], m[3])
    if (d !== null) out.push({ kind: 'duration', raw: m[0], value: d, index: m.index! })
  }
  for (const m of text.matchAll(RE_DATE)) out.push({ kind: 'date', raw: m[0], value: Date.parse(m[0]) || 0, index: m.index! })
  for (const m of text.matchAll(RE_MULT)) {
    const n = m[2] ? Number(m[2]) : parseNumber(m[1])
    if (n !== null) out.push({ kind: 'multiple', raw: m[0], value: n, index: m.index! })
  }
  return out.sort((a, b) => a.index - b.index)
}

/** Values that differ between two versions of a clause, paired in reading order per kind. */
export function quantChanges(before: string, after: string): QuantChange[] {
  const a = quantities(before), b = quantities(after)
  const out: QuantChange[] = []
  for (const kind of ['money', 'percent', 'duration', 'date', 'multiple'] as QuantKind[]) {
    const xa = a.filter(q => q.kind === kind), xb = b.filter(q => q.kind === kind)
    // Remove values present in both (multiset), keep order.
    const rest = (xs: Quant[], ys: Quant[]) => {
      const pool = ys.map(y => y.value)
      return xs.filter(x => { const i = pool.indexOf(x.value); if (i >= 0) { pool.splice(i, 1); return false } return true })
    }
    const ra = rest(xa, xb), rb = rest(xb, xa)
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) out.push({ kind, before: ra[i]?.raw ?? null, after: rb[i]?.raw ?? null })
  }
  return out
}
