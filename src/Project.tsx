import { useEffect, useMemo, useState } from 'react'
import { issuesCsv, type Comparison, type Issue, type TrackedIssue } from './engine/analyze.ts'
import type { Op } from './engine/diff.ts'
import { clonePlaybook, playbookById, STARTER_PLAYBOOKS, type Rule, type RuleSpec, type Severity } from './engine/playbook.ts'
import { clauseLabel, segment, type Clause } from './engine/segment.ts'
import { termReport } from './engine/terms.ts'
import { checkRefs } from './engine/xref.ts'
import { ImportVersion } from './Import.tsx'
import { addVersion, recomputeIssues, useComparison, useProject, useTracker } from './projectData.ts'
import { putData, saveProject, uuid, type Project } from './store.ts'
import { deleteSnapshotCloud, RAW_SYNC_LIMIT } from './sync.ts'
import { ask, download, Empty, go, isTyping, Link, Modal, NotFound, SyntheticBadge, toast } from './ui.tsx'

const TABS = [['compare', 'Compare'], ['issues', 'Issues'], ['rounds', 'Rounds'], ['terms', 'Terms & refs'], ['playbook', 'Playbook'], ['versions', 'Versions']] as const

export default function ProjectView({ id, tab }: { id: string; tab: string }) {
  const { loading, project: p, texts, update } = useProject(id)
  const q = new URLSearchParams(location.search)
  const [aId, setA] = useState<string | null>(q.get('a'))
  const [bId, setB] = useState<string | null>(q.get('b'))
  const [importing, setImporting] = useState(q.get('import') === '1')
  const vs = p?.versions ?? []
  const a = aId && vs.some(v => v.id === aId) ? aId : vs.at(-2)?.id ?? vs.at(-1)?.id ?? null
  const b = bId && vs.some(v => v.id === bId) ? bId : vs.at(-1)?.id ?? null
  const cmp = useComparison(p, texts, a, b)
  const tracked = useTracker(p, texts)

  useEffect(() => { if (p) document.title = `${p.name} · Redline Desk` }, [p?.name])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length) go(`/app/p/${id}/${TABS[n - 1][0]}${location.search}`, { keepScroll: true })
      if (e.key === 'i') setImporting(true)
      if (e.key === 'm' && a && b) go(`/app/p/${id}/memo?a=${a}&b=${b}`)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [id, a, b])

  if (loading) return <div className="boot" role="status"><span className="spinner" /> Opening the matter</div>
  if (!p || !texts) return <NotFound />

  const nextLabel = `v${vs.length + 1}`
  const textsMissing = vs.some(v => texts[v.id] === undefined)

  return (
    <section className="page project">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/app">Matters</Link> / {p.playbook.name}</div>
          <h1>{p.name} {p.sampleId && <SyntheticBadge />}</h1>
          <p className="muted">{p.counterparty ?? 'Counterparty not set'} · {vs.length} version{vs.length === 1 ? '' : 's'}</p>
        </div>
        <div className="row gap wrap">
          <button type="button" className="btn ghost" onClick={() => setImporting(true)}>Add version <kbd>I</kbd></button>
          {cmp && <Link className="btn primary" href={`/app/p/${p.id}/memo?a=${a}&b=${b}`}>Issues memo <kbd>M</kbd></Link>}
        </div>
      </div>

      <nav className="tabs" aria-label="Matter sections">
        {TABS.map(([t, l], i) => <Link key={t} href={`/app/p/${p.id}/${t}${location.search}`} aria-current={tab === t ? 'page' : undefined} title={`Shortcut: ${i + 1}`}>{l}{t === 'issues' && cmp ? <span className="count">{cmp.issues.filter(x => !p.conceded.includes(x.key) && x.source !== 'change').length}</span> : null}</Link>)}
      </nav>

      {textsMissing && <div className="callout warn">The text of some versions is on another device (only playbooks and issue lists sync unless you opt in). Issue lists and rounds still work; re-import a version on this device to see its redline.</div>}

      {vs.length >= 2 && ['compare', 'issues', 'terms'].includes(tab) && (
        <div className="version-pick">
          <label>Base <select value={a ?? ''} onChange={e => { setA(e.target.value); history.replaceState({}, '', `?a=${e.target.value}&b=${b}`) }}>{vs.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
          <span aria-hidden="true">→</span>
          <label>Compared <select value={b ?? ''} onChange={e => { setB(e.target.value); history.replaceState({}, '', `?a=${a}&b=${e.target.value}`) }}>{vs.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
        </div>
      )}

      {vs.length === 0 && tab !== 'playbook' ? (
        <Empty title="No versions yet"><p className="muted">Import the first version of the contract: DOCX, PDF or pasted text. Then add the counterparty’s markup as the next version.</p><button type="button" className="btn primary" onClick={() => setImporting(true)}>Import a version</button></Empty>
      ) : (
        <>
          {tab === 'compare' && (vs.length < 2 ? <Empty title="One version so far"><p className="muted">Add the next version to see the clause-by-clause comparison. Meanwhile, the Issues tab checks this version against the playbook.</p><button type="button" className="btn primary" onClick={() => setImporting(true)}>Add the next version</button></Empty> : cmp ? <CompareTab cmp={cmp} p={p} /> : <Empty title="Text not on this device" />)}
          {tab === 'issues' && <IssuesTab p={p} cmp={cmp} single={vs.length === 1 ? vs[0].issues : null} a={a} b={b} update={update} />}
          {tab === 'rounds' && <RoundsTab p={p} tracked={tracked} update={update} />}
          {tab === 'terms' && <TermsTab cmp={cmp} text={b ? texts[b] : undefined} />}
          {tab === 'versions' && <VersionsTab p={p} texts={texts} />}
        </>
      )}
      {tab === 'playbook' && <PlaybookTab p={p} texts={texts} />}
      {!TABS.some(t => t[0] === tab) && <NotFound />}

      <Modal open={importing} onClose={() => setImporting(false)} title={`Import ${nextLabel}`} wide>
        <ImportVersion nextLabel={`${nextLabel} `} onCancel={() => setImporting(false)} onDone={async v => {
          setImporting(false)
          const np = await addVersion(p, { ...v, label: v.label.trim() }, texts)
          setA(null); setB(null)
          history.replaceState({}, '', location.pathname)
          if (np.versions.length >= 2) go(`/app/p/${p.id}/compare`)
          else go(`/app/p/${p.id}/issues`)
        }} />
      </Modal>
    </section>
  )
}

// ---------- Compare ----------

function Ops({ ops, side }: { ops: Op[]; side: 'a' | 'b' | 'inline' }) {
  return <>{ops.map((o, i) => o.t === 'eq' ? <span key={i}>{o.s}</span> : o.t === 'del' ? (side !== 'b' && <del key={i}>{o.s}</del>) : (side !== 'a' && <ins key={i}>{o.s}</ins>))}</>
}

function CompareTab({ cmp, p }: { cmp: Comparison; p: Project }) {
  const [changesOnly, setChangesOnly] = useState(false)
  const [mode, setMode] = useState<'side' | 'inline'>(() => matchMedia('(max-width: 760px)').matches ? 'inline' : 'side')
  const s = cmp.summary
  const flags = useMemo(() => {
    const m = new Map<string, Issue[]>()
    for (const i of cmp.issues) if (i.clauseId && i.source !== 'change') m.set(i.clauseId, [...(m.get(i.clauseId) ?? []), i])
    return m
  }, [cmp])
  const quantsByB = new Map(cmp.views.filter(v => v.b).map(v => [v.b!.id, v.quants]))
  const rows = cmp.rows.filter(r => !changesOnly || r.ghost || r.pair.modified || r.pair.moved || r.pair.renumbered)
  return (
    <div className="stack">
      <div className="stat-row">
        <div className="stat"><b>{s.modified}</b><span>modified</span></div>
        <div className="stat"><b>{s.moved}</b><span>moved</span></div>
        <div className="stat"><b>{s.inserted}</b><span>inserted</span></div>
        <div className="stat"><b>{s.deleted}</b><span>deleted</span></div>
        <div className="stat"><b>{s.renumbered}</b><span>renumbered</span></div>
        <div className="stat"><b>{s.unchanged}</b><span>unchanged</span></div>
      </div>
      <div className="row between wrap gap">
        <div className="seg-control" role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={mode === 'side'} className={mode === 'side' ? 'on' : ''} onClick={() => setMode('side')}>Side by side</button>
          <button type="button" role="radio" aria-checked={mode === 'inline'} className={mode === 'inline' ? 'on' : ''} onClick={() => setMode('inline')}>Redline</button>
        </div>
        <label className="check"><input type="checkbox" checked={changesOnly} onChange={e => setChangesOnly(e.target.checked)} /> Changes only</label>
      </div>
      <div className={`cmp ${mode}`}>
        {mode === 'side' && <div className="cmp-head"><span>Base</span><span>Compared</span><span className="sr-only">Flags</span></div>}
        {rows.map((r, i) => {
          const a = r.a !== null ? cmp.a.clauses[r.a] : null
          const b = r.b !== null && !r.ghost ? cmp.b.clauses[r.b] : null
          const pair = r.pair
          const tag = r.ghost ? 'ghost' : pair.a === null ? 'inserted' : pair.b === null ? 'deleted' : pair.moved ? 'moved' : pair.modified ? 'modified' : 'same'
          const fl = b ? flags.get(b.id) ?? [] : []
          const qs = b ? quantsByB.get(b.id) ?? [] : []
          const badges = <>
            {pair.moved && !r.ghost && <span className="badge moved">Moved from {a?.num ? '§ ' + a.num : 'elsewhere'}</span>}
            {pair.renumbered && !pair.moved && a?.num && b && <span className="badge">Was § {a.num}</span>}
            {pair.titleWas !== undefined && b && <span className="badge">Title was “{pair.titleWas || 'none'}”</span>}
            {pair.a === null && <span className="badge ins">Inserted</span>}
            {pair.b === null && <span className="badge del">Deleted</span>}
            {qs.map((q, k) => <span key={k} className="badge num" title={`${q.kind} changed`}>{q.before ?? '—'} → {q.after ?? '—'}</span>)}
          </>
          if (mode === 'inline') return (
            <article key={i} className={`cmp-row ${tag}`} id={b ? `clause-${b.id}` : undefined}>
              <div className="cell">
                <h4>{b ? clauseLabel(b) : a ? clauseLabel(a) : ''} {badges}</h4>
                {r.ghost ? <p className="muted small">Moved to {cmp.b.clauses[pair.b!].num ? '§ ' + cmp.b.clauses[pair.b!].num : 'a new position'}.</p>
                  : pair.ops ? <p><Ops ops={pair.ops} side="inline" /></p> : <p>{pair.a === null ? <ins>{b!.body}</ins> : pair.b === null ? <del>{a!.body}</del> : b!.body}</p>}
              </div>
              <Flags list={fl} />
            </article>
          )
          return (
            <article key={i} className={`cmp-row ${tag}`} id={b ? `clause-${b.id}` : undefined}>
              <div className="cell a">{a && !(pair.moved && !r.ghost) ? <><h4>{clauseLabel(a)}</h4><p>{pair.ops ? <Ops ops={pair.ops} side="a" /> : pair.b === null ? <del>{a.body}</del> : a.body}</p></> : pair.moved && !r.ghost ? <p className="muted small moved-note">↑ came from {a?.num ? '§ ' + a.num : 'earlier'}</p> : null}</div>
              <div className="cell b">{r.ghost ? <p className="muted small moved-note">↓ moved to {cmp.b.clauses[pair.b!].num ? '§ ' + cmp.b.clauses[pair.b!].num : 'later'}</p> : b ? <><h4>{clauseLabel(b)} {badges}</h4><p>{pair.ops ? <Ops ops={pair.ops} side="b" /> : pair.a === null ? <ins>{b.body}</ins> : b.body}</p></> : <p className="muted small">Not in this version.</p>}</div>
              <Flags list={fl} />
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Flags({ list }: { list: Issue[] }) {
  return <aside className="flags" aria-label={list.length ? `${list.length} playbook flags` : undefined}>{list.map(i => <div key={i.key} className={`flag sev-${i.severity}`} title={i.detail}><b>{i.issue}</b><span>{i.detail}</span></div>)}</aside>
}

// ---------- Issues ----------

function IssuesTab({ p, cmp, single, a, b, update }: { p: Project; cmp: Comparison | null; single: Issue[] | null; a: string | null; b: string | null; update(patch: Partial<Project>): unknown }) {
  const [sev, setSev] = useState<'all' | Severity>('all')
  const [showChanges, setShowChanges] = useState(true)
  const all = cmp?.issues ?? single ?? p.versions.find(v => v.id === b)?.issues ?? []
  const list = all.filter(i => (sev === 'all' || i.severity === sev) && (showChanges || i.source !== 'change'))
  const statuses = Object.fromEntries(p.conceded.map(k => [k, 'conceded']))
  const label = (id: string | null) => p.versions.find(v => v.id === id)?.label ?? ''
  const docx = async () => {
    if (!cmp) return
    const [{ Packer }, { redlineDocument }] = await Promise.all([import('docx'), import('./engine/redlineDocx.ts')])
    download(`${p.name} redline ${label(a)} to ${label(b)}.docx`, await Packer.toBlob(redlineDocument(cmp, { title: p.name, from: label(a), to: label(b) })))
  }
  return (
    <div className="stack">
      <div className="row between wrap gap">
        <div className="row gap wrap">
          <div className="seg-control" role="radiogroup" aria-label="Severity">{(['all', 'high', 'medium', 'low'] as const).map(s => <button key={s} type="button" role="radio" aria-checked={sev === s} className={sev === s ? 'on' : ''} onClick={() => setSev(s)}>{s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)} <span className="muted">{s === 'all' ? all.length : all.filter(i => i.severity === s).length}</span></button>)}</div>
          <label className="check"><input type="checkbox" checked={showChanges} onChange={e => setShowChanges(e.target.checked)} /> Show value and definition changes</label>
        </div>
        <div className="row gap-sm wrap">
          <button type="button" className="btn ghost sm" onClick={() => download(`${p.name} issues ${label(b)}.csv`, issuesCsv(all, statuses))}>CSV</button>
          {cmp && <><Link className="btn ghost sm" href={`/app/p/${p.id}/memo?a=${a}&b=${b}`}>Memo</Link><Link className="btn ghost sm" href={`/app/p/${p.id}/redline?a=${a}&b=${b}`}>HTML redline</Link><button type="button" className="btn primary sm" onClick={() => void docx().catch(e => toast(String(e), { tone: 'error' }))}>DOCX redline</button></>}
        </div>
      </div>
      {list.length === 0 ? <Empty title="No issues at this filter"><p className="muted">The playbook passes and no terms or references are broken.</p></Empty> : (
        <div className="table-wrap">
          <table className="issues">
            <thead><tr><th>Severity</th><th>Clause</th><th>Issue</th><th>Suggested fallback</th><th><span className="sr-only">Status</span></th></tr></thead>
            <tbody>{list.map(i => {
              const conceded = p.conceded.includes(i.key)
              return (
                <tr key={i.key} className={conceded ? 'conceded' : ''}>
                  <td><span className={`sev sev-${i.severity}`}>{i.severity}</span></td>
                  <td className="nowrap">{i.clauseId ? <Link href={`/app/p/${p.id}/compare${location.search}#clause-${i.clauseId}`}>{i.clause}</Link> : i.clause}</td>
                  <td><b>{i.issue}</b><div className="muted small">{i.detail}</div></td>
                  <td className="fallback">{i.fallback && <><p>{i.fallback}</p><button type="button" className="linkish small" onClick={() => void navigator.clipboard.writeText(i.fallback).then(() => toast('Fallback copied', { tone: 'ok', ttl: 1500 }))}>Copy</button></>}</td>
                  <td>{i.source !== 'change' && <button type="button" className={`btn sm ${conceded ? 'ghost' : 'quiet'}`} onClick={() => update({ conceded: conceded ? p.conceded.filter(k => k !== i.key) : [...p.conceded, i.key] })}>{conceded ? 'Reopen' : 'Concede'}</button>}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
      <p className="muted small">Automated checks for a first pass. They miss things and are not legal advice.</p>
    </div>
  )
}

// ---------- Rounds ----------

const STATUS_LABEL = { open: 'Open', new: 'New this round', conceded: 'Conceded', resolved: 'Resolved' }
function RoundsTab({ p, tracked, update }: { p: Project; tracked: TrackedIssue[]; update(patch: Partial<Project>): unknown }) {
  if (p.versions.length < 2) return <Empty title="Rounds start with the second version"><p className="muted">Each version is a negotiation round. Add the counterparty’s markup to see what was resolved, conceded or is still open.</p></Empty>
  const counts = { open: 0, new: 0, conceded: 0, resolved: 0 }
  for (const t of tracked) counts[t.status]++
  return (
    <div className="stack">
      <div className="stat-row">{(Object.keys(counts) as (keyof typeof counts)[]).map(k => <div key={k} className={`stat st-${k}`}><b>{counts[k]}</b><span>{STATUS_LABEL[k]}</span></div>)}</div>
      <div className="table-wrap">
        <table className="rounds">
          <thead><tr><th>Issue</th>{p.versions.map(v => <th key={v.id} className="center">{v.label.split(' ')[0]}</th>)}<th>Status</th><th>Note</th></tr></thead>
          <tbody>{tracked.map(t => (
            <tr key={t.key}>
              <td><b>{t.issue}</b><div className="muted small">{t.clause} · {t.detail}</div></td>
              {t.present.map((x, i) => <td key={i} className="center"><span className={`dot ${x ? `sev-${t.severity}` : 'clear'}`} title={x ? 'Present' : 'Not present'} /></td>)}
              <td><span className={`status st-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                {(t.status === 'open' || t.status === 'new' || t.status === 'conceded') && <button type="button" className="linkish small" onClick={() => update({ conceded: t.status === 'conceded' ? p.conceded.filter(k => k !== t.key) : [...p.conceded, t.key] })}>{t.status === 'conceded' ? 'Reopen' : 'Concede'}</button>}
              </td>
              <td><input className="note" aria-label={`Note for ${t.issue}`} defaultValue={p.notes[t.key] ?? ''} placeholder="Why, and what we got for it" onBlur={e => { if ((p.notes[t.key] ?? '') !== e.target.value) update({ notes: { ...p.notes, [t.key]: e.target.value } }) }} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Terms & references ----------

function TermsTab({ cmp, text }: { cmp: Comparison | null; text: string | undefined }) {
  const clauses: Clause[] = useMemo(() => cmp?.b.clauses ?? (text ? segment(text).clauses : []), [cmp, text])
  const tr = useMemo(() => termReport(clauses), [clauses])
  const refs = cmp?.refs ?? checkRefs(clauses)
  const label = (id: string) => { const c = clauses.find(c => c.id === id); return c ? clauseLabel(c) : '' }
  return (
    <div className="two-col">
      <div className="panel">
        <h2>Defined terms <span className="muted">{tr.defs.length}</span></h2>
        <table className="compact">
          <thead><tr><th>Term</th><th className="num">Uses</th><th>Where</th></tr></thead>
          <tbody>{tr.defs.map((d, i) => {
            const ch = cmp?.terms.find(t => t.term === d.term)
            return <tr key={i}><td><b>{d.term}</b>{ch && <span className={`badge ${ch.kind === 'added' ? 'ins' : 'num'}`}>{ch.kind}</span>}</td><td className="num">{tr.uses[d.term]}</td><td className="muted small">{label(d.clauseId)}</td></tr>
          })}</tbody>
        </table>
        {cmp && cmp.terms.filter(t => t.kind === 'removed').map(t => <p key={t.term} className="small"><span className="badge del">removed</span> <b>{t.term}</b></p>)}
        <h3>Findings</h3>
        {tr.findings.length ? <ul className="findings">{tr.findings.map((f, i) => <li key={i}><span className={`badge kind-${f.kind}`}>{f.kind}</span> {f.detail} <span className="muted small">{f.clauseIds.map(label).join(', ')}</span></li>)}</ul> : <p className="muted">No unused, undefined or inconsistent terms.</p>}
      </div>
      <div className="panel">
        <h2>Cross-references <span className="muted">{refs.length}</span></h2>
        {refs.length === 0 ? <p className="muted">No “Section X” references found.</p> : (
          <table className="compact">
            <thead><tr><th>In</th><th>Reference</th><th>Status</th></tr></thead>
            <tbody>{refs.map((r, i) => <tr key={i} className={r.status !== 'ok' ? 'bad' : ''}><td className="small">{label(r.clauseId)}</td><td className="nowrap">{r.raw}</td><td><span className={`status st-${r.status === 'ok' ? 'resolved' : 'new'}`}>{r.status}</span><div className="muted small">{r.detail}</div></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---------- Versions ----------

function VersionsTab({ p, texts }: { p: Project; texts: Record<string, string> }) {
  const size = Object.values(texts).reduce((n, t) => n + t.length, 0)
  return (
    <div className="stack">
      <ol className="timeline">{p.versions.map((v, i) => (
        <li key={v.id}>
          <div className="tl-dot" aria-hidden="true">{i + 1}</div>
          <div className="tl-body">
            <div className="row between wrap gap">
              <div><b>{v.label}</b> <span className="muted small">{v.fileName} · {v.format.toUpperCase()} · {v.clauses} clauses · {new Date(v.at).toLocaleDateString()}</span></div>
              <div className="row gap-sm">
                {i > 0 && <Link className="btn ghost sm" href={`/app/p/${p.id}/compare?a=${p.versions[i - 1].id}&b=${v.id}`}>Compare with {p.versions[i - 1].label.split(' ')[0]}</Link>}
                {texts[v.id] !== undefined && <button type="button" className="btn ghost sm" onClick={() => download(`${v.label}.txt`, texts[v.id], 'text/plain')}>Text</button>}
                {!p.sampleId && <button type="button" className="btn danger-ghost sm" onClick={async () => {
                  if (!(await ask(`Delete ${v.label}?`, 'Removes this version and its issue list. You can undo for a few seconds.', 'Delete version'))) return
                  const prev = p
                  await saveProject({ ...p, versions: p.versions.filter(x => x.id !== v.id) })
                  toast(`Deleted ${v.label}`, { undo: () => void saveProject(prev) })
                  setTimeout(() => void deleteSnapshotCloud(v.id), 9000)
                }}>Delete</button>}
              </div>
            </div>
            <div className="muted small">{v.issues.length} issue{v.issues.length === 1 ? '' : 's'} ({v.issues.filter(x => x.severity === 'high').length} high){v.warnings.length ? ` · ${v.warnings.length} numbering warning${v.warnings.length > 1 ? 's' : ''}` : ''}</div>
          </div>
        </li>
      ))}</ol>
      {!p.sampleId && (
        <div className="panel">
          <h2>Sync document text</h2>
          <p className="muted small">Off by default: only the playbook, issue lists and negotiation status sync. Turn on to also store this matter’s contract text in your account, up to {(RAW_SYNC_LIMIT / 1e6).toFixed(1)} MB (currently {(size / 1e6).toFixed(2)} MB).</p>
          <label className="check"><input type="checkbox" checked={!!p.syncText} disabled={size > RAW_SYNC_LIMIT} onChange={async e => { await putData(p.id, texts); await saveProject({ ...p, syncText: e.target.checked }) }} /> Sync this matter’s document text</label>
        </div>
      )}
    </div>
  )
}

// ---------- Playbook editor ----------

const KINDS: Record<RuleSpec['kind'], { label: string; make(): RuleSpec }> = {
  required: { label: 'Required clause', make: () => ({ kind: 'required', match: 'clause title or phrase' }) },
  forbidden: { label: 'Forbidden phrase', make: () => ({ kind: 'forbidden', phrases: [] }) },
  liabilityCap: { label: 'Liability cap', make: () => ({ kind: 'liabilityCap', minMonths: 12 }) },
  duration: { label: 'Term or survival length', make: () => ({ kind: 'duration', match: 'surviv', maxMonths: 36 }) },
  governingLaw: { label: 'Governing law', make: () => ({ kind: 'governingLaw', allowed: ['Delaware'] }) },
  paymentDays: { label: 'Payment terms', make: () => ({ kind: 'paymentDays', maxDays: 30 }) },
  ipScope: { label: 'IP assignment scope', make: () => ({ kind: 'ipScope' }) },
  restrictive: { label: 'Non-compete / non-solicit', make: () => ({ kind: 'restrictive', forbid: ['noncompete', 'nonsolicit'] }) },
  autoRenewal: { label: 'Auto-renewal notice', make: () => ({ kind: 'autoRenewal', maxNoticeDays: 60 }) },
  mutual: { label: 'Mutual obligations', make: () => ({ kind: 'mutual' }) },
}

function PlaybookTab({ p, texts }: { p: Project; texts: Record<string, string> }) {
  const [rules, setRules] = useState<Rule[]>(p.playbook.rules)
  const [addKind, setAddKind] = useState<RuleSpec['kind']>('required')
  useEffect(() => setRules(p.playbook.rules), [p.playbook])
  const dirty = JSON.stringify(rules) !== JSON.stringify(p.playbook.rules)
  const set = (i: number, patch: Partial<Rule>) => setRules(rs => rs.map((r, j) => j === i ? { ...r, ...patch } as Rule : r))
  const apply = async (next: Rule[]) => {
    const np = { ...p, playbook: { ...p.playbook, rules: next } }
    await saveProject({ ...np, versions: recomputeIssues(np, texts) })
    toast('Playbook saved. Issues recomputed for every version.', { tone: 'ok' })
  }
  const starter = playbookById(p.playbook.id)
  return (
    <div className="stack">
      <div className="row between wrap gap">
        <p className="muted">Rules for this matter, starting from <b>{starter?.name ?? p.playbook.name}</b>. Edits apply to this matter only.</p>
        <div className="row gap-sm wrap">
          <select aria-label="Switch starter playbook" value="" onChange={async e => {
            const pb = playbookById(e.target.value)
            if (!pb || !(await ask(`Switch to ${pb.name}?`, 'Replaces this matter’s rules with the starter playbook.', 'Switch', false))) return
            const np = { ...p, playbook: clonePlaybook(pb) }
            await saveProject({ ...np, versions: recomputeIssues(np, texts) })
          }}><option value="">Switch playbook…</option>{STARTER_PLAYBOOKS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          {starter && <button type="button" className="btn ghost sm" onClick={async () => { const prev = p.playbook.rules; await apply(clonePlaybook(starter).rules); toast('Reset to the starter rules', { undo: () => void apply(prev) }) }}>Reset</button>}
          <button type="button" className="btn primary sm" disabled={!dirty} onClick={() => void apply(rules)}>Save rules</button>
        </div>
      </div>
      {rules.map((r, i) => (
        <article key={r.id} className={`rule${r.enabled ? '' : ' off'}`}>
          <div className="rule-head">
            <label className="check"><input type="checkbox" checked={r.enabled} onChange={e => set(i, { enabled: e.target.checked })} /> <span className="sr-only">Enabled</span></label>
            <input className="rule-name" aria-label="Rule name" value={r.name} onChange={e => set(i, { name: e.target.value })} />
            <span className="badge">{KINDS[r.kind].label}</span>
            <select aria-label="Severity" value={r.severity} onChange={e => set(i, { severity: e.target.value as Severity })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
            <button type="button" className="icon-btn" aria-label={`Delete rule ${r.name}`} onClick={() => setRules(rs => rs.filter((_, j) => j !== i))}>&times;</button>
          </div>
          <div className="inline-fields">
            {r.kind === 'required' && <label className="field"><span>Matches (regular expression on clause titles, then text)</span><input value={r.match} onChange={e => set(i, { match: e.target.value })} /></label>}
            {r.kind === 'duration' && <><label className="field"><span>Sentences matching</span><input value={r.match} onChange={e => set(i, { match: e.target.value })} /></label><label className="field"><span>Max months</span><input type="number" min="0" value={r.maxMonths ?? ''} onChange={e => set(i, { maxMonths: e.target.value === '' ? undefined : Number(e.target.value) })} /></label><label className="field"><span>Min months</span><input type="number" min="0" value={r.minMonths ?? ''} onChange={e => set(i, { minMonths: e.target.value === '' ? undefined : Number(e.target.value) })} /></label></>}
            {r.kind === 'forbidden' && <label className="field grow"><span>Phrases, one per line</span><textarea rows={2} value={r.phrases.join('\n')} onChange={e => set(i, { phrases: e.target.value.split('\n') })} /></label>}
            {r.kind === 'liabilityCap' && <><label className="field"><span>Minimum months of fees</span><input type="number" min="0" value={r.minMonths} onChange={e => set(i, { minMonths: Number(e.target.value) })} /></label><label className="field"><span>Minimum amount ($)</span><input type="number" min="0" value={r.minAmount ?? ''} onChange={e => set(i, { minAmount: e.target.value === '' ? undefined : Number(e.target.value) })} /></label></>}
            {r.kind === 'governingLaw' && <label className="field grow"><span>Allowed (comma separated)</span><input value={r.allowed.join(', ')} onChange={e => set(i, { allowed: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label>}
            {r.kind === 'paymentDays' && <label className="field"><span>Maximum days</span><input type="number" min="0" value={r.maxDays} onChange={e => set(i, { maxDays: Number(e.target.value) })} /></label>}
            {r.kind === 'autoRenewal' && <label className="field"><span>Maximum notice days</span><input type="number" min="0" value={r.maxNoticeDays} onChange={e => set(i, { maxNoticeDays: Number(e.target.value) })} /></label>}
            {r.kind === 'restrictive' && <>{(['noncompete', 'nonsolicit'] as const).map(k => <label key={k} className="check"><input type="checkbox" checked={r.forbid.includes(k)} onChange={e => set(i, { forbid: e.target.checked ? [...r.forbid, k] : r.forbid.filter(x => x !== k) })} /> Flag {k === 'noncompete' ? 'non-competes' : 'non-solicits'}</label>)}</>}
          </div>
          <label className="field"><span>Fallback language</span><textarea rows={2} value={r.fallback} onChange={e => set(i, { fallback: e.target.value })} /></label>
        </article>
      ))}
      <div className="row gap-sm">
        <select aria-label="Rule type" value={addKind} onChange={e => setAddKind(e.target.value as RuleSpec['kind'])}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button type="button" className="btn ghost sm" onClick={() => setRules(rs => [...rs, { id: uuid(), name: KINDS[addKind].label, severity: 'medium', fallback: '', enabled: true, ...KINDS[addKind].make() } as Rule])}>Add rule</button>
      </div>
    </div>
  )
}
