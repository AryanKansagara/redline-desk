// Amounts, percentages, durations and dates found in clause text, and how they changed.

export type QuantKind = 'money' | 'percent' | 'duration' | 'date' | 'multiple'
export interface Quant { kind: QuantKind; raw: string; value: number; index: number; currency?: string; measure?: string }
export interface QuantChange { kind: QuantKind; before: string | null; after: string | null }

const UNITS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const WORD_VALUE = new Map([...UNITS.map((w, i) => [w, i + 1] as const), ...TEENS.map((w, i) => [w, i + 10] as const), ...TENS.map((w, i) => [w, 20 + i * 10] as const)])
const UNDER_100 = String.raw`(?:(?:${TENS.join('|')})(?:[\s-]+(?:${UNITS.join('|')})\b)?|${[...TEENS, ...UNITS].join('|')})`
const UNDER_1000 = String.raw`(?:(?:(?:${UNITS.join('|')}|a)[\s-]+)?hundred(?:[\s-]+(?:and[\s-]+)?${UNDER_100}\b)?|${UNDER_100})`
/** A number in digits or words ("one hundred and twenty"). Source of a regular expression without groups. */
export const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|(?:${UNDER_1000}[\s-]+thousand(?:[\s-]+(?:and[\s-]+)?${UNDER_1000})?|${UNDER_1000})\b)`
const RE_NUMBER = new RegExp(`^${NUMBER}$`, 'i')

export function parseNumber(s: string): number | null {
  const t = s.toLowerCase().trim()
  if (!RE_NUMBER.test(t)) return null
  if (/^\d/.test(t)) return Number(t.replace(/,/g, ''))
  let total = 0, part = 0
  for (const w of t.split(/[\s-]+/)) {
    if (w === 'hundred') part = (part || 1) * 100
    else if (w === 'thousand') { total = part * 1000; part = 0 }
    else if (w === 'a') part = 1
    else part += WORD_VALUE.get(w) ?? 0
  }
  return total + part
}

/** Unit of a period, with any qualifier: "business days", "month". */
export const UNIT = String.raw`(?:(?:business|working|banking|calendar)\s+days?|days?|weeks?|months?|years?)\b`
/** A period such as "thirty (30) days" or "12-month": number, number in brackets, unit. Source of a regular expression. */
export const PERIOD = String.raw`\b(${NUMBER})[\s-]*(?:\((${NUMBER})\)[\s-]*)?(${UNIT})`
const isBusiness = (unit: string) => /^(?:business|working|banking)/i.test(unit)
const unitDays = (unit: string) => isBusiness(unit) ? 1.4 : /^week/i.test(unit) ? 7 : /^month/i.test(unit) ? 30 : /^year/i.test(unit) ? 365 : 1
/** Days, business days and months are different measures: none converts exactly into another. */
const measure = (unit: string) => isBusiness(unit) ? 'b' : /^(?:month|year)/i.test(unit) ? 'm' : 'd'

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'

// Commas count only as thousands (also Indian 1,00,000) separators: "€500,00" is five hundred.
const AMOUNT = String.raw`\d+(?:(?:,\d{2,3})*,\d{3})?(?:\.\d+)?(?:\s?(?:million|thousand|billion|(?:bn|mm?|k)\b))?`
export const RE_MONEY = new RegExp(String.raw`(?:US)?[$€£]\s?${AMOUNT}|\b(?:USD|EUR|GBP)\s?${AMOUNT}`, 'gi')
const RE_PCT = /\b\d+(?:\.\d+)?\s?(?:%|percent\b)/g
const RE_DUR = new RegExp(PERIOD, 'gi')
const RE_DATE = new RegExp(`\\b(?:(?:${MONTHS})\\s+\\d{1,2},\\s+\\d{4}|\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})\\b`, 'g')
const RE_MULT = /\b(\d+(?:\.\d+)?|[a-z]+)\s*(?:\((\d+(?:\.\d+)?)\)\s*)?(?:times|x)\b/gi

export function moneyValue(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ''))
  const mult = /(?:billion|bn)$/i.test(raw) ? 1e9 : /(?:million|\dm|\smm?|\dmm)$/i.test(raw) ? 1e6 : /(?:thousand|k)$/i.test(raw) ? 1e3 : 1
  return n * mult
}

const currencyOf = (raw: string) => /€|EUR/i.test(raw) ? 'EUR' : /£|GBP/i.test(raw) ? 'GBP' : 'USD'

/** Duration in days, or null if the phrase is not a duration ("of months"). */
export function durationDays(num: string, paren: string | undefined, unit: string): number | null {
  const n = parseNumber(paren ?? num)
  if (n === null || !Number.isFinite(n)) return null
  return n * unitDays(unit)
}

export function quantities(text: string): Quant[] {
  const out: Quant[] = []
  for (const m of text.matchAll(RE_MONEY)) out.push({ kind: 'money', raw: m[0].trim(), value: moneyValue(m[0]), index: m.index!, currency: currencyOf(m[0]) })
  for (const m of text.matchAll(RE_PCT)) out.push({ kind: 'percent', raw: m[0], value: parseFloat(m[0]), index: m.index! })
  for (const m of text.matchAll(RE_DUR)) {
    const d = durationDays(m[1], m[2], m[3])
    if (d !== null) out.push({ kind: 'duration', raw: m[0], value: d, index: m.index!, measure: measure(m[3]) })
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
    const id = (q: Quant) => `${q.currency ?? q.measure ?? ''}${q.value}`
    const rest = (xs: Quant[], ys: Quant[]) => {
      const pool = ys.map(id)
      return xs.filter(x => { const i = pool.indexOf(id(x)); if (i >= 0) { pool.splice(i, 1); return false } return true })
    }
    const ra = rest(xa, xb), rb = rest(xb, xa)
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) out.push({ kind, before: ra[i]?.raw ?? null, after: rb[i]?.raw ?? null })
  }
  return out
}
