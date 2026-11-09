import assert from 'node:assert/strict'
import { test } from 'node:test'
import { align, lis, rows, similarity, summary } from './align.ts'
import { compare, issuesCsv, roundIssues, trackRounds, versionIssues, type Issue } from './analyze.ts'
import { diffWords, myers, tokenize } from './diff.ts'
import { checkRule, governingLaw, parseCap, playbookById, runPlaybook, STARTER_PLAYBOOKS, type Rule } from './playbook.ts'
import { quantChanges, quantities } from './quant.ts'
import { redlineDocument } from './redlineDocx.ts'
import { SAMPLES } from './samples.ts'
import { segment, splitTitle } from './segment.ts'
import { definitions, termChanges, termReport } from './terms.ts'
import { checkRefs, references } from './xref.ts'

const doc = (s: string) => segment(s).clauses
const rule = (spec: Partial<Rule> & Pick<Rule, 'kind'>): Rule => ({ id: 'r', name: 'Rule', severity: 'high', fallback: 'fb', enabled: true, ...spec } as Rule)
const nda = SAMPLES.find(s => s.id === 'nda')!
const msa = SAMPLES.find(s => s.id === 'msa')!

// ---------- Segmentation ----------

test('segments dotted numbers, (a) subclauses, Article headings and ALL-CAPS headings', () => {
  const d = segment(`MASTER AGREEMENT\nPreamble text.\n\nARTICLE IV Payment\n1. Definitions\n1.1 "Fee" means money.\n(a) first thing\n(b) second thing\n(i) nested roman\n2. Term. This runs for one year.`)
  assert.deepEqual(d.clauses.map(c => c.num), [null, 'IV', '1', '1.1', '1.1(a)', '1.1(b)', '1.1(b)(i)', '2'])
  assert.equal(d.clauses[0].title, 'MASTER AGREEMENT')
  assert.equal(d.clauses.at(-1)!.title, 'Term')
  assert.equal(d.clauses.at(-1)!.body, 'This runs for one year.')
  assert.equal(d.clauses[6].level, 4)
})

test('treats (i) after (h) as a letter, not a roman numeral', () => {
  const nums = doc(`1. List\n(g) g\n(h) h\n(i) i`).map(c => c.num)
  assert.deepEqual(nums, ['1', '1(g)', '1(h)', '1(i)'])
})

test('joins hard-wrapped lines and does not split on amounts or plain numbers mid-sentence', () => {
  const c = doc(`1. Fees. Customer pays\n2.5 million dollars on signing\nand the rest later.`)
  assert.equal(c.length, 1)
  assert.match(c[0].body, /pays 2\.5 million dollars on signing and the rest later/)
})

test('warns about duplicate numbers and jumps with line numbers', () => {
  const d = segment(`1. A\n2. B\n2. C\n5. D`)
  assert.deepEqual(d.warnings.map(w => w.line), [3, 4])
  assert.match(d.warnings[1].message, /jumps from 2 to 5/)
})

test('splitTitle only takes short title-cased lead-ins', () => {
  assert.deepEqual(splitTitle('Limitation of Liability. Except as stated.'), ['Limitation of Liability', 'Except as stated.'])
  assert.deepEqual(splitTitle('The Customer shall pay. Then more.'), ['', 'The Customer shall pay. Then more.'])
})

// ---------- Diff ----------

test('Myers diff produces a minimal edit script that rebuilds both sides', () => {
  const a = tokenize('the quick brown fox jumps'), b = tokenize('the slow brown fox leaps high')
  const ops = myers(a, b)
  assert.equal(ops.filter(o => o.t !== 'ins').map(o => o.s).join(''), a.join(''))
  assert.equal(ops.filter(o => o.t !== 'del').map(o => o.s).join(''), b.join(''))
  assert.equal(ops.filter(o => o.t === 'eq' && o.s.trim()).length, 3)
})

test('word diff groups a replaced phrase into one deletion and one insertion', () => {
  const ops = diffWords('fees paid in the twelve (12) months before', 'fees paid in the three (3) months before')
  assert.deepEqual(ops.filter(o => o.t !== 'eq'), [{ t: 'del', s: 'twelve (12' }, { t: 'ins', s: 'three (3' }])
})

test('diff handles empty inputs', () => {
  assert.deepEqual(myers([], []), [])
  assert.deepEqual(myers([], ['a']), [{ t: 'ins', s: 'a' }])
  assert.deepEqual(myers(['a'], []), [{ t: 'del', s: 'a' }])
})

test('tokenizer keeps formatted numbers together', () => {
  assert.ok(tokenize('pay $1,250,000.00 now').includes('$1,250,000.00'))
})

// ---------- Alignment ----------

test('alignment survives renumbering and flags a moved clause', () => {
  const a = doc(`1. Purpose. Evaluate a deal.\n2. Governing Law. Delaware law governs this agreement.\n3. Term. One year from the effective date.\n4. General. Entire agreement and amendments.`)
  const b = doc(`1. Purpose. Evaluate a deal.\n2. Term. One year from the effective date.\n3. General. Entire agreement and amendments.\n4. Governing Law. Texas law governs this agreement.`)
  const pairs = align(a, b)
  const gov = pairs.find(p => p.a === 1)!
  assert.equal(gov.b, 3)
  assert.equal(gov.moved, true)
  assert.equal(gov.modified, true)
  assert.equal(pairs.find(p => p.a === 2)!.renumbered, true)
  assert.equal(pairs.find(p => p.a === 2)!.moved, false)
  const r = rows(pairs, a.length)
  assert.ok(r.some(x => x.ghost && x.a === 1), 'ghost row where the clause used to be')
  assert.equal(r.filter(x => x.b !== null).length, b.length)
})

test('alignment reports insertions and deletions', () => {
  const a = doc(`1. Alpha. Alpha text here.\n2. Beta. Beta clause text.`)
  const b = doc(`1. Alpha. Alpha text here.\n2. Gamma. A completely new obligation about audits.`)
  const s = summary(align(a, b))
  assert.equal(s.inserted, 1)
  assert.equal(s.deleted, 1)
  assert.equal(s.unchanged, 1)
})

test('similarity and LIS basics', () => {
  assert.equal(similarity('a b c', 'a b c'), 1)
  assert.equal(similarity('a b', 'c d'), 0)
  assert.deepEqual([...lis([0, 4, 1, 2, 3])].sort(), [0, 2, 3, 4])
})

// ---------- Defined terms ----------

test('extracts "X" means and parenthetical definitions', () => {
  const t = definitions(doc(`This Agreement (the "Agreement") is between Acme ("Acme") and Beta, each a "Party".\n1. Definitions.\n1.1 “Confidential Information” means secret things.`)).map(d => d.term)
  assert.deepEqual(t.sort(), ['Acme', 'Agreement', 'Confidential Information', 'Party'])
})

test('flags unused, undefined and inconsistently capitalised terms', () => {
  const r = termReport(doc(`1. Definitions. "Confidential Information" means secrets. "Affiliate" means a controlled entity.\n2. Use. The Recipient will protect Confidential Information and not share confidential information. Each Party's Confidential Information stays with the Recipient.`))
  const kinds = r.findings.map(f => `${f.kind}:${f.term}`)
  assert.ok(kinds.includes('unused:Affiliate'))
  assert.ok(kinds.includes('undefined:Recipient'))
  assert.ok(kinds.includes('inconsistent:Confidential Information'))
  assert.equal(r.uses['Confidential Information'], 2)
})

test('reports definitions that changed between versions', () => {
  const ch = termChanges(doc(`1. "Fees" means amounts paid or payable.`), doc(`1. "Fees" means amounts actually paid.`))
  assert.equal(ch.length, 1)
  assert.equal(ch[0].kind, 'changed')
})

// ---------- Cross-references ----------

test('finds references including lists and ranges', () => {
  const r = references(doc(`1. A. See Sections 2.1, 3 and 4(a). Also Article IV.`)).map(x => x.target)
  assert.deepEqual(r, ['2.1', '3', '4(a)', 'IV'])
})

test('flags missing references and stale ones after renumbering', () => {
  const a = doc(`1. Cap. Subject to Section 2, liability is capped.\n2. Exclusions. The cap does not apply to fraud.\n3. Indirect. No consequential damages.`)
  const b = doc(`1. Cap. Subject to Section 2, liability is capped. See Section 9.\n2. Indirect. No consequential damages.`)
  const refs = checkRefs(b, a, align(a, b))
  assert.equal(refs.find(r => r.target === '9')!.status, 'missing')
  const stale = refs.find(r => r.target === '2')!
  assert.equal(stale.status, 'stale')
  assert.match(stale.detail, /Exclusions/)
})

test('a reference that resolves to a subclause mentioned in its parent is fine', () => {
  const refs = checkRefs(doc(`1. A. As set out in Section 2(b).\n2. B. Either (a) this or (b) that.`))
  assert.equal(refs[0].status, 'ok')
})

// ---------- Numbers ----------

test('extracts amounts, percentages, word-number durations and dates', () => {
  const q = quantities('Pay $1.5 million and 2% within thirty (30) days, by January 5, 2027, capped at two (2) times the fees.')
  assert.deepEqual(q.map(x => x.kind), ['money', 'percent', 'duration', 'date', 'multiple'])
  assert.equal(q[0].value, 1_500_000)
  assert.equal(q[2].value, 30)
  assert.equal(q[4].value, 2)
})

test('pairs changed values by kind and ignores unchanged ones', () => {
  const ch = quantChanges('within 30 days and $500, for twelve (12) months', 'within 30 days and $750, for three (3) months')
  assert.deepEqual(ch, [{ kind: 'money', before: '$500', after: '$750' }, { kind: 'duration', before: 'twelve (12) months', after: 'three (3) months' }])
})

// ---------- Playbook ----------

test('liability cap: months of fees, multiples and fixed amounts', () => {
  assert.equal(parseCap('will not exceed the Fees paid or payable in the twelve (12) months preceding the claim')!.months, 12)
  assert.equal(parseCap('will not exceed two (2) times the annual fees')!.months, 24)
  assert.equal(parseCap('will not exceed $250,000')!.amount, 250000)
  const f = checkRule(rule({ kind: 'liabilityCap', minMonths: 12 }), doc(`8. Limitation of Liability\n8.1 Cap. Total liability will not exceed the fees actually paid in the three (3) months before the claim.`))
  assert.equal(f[0].status, 'fail')
  assert.match(f[0].message, /3 months/)
})

test('governing law against an allowed list', () => {
  assert.equal(governingLaw('This Agreement is governed by the laws of the State of New York, without regard to conflicts.'), 'New York')
  assert.equal(governingLaw('governed by and construed in accordance with the laws of England and Wales.'), 'England and Wales')
  const f = checkRule(rule({ kind: 'governingLaw', allowed: ['Delaware'] }), doc('1. Law. This Agreement is governed by the laws of the State of Texas.'))
  assert.equal(f[0].status, 'fail')
})

test('payment days, auto-renewal notice and survival periods', () => {
  assert.equal(checkRule(rule({ kind: 'paymentDays', maxDays: 30 }), doc('1. Payment. Client pays invoices net 90.'))[0].status, 'fail')
  assert.equal(checkRule(rule({ kind: 'paymentDays', maxDays: 30 }), doc('1. Payment. Client pays within fifteen (15) days.'))[0].status, 'pass')
  assert.equal(checkRule(rule({ kind: 'autoRenewal', maxNoticeDays: 60 }), doc('1. Renewal. This renews automatically unless notice is given at least ninety (90) days before.'))[0].status, 'fail')
  assert.equal(checkRule(rule({ kind: 'autoRenewal', maxNoticeDays: 60 }), doc('1. Renewal. This renews automatically each year.'))[0].message, 'Renews automatically with no notice window to opt out.')
  assert.equal(checkRule(rule({ kind: 'duration', match: 'surviv', maxMonths: 36 }), doc('1. Term. Obligations survive in perpetuity.'))[0].status, 'fail')
})

test('freelancer: broad IP assignment, non-compete and forbidden phrases', () => {
  const pb = playbookById('freelancer')!
  const c = doc(`1. Payment. Client pays within ninety (90) days.\n2. IP. Contractor assigns to Client all inventions conceived during the term, whether or not related to the services.\n3. Restrictions. Contractor shall not provide services to any competing business for two years.`)
  const fails = runPlaybook(pb, c).filter(f => f.status === 'fail').map(f => f.ruleId)
  assert.ok(fails.includes('fl-pay'))
  assert.ok(fails.includes('fl-ip'))
  assert.ok(fails.includes('fl-noncompete'))
  assert.ok(fails.includes('fl-kill'))
})

test('required and forbidden rules', () => {
  const c = doc('1. Changes. Provider may modify these terms at any time.')
  assert.equal(checkRule(rule({ kind: 'forbidden', phrases: ['may modify these terms at any time'] }), c)[0].status, 'fail')
  assert.equal(checkRule(rule({ kind: 'required', match: 'service level' }), c)[0].status, 'fail')
  assert.equal(STARTER_PLAYBOOKS.length, 3)
})

// ---------- Samples end to end ----------

test('NDA sample: one-way, longer survival, governing law moved and changed', () => {
  const pb = playbookById('nda-mutual')!
  assert.equal(versionIssues(segment(nda.versions[0].text), pb).filter(i => i.source === 'playbook').length, 0, 'our draft passes our playbook')
  const c = compare(nda.versions[0].text, nda.versions[1].text, pb)
  const moved = c.pairs.filter(p => p.moved).map(p => c.b.clauses[p.b!].title)
  assert.deepEqual(moved, ['Governing Law'])
  const keys = c.issues.map(i => i.key)
  for (const k of ['nda-mutual', 'nda-term', 'nda-law', 'def:changed:Confidential Information', 'term:inconsistent:Receiving Party']) assert.ok(keys.includes(k), k)
})

test('MSA sample: cap cut to 3 months and a stale cross-reference; tracked across three rounds', () => {
  const pb = playbookById('msa-customer')!
  const c = compare(msa.versions[0].text, msa.versions[1].text, pb)
  const cap = c.issues.find(i => i.key === 'msa-cap')!
  assert.match(cap.detail, /3 months/)
  assert.ok(c.issues.some(i => i.key === 'xref:8.2' && /Exclusions/.test(i.detail)))
  const tracked = trackRounds(roundIssues(msa.versions.map(v => v.text), pb), msa.conceded)
  const st = Object.fromEntries(tracked.map(t => [t.key, t.status]))
  assert.equal(st['msa-cap'], 'conceded')
  assert.equal(st['xref:8.2'], 'resolved')
  assert.equal(st['msa-renew'], 'resolved')
  assert.equal(st['msa-termination'], 'open')
})

test('tracker marks issues first seen in the latest round as new', () => {
  const i = (key: string): Issue => ({ key, source: 'playbook', clauseId: null, clause: 'x', issue: key, detail: '', severity: 'high', fallback: '' })
  const t = Object.fromEntries(trackRounds([[i('a')], [i('a'), i('b')]]).map(x => [x.key, x.status]))
  assert.deepEqual(t, { a: 'open', b: 'new' })
})

// ---------- Exports ----------

test('CSV export escapes quotes, commas and newlines', () => {
  const csv = issuesCsv([{ key: 'k', source: 'playbook', clauseId: null, clause: '§ 8.1 Cap', issue: 'Cap, low', detail: 'Says "3"\nmonths', severity: 'high', fallback: 'Restore' }], { k: 'conceded' })
  assert.equal(csv.split('\r\n')[1], 'high,§ 8.1 Cap,"Cap, low","Says ""3""\nmonths",Restore,conceded')
})

test('DOCX redline contains strikethrough deletions and underlined insertions', async () => {
  const { Packer } = await import('docx')
  const c = compare(msa.versions[0].text, msa.versions[1].text, playbookById('msa-customer')!)
  const buf = await Packer.toBuffer(redlineDocument(c, { title: 'MSA', from: 'v1', to: 'v2' }))
  assert.equal(buf.subarray(0, 2).toString(), 'PK')
  const { inflateRawSync } = await import('node:zlib')
  // Find document.xml in the zip by scanning local file headers.
  let xml = ''
  for (let o = 0; o < buf.length - 30;) {
    if (buf.readUInt32LE(o) !== 0x04034b50) break
    const method = buf.readUInt16LE(o + 8), size = buf.readUInt32LE(o + 18), nl = buf.readUInt16LE(o + 26), xl = buf.readUInt16LE(o + 28)
    const name = buf.subarray(o + 30, o + 30 + nl).toString()
    const data = buf.subarray(o + 30 + nl + xl, o + 30 + nl + xl + size)
    if (name === 'word/document.xml') xml = (method === 8 ? inflateRawSync(data) : data).toString()
    o += 30 + nl + xl + size
  }
  assert.match(xml, /<w:strike\/>|<w:strike w:val="true"\/>/)
  assert.match(xml, /w:u w:val="double"/)
  assert.match(xml, /three \(3/)
})
