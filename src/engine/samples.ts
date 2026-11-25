// Sample contract sets: two synthetic ones written for this app (fictional parties) and one real public standard.
import { CSA_V2, CSA_V3 } from './publicSamples.ts'

export interface SampleSet { id: string; name: string; blurb: string; playbookId: string; versions: { label: string; fileName: string; text: string }[]; conceded?: string[]; counterparty: string; source?: { name: string; url: string; licence: string } }

const BANNER = 'SYNTHETIC SAMPLE: fictional parties, written for Redline Desk. Not legal advice.'

const NDA_V1 = `MUTUAL NONDISCLOSURE AGREEMENT
${BANNER}

This Mutual Nondisclosure Agreement (the "Agreement") is entered into as of March 3, 2026 (the "Effective Date") between Northwind Analytics, Inc., a Delaware corporation ("Northwind"), and Bluefin Robotics LLC, a California limited liability company ("Bluefin"). Northwind and Bluefin are each a "Party" and together the "Parties".

1. Purpose. The Parties wish to evaluate a possible commercial relationship concerning warehouse automation software (the "Purpose"). In connection with the Purpose, each Party may disclose Confidential Information to the other.

2. Definitions.
2.1 "Confidential Information" means any non-public information disclosed by a Party (the "Disclosing Party") to the other Party (the "Receiving Party"), whether orally, visually or in writing, that is marked as confidential or that a reasonable person would understand to be confidential.
2.2 "Representatives" means a Party's employees, officers, directors, advisers and contractors who need to know the Confidential Information for the Purpose.

3. Exclusions. Confidential Information does not include information that (a) is or becomes publicly available through no fault of the Receiving Party; (b) was known to the Receiving Party before disclosure; (c) is independently developed by the Receiving Party without use of the Confidential Information; or (d) is rightfully received from a third party without a duty of confidentiality.

4. Obligations. The Receiving Party will (a) use Confidential Information only for the Purpose; (b) not disclose it to anyone other than its Representatives who are bound by obligations at least as protective as those in this Agreement; and (c) protect it with at least the degree of care it uses for its own similar information, and no less than reasonable care.

5. Compelled Disclosure. If the Receiving Party is required by law to disclose Confidential Information, it will give the Disclosing Party prompt written notice, where legally permitted, so that the Disclosing Party may seek a protective order. Any disclosure under this Section 5 is limited to the portion legally required.

6. Governing Law. This Agreement is governed by the laws of the State of Delaware, without regard to its conflict of laws rules. The state and federal courts in Wilmington, Delaware have exclusive jurisdiction.

7. Term. This Agreement starts on the Effective Date and continues for one (1) year (the "Term"). The Receiving Party's obligations under Section 4 survive for two (2) years after the end of the Term.

8. Return of Materials. On written request, the Receiving Party will promptly return or destroy all Confidential Information and certify the destruction in writing, except for copies kept under routine backup procedures.

9. No Licence. Nothing in this Agreement grants either Party any licence or right in the other Party's Confidential Information, except the limited right to use it for the Purpose.

10. Remedies. Unauthorized disclosure may cause irreparable harm, and the Disclosing Party may seek injunctive relief in addition to any other remedy.

11. General. This Agreement is the entire agreement of the Parties about its subject matter. It may be amended only in a writing signed by both Parties. Neither Party may assign this Agreement without the other Party's consent.
`

const NDA_V2 = `NONDISCLOSURE AGREEMENT
${BANNER}

This Nondisclosure Agreement (the "Agreement") is entered into as of March 3, 2026 (the "Effective Date") between Northwind Analytics, Inc., a Delaware corporation ("Northwind"), and Bluefin Robotics LLC, a California limited liability company ("Bluefin"). Northwind and Bluefin are each a "Party" and together the "Parties".

1. Purpose. The Parties wish to evaluate a possible commercial relationship concerning warehouse automation software (the "Purpose"). In connection with the Purpose, Bluefin may disclose Confidential Information to Northwind. Only Bluefin will disclose Confidential Information under this Agreement.

2. Definitions.
2.1 "Confidential Information" means any information disclosed by Bluefin (the "Disclosing Party") to Northwind (the "Receiving Party"), whether orally, visually or in writing, and whether or not it is marked as confidential.
2.2 "Representatives" means a Party's employees, officers, directors, advisers and contractors who need to know the Confidential Information for the Purpose.

3. Exclusions. Confidential Information does not include information that (a) is or becomes publicly available through no fault of the Receiving Party; (b) was known to the Receiving Party before disclosure; (c) is independently developed by the Receiving Party without use of the Confidential Information; or (d) is rightfully received from a third party without a duty of confidentiality.

4. Obligations. The Receiving Party will (a) use Confidential Information only for the Purpose; (b) not disclose it to anyone other than its Representatives who are bound by obligations at least as protective as those in this Agreement; and (c) protect it with at least the degree of care it uses for its own most sensitive information. The receiving party is responsible for any breach by its Representatives.

5. Compelled Disclosure. If the Receiving Party is required by law to disclose Confidential Information, it will give the Disclosing Party prompt written notice, where legally permitted, so that the Disclosing Party may seek a protective order. Any disclosure under this Section 5 is limited to the portion legally required.

6. Term. This Agreement starts on the Effective Date and continues for three (3) years (the "Term"). The Receiving Party's obligations under Section 4 survive for five (5) years after the end of the Term.

7. Return of Materials. On written request, the Receiving Party will promptly return or destroy all Confidential Information and certify the destruction in writing within ten (10) days, except for copies kept under routine backup procedures.

8. No Licence. Nothing in this Agreement grants either Party any licence or right in the other Party's Confidential Information, except the limited right to use it for the Purpose.

9. Remedies. Unauthorized disclosure may cause irreparable harm, and the Disclosing Party may seek injunctive relief in addition to any other remedy. The Recipient will reimburse the Disclosing Party's reasonable attorneys' fees.

10. General. This Agreement is the entire agreement of the Parties about its subject matter. It may be amended only in a writing signed by both Parties. Neither Party may assign this Agreement without the other Party's consent.

11. Governing Law. This Agreement is governed by the laws of the State of Texas, without regard to its conflict of laws rules. The state and federal courts in Houston, Texas have exclusive jurisdiction.
`

const msa = (o: { cap: string; payDays: string; noticeDays: string; convenience: boolean; exclusions: boolean; round: string }) => `MASTER SUBSCRIPTION AGREEMENT
${BANNER} ${o.round}

This Master Subscription Agreement (the "Agreement") is made on January 12, 2026 (the "Effective Date") between Stratus Ledger, Inc. ("Provider") and Kestrel Health Partners, Inc. ("Customer").

1. Definitions
1.1 "Service" means Provider's hosted claims analytics platform described in an Order Form.
1.2 "Order Form" means an ordering document signed by both parties that references this Agreement.
1.3 "Customer Data" means data submitted to the Service by or for Customer.
1.4 "Fees" means the amounts payable under an Order Form.

2. Service
2.1 Provision. Provider will make the Service available to Customer during each Subscription Term under this Agreement and the applicable Order Form.
2.2 Service Levels. Provider will make the Service available 99.9% of the time each calendar month, excluding scheduled maintenance, and will provide the service credits described in Exhibit A.

3. Fees and Payment
3.1 Invoicing. Provider will invoice Fees annually in advance. Customer will pay undisputed invoices within ${o.payDays} days of receipt.
3.2 Taxes. Fees exclude taxes. Customer is responsible for sales and use taxes other than taxes on Provider's income.

4. Term and Renewal
4.1 Term. This Agreement continues until all Order Forms have expired or been terminated. Each subscription period (a "Subscription Term") lasts twelve (12) months.
4.2 Renewal. Each Subscription Term will renew automatically for successive twelve (12) month periods unless either party gives written notice of non-renewal at least ${o.noticeDays} days before the end of the then-current term.
${o.convenience ? `4.3 Termination for Convenience. Customer may terminate this Agreement for convenience on thirty (30) days' written notice and will receive a pro-rata refund of prepaid Fees.
` : ''}
5. Data Protection
5.1 Security. Provider will maintain administrative, physical and technical safeguards that meet or exceed SOC 2 Type II controls.
5.2 Breach Notice. Provider will notify Customer within seventy-two (72) hours of any unauthorized access to Customer Data (a "Security Breach").

6. Confidentiality
6.1 Each party will protect the other party's confidential information with reasonable care and use it only to perform this Agreement.

7. Indemnification
7.1 Provider will defend Customer against any third-party claim alleging that the Service infringes that third party's intellectual property rights, and will pay resulting damages and costs.

8. Limitation of Liability
8.1 Cap. Except for the exclusions in Section 8.2, each party's total liability arising out of this Agreement will not exceed ${o.cap} preceding the event giving rise to the claim.
${o.exclusions ? `8.2 Exclusions. The cap in Section 8.1 does not apply to a party's indemnification obligations under Section 7.1, or to a party's breach of Section 5 (Data Protection), which is subject to a separate cap of three (3) times the Fees paid in the prior twelve (12) months.
` : ''}8.${o.exclusions ? 3 : 2} Indirect Damages. Neither party is liable for lost profits or indirect, special or consequential damages.

9. General
9.1 Governing Law. This Agreement is governed by the laws of the State of New York.
9.2 Entire Agreement. This Agreement, with its Order Forms, is the entire agreement of the parties. Amendments must be in writing and signed by both parties.
9.3 Notices. Notices under Section 4.2 must be sent in writing to the addresses in the Order Form.
`

export const SAMPLES: SampleSet[] = [
  {
    id: 'nda', name: 'Mutual NDA, counterparty redraft', playbookId: 'nda-mutual', counterparty: 'Bluefin Robotics (synthetic)',
    blurb: 'Bluefin sent back v2: one-way, five-year survival, governing law moved to the end and switched to Texas.',
    versions: [
      { label: 'v1 Our draft', fileName: 'Northwind-Bluefin NDA v1.txt', text: NDA_V1 },
      { label: 'v2 Bluefin markup', fileName: 'Northwind-Bluefin NDA v2 (Bluefin).txt', text: NDA_V2 },
    ],
  },
  {
    id: 'msa', name: 'SaaS MSA, three rounds', playbookId: 'msa-customer', counterparty: 'Stratus Ledger (synthetic)',
    blurb: 'Provider cut the liability cap from 12 months of fees to 3, deleted the carve-outs and broke a cross-reference. Round 3 claws some back.',
    versions: [
      { label: 'v1 Customer paper', fileName: 'Stratus-Kestrel MSA v1.txt', text: msa({ round: 'Round 1.', cap: 'the Fees paid or payable by Customer in the twelve (12) months', payDays: 'forty-five (45)', noticeDays: 'thirty (30)', convenience: true, exclusions: true }) },
      { label: 'v2 Provider markup', fileName: 'Stratus-Kestrel MSA v2 (Provider).txt', text: msa({ round: 'Round 2.', cap: 'the Fees actually paid by Customer in the three (3) months', payDays: 'thirty (30)', noticeDays: 'ninety (90)', convenience: false, exclusions: false }) },
      { label: 'v3 Customer response', fileName: 'Stratus-Kestrel MSA v3.txt', text: msa({ round: 'Round 3.', cap: 'the Fees paid or payable by Customer in the six (6) months', payDays: 'thirty (30)', noticeDays: 'sixty (60)', convenience: false, exclusions: true }) },
    ],
    conceded: ['msa-cap'],
  },
  {
    id: 'csa', name: 'Real: Common Paper cloud agreement v2 → v3', playbookId: 'msa-customer', counterparty: 'Common Paper (public standard)',
    blurb: 'The published Cloud Service Agreement standard terms, 2.0 against 3.0. Machine-learning clause dropped, liability caps rewritten, and a v2.0 cross-reference to the wrong section.',
    source: { name: 'Common Paper Cloud Service Agreement', url: 'https://github.com/CommonPaper/CSA', licence: 'CC BY 4.0' },
    versions: [
      { label: 'v2.0 Common Paper', fileName: 'Common Paper CSA 2.0.md', text: CSA_V2 },
      { label: 'v3.0 Common Paper', fileName: 'Common Paper CSA 3.0.md', text: CSA_V3 },
    ],
  },
]
