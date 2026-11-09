// Ties the pieces together: one version's issues, a comparison of two versions, and the negotiation tracker.
import { align, rows, summary, type Pair, type Row } from './align.ts'
import { runPlaybook, type Playbook, type Severity } from './playbook.ts'
import { quantChanges, type QuantChange } from './quant.ts'
import { clauseLabel, clauseText, segment, type Clause, type Doc } from './segment.ts'
import { termChanges, termReport, type TermChange } from './terms.ts'
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

/** Issues in one version on its own (or relative to the previous version when given). */
export function versionIssues(doc: Doc, pb: Playbook, prev?: Doc, pairs?: Pair[]): Issue[] {
  const out: Issue[] = []
  const seen = new Set<string>()
  for (const f of runPlaybook(pb, doc.clauses)) {
    if (f.status !== 'fail') continue
    let key = f.ruleId
    if (seen.has(key)) key = `${f.ruleId}:${f.clauseId}`
    seen.add(key)
    out.push({ key, source: 'playbook', clauseId: f.clauseId, clause: f.clause, issue: f.rule, detail: f.message, severity: f.severity, fallback: f.fallback })
  }
  for (const r of checkRefs(doc.clauses, prev?.clauses, pairs)) {
    if (r.status === 'ok') continue
    out.push({ key: `xref:${r.target}`, source: 'xref', clauseId: r.clauseId, clause: labelOf(doc.clauses, r.clauseId), issue: r.status === 'stale' ? `Stale reference to ${r.raw}` : `Broken reference to ${r.raw}`, detail: r.detail, severity: 'high', fallback: `Update the reference so it points to the intended clause.` })
  }
  const tr = termReport(doc.clauses)
  for (const f of tr.findings) {
    const sev: Severity = f.kind === 'undefined' || f.kind === 'duplicate' ? 'medium' : 'low'
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

export function compareDocs(a: Doc, b: Doc, pb: Playbook): Comparison {
  const pairs = align(a.clauses, b.clauses)
  const views = pairs.map(p => {
    const ca = p.a !== null ? a.clauses[p.a] : null, cb = p.b !== null ? b.clauses[p.b] : null
    return { pair: p, a: ca, b: cb, quants: ca && cb && p.modified ? quantChanges(clauseText(ca), clauseText(cb)) : [] }
  })
  const terms = termChanges(a.clauses, b.clauses)
  const issues = versionIssues(b, pb, a, pairs)
  const defClause = (t: string) => b.clauses.find(c => c.body.includes(`"${t}"`) || c.body.includes(`“${t}”`))
  for (const t of terms) {
    if (t.kind === 'added') continue
    const usedInB = b.clauses.some(c => new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(c.body))
    if (t.kind === 'removed' && !usedInB) continue
    const c = defClause(t.term) ?? null
    out(issues, { key: `def:${t.kind}:${t.term}`, source: t.kind === 'changed' ? 'change' : 'terms', clauseId: c?.id ?? null, clause: c ? clauseLabel(c) : 'Definitions', issue: t.kind === 'changed' ? `Definition of “${t.term}” changed` : `Definition of “${t.term}” removed but still used`, detail: t.kind === 'changed' ? `Was: ${t.before}  Now: ${t.after}` : `Was: ${t.before}`, severity: t.kind === 'removed' ? 'high' : 'medium', fallback: t.before ?? '' })
  }
  for (const v of views) for (const q of v.quants) {
    if (!v.b) continue
    out(issues, { key: `num:${v.b.num ?? v.b.title}:${q.before}>${q.after}`, source: 'change', clauseId: v.b.id, clause: clauseLabel(v.b), issue: `${q.kind === 'money' ? 'Amount' : q.kind === 'duration' ? 'Period' : q.kind === 'date' ? 'Date' : q.kind === 'percent' ? 'Percentage' : 'Multiple'} changed`, detail: `${q.before ?? '(none)'} → ${q.after ?? '(removed)'}`, severity: 'low', fallback: q.before ? `Restore “${q.before}”.` : '' })
  }
  return { a, b, pairs, rows: rows(pairs, a.clauses.length), views, summary: summary(pairs), terms, refs: checkRefs(b.clauses, a.clauses, pairs), issues: issues.sort(bySeverity) }
}
const out = (list: Issue[], i: Issue) => { if (!list.some(x => x.key === i.key)) list.push(i) }

/** Issues per round, each round judged against the one before it (so stale references are caught). */
export function roundIssues(texts: string[], pb: Playbook): Issue[][] {
  return texts.map((t, i) => i === 0 ? versionIssues(segment(t), pb) : compare(texts[i - 1], t, pb).issues.filter(x => x.source !== 'change'))
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

const csvCell = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
export function issuesCsv(issues: Issue[], statuses: Record<string, string> = {}): string {
  const head = ['Severity', 'Clause', 'Issue', 'Detail', 'Suggested fallback', 'Status']
  return [head, ...issues.map(i => [i.severity, i.clause, i.issue, i.detail, i.fallback, statuses[i.key] ?? 'open'])].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
