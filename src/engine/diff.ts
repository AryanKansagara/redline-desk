// Word-level diff using Myers' O(ND) algorithm.

export type Op = { t: 'eq' | 'ins' | 'del'; s: string }

/** Words (numbers keep their separators, e.g. 1,000.00), whitespace runs, and single punctuation marks. */
export const tokenize = (s: string): string[] => s.match(/\s+|[\p{L}\p{N}$€£%'’-]+(?:[.,]\p{N}+)*|[^\s]/gu) ?? []

/** Myers shortest edit script over two token arrays. */
export function myers(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length, max = n + m
  const off = max + 1
  let v: Int32Array = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  let done = false
  for (let d = 0; d <= max && !done; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v[off + k] = x
      if (x >= n && y >= m) { done = true; break }
    }
  }
  trace.push(v.slice())
  // Backtrack from (n, m).
  const ops: Op[] = []
  let x = n, y = m
  for (let d = trace.length - 2; d > 0; d--) {
    v = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1
    const px = v[off + prevK], py = px - prevK
    while (x > px && y > py) { ops.push({ t: 'eq', s: a[--x] }); y-- }
    if (x === px) ops.push({ t: 'ins', s: b[--y] })
    else ops.push({ t: 'del', s: a[--x] })
  }
  while (x > 0 && y > 0) { ops.push({ t: 'eq', s: a[--x] }); y-- }
  while (x > 0) ops.push({ t: 'del', s: a[--x] })
  while (y > 0) ops.push({ t: 'ins', s: b[--y] })
  return ops.reverse()
}

/** Merges runs and folds whitespace or punctuation between two edits into the edits, so redlines read as phrases. */
export function cleanup(raw: Op[]): Op[] {
  const ops: Op[] = []
  for (const o of raw) { if (ops.length && ops.at(-1)!.t === o.t) ops.at(-1)!.s += o.s; else ops.push({ ...o }) }
  const out: Op[] = []
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]
    if (o.t === 'eq' && /^[\s\p{P}]{1,3}$/u.test(o.s) && out.length && out.at(-1)!.t !== 'eq' && ops[i + 1] && ops[i + 1].t !== 'eq') {
      out.push({ t: 'del', s: o.s }, { t: 'ins', s: o.s })
      continue
    }
    out.push({ ...o })
  }
  // Group consecutive non-eq ops: all deletions first, then all insertions.
  const res: Op[] = []
  for (let i = 0; i < out.length;) {
    if (out[i].t === 'eq') {
      let s = ''
      while (i < out.length && out[i].t === 'eq') s += out[i++].s
      res.push({ t: 'eq', s })
    } else {
      let d = '', ins = ''
      while (i < out.length && out[i].t !== 'eq') { if (out[i].t === 'del') d += out[i].s; else ins += out[i].s; i++ }
      if (d) res.push({ t: 'del', s: d })
      if (ins) res.push({ t: 'ins', s: ins })
    }
  }
  return res
}

export const diffWords = (a: string, b: string): Op[] => cleanup(myers(tokenize(a), tokenize(b)))

export const diffStats = (ops: Op[]) => ({
  ins: ops.filter(o => o.t === 'ins').reduce((n, o) => n + tokenize(o.s).filter(t => t.trim()).length, 0),
  del: ops.filter(o => o.t === 'del').reduce((n, o) => n + tokenize(o.s).filter(t => t.trim()).length, 0),
})
