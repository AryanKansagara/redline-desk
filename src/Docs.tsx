import { STARTER_PLAYBOOKS } from './engine/playbook.ts'
import { Link } from './ui.tsx'

export default function Docs() {
  return (
    <section className="page narrow prose">
      <div className="eyebrow">Docs · updated November 2026</div>
      <h1>Formats, limits and how the checks work</h1>
      <p className="lede">Redline Desk compares any two versions of a contract and checks the newer one against a playbook. It does not need Word track-changes, and documents never leave your browser.</p>

      <h2 id="formats">Supported formats</h2>
      <table>
        <thead><tr><th>Format</th><th>How to get it</th><th>What is kept</th></tr></thead>
        <tbody>
          <tr><td><b>DOCX</b></td><td>Word: File › Save As › Word Document (.docx). Google Docs: File › Download › Microsoft Word. Old .doc files: open and re-save as .docx.</td><td>Paragraph text, headings and list numbering. Word auto-numbering is rebuilt from list nesting (1., 1.1, (a)). Tracked changes are read as the current text; accept or reject them first if you want a clean base.</td></tr>
          <tr><td><b>PDF</b></td><td>The PDF the other side sent. It must have a text layer: if you cannot select text in a viewer, run OCR first (Preview, Acrobat or <code>ocrmypdf</code>).</td><td>Text reconstructed line by line from glyph positions; larger or bold lines become headings; page numbers are dropped. Columns and footnotes may interleave.</td></tr>
          <tr><td><b>Text</b></td><td>Paste from anywhere, or a .txt/.md file.</td><td>Exactly what you paste. Keep one clause per line or paragraph.</td></tr>
        </tbody>
      </table>
      <h3>Limits</h3>
      <ul>
        <li>15 MB per file, 200 PDF pages. Typical NDAs and MSAs are well under 1 MB.</li>
        <li>Optional cloud sync of document text is capped at 1.5 MB per matter and off by default.</li>
        <li>Scanned PDFs without a text layer are rejected with a message, never silently compared as empty.</li>
      </ul>

      <h2 id="structure">How clauses are found</h2>
      <p>Each version is split into clauses at numbered headings (<code>1.</code>, <code>1.1</code>, <code>7.2.3</code>), lettered and roman subclauses on their own line (<code>(a)</code>, <code>(iv)</code>), <code>Article IV</code> / <code>Section 5</code> headings, and ALL-CAPS headings. A short title-cased lead-in such as “Limitation of Liability.” becomes the clause title. If a document has no headings at all, it is compared paragraph by paragraph. The import report lists duplicate numbers and numbering jumps with line numbers.</p>

      <h2 id="compare">How versions are compared</h2>
      <ol>
        <li><b>Alignment.</b> Identical clauses are paired first, then the rest by word-overlap similarity (a matching title raises the score), so renumbered clauses still line up. A clause is <em>moved</em> when its pair falls outside the longest run that keeps the original order.</li>
        <li><b>Word diff.</b> Inside each pair, a Myers shortest-edit diff runs on words, and replaced phrases are grouped so the redline reads naturally.</li>
        <li><b>Values.</b> Amounts, percentages, periods (“thirty (30) days”), dates and multiples (“two times the fees”) are extracted and shown as before → after.</li>
        <li><b>Defined terms.</b> Definitions written as <code>"X" means</code>, <code>(the "X")</code> or <code>each a "X"</code> are collected. You get unused terms, terms used like defined terms but never defined, inconsistent capitalisation, and definitions whose wording changed.</li>
        <li><b>Cross-references.</b> Every “Section 7.2”, “Sections 3 and 4(a)” or “Article IV” is checked against the version’s numbering. A reference is <em>stale</em> when the clause it pointed to was renumbered or deleted and the number now lands somewhere else.</li>
      </ol>

      <h2 id="playbooks">Playbooks</h2>
      <p>Each matter has its own copy of a playbook that you can edit. Every rule has a severity and fallback language that goes into the issues list and memo. Rule types:</p>
      <ul>
        <li><b>Required clause</b>: a title or phrase that must appear.</li>
        <li><b>Forbidden phrase</b>: wording that must not appear (residuals, unilateral changes).</li>
        <li><b>Liability cap</b>: reads “fees paid in the N months”, “X times the fees” or a fixed amount, then compares it with your minimum.</li>
        <li><b>Term or survival length</b>: the period in matching sentences against a maximum or minimum. “In perpetuity” counts as unlimited.</li>
        <li><b>Governing law</b>: the jurisdiction in “governed by the laws of…” against an allowed list.</li>
        <li><b>Payment terms</b>: “within N days” or “net N” against a maximum.</li>
        <li><b>IP assignment scope</b>: flags assignment of pre-existing or unrelated work, and assignment that happens before payment.</li>
        <li><b>Non-compete / non-solicit</b>: flags either restriction.</li>
        <li><b>Auto-renewal</b>: flags automatic renewal with no opt-out window, or a notice window longer than your maximum.</li>
        <li><b>Mutual obligations</b>: flags an NDA that protects only one party.</li>
      </ul>
      <h3>Starter playbooks</h3>
      {STARTER_PLAYBOOKS.map(pb => (
        <details key={pb.id}>
          <summary>{pb.name} ({pb.rules.length} rules)</summary>
          <ul>{pb.rules.map(r => <li key={r.id}><b>{r.name}</b> <span className={`sev sev-${r.severity}`}>{r.severity}</span></li>)}</ul>
        </details>
      ))}
      <p className="muted small">Starter positions reflect common market practice as of November 2026 for a customer buying SaaS, a party to a mutual NDA, and an independent contractor. They are starting points, not advice for your deal.</p>

      <h2 id="rounds">Negotiation rounds</h2>
      <p>Every version is a round. The Rounds tab follows each issue across rounds: <b>open</b> if it is still in the latest version, <b>new</b> if it first appeared there, <b>resolved</b> if it disappeared, and <b>conceded</b> if you accepted it. Add a note to record what you got in exchange.</p>

      <h2 id="exports">Exports</h2>
      <ul>
        <li>Issues list as CSV (severity, clause, issue, detail, fallback, status).</li>
        <li>A printable issues memo, which you can print or save as PDF.</li>
        <li>A DOCX redline with insertions double-underlined in blue and deletions struck through in red, plus a printable HTML redline.</li>
      </ul>

      <h2>Known limits</h2>
      <ul>
        <li>Checks are pattern-based. They catch the usual drafting moves but not every phrasing, and they do not understand intent.</li>
        <li>Tables and images in DOCX are flattened to text; footnotes and headers are ignored.</li>
        <li>Not legal advice. Read the contract.</li>
      </ul>
      <p><Link href="/app?sample=nda" className="btn primary">Try the NDA sample</Link> <Link href="/privacy" className="btn ghost">Privacy</Link></p>
    </section>
  )
}
