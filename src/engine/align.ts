// Clause alignment across two versions: similarity matching that survives renumbering and moved clauses.
import { diffWords, type Op } from './diff.ts'
import type { Clause } from './segment.ts'

export interface Pair {
  a: number | null
  b: number | null
  sim: number
  modified: boolean
  moved: boolean
  renumbered: boolean
  /** Word diff of the clause body. */
  ops?: Op[]
  /** Previous title, when the title changed. */
  titleWas?: string
}

/** A row in the side-by-side view. `ghost` marks where a moved clause used to be. */
export interface Row { a: number | null; b: number | null; pair: Pair; ghost?: boolean }

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

function bag(s: string) {
  const m = new Map<string, number>()
  for (const w of words(s)) m.set(w, (m.get(w) ?? 0) + 1)
  return m
}

/** Dice coefficient over word multisets. */
export function similarity(x: string, y: string): number {
  const a = bag(x), b = bag(y)
  let na = 0, nb = 0, both = 0
  for (const v of a.values()) na += v
  for (const v of b.values()) nb += v
  if (!na && !nb) return 1
  for (const [w, v] of a) both += Math.min(v, b.get(w) ?? 0)
  return (2 * both) / (na + nb)
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function clauseSim(a: Clause, b: Clause): number {
  const body = similarity(a.body, b.body)
  const titled = a.title && b.title
  if (titled && norm(a.title) === norm(b.title)) return Math.max(body, 0.55 + 0.45 * body)
  if (!a.body && !b.body) return titled ? similarity(a.title, b.title) : 0
  return titled ? 0.85 * body + 0.15 * similarity(a.title, b.title) : body
}

/** Indices (into seq) of a longest increasing subsequence. */
export function lis(seq: number[]): Set<number> {
  const tails: number[] = [], prev = new Array<number>(seq.length).fill(-1)
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (seq[tails[mid]] < seq[i]) lo = mid + 1; else hi = mid }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const out = new Set<number>()
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) out.add(i)
  return out
}

export const THRESHOLD = 0.5

export function align(A: Clause[], B: Clause[]): Pair[] {
  const matchA = new Array<number>(A.length).fill(-1)
  const matchB = new Array<number>(B.length).fill(-1)
  const sims = new Map<string, number>()
  // Pass 1: identical text (cheap, and anchors renumbered clauses).
  const byText = new Map<string, number[]>()
  B.forEach((c, j) => { const k = norm(c.title + '|' + c.body); byText.set(k, [...(byText.get(k) ?? []), j]) })
  A.forEach((c, i) => {
    const list = byText.get(norm(c.title + '|' + c.body))
    const j = list?.find(j => matchB[j] < 0)
    if (j !== undefined && (c.body || c.title)) { matchA[i] = j; matchB[j] = i; sims.set(`${i}:${j}`, 1) }
  })
  // Pass 2: best remaining pairs by similarity, ties broken by closeness in position.
  const cands: [number, number, number][] = []
  A.forEach((a, i) => { if (matchA[i] < 0) B.forEach((b, j) => { if (matchB[j] < 0) { const s = clauseSim(a, b); if (s >= THRESHOLD) cands.push([s, i, j]) } }) })
  cands.sort((x, y) => y[0] - x[0] || Math.abs(x[1] / A.length - x[2] / B.length) - Math.abs(y[1] / A.length - y[2] / B.length))
  for (const [s, i, j] of cands) if (matchA[i] < 0 && matchB[j] < 0) { matchA[i] = j; matchB[j] = i; sims.set(`${i}:${j}`, s) }

  const matched = A.map((_, i) => i).filter(i => matchA[i] >= 0)
  const keep = lis(matched.map(i => matchA[i]))
  const pairs: Pair[] = []
  matched.forEach((i, idx) => {
    const j = matchA[i], a = A[i], b = B[j]
    const modified = norm(a.body) !== norm(b.body) || norm(a.title) !== norm(b.title)
    pairs.push({ a: i, b: j, sim: sims.get(`${i}:${j}`) ?? 1, modified, moved: !keep.has(idx), renumbered: (a.num ?? '') !== (b.num ?? ''), ops: modified ? diffWords(a.body, b.body) : undefined, titleWas: norm(a.title) !== norm(b.title) ? a.title : undefined })
  })
  A.forEach((_, i) => { if (matchA[i] < 0) pairs.push({ a: i, b: null, sim: 0, modified: true, moved: false, renumbered: false }) })
  B.forEach((_, j) => { if (matchB[j] < 0) pairs.push({ a: null, b: j, sim: 0, modified: true, moved: false, renumbered: false }) })
  return pairs
}

/** Orders pairs for a side-by-side view: follows the new version, slots deletions where they were, and leaves a ghost row where moved clauses came from. */
export function rows(pairs: Pair[], nA: number): Row[] {
  const byA = new Map<number, Pair>(), byB = new Map<number, Pair>()
  for (const p of pairs) { if (p.a !== null) byA.set(p.a, p); if (p.b !== null) byB.set(p.b, p) }
  const out: Row[] = []
  let ai = 0
  const flushA = (upTo: number) => {
    for (; ai < upTo && ai < nA; ai++) {
      const p = byA.get(ai)!
      if (p.b === null) out.push({ a: ai, b: null, pair: p })
      else if (p.moved) out.push({ a: ai, b: null, pair: p, ghost: true })
    }
  }
  const nB = Math.max(-1, ...pairs.map(p => p.b ?? -1)) + 1
  for (let j = 0; j < nB; j++) {
    const p = byB.get(j)!
    if (p.a !== null && !p.moved) { flushA(p.a); ai = Math.max(ai, p.a + 1) }
    out.push({ a: p.a, b: j, pair: p })
  }
  flushA(nA)
  return out
}

export function summary(pairs: Pair[]) {
  return {
    unchanged: pairs.filter(p => p.a !== null && p.b !== null && !p.modified && !p.moved).length,
    modified: pairs.filter(p => p.a !== null && p.b !== null && p.modified).length,
    moved: pairs.filter(p => p.moved).length,
    inserted: pairs.filter(p => p.a === null).length,
    deleted: pairs.filter(p => p.b === null).length,
    renumbered: pairs.filter(p => p.renumbered && p.a !== null && p.b !== null).length,
  }
}
