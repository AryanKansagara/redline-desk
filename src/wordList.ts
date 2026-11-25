// Reads list identity from a DOCX package, which mammoth's HTML does not keep, and marks numbered paragraphs with it.
import JSZip from 'jszip'
import { wordCounter, type Label, type Level, type WordList } from './engine/wordNumbers.ts'

const OPEN = '', CLOSE = ''
const MARK = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g')

const attr = (el: Element | undefined, name: string) => el ? Array.from(el.attributes).find(a => a.localName === name)?.value : undefined
const kids = (el: Element | undefined, name: string) => el ? Array.from(el.children).filter(c => c.localName === name) : []
const kid = (el: Element | undefined, name: string): Element | undefined => kids(el, name)[0]
const all = (el: Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name))
const val = (el: Element | undefined, name: string) => attr(kid(el, name), 'val')

async function part(zip: JSZip, path: string): Promise<Document | null> {
  const f = zip.file(path)
  if (!f) return null
  const d = new DOMParser().parseFromString(await f.async('string'), 'application/xml')
  return d.getElementsByTagName('parsererror').length ? null : d
}

/** Path of the part a relationship of this kind points to, else `fallback`. */
async function related(zip: JSZip, dir: string, rels: string, kind: string, fallback: string): Promise<string> {
  const d = await part(zip, rels)
  const target = d && all(d, 'Relationship').find(r => attr(r, 'Type')?.endsWith('/' + kind))?.getAttribute('Target')
  if (!target) return fallback
  const path = target.startsWith('/') ? target.slice(1) : dir + target
  return zip.file(path) ? path : fallback
}

function readLists(numbering: Document, styles: Document | null): { lists: Record<string, WordList>; byStyle: Record<string, { numId: string; depth: number }> } {
  const level = (l: Element): Level => {
    const restart = val(l, 'lvlRestart'), legal = kid(l, 'isLgl')
    return { format: val(l, 'numFmt') ?? 'decimal', text: val(l, 'lvlText') ?? '', start: Number(val(l, 'start') ?? 1), ...(restart !== undefined ? { restart: Number(restart) } : {}), legal: !!legal && !['0', 'false', 'off'].includes(attr(legal, 'val') ?? '1') }
  }
  const abstracts = new Map(all(numbering, 'abstractNum').map(a => [attr(a, 'abstractNumId')!, a]))
  const nums = new Map(all(numbering, 'num').map(n => [attr(n, 'numId')!, n]))
  // A list that only links to a list style takes its levels from the list that style names.
  const abstractOf = (numId: string | undefined, seen = new Set<string>()): string | undefined => {
    const id = numId === undefined || seen.has(numId) ? undefined : val(nums.get(numId), 'abstractNumId')
    const link = id === undefined ? undefined : val(abstracts.get(id), 'numStyleLink')
    if (link === undefined || !styles) return id
    const style = all(styles, 'style').find(s => attr(s, 'styleId') === link)
    return abstractOf(val(kid(kid(style, 'pPr'), 'numPr'), 'numId'), seen.add(numId!)) ?? id
  }
  const lists: Record<string, WordList> = {}
  const byStyle: Record<string, { numId: string; depth: number }> = {}
  for (const [numId, n] of nums) {
    const abstractId = abstractOf(numId)
    const a = abstractId === undefined ? undefined : abstracts.get(abstractId)
    if (!a) continue
    const levels: Record<number, Level> = {}, overrides: Record<number, number> = {}
    for (const l of kids(a, 'lvl')) {
      const depth = Number(attr(l, 'ilvl') ?? 0), style = val(l, 'pStyle')
      levels[depth] = level(l)
      if (style !== undefined) byStyle[style] ??= { numId, depth }
    }
    for (const o of kids(n, 'lvlOverride')) {
      const depth = Number(attr(o, 'ilvl') ?? 0), own = kid(o, 'lvl'), start = val(o, 'startOverride')
      if (own) levels[depth] = level(own)
      if (start !== undefined) overrides[depth] = Number(start)
    }
    lists[numId] = { abstractId: abstractId!, levels, overrides }
  }
  return { lists, byStyle }
}

/** The same DOCX with a mark in front of every auto-numbered paragraph, and the label each mark stands for. */
export async function markNumbers(buf: ArrayBuffer): Promise<{ buf: ArrayBuffer; labels: Label[] }> {
  const zip = await JSZip.loadAsync(buf)
  const main = await related(zip, '', '_rels/.rels', 'officeDocument', 'word/document.xml')
  const dir = main.slice(0, main.lastIndexOf('/') + 1), rels = `${dir}_rels/${main.slice(dir.length)}.rels`
  const doc = await part(zip, main), numbering = await part(zip, await related(zip, dir, rels, 'numbering', dir + 'numbering.xml'))
  if (!doc || !numbering) return { buf, labels: [] }
  const styles = await part(zip, await related(zip, dir, rels, 'styles', dir + 'styles.xml'))
  const { lists, byStyle } = readLists(numbering, styles)
  const styleOf = new Map(styles ? all(styles, 'style').map(s => [attr(s, 'styleId') ?? '', s]) : [])
  const standard = styles ? all(styles, 'style').find(s => attr(s, 'type') === 'paragraph' && ['1', 'true', 'on'].includes(attr(s, 'default') ?? '')) : undefined
  /** A paragraph style's list, taken from the nearest style that names one. */
  const fromStyle = (id: string | undefined): { numId: string; depth: number } | undefined => {
    const seen = new Set<string>()
    for (let s = id; s !== undefined && !seen.has(s); s = val(styleOf.get(s), 'basedOn')) {
      seen.add(s)
      const pr = kid(kid(styleOf.get(s), 'pPr'), 'numPr'), numId = val(pr, 'numId')
      if (numId !== undefined) return { numId, depth: byStyle[s] && lists[byStyle[s].numId]?.abstractId === lists[numId]?.abstractId ? byStyle[s].depth : Number(val(pr, 'ilvl') ?? 0) }
      if (byStyle[s] && s === id && !pr) return byStyle[s]
    }
    return undefined
  }
  const next = wordCounter(lists)
  const labels: Label[] = []
  for (const p of all(doc, 'p')) {
    // Drawings repeat text boxes for older readers; a paragraph whose mark is a tracked deletion is not in the current text.
    let up: Element | null = p.parentElement
    while (up && up.localName !== 'txbxContent') up = up.parentElement
    const pPr = kid(p, 'pPr'), rPr = kid(pPr, 'rPr')
    if (up || p.namespaceURI !== doc.documentElement.namespaceURI || kid(rPr, 'del') || kid(rPr, 'moveFrom')) continue
    const numPr = kid(pPr, 'numPr'), style = fromStyle(val(pPr, 'pStyle') ?? attr(standard, 'styleId'))
    const numId = val(numPr, 'numId') ?? style?.numId
    if (numId === undefined || numId === '0') continue
    const label = next(numId, Number(val(numPr, 'ilvl') ?? (style && (val(numPr, 'numId') === undefined || lists[style.numId]?.abstractId === lists[numId]?.abstractId) ? style.depth : 0)))
    if (!label) continue
    const run = doc.createElementNS(p.namespaceURI, 'w:r'), text = doc.createElementNS(p.namespaceURI, 'w:t')
    text.textContent = OPEN + labels.length + CLOSE
    run.appendChild(text)
    p.insertBefore(run, pPr?.nextSibling ?? (pPr ? null : p.firstChild))
    labels.push(label)
  }
  if (!labels.length) return { buf, labels }
  zip.file(main, new XMLSerializer().serializeToString(doc))
  return { buf: await zip.generateAsync({ type: 'arraybuffer' }), labels }
}

/** Splits the mark from a paragraph's text. */
export function takeMark(text: string, labels: Label[]): { text: string; label: Label | null } {
  const m = text.match(new RegExp(`^\\s*${MARK.source}`))
  return { text: text.replace(MARK, '').trim(), label: m ? labels[Number(m[1])] ?? null : null }
}
