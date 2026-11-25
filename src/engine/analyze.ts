// Ties the pieces together: one version's issues, a comparison of two versions, and the negotiation tracker.
import { align, rows, summary, type Pair, type Row } from './align.ts'
import { runPlaybook, type Playbook, type Severity } from './playbook.ts'
import { quantChanges, type QuantChange } from './quant.ts'
import { clauseLabel, clauseText, segment, type Clause, type Doc } from './segment.ts'
import { definitions, termChanges, termReport, type TermChange } from './terms.ts'
import { checkRefs, type XRef } from './xref.ts'

export interface Issue {
  /** Stable across versions, so rounds can be tracked. */
  key: string
  source: 'playbook' | 'terms' | 'xref' | 'change'
  clauseId: string | null
  clause: string
  issue: string
  detail: string
  severity: Severity
  fallback: string
}

const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
export const bySeverity = (a: Issue, b: Issue) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]

const labelOf = (clauses: Clause[], id: string | null) => { const c = id ? clauses.find(c => c.id === id) : undefined; return c ? clauseLabel(c) : 'Whole agreement' }

const MANY = new Set(['forbidden', 'restrictive', 'ipScope'])
/** Rules that can report several findings; every other rule has one, keyed by the rule alone. */
const manyFindings = (pb: Playbook, ruleId: string) => MANY.has(pb.rules.find(r => r.id === ruleId)?.kind ?? '')
/** What was found and in which clause (by title, which survives renumbering), so accepting one finding never covers another. */
const findingKey = (ruleId: string, message: string, clause: string) => `${ruleId}:${message}@${clause.replace(/^(?:§|Art\.) \S+ (?=\S)/, '')}`

interface Keyed { playbook: Playbook; versions: { issues: Issue[] }[]; conceded: string[]; notes: Record<string, string> }
/**
 * Moves concessions and notes saved under the old keys (rule id, or rule id and clause position) to what they were about,
 * read from the stored issues. A concession that covered different findings over time is dropped, so they show as open.
 */
export function migrateKeys<T extends Keyed>(p: T): T {
  const isOld = (k: string) => p.playbook.rules.some(r => MANY.has(r.kind) && k.startsWith(r.id) && /^(?::c\d+)?$/.test(k.slice(r.id.length)))
  if (!p.conceded.some(isOld) && !Object.keys(p.notes).some(isOld) && !p.versions.some(v => v.issues.some(i => i.source === 'playbook' && isOld(i.key)))) return p
  const now = new Map<string, string[]>()
  const versions = p.versions.map(v => {
    const seen = new Set<string>(), begun = new Set<string>()
    return { ...v, issues: v.issues.map(i => {
      const rule = i.source === 'playbook' ? p.playbook.rules.find(r => MANY.has(r.kind) && (i.key === r.id || i.key.startsWith(r.id + ':'))) : undefined
      if (!rule) return i
      const base = findingKey(rule.id, i.detail, i.clause)
      let key = base
      for (let n = 2; seen.has(key); n++) key = `${base}#${n}`
      seen.add(key)
      // Issues may be moved already when a concession saved by an older build arrives by sync.
      const old = begun.has(rule.id) ? `${rule.id}:${i.clauseId}` : rule.id
      begun.add(rule.id)
      now.set(old, [...(now.get(old) ?? []), key])
      return { ...i, key }
    }) }
  })
  const conceded = [...new Set(p.conceded.flatMap(k => {
    const to = new Set(isOld(k) ? now.get(k) : [])
    return to.size === 0 ? [k] : to.size === 1 ? [...to] : []
  }))]
  const notes: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.notes)) {
    const to = (isOld(k) && now.get(k)?.at(-1)) || k
    notes[to] = notes[to] && notes[to] !== v ? `${notes[to]} ${v}` : v
  }
  return { ...p, versions, conceded, notes }
}

/** Issues in one version on its own (or relative to the previous version when given). */
export function versionIssues(doc: Doc, pb: Playbook, prev?: Doc, pairs?: Pair[], before?: XRef[]): Issue[] {
  const out: Issue[] = []
  const seen = new Set<string>()
  for (const f of runPlaybook(pb, doc.clauses)) {
    if (f.status !== 'fail') continue
    let key = f.ruleId
    if (manyFindings(pb, f.ruleId)) {
      const base = findingKey(f.ruleId, f.message, f.clause)
      key = base
      for (let n = 2; seen.has(key); n++) key = `${base}#${n}`
    }
    seen.add(key)
    out.push({ key, source: 'playbook', clauseId: f.clauseId, clause: f.clause, issue: f.rule, detail: f.message, severity: f.severity, fallback: f.fallback })
  }
  for (const r of checkRefs(doc.clauses, prev?.clauses, pairs, before)) {
    if (r.status === 'ok') continue
    out.push({ key: `xref:${r.target}`, source: 'xref', clauseId: r.clauseId, clause: labelOf(doc.clauses, r.clauseId), issue: r.status === 'stale' ? `Stale reference to ${r.raw}` : `Broken reference to ${r.raw}`, detail: r.detail, severity: 'high', fallback: `Update the reference so it points to the intended clause.` })
  }
  const tr = termReport(doc.clauses)
  for (const f of tr.findings) {
    const sev: Severity = (f.kind === 'undefined' && !f.external) || f.kind === 'duplicate' ? 'medium' : 'low'
    const issue = { unused: 'Defined term never used', undefined: 'Term used but not defined', inconsistent: 'Inconsistent capitalisation', duplicate: 'Term defined twice' }[f.kind]
    const fallback = { unused: `Delete the definition of “${f.term}”, or use it.`, undefined: `Add a definition for “${f.term}” or use the existing defined term.`, inconsistent: `Use “${f.term}” consistently.`, duplicate: `Keep one definition of “${f.term}”.` }[f.kind]
    out.push({ key: `term:${f.kind}:${f.term}`, source: 'terms', clauseId: f.clauseIds[0] ?? null, clause: labelOf(doc.clauses, f.clauseIds[0] ?? null), issue, detail: f.detail, severity: sev, fallback })
  }
  return out.sort(bySeverity)
}

export interface PairView { pair: Pair; a: Clause | null; b: Clause | null; quants: QuantChange[] }

export interface Comparison {
  a: Doc
  b: Doc
  pairs: Pair[]
  rows: Row[]
  views: PairView[]
  summary: ReturnType<typeof summary>
  terms: TermChange[]
  refs: XRef[]
  issues: Issue[]
}

export function compare(textA: string, textB: string, pb: Playbook): Comparison {
  const a = segment(textA), b = segment(textB)
  return compareDocs(a, b, pb)
}

/** `before` is what the round that ended in `a` found, so that what it left broken stays an issue until it is fixed. */
export function compareDocs(a: Doc, b: Doc, pb: Playbook, before?: { refs: XRef[]; issues: Issue[] }): Comparison {
  const pairs = align(a.clauses, b.clauses)
  const views = pairs.map(p => {
    const ca = p.a !== null ? a.clauses[p.a] : null, cb = p.b !== null ? b.clauses[p.b] : null
    return { pair: p, a: ca, b: cb, quants: ca && cb && p.modified ? quantChanges(clauseText(ca), clauseText(cb)) : [] }
  })
  const terms = termChanges(a.clauses, b.clauses)
  const issues = versionIssues(b, pb, a, pairs, before?.refs)
  const defClause = (t: string) => b.clauses.find(c => c.body.includes(`"${t}"`) || c.body.includes(`“${t}”`))
  const used = (term: string) => b.clauses.some(c => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(c.body))
  for (const t of terms) {
    if (t.kind === 'added') continue
    if (t.kind === 'removed' && !used(t.term)) continue
    const c = defClause(t.term) ?? null
    out(issues, { key: `def:${t.kind}:${t.term}`, source: t.kind === 'changed' ? 'change' : 'terms', clauseId: c?.id ?? null, clause: c ? clauseLabel(c) : 'Definitions', issue: t.kind === 'changed' ? `Definition of “${t.term}” changed` : `Definition of “${t.term}” removed but still used`, detail: t.kind === 'changed' ? `Was: ${t.before}  Now: ${t.after}` : `Was: ${t.before}`, severity: t.kind === 'removed' ? 'high' : 'medium', fallback: t.before ?? '' })
  }
  // A definition dropped in an earlier round is still missing until it is restored or its last use goes.
  const defined = new Set(definitions(b.clauses).map(d => d.term))
  for (const i of before?.issues ?? []) {
    const term = i.key.startsWith(REMOVED) ? i.key.slice(REMOVED.length) : null
    if (term !== null && !defined.has(term) && used(term)) out(issues, i)
  }
  for (const v of views) for (const q of v.quants) {
    if (!v.b) continue
    out(issues, { key: `num:${v.b.num ?? v.b.title}:${q.before}>${q.after}`, source: 'change', clauseId: v.b.id, clause: clauseLabel(v.b), issue: `${q.kind === 'money' ? 'Amount' : q.kind === 'duration' ? 'Period' : q.kind === 'date' ? 'Date' : q.kind === 'percent' ? 'Percentage' : 'Multiple'} changed`, detail: `${q.before ?? '(none)'} → ${q.after ?? '(removed)'}`, severity: 'low', fallback: q.before ? `Restore “${q.before}”.` : '' })
  }
  return { a, b, pairs, rows: rows(pairs, a.clauses.length), views, summary: summary(pairs), terms, refs: checkRefs(b.clauses, a.clauses, pairs, before?.refs), issues: issues.sort(bySeverity) }
}
const REMOVED = 'def:removed:'
const out = (list: Issue[], i: Issue) => { if (!list.some(x => x.key === i.key)) list.push(i) }

/** Issues per round, each round judged against the one before it (so stale references are caught) and what that one left unfixed. */
export function roundIssues(texts: string[], pb: Playbook): Issue[][] {
  const docs = texts.map(segment)
  let before: Comparison | undefined
  return docs.map((d, i) => {
    if (i === 0) return versionIssues(d, pb)
    before = compareDocs(docs[i - 1], d, pb, before)
    return before.issues.filter(x => x.source !== 'change')
  })
}

// ---------- Negotiation tracker ----------

export type RoundStatus = 'open' | 'resolved' | 'conceded' | 'new'
export interface TrackedIssue { key: string; issue: string; clause: string; severity: Severity; status: RoundStatus; firstSeen: number; lastSeen: number; present: boolean[]; detail: string; fallback: string }

/**
 * Follows issues across rounds (v1 -> v2 -> v3). An issue still present in the latest round is open (or new if it
 * first appeared there, or conceded if the user accepted it); one that disappeared is resolved.
 */
export function trackRounds(rounds: Issue[][], conceded: string[] = []): TrackedIssue[] {
  const map = new Map<string, TrackedIssue>()
  const last = rounds.length - 1
  rounds.forEach((issues, r) => {
    for (const i of issues) {
      if (i.source === 'change') continue
      const t = map.get(i.key) ?? { key: i.key, issue: i.issue, clause: i.clause, severity: i.severity, status: 'open', firstSeen: r, lastSeen: r, present: rounds.map(() => false), detail: i.detail, fallback: i.fallback }
      t.present[r] = true
      t.lastSeen = r
      t.clause = i.clause
      t.detail = i.detail
      map.set(i.key, t)
    }
  })
  for (const t of map.values()) {
    if (t.lastSeen < last) t.status = 'resolved'
    else if (conceded.includes(t.key)) t.status = 'conceded'
    else if (t.firstSeen === last && last > 0) t.status = 'new'
    else t.status = 'open'
  }
  const order: Record<RoundStatus, number> = { new: 0, open: 1, conceded: 2, resolved: 3 }
  return [...map.values()].sort((a, b) => order[a.status] - order[b.status] || SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
}

// ---------- Exports ----------

/** Contract text is untrusted: a cell a spreadsheet would run as a formula is kept as text by a leading apostrophe. */
function csvCell(s: string): string {
  if (/^[=+\-@\t\r]/.test(s)) return `"'${s.replace(/"/g, '""')}"`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function issuesCsv(issues: Issue[], statuses: Record<string, string> = {}): string {
  const head = ['Severity', 'Clause', 'Issue', 'Detail', 'Suggested fallback', 'Status']
  return [head, ...issues.map(i => [i.severity, i.clause, i.issue, i.detail, i.fallback, statuses[i.key] ?? 'open'])].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
