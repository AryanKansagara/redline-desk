import { useEffect, useState } from 'react'
import { STARTER_PLAYBOOKS } from './engine/playbook.ts'
import { SAMPLES } from './engine/samples.ts'
import { createBlankProject, createSampleProject } from './projectData.ts'
import { deleteProject, getDefaults, saveProject, useProjects, type Project } from './store.ts'
import { useSync } from './sync.ts'
import { ask, go, Link, Modal, SyntheticBadge, toast } from './ui.tsx'

export default function Workspace() {
  const list = useProjects()
  const sync = useSync()
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // /app?sample=nda opens (or creates) the sample straight away.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const s = q.get('sample')
    const tab = q.get('tab')?.replace(/[^a-z]/g, '')
    if (!s || list === null || busy) return
    if (!SAMPLES.some(x => x.id === s)) return
    setBusy(s)
    void createSampleProject(s).then(p => go(`/app/p/${p.id}${tab ? '/' + tab : ''}`, { replace: true }))
  }, [list, busy])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'n' && !(e.target as HTMLElement).closest('input,textarea,select,dialog')) { e.preventDefault(); setCreating(true) } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const openSample = async (id: string) => { setBusy(id); const p = await createSampleProject(id); go(`/app/p/${p.id}`) }

  if (list === null || busy) return <div className="boot" role="status"><span className="spinner" /> {busy ? 'Opening the synthetic contract set' : 'Opening your matters'}</div>

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Matters</h1>
          <p className="muted">One matter per contract under negotiation. Each keeps its versions, playbook, issue list and the status of every issue across rounds. {sync.user ? 'Synced to your account (text stays local unless you opt in).' : 'Stored in this browser.'}</p>
        </div>
        {list.length > 0 && <button type="button" className="btn primary" onClick={() => setCreating(true)}>New matter <kbd>N</kbd></button>}
      </div>

      {list.length === 0 ? (
        <div className="onboard">
          <article className="onboard-card feature">
            <div className="eyebrow">Two minutes</div>
            <h2>Try the sample</h2>
            <p>Two synthetic contract sets, written from scratch, with the problems you meet in real negotiations. Every view is live.</p>
            <div className="stack-sm">
              {SAMPLES.map(s => (
                <button key={s.id} type="button" className="sample-btn" onClick={() => void openSample(s.id)}>
                  <span><strong>{s.name}</strong><small>{s.blurb}</small></span><span aria-hidden="true">&rarr;</span>
                </button>
              ))}
            </div>
          </article>
          <article className="onboard-card">
            <div className="eyebrow">Your contract</div>
            <h2>Import your versions</h2>
            <p>Drop in two or more versions as DOCX, PDF or pasted text. No Word track-changes needed. Pick the playbook for the contract type, and every deviation comes back with fallback language.</p>
            <div className="row gap wrap">
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>Import your data</button>
              <Link href="/docs" className="btn ghost">Formats and limits</Link>
            </div>
            <p className="muted small">Documents are parsed in your browser and never leave it. <Link href="/privacy">How we handle your data</Link>.</p>
          </article>
        </div>
      ) : (
        <>
          <div className="project-grid">{list.map(p => <ProjectCard key={p.id} p={p} />)}</div>
          <div className="samples-row">
            <span className="muted small">Samples:</span>
            {SAMPLES.map(s => <button key={s.id} type="button" className="linkish small" onClick={() => void openSample(s.id)}>{s.name}</button>)}
          </div>
        </>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New matter">
        <form className="stack" onSubmit={async e => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          const p = await createBlankProject(String(f.get('name')).trim() || 'Untitled matter', String(f.get('pb')))
          if (f.get('cp')) await saveProject({ ...p, counterparty: String(f.get('cp')) })
          setCreating(false)
          go(`/app/p/${p.id}/versions?import=1`)
        }}>
          <label className="field"><span>Matter name</span><input name="name" required autoFocus placeholder="Acme MSA renewal" /></label>
          <label className="field"><span>Counterparty (optional)</span><input name="cp" placeholder="Acme, Inc." /></label>
          <label className="field"><span>Playbook</span>
            <select name="pb" defaultValue={getDefaults().playbookId}>{STARTER_PLAYBOOKS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <p className="muted small">You can edit the rules for this matter later. Next you will import the first version.</p>
          <div className="row end gap"><button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary">Create and import</button></div>
        </form>
      </Modal>
    </section>
  )
}

function ProjectCard({ p }: { p: Project }) {
  const [renaming, setRenaming] = useState(false)
  const last = p.versions.at(-1)
  const high = last?.issues.filter(i => i.severity === 'high' && !p.conceded.includes(i.key)).length ?? 0
  return (
    <article className="project-card">
      <div className="row between">
        {renaming ? (
          <form onSubmit={e => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('n')).trim(); if (v) void saveProject({ ...p, name: v }); setRenaming(false) }}>
            <input name="n" defaultValue={p.name} autoFocus aria-label="Matter name" onBlur={e => e.currentTarget.form?.requestSubmit()} />
          </form>
        ) : <h3><Link href={`/app/p/${p.id}`}>{p.name}</Link></h3>}
        {p.sampleId && <SyntheticBadge />}
      </div>
      <p className="muted small">{p.counterparty ?? 'No counterparty set'} · {p.playbook.name}</p>
      <dl className="mini-stats">
        <div><dt>Versions</dt><dd>{p.versions.length}</dd></div>
        <div><dt>Latest</dt><dd>{last?.label ?? 'None yet'}</dd></div>
        <div><dt>Open issues</dt><dd>{last ? last.issues.filter(i => !p.conceded.includes(i.key)).length : '—'}</dd></div>
        <div><dt>High</dt><dd className={high ? 'sev-high-text' : ''}>{last ? high : '—'}</dd></div>
      </dl>
      {p.dataMissing && <p className="warn-text small">Contract text lives on another device. Issue lists are here; re-import to see the redline.</p>}
      <div className="row between">
        <span className="muted small">Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
        <div className="row gap-sm">
          <button type="button" className="btn ghost sm" onClick={() => setRenaming(true)}>Rename</button>
          <button type="button" className="btn danger-ghost sm" onClick={async () => {
            if (!(await ask(`Delete “${p.name}”?`, 'Removes the matter, its versions and its issue history from this device (and the cloud, if you are signed in). You can undo for a few seconds.', 'Delete matter'))) return
            const undo = await deleteProject(p.id)
            toast(`Deleted ${p.name}`, { undo: () => void undo() })
          }}>Delete</button>
        </div>
      </div>
    </article>
  )
}
