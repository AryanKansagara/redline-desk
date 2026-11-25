// Counts Word's automatic numbering. Word keeps one counter set per abstract list: every paragraph of that list advances
// it wherever it stands in the document, and a list instance (w:num) may restart a level with a start override.

export interface Level { format: string; text: string; start: number; /** Level whose use restarts this one; 0 means never. */ restart?: number; legal?: boolean }
export interface WordList { abstractId: string; levels: Record<number, Level>; overrides: Record<number, number> }
/** `word`: what Word prints, when clauses can be read from it. `plain`: 1. / 1.1 / (a) by depth. */
export interface Label { word: string | null; plain: string }

const letters = (n: number) => String.fromCharCode(97 + (n - 1) % 26).repeat(Math.ceil(n / 26))
const roman = (n: number) => {
  let out = ''
  for (const [v, s] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']] as const) while (n >= v) { out += s; n -= v }
  return out
}

function print(n: number, format: string): string {
  if (n < 1 || format === 'none') return format === 'none' ? '' : String(n)
  switch (format) {
    case 'lowerLetter': return letters(n)
    case 'upperLetter': return letters(n).toUpperCase()
    case 'lowerRoman': return roman(n)
    case 'upperRoman': return roman(n).toUpperCase()
    case 'decimalZero': return String(n).padStart(2, '0')
    default: return String(n)
  }
}

const clauseText = (text: string, depth: number): string | null => {
  const t = text.trim()
  if (/^\d{1,2}(?:\.\d{1,3})+\.?$/.test(t)) return t.replace(/\.$/, '')
  if (depth === 0 && /^\d{1,2}\.?$/.test(t)) return t.replace(/\.?$/, '.')
  if (/^\((?:[a-z]{1,2}|[ivx]{1,5}|\d{1,2})\)$/.test(t)) return t
  return /^(?:ARTICLE|Article|SECTION|Section|CLAUSE|Clause)\s+(?:\d{1,2}(?:\.\d{1,3})*|[IVXLC]{1,6})[.:]?$/.test(t) ? t : null
}

export function wordCounter(lists: Record<string, WordList>) {
  const counts = new Map<string, number[]>()
  const started = new Set<string>()
  /** Advances list `numId` at `depth` and returns its label; null for bullets and unknown lists. */
  return (numId: string, depth: number): Label | null => {
    const list = lists[numId], level = list?.levels[depth]
    if (!level || level.format === 'bullet') return null
    const c = counts.get(list.abstractId) ?? []
    counts.set(list.abstractId, c)
    const key = `${numId}:${depth}`
    const override = started.has(key) ? undefined : list.overrides[depth]
    started.add(key)
    c[depth] = override ?? (c[depth] === undefined ? level.start : c[depth] + 1)
    // A level that was skipped counts as begun.
    for (let d = 0; d < depth; d++) c[d] ??= list.overrides[d] ?? list.levels[d]?.start ?? 1
    for (let d = depth + 1; d < c.length; d++) {
      const after = list.levels[d]?.restart
      if (after === undefined || (after > 0 && depth < after)) delete c[d]
    }
    const text = level.text.replace(/%(\d)/g, (_, k: string) => {
      const d = Number(k) - 1
      return c[d] === undefined ? '' : print(c[d], level.legal ? 'decimal' : list.levels[d]?.format ?? 'decimal')
    })
    // A level that prints nothing (w:numFmt "none" without text) is only an indent.
    if (!text.trim()) return null
    return { word: clauseText(text, depth), plain: depth === 0 ? `${c[0]}.` : depth === 1 ? `${c[0]}.${c[1]}` : `(${letters(c[depth] || 1)})` }
  }
}
