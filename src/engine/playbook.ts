// Playbook rules: user-editable checks per contract type, each with a severity and fallback language.
import { durationDays, moneyValue, parseNumber } from './quant.ts'
import { clauseLabel, type Clause } from './segment.ts'

export type Severity = 'high' | 'medium' | 'low'

export type RuleSpec =
  | { kind: 'required'; match: string }
  | { kind: 'forbidden'; phrases: string[] }
  | { kind: 'liabilityCap'; minMonths: number; minAmount?: number }
  | { kind: 'duration'; match: string; maxMonths?: number; minMonths?: number }
  | { kind: 'governingLaw'; allowed: string[] }
  | { kind: 'paymentDays'; maxDays: number }
  | { kind: 'ipScope' }
  | { kind: 'restrictive'; forbid: ('noncompete' | 'nonsolicit')[] }
  | { kind: 'autoRenewal'; maxNoticeDays: number }
  | { kind: 'mutual' }

export type Rule = { id: string; name: string; severity: Severity; fallback: string; enabled: boolean } & RuleSpec
export interface Playbook { id: string; name: string; contractType: string; rules: Rule[] }

export interface Finding { ruleId: string; rule: string; status: 'pass' | 'fail'; severity: Severity; clauseId: string | null; clause: string; message: string; fallback: string }

const sentences = (s: string) => s.split(/(?<=[.;])\s+(?=[A-Z(])/)
const titleOrBody = (clauses: Clause[], re: RegExp) => {
  const byTitle = clauses.filter(c => re.test(c.title))
  return byTitle.length ? byTitle : clauses.filter(c => re.test(c.body))
}
const firstDuration = (s: string): { days: number; raw: string } | null => {
  for (const m of s.matchAll(/\b(\d+|[a-z]+(?:-[a-z]+)?)\s*(?:\((\d+)\)\s*)?(business days?|calendar days?|days?|months?|years?)\b/gi)) {
    const d = durationDays(m[1], m[2], m[3])
    if (d !== null) return { days: d, raw: m[0] }
  }
  return null
}
const months = (days: number) => Math.round(days / 30.4)

/** Parses a liability cap: months of fees, a multiple of annual fees, or a fixed amount. */
export function parseCap(text: string): { months?: number; amount?: number; raw: string } | null {
  const mult = text.match(/\b(\d+(?:\.\d+)?|[a-z]+)\s*(?:\((\d+(?:\.\d+)?)\)\s*)?(?:times|x)\s+(?:the\s+)?(?:total\s+|aggregate\s+)?(?:annual\s+)?(?:fees|amounts)/i)
  if (mult) { const n = mult[2] ? Number(mult[2]) : parseNumber(mult[1]); if (n !== null) return { months: n * 12, raw: mult[0] } }
  const fees = text.search(/\b(fees|amounts)\b[^.]{0,80}\b(paid|payable)/i)
  if (fees >= 0) {
    const d = firstDuration(text.slice(fees, fees + 220))
    if (d) return { months: months(d.days), raw: text.slice(fees, fees + 220).split(/[.;]/)[0] }
  }
  const money = text.match(/(?:US)?[$€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s?(?:million|thousand))?/)
  if (money) return { amount: moneyValue(money[0]), raw: money[0] }
  return null
}

export function governingLaw(text: string): string | null {
  const m = text.match(/governed by(?:,? and (?:construed|interpreted) in accordance with,?)? the (?:internal )?laws? of (?:the )?(?:State of |Commonwealth of |Province of )?([A-Z][A-Za-z]+(?:(?: and | )[A-Z][A-Za-z]+){0,3})/)
  return m ? m[1].trim() : null
}

function fail(r: Rule, c: Clause | null, message: string): Finding {
  return { ruleId: r.id, rule: r.name, status: 'fail', severity: r.severity, clauseId: c?.id ?? null, clause: c ? clauseLabel(c) : 'Whole agreement', message, fallback: r.fallback }
}
function pass(r: Rule, c: Clause | null, message: string): Finding {
  return { ...fail(r, c, message), status: 'pass' }
}

export function checkRule(r: Rule, clauses: Clause[]): Finding[] {
  const all = clauses.map(c => c.title + '. ' + c.body).join('\n')
  switch (r.kind) {
    case 'required': {
      const re = new RegExp(r.match, 'i')
      const c = titleOrBody(clauses, re)[0]
      return [c ? pass(r, c, 'Present.') : fail(r, null, `No clause matches “${r.name}”.`)]
    }
    case 'forbidden': {
      const out: Finding[] = []
      for (const c of clauses) for (const p of r.phrases) if (p && (c.title + ' ' + c.body).toLowerCase().includes(p.toLowerCase())) out.push(fail(r, c, `Contains “${p}”.`))
      return out.length ? out : [pass(r, null, 'None found.')]
    }
    case 'liabilityCap': {
      const re = /limitation of liability|liability cap|aggregate liability|total liability|cumulative liability/i
      const heads = clauses.filter(c => re.test(c.title) && c.num)
      const cs = clauses.filter(c => re.test(c.title) || re.test(c.body) || heads.some(h => c.num?.startsWith(h.num + '.')))
      for (const c of cs) {
        const cap = parseCap(c.body)
        if (!cap) continue
        if (cap.months !== undefined && cap.months < r.minMonths) return [fail(r, c, `Cap is fees from ${cap.months} month${cap.months === 1 ? '' : 's'}; playbook minimum is ${r.minMonths}.`)]
        if (cap.amount !== undefined && r.minAmount && cap.amount < r.minAmount) return [fail(r, c, `Cap is ${cap.raw}; playbook minimum is $${r.minAmount.toLocaleString('en-US')}.`)]
        return [pass(r, c, cap.months !== undefined ? `Cap is ${cap.months} months of fees.` : `Cap is ${cap.raw}.`)]
      }
      return [fail(r, cs[0] ?? null, cs.length ? 'Liability clause found but no cap amount could be read.' : 'No limitation of liability clause found.')]
    }
    case 'duration': {
      const re = new RegExp(r.match, 'i')
      for (const c of clauses) for (const s of sentences(c.body)) {
        if (!re.test(s) && !re.test(c.title)) continue
        if (/perpetu|indefinite|in perpetuity/i.test(s) && r.maxMonths !== undefined) return [fail(r, c, `Runs indefinitely; playbook maximum is ${r.maxMonths} months.`)]
        const d = firstDuration(s)
        if (!d) continue
        const m = months(d.days)
        if (r.maxMonths !== undefined && m > r.maxMonths) return [fail(r, c, `${d.raw} exceeds the playbook maximum of ${r.maxMonths} months.`)]
        if (r.minMonths !== undefined && m < r.minMonths) return [fail(r, c, `${d.raw} is below the playbook minimum of ${r.minMonths} months.`)]
        return [pass(r, c, `${d.raw}.`)]
      }
      return [pass(r, null, 'No matching period found.')]
    }
    case 'governingLaw': {
      for (const c of clauses) {
        const law = governingLaw(c.body)
        if (!law) continue
        const ok = r.allowed.some(a => law.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(law.toLowerCase()))
        return [ok ? pass(r, c, `${law} law.`) : fail(r, c, `${law} law is not in the allowed list (${r.allowed.join(', ')}).`)]
      }
      return [fail(r, null, 'No governing law clause found.')]
    }
    case 'paymentDays': {
      for (const c of titleOrBody(clauses, /payment|invoice|fees/i)) {
        const m = c.body.match(/within\s+(\w+(?:-\w+)?)\s*(?:\((\d+)\)\s*)?(?:calendar |business )?days|\bnet[\s-]?(\d+)/i)
        if (!m) continue
        const days = m[3] ? Number(m[3]) : (m[2] ? Number(m[2]) : parseNumber(m[1]))
        if (days === null) continue
        return [days > r.maxDays ? fail(r, c, `Payment due in ${days} days; playbook maximum is ${r.maxDays}.`) : pass(r, c, `Payment due in ${days} days.`)]
      }
      return [pass(r, null, 'No payment period found.')]
    }
    case 'ipScope': {
      const cs = clauses.filter(c => /assign/i.test(c.body) && /intellectual property|work product|deliverables|inventions/i.test(c.body))
      const out: Finding[] = []
      for (const c of cs) {
        const broad = c.body.match(/whether or not (?:related|in connection)|all (?:inventions|ideas|works)[^.]{0,60}(?:during the term|conceived)|(?:pre-?existing|background|prior) (?:intellectual property|IP|technology|materials|tools)[^.]{0,40}(?:assign|transfer)|any and all intellectual property[^.]{0,80}(?:whether|including)/i)
        const carved = /(?:excluding|other than|except|does not include|shall not include)[^.]{0,80}(?:pre-?existing|background|prior)/i.test(c.body)
        if (broad && !carved) out.push(fail(r, c, `Assignment reaches beyond the deliverables (“${broad[0].slice(0, 70)}…”).`))
        else if (!/upon (?:full |final |receipt of )?payment|following payment|after payment/i.test(c.body) && /contractor|freelancer|consultant/i.test(all)) out.push(fail(r, c, 'IP transfers before you are paid; tie assignment to full payment.'))
      }
      return out.length ? out : [pass(r, cs[0] ?? null, cs.length ? 'Limited to the deliverables.' : 'No IP assignment found.')]
    }
    case 'restrictive': {
      const out: Finding[] = []
      for (const c of clauses) {
        const t = c.title + '. ' + c.body
        if (r.forbid.includes('noncompete') && /non-?compet|shall not[^.]{0,140}\b(compete|competitive|competing)\b/i.test(t)) out.push(fail(r, c, 'Non-compete restriction.'))
        else if (r.forbid.includes('nonsolicit') && /non-?solicit|shall not[^.]{0,100}\bsolicit/i.test(t)) out.push(fail(r, c, 'Non-solicitation restriction.'))
      }
      return out.length ? out : [pass(r, null, 'None found.')]
    }
    case 'autoRenewal': {
      const c = clauses.find(c => /automatic(?:ally)? renew|auto-?renew|renews? automatically/i.test(c.body))
      if (!c) return [pass(r, null, 'No automatic renewal.')]
      const m = c.body.match(/(?:at least|no less than|not less than|no later than|minimum of)\s+(\w+(?:-\w+)?)\s*(?:\((\d+)\)\s*)?(?:calendar |business )?days/i)
      const n = m ? (m[2] ? Number(m[2]) : parseNumber(m[1])) : null
      if (n === null) return [fail(r, c, 'Renews automatically with no notice window to opt out.')]
      return [n > r.maxNoticeDays ? fail(r, c, `Renews automatically unless you give ${n} days' notice; playbook maximum is ${r.maxNoticeDays}.`) : pass(r, c, `${n}-day notice window.`)]
    }
    case 'mutual': {
      const mutual = /\b(each|either) party\b[^.]{0,120}\b(disclos|receiv)|\bmutual\b/i.test(all) && !/\bonly (?:the )?\w+(?: \w+)? (?:will|shall|may) disclose|one-way|solely (?:to|by) /i.test(all)
      return [mutual ? pass(r, null, 'Obligations run both ways.') : fail(r, clauses.find(c => /confidential/i.test(c.body)) ?? null, 'Obligations run one way: only one party is protected.')]
    }
  }
}

export function runPlaybook(pb: Playbook, clauses: Clause[]): Finding[] {
  return pb.rules.filter(r => r.enabled).flatMap(r => checkRule(r, clauses))
}

const R = (id: string, name: string, severity: Severity, spec: RuleSpec, fallback: string): Rule => ({ id, name, severity, fallback, enabled: true, ...spec })

export const STARTER_PLAYBOOKS: Playbook[] = [
  {
    id: 'nda-mutual', name: 'Mutual NDA', contractType: 'NDA',
    rules: [
      R('nda-mutual', 'Mutual obligations', 'high', { kind: 'mutual' }, 'Each party may disclose Confidential Information to the other, and each party agrees to the obligations in this Agreement when it is the Receiving Party.'),
      R('nda-term', 'Confidentiality period ≤ 3 years', 'medium', { kind: 'duration', match: 'surviv|confidentiality obligations|period of', maxMonths: 36 }, 'The Receiving Party’s obligations survive for two (2) years after the end of the Term, except for trade secrets, which are protected for as long as they remain trade secrets.'),
      R('nda-law', 'Governing law in allowed list', 'medium', { kind: 'governingLaw', allowed: ['Delaware', 'California', 'New York', 'England and Wales'] }, 'This Agreement is governed by the laws of the State of Delaware, without regard to its conflict of laws rules.'),
      R('nda-exclusions', 'Standard exclusions present', 'high', { kind: 'required', match: 'exclusions|does not include|shall not include|not apply to information' }, 'Confidential Information does not include information that is or becomes public through no fault of the Receiving Party, was already known to it, is independently developed, or is rightfully received from a third party.'),
      R('nda-residuals', 'No residuals clause', 'medium', { kind: 'forbidden', phrases: ['residuals', 'unaided memory'] }, 'Delete the residuals clause.'),
      R('nda-nonsolicit', 'No non-solicit in an NDA', 'low', { kind: 'restrictive', forbid: ['noncompete', 'nonsolicit'] }, 'Delete the restriction; an NDA should not limit hiring or competition.'),
      R('nda-injunction', 'Return or destroy clause', 'low', { kind: 'required', match: 'return or destroy|return of materials|destroy' }, 'On request, the Receiving Party will return or destroy the Discloser’s Confidential Information and confirm this in writing.'),
    ],
  },
  {
    id: 'msa-customer', name: 'MSA / SaaS (customer side)', contractType: 'MSA',
    rules: [
      R('msa-cap', 'Liability cap ≥ 12 months of fees', 'high', { kind: 'liabilityCap', minMonths: 12 }, 'Each party’s total liability will not exceed the fees paid or payable by Customer in the twelve (12) months preceding the event giving rise to the claim.'),
      R('msa-supercap', 'Data breach carve-out', 'high', { kind: 'required', match: 'breach of section \\d+ \\(data protection\\)|does not apply[^.]*(data|security)' }, 'The cap does not apply to a party’s breach of its data protection or confidentiality obligations, which are subject to a separate cap of three (3) times the fees paid in the prior twelve (12) months.'),
      R('msa-renew', 'Auto-renewal notice ≤ 60 days', 'medium', { kind: 'autoRenewal', maxNoticeDays: 60 }, 'Either party may prevent renewal by giving written notice at least thirty (30) days before the end of the then-current term.'),
      R('msa-law', 'Governing law in allowed list', 'medium', { kind: 'governingLaw', allowed: ['Delaware', 'California', 'New York'] }, 'This Agreement is governed by the laws of the State of Delaware.'),
      R('msa-sla', 'Service levels present', 'medium', { kind: 'required', match: 'service level|uptime|availability' }, 'Provider will make the Service available 99.9% of the time each month, measured as set out in the Service Level Agreement, with service credits as the remedy.'),
      R('msa-termination', 'Termination for convenience', 'low', { kind: 'required', match: 'terminat\\w* for convenience|terminate this agreement at any time' }, 'Customer may terminate this Agreement for convenience on thirty (30) days’ written notice and receive a pro-rata refund of prepaid fees.'),
      R('msa-forbidden', 'No unilateral changes', 'high', { kind: 'forbidden', phrases: ['may modify these terms at any time', 'sole discretion to change', 'unilaterally'] }, 'Changes to this Agreement are effective only when signed by both parties.'),
      R('msa-payment', 'Payment terms ≥ 30 days', 'low', { kind: 'paymentDays', maxDays: 90 }, 'Customer will pay undisputed invoices within thirty (30) days of receipt.'),
    ],
  },
  {
    id: 'freelancer', name: 'Freelancer agreement (contractor side)', contractType: 'Services',
    rules: [
      R('fl-pay', 'Payment within 30 days', 'high', { kind: 'paymentDays', maxDays: 30 }, 'Client will pay each invoice within thirty (30) days of receipt. Late amounts accrue interest at 1.5% per month.'),
      R('fl-ip', 'IP assignment limited to deliverables, on payment', 'high', { kind: 'ipScope' }, 'Upon full payment, Contractor assigns to Client all rights in the Deliverables. Contractor keeps its pre-existing materials and general know-how and grants Client a licence to use any of them embedded in the Deliverables.'),
      R('fl-noncompete', 'No non-compete', 'high', { kind: 'restrictive', forbid: ['noncompete'] }, 'Delete the non-compete. Contractor may work for other clients, including in the same industry.'),
      R('fl-nonsolicit', 'No broad non-solicit', 'low', { kind: 'restrictive', forbid: ['nonsolicit'] }, 'Limit non-solicitation to the Client employees Contractor worked with directly, for six (6) months.'),
      R('fl-kill', 'Kill fee / termination payment', 'medium', { kind: 'required', match: 'kill fee|work performed through|pay for all work|termination fee' }, 'If Client terminates early, Client will pay for all work performed through the termination date plus any non-cancellable expenses.'),
      R('fl-law', 'Governing law in allowed list', 'low', { kind: 'governingLaw', allowed: ['California', 'New York', 'Delaware', 'England and Wales'] }, 'This Agreement is governed by the laws of the Contractor’s home state.'),
      R('fl-indemnity', 'No uncapped indemnity', 'medium', { kind: 'forbidden', phrases: ['indemnify, defend and hold harmless client from any and all', 'unlimited liability'] }, 'Contractor’s total liability is capped at the fees paid under this Agreement.'),
    ],
  },
]

export const playbookById = (id: string) => STARTER_PLAYBOOKS.find(p => p.id === id)
export const clonePlaybook = (p: Playbook): Playbook => JSON.parse(JSON.stringify(p))
