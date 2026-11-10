import { useState } from 'react'
import { STARTER_PLAYBOOKS } from './engine/playbook.ts'
import { deleteProject, getDefaults, getProjects, setDefaults, type Defaults } from './store.ts'
import { exportAll, RAW_SYNC_LIMIT, useSync } from './sync.ts'
import { ask, download, Link, setTheme, toast, useDark } from './ui.tsx'

export default function Settings() {
  const [d, setD] = useState<Defaults>(getDefaults)
  const dark = useDark()
  const sync = useSync()
  const save = (p: Partial<Defaults>) => { const next = { ...d, ...p }; setD(next); setDefaults(next); toast('Saved', { tone: 'ok', ttl: 1500 }) }

  return (
    <section className="page narrow settings">
      <div className="eyebrow">Settings</div>
      <h1>Settings</h1>

      <div className="panel">
        <h2>Defaults for new matters</h2>
        <div className="inline-fields">
          <label className="field"><span>Default playbook</span><select value={d.playbookId} onChange={e => save({ playbookId: e.target.value })}>{STARTER_PLAYBOOKS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="field"><span>Reviewer name (on memos)</span><input value={d.reviewer} onChange={e => setD({ ...d, reviewer: e.target.value })} onBlur={() => save({})} /></label>
          <label className="field"><span>Firm or company</span><input value={d.firm} onChange={e => setD({ ...d, firm: e.target.value })} onBlur={() => save({})} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={d.syncText} onChange={e => save({ syncText: e.target.checked })} /> Sync document text for new matters by default (under {(RAW_SYNC_LIMIT / 1e6).toFixed(1)} MB)</label>
      </div>

      <div className="panel">
        <h2>Appearance</h2>
        <div className="seg-control" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" aria-checked={dark} className={dark ? 'on' : ''} onClick={() => setTheme('dark')}>Ink (dark)</button>
          <button type="button" role="radio" aria-checked={!dark} className={!dark ? 'on' : ''} onClick={() => setTheme('light')}>Ivory (light)</button>
        </div>
      </div>

      <div className="panel">
        <h2>Your data</h2>
        <p>Matters live in this browser (IndexedDB). {sync.user ? <>Signed in as <b>{sync.user.email}</b>: playbooks, issue lists and negotiation status sync; contract text syncs only for matters where you turned it on.</> : 'Sign in from the account menu to sync across devices. It is optional.'} <Link href="/privacy">Privacy details</Link>.</p>
        <div className="row gap wrap">
          <button type="button" className="btn ghost" onClick={async () => download(`redline-desk-export-${new Date().toISOString().slice(0, 10)}.json`, await exportAll())}>Export all my data (JSON)</button>
          <button type="button" className="btn danger-ghost" onClick={async () => {
            const list = getProjects()
            if (!list.length) { toast('Nothing to delete'); return }
            if (!(await ask('Delete all local matters?', `Removes ${list.length} matter${list.length > 1 ? 's' : ''} from this browser${sync.user ? ' and from your cloud account' : ''}. You can undo for a few seconds.`, 'Delete everything'))) return
            const undos = await Promise.all(list.map(p => deleteProject(p.id)))
            toast(`Deleted ${list.length} matters`, { undo: () => { for (const u of undos) void u() } })
          }}>Delete all matters</button>
        </div>
      </div>

      <div className="panel">
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcuts">
          <div><dt><kbd>N</kbd></dt><dd>New matter (on Matters)</dd></div>
          <div><dt><kbd>1</kbd>&ndash;<kbd>6</kbd></dt><dd>Switch matter tabs</dd></div>
          <div><dt><kbd>I</kbd></dt><dd>Import a version</dd></div>
          <div><dt><kbd>M</kbd></dt><dd>Open the issues memo</dd></div>
          <div><dt><kbd>&#8984;</kbd>/<kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>Undo the last delete</dd></div>
        </dl>
      </div>
    </section>
  )
}
