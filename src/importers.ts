// File import, all in the browser: DOCX via mammoth, PDF via pdf.js (both lazy-loaded), plain text as is.
import type { Format } from './store.ts'

export const MAX_FILE_BYTES = 15 * 1024 * 1024

export async function detectFormat(file: File): Promise<Format | null> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  const sig = String.fromCharCode(...head)
  if (sig.startsWith('%PDF')) return 'pdf'
  if (sig.startsWith('PK')) return /\.docx$/i.test(file.name) || file.type.includes('wordprocessingml') ? 'docx' : null
  if (/\.(txt|md|text|rtf)$/i.test(file.name) || file.type.startsWith('text/') || !file.type) return 'text'
  return null
}

export async function readFile(file: File): Promise<{ format: Format; text: string }> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB; the limit is 15 MB.`)
  const format = await detectFormat(file)
  if (!format) throw new Error(`${file.name} is not a DOCX, PDF or text file. Old .doc files: save as .docx first.`)
  if (format === 'text') { const t = await file.text(); return { format, text: /\.md$/i.test(file.name) || looksLikeMarkdown(t) ? markdownToText(t) : t } }
  const buf = await file.arrayBuffer()
  return { format, text: format === 'docx' ? await docxToText(buf) : await pdfToText(buf) }
}

/** True when pasted or loaded text is raw Markdown (headings, bold titles, inline HTML, nested list indents). */
export const looksLikeMarkdown = (t: string) => (t.match(/^#{1,6}\s|\*\*[^*\n]+\*\*|<span\b|^ {2,}(\d+|[a-z])\.\s/gm)?.length ?? 0) >= 3

/**
 * Markdown -> plain contract text. Strips emphasis, links and inline HTML, and rebuilds numbering for
 * indented ordered lists the way open-source contract repos write them: "11." then an indented "1." means 11.1,
 * an indented "a." means (a), and a further level means (i).
 */
export function markdownToText(md: string): string {
  const stack: { indent: number; n: string }[] = []
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
  const inline = (s: string) => s
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '').replace(/(^|[\s(“"])[*_]([^*_\n]+)[*_](?=[\s.,;:)”"]|$)/g, '$1$2')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/^#{1,6}\s+/, '').replace(/\s+$/, '')
  const out: string[] = []
  for (const raw of md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    const m = raw.match(/^( *)(\d{1,3}|[a-z]|[ivx]{1,5})\.\s+(.*)$/)
    if (!m) {
      if (!raw.trim()) { out.push(''); continue }
      if (!/^ {2,}/.test(raw)) stack.length = 0
      out.push(inline(raw.trim().replace(/^[-*+]\s+/, '').replace(/^>\s?/, '')))
      continue
    }
    const indent = m[1].length
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop()
    const depth = stack.length
    const pos = /^\d+$/.test(m[2]) ? +m[2] : m[2].length === 1 && depth < 3 ? m[2].charCodeAt(0) - 96 : roman.indexOf(m[2]) + 1
    const text = inline(m[3])
    // Text that already carries its own number ("1.1 Access", "(a) ...") keeps it.
    const own = /^(\d+(\.\d+)+|\(?[a-z0-9]{1,4}\))\s/i.test(text)
    const label = depth === 0 ? `${pos}.` : depth === 1 ? `${stack[0].n}.${pos}` : depth === 2 ? `(${String.fromCharCode(96 + Math.min(pos, 26))})` : `(${roman[pos - 1] ?? pos})`
    stack.push({ indent, n: depth === 0 ? String(pos) : label })
    out.push(own ? text : `${label} ${text}`)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** DOCX -> text with numbering rebuilt from list nesting (Word auto-numbering is not in the text itself). */
export async function docxToText(buf: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })
  const root = new DOMParser().parseFromString(html, 'text/html').body
  const lines: string[] = []
  // Paragraph texts of an element; line breaks become spaces so "Cover Page<br>for" does not run together.
  const paras = (el: Element): string[] => {
    el.querySelectorAll('br').forEach(b => b.replaceWith(' '))
    const ps = el.tagName === 'P' ? [el] : Array.from(el.querySelectorAll('p'))
    return (ps.length ? ps : [el]).map(p => (p.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  }
  const numbered = /^\s*(\(?[a-z0-9ivx]{1,3}[.)]|\d+(\.\d+)*\.?|article|section)\s/i
  const walkList = (ol: Element, prefix: string, depth: number, start = 0) => {
    let n = start
    for (const li of Array.from(ol.children)) {
      if (li.tagName !== 'LI') continue
      n++
      const label = depth === 0 ? `${n}.` : depth === 1 ? `${prefix}${n}` : `(${String.fromCharCode(96 + Math.min(n, 26))})`
      const own = Array.from(li.childNodes).filter(c => !(c instanceof Element && (c.tagName === 'OL' || c.tagName === 'UL'))).map(c => c.textContent ?? '').join('').trim()
      if (own) lines.push('', ol.tagName === 'OL' && !numbered.test(own) ? `${label} ${own}` : own)
      for (const sub of Array.from(li.children)) if (sub.tagName === 'OL' || sub.tagName === 'UL') walkList(sub, depth === 0 ? `${n}.` : prefix, depth + 1)
    }
    return n
  }
  // Word keeps counting a list across an interrupting table; a paragraph or heading in between starts a new list.
  let top = 0
  for (const el of Array.from(root.children)) {
    if (el.tagName === 'OL') top = walkList(el, '', 0, top)
    else if (el.tagName === 'UL') walkList(el, '', 0)
    else if (el.tagName === 'TABLE') for (const tr of Array.from(el.querySelectorAll('tr'))) {
      const cells = Array.from(tr.children).map(paras)
      // A one-cell row is page layout (cover pages, boxed clauses): keep its paragraphs as paragraphs.
      if (cells.length === 1) for (const t of cells[0]) lines.push('', t)
      else if (cells.some(c => c.length)) lines.push('', cells.map(c => c.join(' ')).join(' | '))
    }
    else { const t = paras(el).join(' '); if (t) { lines.push('', t); top = 0 } }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** PDF -> text, rebuilding lines from glyph positions and marking larger or bold lines as headings. */
export async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  if (pdf.numPages > 200) throw new Error('PDFs over 200 pages are not supported in the browser.')
  type Line = { y: number; x: number; end: number; text: string; h: number; bold: boolean; page: number }
  const all: Line[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const styles = content.styles as Record<string, { fontFamily?: string }>
    const rows = new Map<number, Line>()
    for (const it of content.items as { str: string; transform: number[]; width: number; height: number; fontName: string }[]) {
      if (!it.str.trim()) continue
      // Rotated text (margin stamps, watermarks) is not part of the contract body.
      if (Math.abs(it.transform[1]) > 0.01 || Math.abs(it.transform[2]) > 0.01) continue
      const y = Math.round(it.transform[5] / 2) * 2
      const bold = /bold|black|semibold/i.test(it.fontName + ' ' + (styles[it.fontName]?.fontFamily ?? ''))
      const row = rows.get(y)
      // Only add a space where the glyphs are visibly apart; pdf.js splits runs at font changes mid-word ("(“NDA”)").
      if (row) { row.text += (row.text.endsWith(' ') || it.str.startsWith(' ') || it.transform[4] - row.end < it.height * 0.12 ? '' : ' ') + it.str; row.end = it.transform[4] + it.width; row.h = Math.max(row.h, it.height); row.bold &&= bold }
      else rows.set(y, { y, x: it.transform[4], end: it.transform[4] + it.width, text: it.str, h: it.height, bold, page: p })
    }
    all.push(...[...rows.values()].sort((a, b) => b.y - a.y))
  }
  const lines = all.filter(l => !/^\s*(page\s+)?\d+(\s+of\s+\d+)?\s*$/i.test(l.text))
  if (!lines.length) throw new Error('This PDF has no text layer (it is probably a scan). Run OCR first, then import it again.')
  const hs = lines.map(l => l.h).sort((a, b) => a - b)
  const body = hs[Math.floor(hs.length / 2)] || 10
  const out: string[] = []
  lines.forEach((l, i) => {
    const prev = lines[i - 1]
    const gap = prev && prev.page === l.page ? prev.y - l.y : body * 2
    const heading = (l.h > body * 1.15 || l.bold) && l.text.length < 90
    const wrappedRef = prev && /\b(?:Sections?|Clauses?|Articles?|§)$/.test(prev.text.trim()) && /^\d/.test(l.text.trim())
    if (wrappedRef) { out[out.length - 1] += ' ' + l.text.trim(); return }
    if (heading || gap > body * 1.9 || /^(\d+(\.\d+)*\.?|\([a-z0-9]+\)|[a-z][.)]|ARTICLE|Section)\s/.test(l.text.trim())) out.push('')
    out.push(l.text.trim())
    if (heading) out.push('')
  })
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
