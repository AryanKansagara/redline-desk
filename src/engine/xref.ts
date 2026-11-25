// Cross-reference validation: "Section 7.2" pointing at clauses that no longer exist or have moved.
import type { Pair } from './align.ts'
import type { Clause } from './segment.ts'

export interface XRef { clauseId: string; raw: string; target: string; title?: string; status: 'ok' | 'missing' | 'stale'; detail: string }

const REF = String.raw`(?:\d{1,2}(?:\.\d{1,3})*(?:\([a-z0-9]{1,4}\))*|[IVXLC]{1,6}\b)`
// A reference may carry the cited clause's title: "Sections 8.1 (Liability Cap) and 8.2 (Damages Waiver)".
const CITED = String.raw`(?:\s*\([A-Z][^()]{2,60}\))?`
const RE_XREF = new RegExp(String.raw`\b(Sections?|Clauses?|Articles?|§§?)\s*(${REF}${CITED}(?:\s*(?:,|and|or|through|to|–|-)\s*(?:Section\s+)?${REF}${CITED})*)`, 'g')
const RE_ITEM = new RegExp(String.raw`(${REF})(?:\s*\(([A-Z][^()]{2,60})\))?`, 'g')

export function references(clauses: Clause[]): { clauseId: string; raw: string; target: string; title?: string }[] {
  const out: { clauseId: string; raw: string; target: string; title?: string }[] = []
  for (const c of clauses) {
    for (const m of c.body.matchAll(RE_XREF)) {
      for (const it of m[2].matchAll(RE_ITEM)) {
        const target = it[1].trim().replace(/\.$/, '')
        if (target) out.push({ clauseId: c.id, raw: `${m[1].replace(/s$/, '')} ${target}`, target, ...(it[2] ? { title: it[2].trim() } : {}) })
      }
    }
  }
  return out
}

const normTitle = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, '').replace(/\b(\w+?)s\b/g, '$1').replace(/\s+/g, ' ').trim()
/** Cited title and actual title agree, allowing plurals, "&"/"and" and one being a prefix of the other. */
const sameTitle = (a: string, b: string) => { const x = normTitle(a), y = normTitle(b); return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ') || x.endsWith(' ' + y) || y.endsWith(' ' + x) }

/** Does `target` exist in the document? "7.2(a)" also counts if 7.2 exists and mentions "(a)". */
export function resolve(clauses: Clause[], target: string): Clause | undefined {
  const exact = clauses.find(c => c.num === target)
  if (exact) return exact
  const m = target.match(/^(.+?)((?:\([a-z0-9]+\))+)$/)
  if (m) {
    const parent = clauses.find(c => c.num === m[1])
    const first = m[2].match(/\([a-z0-9]+\)/)![0]
    if (parent && parent.body.includes(first)) return parent
  }
  return undefined
}

/** The sentence that cites `target` also uses the clause's title as words. */
const namedNear = (body: string, target: string, title: string) => body.split(/[.;]\s/).some(s => s.includes(target) && ` ${normTitle(s)} `.includes(` ${normTitle(title)} `))

/**
 * Tells references written in this version from ones carried over. Carried over means the paired older clause cites the
 * same number; when its citations were edited, a number that an old citation's clause now has is an update, not a leftover.
 * A clause with no older counterpart is judged on its target alone: only a clause that is new too is surely what it means.
 */
function rewrittenRefs(doc: Clause[], prev?: Clause[], pairs?: Pair[]) {
  const before = new Map<string, { same: boolean; targets: Set<string>; updated: Set<string> }>()
  if (prev && pairs) {
    const list = (clauses: Clause[]) => {
      const m = new Map<string, { target: string }[]>()
      for (const r of references(clauses)) m.set(r.clauseId, [...(m.get(r.clauseId) ?? []), r])
      return m
    }
    const was = list(prev), now = list(doc)
    for (const p of pairs) {
      if (p.a === null || p.b === null) continue
      const x = (was.get(prev[p.a].id) ?? []).map(r => r.target), y = (now.get(doc[p.b].id) ?? []).map(r => r.target)
      const updated = x.flatMap(t => {
        const old = resolve(prev, t)
        const to = old && pairs.find(q => q.a === prev.indexOf(old))
        return to && to.b !== null && old.num !== doc[to.b].num && doc[to.b].num ? [doc[to.b].num! + (old.num === t ? '' : t.slice(old.num!.length))] : []
      })
      before.set(doc[p.b].id, { same: x.join('|') === y.join('|'), targets: new Set(x), updated: new Set(updated) })
    }
  }
  return (r: { clauseId: string; target: string }, hit: Clause) => {
    const b = before.get(r.clauseId)
    const isNew = !!pairs?.some(p => p.b === doc.indexOf(hit) && p.a === null)
    // "the exclusions in Section 8.2" names the new § 8.2 Exclusions: a dropped clause was put back under its old number.
    if (isNew && hit.title && namedNear(doc.find(c => c.id === r.clauseId)!.body, r.target, hit.title)) return true
    if (b) return !b.targets.has(r.target) || (!b.same && b.updated.has(r.target))
    return isNew
  }
}

/**
 * Validates references in `doc`. When the previous version and the alignment are given, a reference whose
 * target was renumbered (so the number now lands on a different clause, or nowhere) is reported as stale.
 */
export function checkRefs(doc: Clause[], prev?: Clause[], pairs?: Pair[]): XRef[] {
  const out: XRef[] = []
  const rewritten = rewrittenRefs(doc, prev, pairs)
  for (const r of references(doc)) {
    const hit = resolve(doc, r.target)
    let status: XRef['status'] = hit ? 'ok' : 'missing'
    let detail = hit ? `Points to ${hit.title || 'clause ' + hit.num}.` : `${r.raw} does not exist in this version.`
    // A reference this version wrote, and that lands somewhere, is taken as intended.
    const intended = hit && rewritten(r, hit)
    // The reference names its target's title: that settles whether it lands in the right place.
    if (r.title && hit?.title && hit.num === r.target) {
      if (!sameTitle(r.title, hit.title)) { status = 'stale'; detail = `${r.raw} is cited as “${r.title}”, but § ${hit.num} is ${hit.title}.` }
      out.push({ ...r, status, detail })
      continue
    }
    if (prev && pairs && !intended) {
      const old = resolve(prev, r.target)
      const oldIdx = old ? prev.indexOf(old) : -1
      const pair = oldIdx >= 0 ? pairs.find(p => p.a === oldIdx) : undefined
      if (pair && pair.b !== null && doc[pair.b].num !== old!.num) {
        const now = doc[pair.b]
        if (!hit || hit !== now) { status = 'stale'; detail = `${r.raw} (${old!.title || 'the original clause'}) is now ${now.num ? '§ ' + now.num : 'unnumbered'}; this reference was not updated.` }
      } else if (pair && pair.b === null) {
        status = hit ? 'stale' : 'missing'
        detail = hit ? `${r.raw} used to be ${old!.title || 'a clause'} (deleted); the number now lands on ${hit.title || 'a different clause'}.` : `${r.raw} (${old!.title || 'the referenced clause'}) was deleted in this version.`
      }
    }
    out.push({ ...r, status, detail })
  }
  return out
}
