import { useState } from 'react'
import { segment, clauseLabel } from './engine/segment.ts'
import { definitions } from './engine/terms.ts'
import { looksLikeMarkdown, markdownToText, readFile } from './importers.ts'
import type { Format } from './store.ts'
import { toast } from './ui.tsx'

export interface Parsed { label: string; fileName: string; format: Format; text: string }

/** Guided import: pick a file or paste text, see what was detected, then confirm. */
export function ImportVersion({ nextLabel, onDone, onCancel }: { nextLabel: string; onDone(v: Parsed): void; onCancel(): void }) {
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [drag, setDrag] = useState(false)

  const take = async (file: File) => {
    setBusy(true); setErr(null)
    try {
      const { format, text } = await readFile(file)
      if (!text.trim()) throw new Error('No text found in this file.')
      setParsed({ label: nextLabel, fileName: file.name, format, text })
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  if (parsed) return <Review parsed={parsed} onChange={setParsed} onBack={() => setParsed(null)} onDone={onDone} />

  return (
    <div className="stack">
      <label className={`drop${drag ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void take(f) }}>
        <input type="file" accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={e => { const f = e.target.files?.[0]; if (f) void take(f) }} />
        <strong>{busy ? 'Reading the document in your browser…' : 'Drop a DOCX, PDF, Markdown or text file'}</strong>
        <span className="muted small">or click to choose. Up to 15 MB. Nothing is uploaded.</span>
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="or"><span>or paste the text</span></div>
      <label className="field"><span className="sr-only">Contract text</span><textarea rows={8} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'1. Definitions\n1.1 "Services" means…'} /></label>
      <div className="row end gap">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={!paste.trim()} onClick={() => setParsed({ label: nextLabel, fileName: 'Pasted text', format: 'text', text: looksLikeMarkdown(paste) ? markdownToText(paste) : paste })}>Check pasted text</button>
      </div>
    </div>
  )
}

function Review({ parsed, onChange, onBack, onDone }: { parsed: Parsed; onChange(p: Parsed): void; onBack(): void; onDone(v: Parsed): void }) {
  const doc = segment(parsed.text)
  const numbered = doc.clauses.filter(c => c.num).length
  const defs = definitions(doc.clauses).length
  const ok = doc.clauses.length >= 2
  return (
    <div className="stack">
      <div className="report-grid">
        <div><span className="muted small">Format</span><strong>{parsed.format.toUpperCase()}</strong></div>
        <div><span className="muted small">Characters</span><strong>{parsed.text.length.toLocaleString()}</strong></div>
        <div><span className="muted small">Clauses</span><strong>{doc.clauses.length}</strong></div>
        <div><span className="muted small">Numbered</span><strong>{numbered}</strong></div>
        <div><span className="muted small">Defined terms</span><strong>{defs}</strong></div>
      </div>
      {doc.warnings.length > 0 ? (
        <div className="callout warn">
          <strong>Check these before you compare</strong>
          <ul>{doc.warnings.slice(0, 12).map((w, i) => <li key={i}><span className="mono">line {w.line}</span> {w.message}</li>)}</ul>
        </div>
      ) : <div className="callout ok">Numbering is consistent: no duplicates or jumps.</div>}
      {!ok && <p className="error">Only one clause was found. Add line breaks between clauses, or paste text that keeps its numbering.</p>}
      <details open>
        <summary>Detected structure (first 12 clauses)</summary>
        <ol className="outline">{doc.clauses.slice(0, 12).map(c => <li key={c.id} style={{ paddingLeft: Math.max(0, c.level - 1) * 14 }}><b>{clauseLabel(c)}</b> <span className="muted">{c.body.slice(0, 90)}{c.body.length > 90 ? '…' : ''}</span></li>)}</ol>
      </details>
      <label className="field"><span>Version label</span><input value={parsed.label} onChange={e => onChange({ ...parsed, label: e.target.value })} /></label>
      <div className="row end gap">
        <button type="button" className="btn ghost" onClick={onBack}>Back</button>
        <button type="button" className="btn primary" disabled={!ok || !parsed.label.trim()} onClick={() => { onDone(parsed); toast(`Added ${parsed.label}`, { tone: 'ok' }) }}>Add version</button>
      </div>
    </div>
  )
}
