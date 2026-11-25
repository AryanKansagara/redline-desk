// Defined terms: definitions, unused/undefined terms, inconsistent capitalisation, changed definitions.
import type { Clause } from './segment.ts'

export interface Definition { term: string; definition: string; clauseId: string }
export interface TermFinding { kind: 'unused' | 'undefined' | 'inconsistent' | 'duplicate'; term: string; detail: string; clauseIds: string[]; count: number; external?: string }
export interface TermChange { term: string; kind: 'added' | 'removed' | 'changed'; before?: string; after?: string }

const Q_OPEN = '["“”]'
const Q_CLOSE = '["”“]'
const RE_MEANS = new RegExp(`${Q_OPEN}([A-Z][^"“”]{0,50}?)${Q_CLOSE}\\s*(?:shall\\s+)?(?:means?|shall have the meaning|has the meaning|refers? to)\\b`, 'g')
// ("X"), (the "X"), each a "X", together the "X", collectively, the "X"
const RE_NAMED = new RegExp(`(?:\\(\\s*|\\b(?:the|a|an|each a|each, a|each an|together the|together, the|collectively the|collectively, the|hereinafter|hereinafter the)\\s+)${Q_OPEN}([A-Z][^"“”]{0,50}?)${Q_CLOSE}`, 'g')

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sentenceFrom = (text: string, at: number) => {
  const rest = text.slice(at)
  const end = rest.search(/\.(\s|$)/)
  return (end >= 0 ? rest.slice(0, end + 1) : rest).slice(0, 400).trim()
}
/** From the start of the sentence containing `at` up to `end`: the phrase that introduces a named term. */
const leadIn = (text: string, at: number, end: number) => {
  let start = 0
  // Start after the sentence boundary or the previous named term, whichever is later.
  for (const m of text.slice(0, at).matchAll(/[.!?]["”]?\s+|\n|["”]\)[,]?\s*/g)) start = m.index! + m[0].length
  return text.slice(start, end).trim().slice(-400)
}

export function definitions(clauses: Clause[]): Definition[] {
  const out: Definition[] = []
  for (const c of clauses) {
    for (const m of c.body.matchAll(RE_MEANS)) out.push({ term: m[1].trim(), definition: sentenceFrom(c.body, m.index!), clauseId: c.id })
    for (const m of c.body.matchAll(RE_NAMED)) {
      const term = m[1].trim()
      if (out.some(d => d.term === term && d.clauseId === c.id)) continue
      out.push({ term, definition: leadIn(c.body, m.index!, m.index! + m[0].length), clauseId: c.id })
    }
  }
  return out
}

const STOP_FIRST = new Set(['Section', 'Sections', 'Article', 'Articles', 'Exhibit', 'Schedule', 'Appendix', 'Annex', 'Clause', 'Clauses', 'State', 'States', 'United', 'Court', 'Courts', 'Federal', 'Commonwealth', 'County', 'City', 'Republic', 'Internet', 'English', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'I', 'The', 'This', 'That', 'Such'])

/** Strip a plural or possessive so "Parties" and "Party's" count as uses of "Party". */
const stem = (s: string) => s.replace(/['’]s$/, '').replace(/ies$/, 'y').replace(/(?<!s)s$/, '')

export function termReport(clauses: Clause[]): { defs: Definition[]; findings: TermFinding[]; uses: Record<string, number> } {
  const defs = definitions(clauses)
  const findings: TermFinding[] = []
  const byTerm = new Map<string, Definition[]>()
  for (const d of defs) byTerm.set(d.term, [...(byTerm.get(d.term) ?? []), d])
  for (const [term, ds] of byTerm) if (new Set(ds.map(d => d.definition)).size > 1) findings.push({ kind: 'duplicate', term, detail: `“${term}” is defined ${ds.length} times with different wording.`, clauseIds: ds.map(d => d.clauseId), count: ds.length })

  const uses: Record<string, number> = {}
  const definedStems = new Set([...byTerm.keys()].map(stem))
  for (const term of byTerm.keys()) {
    const exact = new RegExp(`(?<![“"\\w])${esc(term)}(?:s|es|['’]s)?(?![\\w”"])`, 'g')
    const loose = new RegExp(`(?<![“"\\w])${esc(term)}(?:s|es|['’]s)?(?![\\w”"])`, 'gi')
    let n = 0
    const variants = new Map<string, string[]>()
    for (const c of clauses) {
      n += (c.body.match(exact) ?? []).length
      for (const m of c.body.matchAll(loose)) {
        const v = m[0].replace(/(?:es|s|['’]s)$/, '')
        if (v === term || stem(m[0]) === stem(term) && m[0].startsWith(term)) continue
        const multiWord = term.includes(' ')
        // Lower-case "services" next to a defined "Services" is ordinary English; only flag mixed case, or any variant of a multi-word term.
        if (!multiWord && v === v.toLowerCase()) continue
        // ALL-CAPS is how disclaimers are made conspicuous, not a different term.
        if (v === v.toUpperCase()) continue
        // Sentence-initial capital on a lower-case word is not a variant either.
        variants.set(v, [...(variants.get(v) ?? []), c.id])
      }
    }
    uses[term] = n
    if (n === 0) findings.push({ kind: 'unused', term, detail: `“${term}” is defined but never used.`, clauseIds: byTerm.get(term)!.map(d => d.clauseId), count: 0 })
    for (const [v, ids] of variants) findings.push({ kind: 'inconsistent', term, detail: `“${v}” appears ${ids.length}× where the defined term is “${term}”.`, clauseIds: [...new Set(ids)], count: ids.length })
  }

  // Capitalised phrases used like defined terms ("the Disclosing Party") that are never defined.
  const cand = new Map<string, string[]>()
  const titles = new Set(clauses.map(c => c.title.toLowerCase()))
  for (const c of clauses) {
    for (const m of c.body.matchAll(/\b(?:the|any|each|such|all|that|either|its|their|other)\s+((?:[A-Z][a-z]+(?:-[A-Z][a-z]+)*)(?:\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)*){0,3})(?![\w-])/g)) {
      const phrase = m[1]
      if (STOP_FIRST.has(phrase.split(' ')[0]) || titles.has(phrase.toLowerCase())) continue
      // Names of statutes and treaties ("the Health Insurance Portability and Accountability Act", "the International Sale of Goods").
      const after = c.body.slice(m.index! + m[0].length, m.index! + m[0].length + 60)
      if (/^(?:\s+(?:and|of|for|on|[A-Z][a-z]+))*\s+(?:Act|Convention|Code|Regulation|Directive|Goods)\b/.test(after) || /Convention[^.]{0,40}$/.test(c.body.slice(Math.max(0, m.index! - 60), m.index!))) continue
      if (byTerm.has(phrase) || definedStems.has(stem(phrase))) continue
      // Inside a quoted definition, or a longer defined term that starts with this phrase.
      if ([...byTerm.keys()].some(t => t.startsWith(phrase + ' '))) continue
      cand.set(phrase, [...(cand.get(phrase) ?? []), c.id])
    }
  }
  // Standard-form agreements leave some terms to a cover page or order form and say so.
  const ext = clauses.map(c => c.body.match(/\b(?:meanings?|defined)\s+(?:given\s+|set (?:out|forth)\s+)?(?:on|in)\s+the\s+(Cover Page|Order Form|Key Terms|Schedule|Statement of Work)/i)?.[1]
    ?? (/\bhighlighted and capitali[sz]ed\b/i.test(c.body) ? 'Cover Page or Order Form' : undefined)).find(Boolean)
  for (const [term, ids] of cand) findings.push({ kind: 'undefined', term, detail: ext ? `“${term}” is used ${ids.length}× like a defined term and is not defined in this text; the agreement says such terms are defined on the ${ext}.` : `“${term}” is used ${ids.length}× like a defined term but is never defined.`, clauseIds: [...new Set(ids)], count: ids.length, ...(ext ? { external: ext } : {}) })
  return { defs, findings, uses }
}

const normDef = (s: string) => s.replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()

export function termChanges(a: Clause[], b: Clause[]): TermChange[] {
  const da = new Map(definitions(a).map(d => [d.term, d.definition]))
  const db = new Map(definitions(b).map(d => [d.term, d.definition]))
  const out: TermChange[] = []
  for (const [t, d] of da) {
    if (!db.has(t)) out.push({ term: t, kind: 'removed', before: d })
    else if (normDef(d) !== normDef(db.get(t)!)) out.push({ term: t, kind: 'changed', before: d, after: db.get(t) })
  }
  for (const [t, d] of db) if (!da.has(t)) out.push({ term: t, kind: 'added', after: d })
  return out
}
