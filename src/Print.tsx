import { useEffect } from 'react'
import { bySeverity } from './engine/analyze.ts'
import { clauseLabel } from './engine/segment.ts'
import { useComparison, useProject, useTracker } from './projectData.ts'
import { getDefaults } from './store.ts'
import { Link, NotFound } from './ui.tsx'

/** Printable issues memo and HTML redline. Both render from the same comparison the app shows. */
export default function Print({ id, kind }: { id: string; kind: 'memo' | 'redline' }) {
  const { loading, project: p, texts } = useProject(id)
  const q = new URLSearchParams(location.search)
  const vs = p?.versions ?? []
  const a = q.get('a') ?? vs.at(-2)?.id ?? null, b = q.get('b') ?? vs.at(-1)?.id ?? null
  const cmp = useComparison(p, texts, a, b)
  const tracked = useTracker(p, texts)
  useEffect(() => { if (p) document.title = `${p.name} · ${kind === 'memo' ? 'Issues memo' : 'Redline'}` }, [p?.name, kind])
  if (loading) return <div className="boot"><span className="spinner" /> Preparing</div>
  if (!p) return <NotFound />
  if (!cmp) return <div className="page narrow"><p>Both versions’ text is needed on this device to print. <Link href={`/app/p/${id}/versions`}>Back to versions</Link></p></div>
  const la = vs.find(v => v.id === a)?.label, lb = vs.find(v => v.id === b)?.label
  const d = getDefaults()
  const issues = cmp.issues.filter(i => i.source !== 'change').sort(bySeverity)
  const changes = cmp.issues.filter(i => i.source === 'change')
  return (
    <div className="print-page">
      <div className="print-bar no-print">
        <Link href={`/app/p/${id}/issues?a=${a}&b=${b}`} className="btn ghost sm">← Back</Link>
        <button type="button" className="btn primary sm" onClick={() => print()}>Print or save as PDF</button>
      </div>
      <article className="paper">
        <header className="paper-head">
          <div className="eyebrow">{kind === 'memo' ? 'Issues memo' : 'Redline'} · Privileged &amp; confidential draft</div>
          <h1>{p.name}</h1>
          <p>{lb} compared against {la} · {p.counterparty ?? 'Counterparty not set'} · Playbook: {p.playbook.name}</p>
          <p className="muted small">Prepared {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}{d.reviewer ? ` by ${d.reviewer}` : ''}{d.firm ? `, ${d.firm}` : ''}. Automated first-pass review; not legal advice.{p.sampleId ? ' Synthetic sample contract.' : ''}</p>
        </header>
        {kind === 'memo' ? (
          <>
            <h2>Summary</h2>
            <p>{cmp.summary.modified} clauses modified, {cmp.summary.moved} moved, {cmp.summary.inserted} inserted and {cmp.summary.deleted} deleted. {issues.filter(i => i.severity === 'high').length} high-severity issues, {issues.filter(i => i.severity === 'medium').length} medium, {issues.filter(i => i.severity === 'low').length} low.</p>
            <h2>Issues and proposed fallbacks</h2>
            <table className="memo-table">
              <thead><tr><th>#</th><th>Clause</th><th>Issue</th><th>Proposed fallback</th></tr></thead>
              <tbody>{issues.map((i, n) => <tr key={i.key}><td>{n + 1}</td><td>{i.clause}<div className={`sev sev-${i.severity}`}>{i.severity}</div></td><td><b>{i.issue}</b>{p.conceded.includes(i.key) && <em> (conceded)</em>}<div>{i.detail}</div>{p.notes[i.key] && <div className="muted">Note: {p.notes[i.key]}</div>}</td><td>{i.fallback}</td></tr>)}</tbody>
            </table>
            {changes.length > 0 && <><h2>Changed values and definitions</h2><ul>{changes.map(c => <li key={c.key}><b>{c.clause}</b>: {c.issue}. {c.detail}</li>)}</ul></>}
            {vs.length > 2 && <><h2>Negotiation status across {vs.length} rounds</h2><ul>{tracked.map(t => <li key={t.key}><b>{t.status}</b>: {t.issue} ({t.clause})</li>)}</ul></>}
          </>
        ) : (
          <div className="redline-doc">
            <p className="legend"><ins>Inserted</ins> <del>Deleted</del> <span className="badge moved">Moved</span></p>
            {cmp.rows.map((r, i) => {
              const ca = r.a !== null ? cmp.a.clauses[r.a] : null, cb = r.b !== null ? cmp.b.clauses[r.b] : null
              if (r.ghost) return <p key={i} className="muted small">[{clauseLabel(ca!)} moved to {clauseLabel(cmp.b.clauses[r.pair.b!])}]</p>
              return (
                <section key={i}>
                  <h3>{clauseLabel((cb ?? ca)!)} {r.pair.moved && <span className="badge moved">moved</span>}{r.pair.renumbered && ca?.num && cb && <span className="muted small"> (was {ca.num})</span>}</h3>
                  <p>{r.pair.ops ? r.pair.ops.map((o, k) => o.t === 'eq' ? <span key={k}>{o.s}</span> : o.t === 'ins' ? <ins key={k}>{o.s}</ins> : <del key={k}>{o.s}</del>) : r.pair.a === null ? <ins>{cb!.body}</ins> : r.pair.b === null ? <del>{ca!.body}</del> : cb!.body}</p>
                </section>
              )
            })}
          </div>
        )}
      </article>
    </div>
  )
}
