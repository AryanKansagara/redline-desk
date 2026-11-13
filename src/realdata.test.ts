// Tests against excerpts of real, openly licensed standard agreements:
// Common Paper Cloud Service Agreement v2.0 and v3.0 (github.com/CommonPaper/CSA, CC BY 4.0) and
// Bonterms Mutual NDA v1.0 (github.com/Bonterms/Mutual-NDA, CC BY 4.0). Excerpts keep the original Markdown layout.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compare } from './engine/analyze.ts'
import { checkRule, playbookById, type Rule } from './engine/playbook.ts'
import { segment, splitTitle } from './engine/segment.ts'
import { termReport } from './engine/terms.ts'
import { checkRefs, references } from './engine/xref.ts'
import { looksLikeMarkdown, markdownToText } from './importers.ts'

const CSA_V2 = `# Cloud Service Agreement

8. <span class="header_2" id="8">Limitation of Liability</span>
    1. <span class="header_3" id="8.1">Liability Caps.</span>
        a. **<span id="8.1.a">Except</span> as provided in Section 8.4 (Exceptions), each party’s total cumulative liability for all claims arising out of or relating to this Agreement will not be more than the <span class="keyterms_link">General Cap Amount</span>.**
    2. <span class="header_3" id="8.2">Damages Waiver.</span>  **Except as provided in Section 8.4 (Exceptions), under no circumstances will either party be liable for lost profits or revenues.**
    3. <span class="header_3" id="8.3">Applicability.</span>  **The limitations and waivers contained in Sections 8.1 (Liability Caps) and 8.2 (Damages Waiver) apply to all liability, whether in tort (including negligence), contract, breach of statutory duty, or otherwise.**
    4. <span class="header_3" id="8.4">Exceptions.</span>  Section 8.1 (Liability Caps) does not apply to any <span class="keyterms_link">Unlimited Claims</span>. Section 8.2 (Damages Waiver) does not apply to a breach of Section 12 (Confidentiality).

10. <span class="header_2" id="10">Confidentiality</span>
    1. <span class="header_3" id="10.1">Use and Nondisclosure.</span>  Recipient will not use Discloser’s Confidential Information except to fulfill its obligations under the Agreement.

12. <span class="header_2" id="12">General Terms</span>
    3. <span class="header_3" id="12.3">Governing Law and Chosen Courts.</span>  The <span class="keyterms_link">Governing Law</span> will govern all interpretations and disputes about this Agreement, without regard to its conflict of laws provisions.
`

const CSA_V3 = `# Cloud Service Agreement

5. <span class="header_2" id="5">Term & Termination</span>
    1. <span class="header_3" id="5.1">Order Form and Agreement.</span>  For each Order Form, the Agreement will start on the <span class="orderform_link">Order Date</span>, continue through the <span class="orderform_link">Subscription Period</span>, and automatically renew for additional <span class="orderform_link">Subscription Periods</span> unless one party gives notice of non-renewal to the other party before the <span class="orderform_link">Non-Renewal Notice Date</span>.
    6. <span class="header_3" id="5.6">Survival.</span>
        a. <span id="5.6.a">The</span> following sections will survive expiration or termination of the Agreement: Section 5.6 (Survival), Section 8 (Limitation of Liability).

8. <span class="header_2" id="8">Limitation of Liability</span>
    1. <span class="header_3" id="8.1">Liability Cap.</span> **Except as provided in the Cover Page, each party’s total cumulative liability for all claims arising out of or relating to this Agreement will not be more than the <span class="keyterms_link">General Cap Amount</span>.**
    2. <span class="header_3" id="8.2">Indirect Damages Waiver.</span> **Except for a breach of Section 10 (Confidentiality), under no circumstances will either party be liable for lost profits or revenues.**
    3. <span class="header_3" id="8.3">Applicability.</span>  **The limitations and waivers contained in Sections 8.1 (Liability Cap) and 8.2 (Indirect Damages Waiver) apply to all liability, whether in tort (including negligence), contract, breach of statutory duty, or otherwise.**

10. <span class="header_2" id="10">Confidentiality</span>
    1. <span class="header_3" id="10.1">Use and Nondisclosure.</span>  Recipient will not use Discloser’s Confidential Information except to fulfill its obligations under the Agreement. Prohibited Data includes information regulated by the Health Insurance Portability and Accountability Act.
`

const BONTERMS = `# Bonterms Mutual NDA (Version 1.0)

4. **Exceptions**. Recipient’s obligations in this NDA do not apply to information that it can demonstrate: (a) is or becomes publicly available through no fault of Recipient.

5. **Permitted Disclosures**.
- (a) _Representatives_. Recipient may disclose Confidential Information to its employees who need to know it for the Purpose.
- (b) _Required by Law_. Recipient may disclose Confidential Information to the extent required by law, subpoena or court order.

9. **Disclaimer**. CONFIDENTIAL INFORMATION IS PROVIDED WITHOUT WARRANTIES.

Bonterms Mutual NDA (Version 1.0). <br />
© 2021. Free to use under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).<br />
`

const nums = (text: string) => segment(text).clauses.map(c => c.num)

test('Markdown: indented ordered lists become 8, 8.1, 8.1(a) as in the rendered agreement', () => {
  assert.ok(looksLikeMarkdown(CSA_V2))
  const t = markdownToText(CSA_V2)
  assert.doesNotMatch(t, /<span|\*\*/)
  assert.deepEqual(nums(t).slice(1), ['8', '8.1', '8.1(a)', '8.2', '8.3', '8.4', '10', '10.1', '12', '12.3'])
  const c = segment(t).clauses.find(c => c.num === '8.2')!
  assert.equal(c.title, 'Damages Waiver')
})

test('Markdown: bold titles, emphasised bullet subclauses, links and <br> are cleaned', () => {
  const d = segment(markdownToText(BONTERMS)).clauses
  assert.deepEqual(d.map(c => c.num), [null, '4', '5', '5(a)', '5(b)', '9'])
  assert.equal(d[3].title, 'Representatives')
  assert.equal(d[2].title, 'Permitted Disclosures')
  assert.match(d.at(-1)!.body, /Free to use under CC BY 4\.0\./)
  assert.ok(!looksLikeMarkdown('1. Fees. Customer pays within 30 days.\n2. Term. One year.'))
})

test('cross-references: a cited title that no longer matches is caught (real error in CSA v2.0 § 8.4)', () => {
  const refs = checkRefs(segment(markdownToText(CSA_V2)).clauses)
  const bad = refs.filter(r => r.status !== 'ok')
  assert.equal(bad.length, 1)
  assert.equal(bad[0].target, '12')
  assert.match(bad[0].detail, /cited as “Confidentiality”, but § 12 is General Terms/)
})

test('cross-references: "Sections 8.1 (Liability Cap) and 8.2 (...)" yields both targets with titles', () => {
  const r = references(segment(markdownToText(CSA_V3)).clauses).filter(r => r.target.startsWith('8.'))
  assert.deepEqual(r.map(x => [x.target, x.title]), [['8.1', 'Liability Cap'], ['8.2', 'Indirect Damages Waiver']])
})

test('v2 → v3: a renamed clause cited by its new title is not reported as stale', () => {
  const cmp = compare(markdownToText(CSA_V2), markdownToText(CSA_V3), playbookById('msa-customer')!)
  assert.deepEqual(cmp.refs.filter(r => r.status !== 'ok'), [])
})

test('playbook: caps, governing law and renewal deadlines set on a cover page are named, not misreported', () => {
  const c = segment(markdownToText(CSA_V3)).clauses
  const rule = (spec: Partial<Rule> & Pick<Rule, 'kind'>) => ({ id: 'r', name: 'R', severity: 'high', fallback: '', enabled: true, ...spec }) as Rule
  const cap = checkRule(rule({ kind: 'liabilityCap', minMonths: 12 }), c)[0]
  assert.equal(cap.clause, '§ 8.1 Liability Cap') // not the survival clause that only cites "Limitation of Liability"
  assert.match(cap.message, /“General Cap Amount”.*cover page/)
  const renew = checkRule(rule({ kind: 'autoRenewal', maxNoticeDays: 60 }), c)[0]
  assert.match(renew.message, /“Non-Renewal Notice Date”/)
  const law = checkRule(rule({ kind: 'governingLaw', allowed: ['Delaware'] }), segment(markdownToText(CSA_V2)).clauses)[0]
  assert.equal(law.clause, '§ 12.3 Governing Law and Chosen Courts')
  assert.match(law.message, /“Governing Law”/)
})

test('terms: hyphenated terms stay whole, statute names are skipped, ALL-CAPS disclaimers are not variants', () => {
  const v3 = termReport(segment(markdownToText(CSA_V3)).clauses).findings.map(f => f.term)
  assert.ok(v3.includes('Non-Renewal Notice Date'))
  assert.ok(!v3.includes('Non'))
  assert.ok(!v3.some(t => t.startsWith('Health Insurance')))
  const nda = termReport(segment(`1. Definitions. "Confidential Information" means secrets.\n2. Use. Confidential Information stays secret.\n3. Disclaimer. CONFIDENTIAL INFORMATION IS PROVIDED AS IS.`).clauses)
  assert.deepEqual(nda.findings.filter(f => f.kind === 'inconsistent'), [])
})

test('terms: when the agreement says terms are defined on the Cover Page, undefined terms say so', () => {
  const t = `1. Use. Capitalized words have the meanings given on the Cover Page.\n2. Term. This runs for the Subscription Period.`
  const f = termReport(segment(t).clauses).findings.find(f => f.term === 'Subscription Period')!
  assert.equal(f.external, 'Cover Page')
  const cmp = compare(t, t, playbookById('msa-customer')!)
  assert.equal(cmp.issues.find(i => i.key === 'term:undefined:Subscription Period')!.severity, 'low')
})

test('segment: "a." lettered subclauses after a full stop, but never a wrapped line or a wrapped section number', () => {
  assert.deepEqual(nums(`5. Permitted Disclosures.\na. Representatives. Recipient may disclose.\nb. Required by Law. Recipient may disclose.`), ['5', '5(a)', '5(b)'])
  assert.deepEqual(nums(`5. Use. Recipient may use it for\na. limited purpose only.`), ['5'])
  assert.deepEqual(nums(`3.4. Acceptance. If a Deliverable is subject to acceptance, the provisions of this Section\n\n3.4 will apply.\n(a) Test Period. Fifteen days.`), ['3.4', '3.4(a)'])
})

test('splitTitle accepts "&" in headings ("Term & Termination")', () => {
  assert.deepEqual(splitTitle('Term & Termination. This starts now.'), ['Term & Termination', 'This starts now.'])
})
