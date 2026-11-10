// Builds a Word redline: insertions double-underlined in blue, deletions struck through in red.
import { AlignmentType, Document, HeadingLevel, Paragraph, TextRun } from 'docx'
import type { Comparison } from './analyze.ts'
import { clauseLabel } from './segment.ts'

const INS = '1F4FD8', DEL = 'C0392B', MUTED = '6B6760'

export function redlineDocument(cmp: Comparison, meta: { title: string; from: string; to: string }): Document {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(meta.title)] }),
    new Paragraph({ children: [new TextRun({ text: `Redline of ${meta.to} against ${meta.from}. `, color: MUTED }), new TextRun({ text: 'Inserted', color: INS, underline: { type: 'double', color: INS } }), new TextRun({ text: ' · ', color: MUTED }), new TextRun({ text: 'Deleted', color: DEL, strike: true })] }),
    new Paragraph({ children: [new TextRun({ text: 'Generated in the browser by Redline Desk. Not legal advice.', color: MUTED, size: 18 })] }),
  ]
  for (const r of cmp.rows) {
    const { pair } = r
    const a = r.a !== null ? cmp.a.clauses[r.a] : null
    const b = r.b !== null ? cmp.b.clauses[r.b] : null
    if (r.ghost) {
      children.push(new Paragraph({ children: [new TextRun({ text: `[${clauseLabel(a!)} moved to ${clauseLabel(cmp.b.clauses[pair.b!])}]`, italics: true, color: MUTED })] }))
      continue
    }
    const label = b ? clauseLabel(b) : clauseLabel(a!)
    const note = pair.a === null ? ' (inserted)' : pair.b === null ? ' (deleted)' : [pair.moved && 'moved', pair.renumbered && a?.num && `was ${a.num}`, pair.titleWas !== undefined && `title was “${pair.titleWas}”`].filter(Boolean).join(', ').replace(/^(.+)$/, ' ($1)')
    children.push(new Paragraph({ heading: (b ?? a)!.level <= 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: [new TextRun(label), new TextRun({ text: note, color: MUTED, italics: true })] }))
    let runs: TextRun[]
    if (pair.a === null) runs = [new TextRun({ text: b!.body, color: INS, underline: { type: 'double', color: INS } })]
    else if (pair.b === null) runs = [new TextRun({ text: a!.body, color: DEL, strike: true })]
    else if (pair.ops) runs = pair.ops.map(o => o.t === 'eq' ? new TextRun(o.s) : o.t === 'ins' ? new TextRun({ text: o.s, color: INS, underline: { type: 'double', color: INS } }) : new TextRun({ text: o.s, color: DEL, strike: true }))
    else runs = [new TextRun(b!.body)]
    children.push(new Paragraph({ alignment: AlignmentType.LEFT, children: runs }))
  }
  return new Document({ creator: 'Redline Desk', title: meta.title, styles: { default: { document: { run: { font: 'Georgia', size: 22 } } } }, sections: [{ children }] })
}
