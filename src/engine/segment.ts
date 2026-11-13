// Clause segmentation: turns contract text into numbered, titled clauses.

export interface Clause {
  id: string
  /** Normalised number such as "7", "7.2", "7.2(a)", "IV"; null for unnumbered headings and the preamble. */
  num: string | null
  title: string
  /** Clause text without its number or title prefix. */
  body: string
  level: number
  /** 1-based line where the clause starts in the source text. */
  line: number
}

export interface Doc {
  clauses: Clause[]
  warnings: { line: number; message: string }[]
}

const RE_ART = /^(?:ARTICLE|Article|SECTION|Section|CLAUSE|Clause)\s+(\d{1,2}(?:\.\d{1,3})*|[IVXLC]{1,6})\b[.:\-–—]?\s*(.*)$/
const RE_NUM = /^(\d{1,2}(?:\.\d{1,3})*)(\.?)\s+(\S.*)$/
const RE_SUB = /^\(([a-z]{1,2}|[ivx]{1,5}|\d{1,2})\)\s+(\S.*)$/
const RE_CAPS = /^[A-Z][A-Z0-9 ,&'’()\-/]{2,79}$/
const MINOR = new Set(['of', 'and', 'the', 'to', 'for', 'in', 'on', 'or', 'a', 'an', 'by', 'with', 'upon'])

const isRoman = (s: string) => /^[ivx]+$/.test(s)

/** "Limitation of Liability. Except..." -> ["Limitation of Liability", "Except..."] */
export function splitTitle(text: string): [string, string] {
  const t = text.trim()
  const m = t.match(/^([A-Z][^.;:]{1,70}?)[.:]\s+([\s\S]*)$/) ?? t.match(/^([A-Z][^.;:]{1,70}?)\.?$/)
  if (m) {
    const words = m[1].split(/\s+/)
    const capped = words.filter(w => /^[A-Z0-9“"(&]/.test(w) || MINOR.has(w.toLowerCase()))
    const ok = words.length <= 9 && capped.length === words.length && !/\b(shall|will|may|must|is|are)\b/.test(m[1])
    if (ok) return [m[1].trim(), (m[2] ?? '').trim()]
  }
  return ['', t]
}

/** Splits text into clauses using numbered headings (1., 1.1, (a)), Article/Section headings and ALL-CAPS headings. */
export function segment(text: string): Doc {
  const lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n')
  const clauses: Clause[] = []
  const warnings: Doc['warnings'] = []
  let cur: { num: string | null; head: string; parts: string[]; level: number; line: number } | null = null
  let lastNum: string | null = null // most recent dotted number (parent of (a) subclauses)
  let lastLetter: string | null = null
  let lastLetterNum: string | null = null
  const seen = new Map<string, number>()

  const flush = () => {
    if (!cur) return
    const paras = (ls: string[]) => ls.join('\n').split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
    const [title, body] = cur.num === null && cur.head && RE_CAPS.test(cur.head) ? [cur.head, paras(cur.parts)] : splitTitle(paras([cur.head, ...cur.parts]))
    if (cur.num !== null || title || body) clauses.push({ id: `c${clauses.length}`, num: cur.num, title, body, level: cur.level, line: cur.line })
    cur = null
  }
  const start = (num: string | null, head: string, level: number, line: number) => {
    flush()
    if (num) {
      if (seen.has(num)) warnings.push({ line, message: `Number ${num} is used twice (first on line ${seen.get(num)}).` })
      else seen.set(num, line)
    }
    cur = { num, head, parts: [], level, line }
  }

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim()
    const ln = i + 1
    if (!line) { cur?.parts.push(''); return }
    let m: RegExpMatchArray | null
    if ((m = line.match(RE_ART))) {
      start(m[1], m[2], 1, ln)
      lastNum = m[1]; lastLetter = null
      return
    }
    if ((m = line.match(RE_NUM)) && (m[1].includes('.') || m[2] === '.') && !/^\d+\.\d+\s*(%|percent|million|days|months|years)/i.test(line)) {
      const num = m[1]
      const prev = lastNum
      if (prev && !num.includes('.') && !prev.includes('.') && /^\d+$/.test(prev) && +num > +prev + 1) warnings.push({ line: ln, message: `Numbering jumps from ${prev} to ${num}.` })
      start(num, m[3], num.split('.').length, ln)
      lastNum = num; lastLetter = null
      return
    }
    if ((m = line.match(RE_SUB)) && lastNum) {
      const label = m[1]
      const nestedRoman = isRoman(label) && lastLetter !== null && !(label === 'i' && lastLetter === 'h') && !(label === 'v' && lastLetter === 'u') && !(label === 'x' && lastLetter === 'w')
      let num: string
      if (nestedRoman && lastLetterNum) num = `${lastLetterNum}(${label})`
      else { num = `${lastNum}(${label})`; lastLetter = label; lastLetterNum = num }
      start(num, m[2], (lastNum.split('.').length) + (nestedRoman ? 2 : 1), ln)
      return
    }
    if (RE_CAPS.test(line) && /[A-Z]{2}/.test(line) && (line.includes(' ') || line.length >= 5) && !/[.;]$/.test(line)) {
      start(null, line, 1, ln)
      return
    }
    if (!cur) start(null, '', 0, ln)
    cur!.parts.push(line)
  })
  flush()
  // No usable headings: fall back to one clause per paragraph so alignment still works.
  const paras = text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (clauses.filter(c => c.num || c.title).length < 2 && paras.length >= 3) {
    warnings.push({ line: 1, message: 'No numbered or ALL-CAPS headings found; comparing paragraph by paragraph.' })
    return { clauses: paras.map((p, i) => { const [title, body] = splitTitle(p); return { id: `c${i}`, num: null, title, body, level: 1, line: 0 } }), warnings }
  }
  return { clauses, warnings }
}

export const clauseLabel = (c: Clause) => c.num ? `${/^[IVXLC]+$/.test(c.num) ? 'Art. ' : '§ '}${c.num}${c.title ? ' ' + c.title : ''}` : c.title || (c.line <= 1 ? 'Preamble' : `Untitled (line ${c.line})`)

/** Full text of a clause including its title, as a reader sees it. */
export const clauseText = (c: Clause) => [c.title, c.body].filter(Boolean).join('. ').replace(/\.\./g, '.')
