import { useEffect, useMemo, useState } from 'react'
import { compare, roundIssues, trackRounds, versionIssues, type Comparison } from './engine/analyze.ts'
import { clonePlaybook, playbookById, STARTER_PLAYBOOKS, type Playbook } from './engine/playbook.ts'
import { SAMPLES } from './engine/samples.ts'
import { segment } from './engine/segment.ts'
import { getData, getDefaults, getProjects, putData, saveProject, useProjects, uuid, type Dataset, type Format, type Project, type VersionMeta } from './store.ts'

export const sampleTexts = (id: string): Dataset | null => {
  const s = SAMPLES.find(x => x.id === id)
  return s ? Object.fromEntries(s.versions.map((v, i) => [`${id}-v${i + 1}`, v.text])) : null
}

export function buildVersion(id: string, label: string, fileName: string, format: Format, text: string, playbook: Playbook, prevText?: string): VersionMeta {
  const doc = segment(text)
  const issues = prevText !== undefined ? compare(prevText, text, playbook).issues.filter(i => i.source !== 'change') : versionIssues(doc, playbook)
  return { id, label, at: Date.now(), fileName, format, chars: text.length, clauses: doc.clauses.length, warnings: doc.warnings, issues }
}

export async function createSampleProject(sampleId: string): Promise<Project> {
  const existing = getProjects().find(p => p.sampleId === sampleId)
  if (existing) return existing
  const s = SAMPLES.find(x => x.id === sampleId)!
  const playbook = clonePlaybook(playbookById(s.playbookId)!)
  const now = Date.now()
  const versions = s.versions.map((v, i) => ({ ...buildVersion(`${sampleId}-v${i + 1}`, v.label, v.fileName, 'text', v.text, playbook, s.versions[i - 1]?.text), at: now - (s.versions.length - i) * 86400000 * 3 }))
  return saveProject({ id: uuid(), name: s.name, counterparty: sampleId === 'nda' ? 'Bluefin Robotics (synthetic)' : 'Stratus Ledger (synthetic)', createdAt: now, updatedAt: now, playbook, versions, conceded: s.conceded ?? [], notes: s.conceded ? { 'msa-cap': 'Accepted 6 months in exchange for restoring the data breach carve-out (round 3).' } : {}, sampleId })
}

export async function createBlankProject(name: string, playbookId?: string): Promise<Project> {
  const now = Date.now()
  const pb = playbookById(playbookId ?? getDefaults().playbookId) ?? STARTER_PLAYBOOKS[0]
  return saveProject({ id: uuid(), name, createdAt: now, updatedAt: now, playbook: clonePlaybook(pb), versions: [], conceded: [], notes: {}, syncText: getDefaults().syncText })
}

export async function addVersion(p: Project, v: { label: string; fileName: string; format: Format; text: string }, texts: Dataset): Promise<Project> {
  const id = uuid()
  const prev = p.versions.at(-1)
  const meta = buildVersion(id, v.label, v.fileName, v.format, v.text, p.playbook, prev ? texts[prev.id] : undefined)
  await putData(p.id, { ...texts, [id]: v.text })
  return saveProject({ ...p, versions: [...p.versions, meta], dataMissing: false })
}

/** Re-runs the playbook on every version after a rule edit, so synced issue lists stay current. */
export function recomputeIssues(p: Project, texts: Dataset): VersionMeta[] {
  return p.versions.map((v, i) => {
    const t = texts[v.id]
    if (t === undefined) return v
    const prevT = i > 0 ? texts[p.versions[i - 1].id] : undefined
    return { ...buildVersion(v.id, v.label, v.fileName, v.format, t, p.playbook, prevT), at: v.at }
  })
}

export function useProject(id: string) {
  const list = useProjects()
  const project = list?.find(p => p.id === id) ?? null
  const [texts, setTexts] = useState<Dataset | null>(null)
  const key = project ? project.versions.map(v => v.id).join(',') : ''
  useEffect(() => {
    if (!project) return
    let live = true
    if (project.sampleId) { setTexts(sampleTexts(project.sampleId) ?? {}); return }
    void getData(project.id).then(d => { if (live) setTexts(d ?? {}) })
    return () => { live = false }
  }, [project?.id, project?.sampleId, key])
  const update = (patch: Partial<Project>) => project && saveProject({ ...project, ...patch })
  return { loading: list === null || (project !== null && texts === null), project, texts, update }
}

export function useComparison(p: Project | null, texts: Dataset | null, aId: string | null, bId: string | null): Comparison | null {
  return useMemo(() => {
    if (!p || !texts || !aId || !bId) return null
    const ta = texts[aId], tb = texts[bId]
    if (ta === undefined || tb === undefined) return null
    return compare(ta, tb, p.playbook)
  }, [p?.playbook, texts, aId, bId])
}

export function useTracker(p: Project | null, texts: Dataset | null) {
  return useMemo(() => {
    if (!p) return []
    const all = p.versions.every(v => texts?.[v.id] !== undefined)
    // Without the text (synced from another device), fall back to the stored issue lists.
    const rounds = all && texts ? roundIssues(p.versions.map(v => texts[v.id]), p.playbook) : p.versions.map(v => v.issues)
    return trackRounds(rounds, p.conceded)
  }, [p?.versions, p?.playbook, p?.conceded, texts])
}
