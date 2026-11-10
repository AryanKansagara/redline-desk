import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { compare } from './engine/analyze.ts'
import { diffStats } from './engine/diff.ts'
import { playbookById } from './engine/playbook.ts'
import { SAMPLES } from './engine/samples.ts'
import { clauseText } from './engine/segment.ts'
import { Link } from './ui.tsx'

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** The hero runs the real engine on the synthetic NDA: aligned clauses, connector lines, the moved clause, margin flags. */
function LiveCompare() {
  const nda = SAMPLES.find(s => s.id === 'nda')!
  const cmp = useMemo(() => compare(nda.versions[0].text, nda.versions[1].text, playbookById('nda-mutual')!), [])
  const A = cmp.a.clauses.filter(c => c.num), B = cmp.b.clauses.filter(c => c.num)
  const pairOfB = new Map(cmp.pairs.filter(p => p.b !== null).map(p => [p.b!, p]))
  const flags = new Map<string, typeof cmp.issues>()
  for (const i of cmp.issues) if (i.clauseId && i.source === 'playbook') flags.set(i.clauseId, [...(flags.get(i.clauseId) ?? []), i])
  const wrap = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<{ w: number; h: number; lines: { d: string; kind: string; key: string }[]; moved: Record<string, number> } | null>(null)
  const [step, setStep] = useState(reduced() ? 4 : 0)
  const [sel, setSel] = useState<number | null>(null)
  const [run, setRun] = useState(0)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      const gap = el.querySelector('.lc-gap')!.getBoundingClientRect()
      const lines: { d: string; kind: string; key: string }[] = []
      const moved: Record<string, number> = {}
      for (const p of cmp.pairs) {
        if (p.a === null || p.b === null) continue
        const ea = el.querySelector(`[data-a="${p.a}"]`), eb = el.querySelector(`[data-b="${p.b}"]`)
        if (!ea || !eb) continue
        const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect()
        const ya = ra.top + ra.height / 2 - box.top, yb = rb.top + rb.height / 2 - box.top
        const x0 = gap.left - box.left, x1 = gap.right - box.left, mx = (x0 + x1) / 2
        lines.push({ d: `M${x0},${ya} C${mx},${ya} ${mx},${yb} ${x1},${yb}`, kind: p.moved ? 'moved' : p.modified ? 'modified' : 'same', key: `${p.a}-${p.b}` })
        if (p.moved) moved[p.b] = ra.top - rb.top
      }
      setGeo({ w: box.width, h: box.height, lines, moved })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cmp])

  useLayoutEffect(() => {
    if (reduced()) return
    setStep(0)
    const ts = [500, 1300, 2600, 3700].map((t, i) => setTimeout(() => setStep(i + 1), t))
    return () => ts.forEach(clearTimeout)
  }, [run])

  const selPair = sel !== null ? pairOfB.get(sel) : cmp.pairs.find(p => p.moved)
  const selB = selPair?.b != null ? cmp.b.clauses[selPair.b] : null
  return (
    <div className="lc" data-step={step}>
      <div className="lc-bar">
        <span className="lc-dot" /> <span className="mono small">NDA v1 (ours) → v2 (counterparty)</span>
        <span className="badge synthetic">Synthetic</span>
        <span className="lc-stats mono small">{cmp.summary.modified} modified · {cmp.summary.moved} moved · {cmp.issues.filter(i => i.source === 'playbook').length} playbook flags</span>
        <button type="button" className="linkish small" onClick={() => setRun(r => r + 1)}>Replay</button>
      </div>
      <div className="lc-grid" ref={wrap}>
        <ol className="lc-col a" aria-label="Version 1 clauses">
          {A.map(c => { const idx = cmp.a.clauses.indexOf(c); const p = cmp.pairs.find(x => x.a === idx); return (
            <li key={c.id} data-a={idx} className={`lc-item ${p?.moved ? 'moved' : p?.modified ? 'modified' : ''}`}><span className="lc-num">{c.num}</span>{c.title || clauseText(c).slice(0, 26)}</li>
          ) })}
        </ol>
        <div className="lc-gap" aria-hidden="true" />
        <ol className="lc-col b" aria-label="Version 2 clauses">
          {B.map(c => {
            const idx = cmp.b.clauses.indexOf(c)
            const p = pairOfB.get(idx)!
            const st = p.ops ? diffStats(p.ops) : null
            const shift = geo?.moved[idx]
            const fl = flags.get(c.id) ?? []
            return (
              <li key={c.id} data-b={idx} className={`lc-item ${p.moved ? 'moved' : p.modified ? 'modified' : ''}${sel === idx ? ' sel' : ''}`}
                style={p.moved && shift !== undefined ? { transform: step >= 3 ? 'none' : `translateY(${shift}px)` } : undefined}>
                <button type="button" onClick={() => setSel(idx)} aria-label={`Show changes in ${c.num} ${c.title}`}>
                  <span className="lc-num">{c.num}</span>{c.title || clauseText(c).slice(0, 26)}
                  {st && (st.ins || st.del) ? <span className="lc-delta mono"><i>+{st.ins}</i> <s>−{st.del}</s></span> : null}
                </button>
                {fl.length > 0 && <span className="lc-flags">{fl.map(f => <span key={f.key} className={`lc-flag sev-${f.severity}`} title={f.detail}>{f.issue}</span>)}</span>}
              </li>
            )
          })}
        </ol>
        {geo && (
          <svg className="lc-lines" width={geo.w} height={geo.h} aria-hidden="true">
            {geo.lines.map((l, i) => <path key={l.key} d={l.d} className={`lc-line ${l.kind}`} pathLength={1} style={{ transitionDelay: `${i * 45}ms` }} />)}
          </svg>
        )}
      </div>
      {selPair?.ops && selB && (
        <div className="lc-diff" aria-live="polite">
          <div className="mono small muted">§ {selB.num} {selB.title}{selPair.moved ? ' · moved from § ' + cmp.a.clauses[selPair.a!].num : ''}</div>
          <p>{selPair.ops.map((o, i) => o.t === 'eq' ? <span key={i}>{o.s}</span> : o.t === 'ins' ? <ins key={i}>{o.s}</ins> : <del key={i}>{o.s}</del>)}</p>
        </div>
      )}
    </div>
  )
}

const FEATURES = [
  ['Clause-aware compare', 'Clauses are aligned by meaning, not position, so renumbering does not turn the whole document red, and a moved clause shows up as a move.'],
  ['Any format, no track-changes', 'DOCX, the PDF the other side sent, or pasted text. Compare any two versions, even when nobody kept a Word file with track-changes.'],
  ['Broken terms and references', 'Defined terms that are unused, undefined, inconsistently capitalised or quietly redefined, and “Section 8.2” references that no longer point where they did.'],
  ['Playbook review', 'Liability caps in months of fees, survival periods, governing law, payment days, IP scope, non-competes and auto-renewal windows, each with a severity and fallback language.'],
  ['Exports you can send', 'An issues list as CSV, a printable memo, and a DOCX redline with coloured underline and strikethrough that opens in Word.'],
  ['Rounds, tracked', 'v1 → v2 → v3: see what was resolved, what you conceded and what is still open, with a note on each.'],
]

export function Landing() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Contract comparison and playbook review</div>
          <h1>See what the other side <span className="hl">actually changed</span>.</h1>
          <p className="lede">Redline Desk compares any two versions of an NDA, MSA or services agreement clause by clause, catches moved clauses, broken defined terms and cross-references, and checks every deviation against your playbook. Your documents never leave the browser.</p>
          <div className="row gap wrap">
            <Link href="/app?sample=nda" className="btn primary lg">Try the NDA sample</Link>
            <Link href="/app" className="btn ghost lg">Compare your contract</Link>
          </div>
        </div>
        <LiveCompare />
      </section>

      <section className="band">
        <div className="band-inner">
          <p className="quote">“Their contracts manager sends a PDF, and we send redlines back on the PDF.”</p>
          <p className="muted small">The workflow in-house teams and small firms describe. No Word file, no track-changes, and a liability cap that went from twelve months of fees to three on page nine.</p>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">What it catches</div>
        <h2 className="section-title">Built for the second read, the one where things slip through</h2>
        <div className="feature-grid">{FEATURES.map(([t, d], i) => <article key={t} className="feature-card"><span className="mono small muted">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></article>)}</div>
      </section>

      <section className="section split">
        <div>
          <div className="eyebrow">Private by construction</div>
          <h2 className="section-title">No upload step, because there is no server</h2>
          <p>Parsing, alignment, diffing and playbook checks run in your browser. If you sign in, only playbooks, issue lists and negotiation status sync. Contract text syncs only if you opt in for a matter. <Link href="/privacy">Read the privacy page</Link>.</p>
        </div>
        <ol className="steps">
          <li><b>Import</b> two or more versions: DOCX, PDF or text.</li>
          <li><b>Review</b> the aligned redline, margin flags and the issues list.</li>
          <li><b>Send</b> the memo or DOCX redline, then track the next round.</li>
        </ol>
      </section>

      <section className="section cta">
        <h2 className="section-title">Two synthetic contract sets are ready to open</h2>
        <p className="muted">A mutual NDA the counterparty made one-way, and a SaaS MSA where the liability cap shrank and a cross-reference broke. Not legal advice.</p>
        <div className="row gap center-x wrap">
          {SAMPLES.map(s => <Link key={s.id} href={`/app?sample=${s.id}`} className="btn ghost lg">{s.name}</Link>)}
        </div>
      </section>
    </>
  )
}
