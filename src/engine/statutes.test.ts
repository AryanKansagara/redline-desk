import assert from 'node:assert/strict'
import { test } from 'node:test'
import { segment } from './segment.ts'
import { termReport } from './terms.ts'
import { checkRefs, references } from './xref.ts'

const refs = (s: string) => references(segment(`1. Text. ${s}\n2. Other. Nothing here.\n`).clauses).map(r => r.target)

test('statutes are not references to this contract', () => {
  for (const s of [
    'A release under Section 1542 of the California Civil Code', 'Section 365(n) of the Bankruptcy Code', 'Article 28 of the GDPR', 'Article 28(3)(a) to (d) of the UK GDPR', 'Article 6 GDPR',
    'section 1 of the Contracts (Rights of Third Parties) Act 1999', 'Sections 13 and 15(d) of the Securities Exchange Act of 1934', 'Article 4 of Regulation (EU) 2016/679',
    'Internal Revenue Code Section 83(b)', '17 U.S.C. § 10', 'FAR section 12.212 and DFAR section 227.7202', 'Section 9.1234', 'section 12 of the Act', 'clause 7 of the Standard Contractual Clauses',
  ]) assert.deepEqual(refs(s + '.'), [], s)
})

test('references to this contract are still found next to statutes', () => {
  assert.deepEqual(refs('Section 8.2 of this Agreement'), ['8.2'])
  assert.deepEqual(refs('Section 8 of the Agreement and the Data Protection Act'), ['8'])
  assert.deepEqual(refs('its duties in Section 8 under the Data Protection Act'), ['8'])
  assert.deepEqual(refs('Section 5 and Section 28 of the GDPR'), ['5'])
  assert.deepEqual(refs('Section 8.2. Regulations of the Act apply'), ['8.2'])
  assert.deepEqual(refs('Sections 2.1, 3 and 4(a)'), ['2.1', '3', '4(a)'])
  assert.deepEqual(refs('Section 8.2 (Liability Cap) applies to the Act'), ['8.2'])
  assert.deepEqual(refs('Sections 99 and 100'), ['99'])
})

test('a cited statute is not an undefined term; other phrases still are', () => {
  const terms = (s: string) => termReport(segment(`1. Text. ${s}\n2. Other. Nothing here.\n`).clauses).findings.map(f => f.term)
  assert.deepEqual(terms('Section 1542 of the California Civil Code, Section 365(n) of the Bankruptcy Code and Article 28 of the GDPR apply.'), [])
  assert.deepEqual(terms('Staff follow the Conduct Code and Section 2 of the Master Plan.'), ['Conduct Code', 'Master Plan'])
})

test('lower-case references are checked', () => {
  const r = checkRefs(segment('1. A. As set out in clause 9.9 and section 8.8, and clauses 2 and 7.\n2. B. In article I wrote, sub-clause 3 and sub-clause 6.6.\n').clauses)
  assert.deepEqual(r.map(x => [x.target, x.status]), [['9.9', 'missing'], ['8.8', 'missing'], ['2', 'ok'], ['7', 'missing'], ['6.6', 'missing']])
})
