// Playbook rules: user-editable checks per contract type, each with a severity and fallback language.
import { durationDays, moneyValue, NUMBER, parseNumber, PERIOD, RE_MONEY } from './quant.ts'
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
const RE_PERIOD = new RegExp(PERIOD, 'gi')
const firstDuration = (s: string): { months: number; raw: string } | null => {
  for (const m of s.matchAll(RE_PERIOD)) {
    const d = durationDays(m[1], m[2], m[3])
    if (d === null || /^week/i.test(m[3])) continue
    const n = parseNumber(m[2] ?? m[1])!
    return { months: /^month/i.test(m[3]) ? n : /^year/i.test(m[3]) ? n * 12 : Math.round(d / 30.4), raw: m[0] }
  }
  return null
}
/** User-typed patterns: fall back to a literal match if the regular expression is invalid. */
const userRe = (src: string) => { try { return new RegExp(src, 'i') } catch { return new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }

const FEE_MONTHS: Record<string, number> = { annual: 12, yearly: 12, quarterly: 3, monthly: 1 }

/**
 * Parses a liability cap: months of fees, a multiple of the fees of a period, or a fixed amount.
 * A "lesser of" cap carries both arms, because either one may be the limit.
 */
export function parseCap(text: string): { months?: number; amount?: number; raw: string } | null {
  const money = text.match(new RegExp(RE_MONEY.source, 'i'))
  const fees = feeCap(text)
  if (fees && money && /\b(?:lesser|lower|smaller|least) of\b|\bwhichever is (?:the )?(?:less|lesser|lower|smaller)\b/i.test(text)) return { ...fees, amount: moneyValue(money[0]), raw: money[0] }
  return fees ?? (money ? { amount: moneyValue(money[0]), raw: money[0] } : null)
}

function feeCap(text: string): { months: number; raw: string } | null {
  const mult = text.match(/\b(\d+(?:\.\d+)?|[a-z]+)\s*(?:\((\d+(?:\.\d+)?)\)\s*)?(?:times|x)\s+(?:the\s+)?(?:total\s+|aggregate\s+)?(?:(annual|yearly|quarterly|monthly)\s+)?(?:fees|amounts)/i)
  const n = mult ? (mult[2] ? Number(mult[2]) : parseNumber(mult[1])) : null
  if (mult && n !== null) {
    const rest = text.slice(mult.index! + mult[0].length).split(/[.;]/)[0]
    // "two times the fees paid in the three (3) months before the claim" is six months of fees, not two years.
    const span = rest.match(/\b(?:in|during|for|over|within)\s+(?:the|each|any|a)\s+(.{0,80})/i)
    const per = mult[3] ? FEE_MONTHS[mult[3].toLowerCase()] : span ? firstDuration(span[1])?.months : undefined
    if (per !== undefined) return { months: n * per, raw: mult[0] }
    // No period means annual fees; a period that cannot be read must not be taken for a year.
    if (!span || !/\b(?:days?|weeks?|months?|quarters?|half|period)\b/i.test(span[1])) return { months: n * 12, raw: mult[0] }
    return /\byears?\b/i.test(span[1]) ? { months: n * 12, raw: mult[0] } : null
  }
  const fees = text.search(/\b(fees|amounts)\b[^.]{0,80}\b(paid|payable)/i)
  if (fees < 0) return null
  const d = firstDuration(text.slice(fees, fees + 220))
  return d ? { months: d.months, raw: text.slice(fees, fees + 220).split(/[.;]/)[0] } : null
}

interface Term { days: number; raw: string }
/** A period as calendar days, rounded up, because a business day is longer than a day. */
const term = (num: string, paren: string | undefined, unit: string, raw: string): Term | null => {
  const d = durationDays(num, paren, unit)
  return d === null ? null : { days: Math.ceil(d), raw: raw.replace(/\s+/g, ' ').trim() }
}
const plainDays = (t: Term) => /\bcalendar days?$|(?<!business |working |banking )\bdays?$/i.test(t.raw)
const saidAs = (t: Term) => plainDays(t) ? `${t.days} days` : `${t.raw} (about ${t.days} days)`

const RE_NOTICE = [
  // "at least ninety (90) days' prior notice", "three months before the end of the term"; then any day count after "at least".
  new RegExp(String.raw`(?:at least|(?:no|not) less than|(?:no|not) later than|minimum of)\s+${PERIOD}['’]?\s+(?:(?!unless|if|and|or|but)\w+\s+){0,3}?(?:notice|before|prior|in advance)\b`, 'i'),
  new RegExp(String.raw`(?:at least|(?:no|not) less than|(?:no|not) later than|minimum of)\s+\b(${NUMBER})[\s-]*(?:\((${NUMBER})\)[\s-]*)?((?:(?:business|working|banking|calendar)\s+)?days?\b)`, 'i'),
  new RegExp(String.raw`${PERIOD}['’]?\s+(?:before|prior to)\b[^.;]{0,40}\b(?:end|expir\w*|renew\w*|anniversary)`, 'i'),
]
function noticeTerm(s: string): Term | null {
  for (const re of RE_NOTICE) {
    const m = s.match(re)
    const t = m && term(m[1], m[2], m[3], m[0].match(new RegExp(PERIOD, 'i'))![0])
    if (t) return t
  }
  return null
}

const PAY_PATTERNS = [
  new RegExp(String.raw`\b(?:within|in|(?:no|not) (?:later|more) than)\s+(?:a (?:period|maximum) of\s+)?(?=${PERIOD})`, 'gi'),
  new RegExp(String.raw`(?=${PERIOD}['’]?\s+(?:net\b|(?:after|from|following|of)\b))`, 'gi'),
  new RegExp(String.raw`\b(?:payment|credit) (?:terms?|period)\b[^.;]{0,30}?(?=${PERIOD})`, 'gi'),
]
const RE_NET = new RegExp(String.raw`\bnet[\s-]?(${NUMBER})(?:\s*\((${NUMBER})\))?(?![\w%])`, 'i')
function payTerm(s: string): Term | null {
  const found: { at: number; t: Term }[] = []
  for (const re of PAY_PATTERNS) for (const m of s.matchAll(re)) {
    const at = m.index! + m[0].length, p = s.slice(at).match(new RegExp(`^${PERIOD}`, 'i'))
    // "fees paid in twelve (12) months before the claim" looks back; it is not when payment is due.
    if (!p || /^\s*(?:period\s+)?(?:immediately\s+)?(?:before|preceding|prior)\b/i.test(s.slice(at + p[0].length))) continue
    const t = term(p[1], p[2], p[3], p[0])
    if (t) found.push({ at, t })
  }
  const net = s.match(RE_NET), n = net && parseNumber(net[2] ?? net[1])
  if (net && n !== null) found.push({ at: net.index!, t: { days: n!, raw: `${n} days` } })
  return found.sort((x, y) => x.at - y.at)[0]?.t ?? null
}
const RE_PAY = /\b(?:pay|pays|paid|payable|payments?|due|invoices?|remit\w*|net)\b/i
const RE_SIDE = /\b(?:liabilit|refund|reimburs|disput|suspen|terminat|interest|late\b|overdue)/i
const RE_PAY_NOW = /\b(?:pay|pays|payable|due|payment)\b[^.;]{0,60}\b(?:(?:up)?on (?:receipt|demand|signing|signature|execution|delivery|completion)|immediately|in advance)\b/i
const RE_MUST_PAY = /\b(?:will|shall|must|agrees? to)\s+(?:promptly\s+)?pay\b|\bpays\b|\binvoices?\b[^.]*\b(?:due|payable)\b/i
const RE_OTHER_FEES = /\b(?:attorney|legal|lawyer|counsel|court|filing|termination|cancellation|kill)\w*['’]?s?['’]?\s+fees?/i

export function governingLaw(text: string): string | null {
  const m = text.match(/governed by(?:,? and (?:construed|interpreted) in accordance with,?)? the (?:internal )?laws? of (?:the )?(?:State of |Commonwealth of |Province of )?([A-Z][A-Za-z'’]+(?:(?: and | of | )[A-Z][A-Za-z'’]+){0,4})/)
  return m ? m[1].trim() : null
}

const COUNTRY = /^(?:u\.?s\.?a?\.?|united states(?: of america)?|canada)$/
/** "State of Delaware" -> delaware; "England" and "England and Wales" are one jurisdiction. Whole names only: Kansas is not Arkansas. */
function jurisdictions(name: string): string[] {
  const one = (s: string) => {
    const t = s.replace(/^(?:the |state of |commonwealth of |province of )+/, '').replace(/ (?:laws?|city|county|u\.?s\.?a?\.?|united states(?: of america)?|canada|sar|special administrative region)$/, '').trim()
    if (/^(?:england|wales)$/.test(t)) return 'england and wales'
    if (t === "people's republic of china" || t === 'prc') return 'china'
    return t === 'republic of china' ? 'taiwan' : t.replace(/^(?:republic|kingdom) of /, '')
  }
  const parts = name.toLowerCase().replace(/’/g, "'").replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(/ and |, /).map(one).filter(Boolean)
  // "Ontario and Canada": the province decides.
  const local = parts.filter(x => !COUNTRY.test(x))
  return local.length ? local : parts
}

/** A capitalised placeholder such as "the General Cap Amount" whose value lives on a cover page or order form. */
const placeholder = (text: string, key: string) => text.match(new RegExp(`\\b[Tt]he ((?:[A-Z][A-Za-z-]+ ){0,4}(?:${key}))\\b`))?.[1] ?? null
const elsewhere = (term: string) => `set by “${term}”, which is filled in outside this text (cover page or order form)`

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
      const re = userRe(r.match)
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
      const underHead = (c: Clause) => re.test(c.title) || heads.some(h => c.num?.startsWith(h.num + '.') || c.num?.startsWith(h.num + '('))
      // Clauses in the liability section first; a body that merely cites "Limitation of Liability" comes last.
      const cs = [...clauses.filter(underHead), ...clauses.filter(c => !underHead(c) && re.test(c.body))]
      for (const c of cs) {
        const cap = parseCap(c.body)
        if (!cap) continue
        if (cap.months !== undefined && cap.months < r.minMonths) return [fail(r, c, `Cap is fees from ${cap.months} month${cap.months === 1 ? '' : 's'}; playbook minimum is ${r.minMonths}.`)]
        if (cap.amount !== undefined) {
          if (r.minAmount) { if (cap.amount < r.minAmount) return [fail(r, c, `Cap is ${cap.raw}; playbook minimum is $${r.minAmount.toLocaleString('en-US')}.`)] }
          else if (r.minMonths > 0) return [fail(r, c, `Cap is ${cap.months !== undefined ? 'the lesser of fees and ' : ''}${cap.raw}, a fixed amount that cannot be compared with ${r.minMonths} months of fees. Set a minimum amount in this rule to check it.`)]
        }
        return [pass(r, c, cap.months !== undefined ? `Cap is ${cap.months} months of fees.` : `Cap is ${cap.raw}.`)]
      }
      const ph = cs.map(c => [c, placeholder(c.body, 'Cap Amount|Cap|Liability Amount|Liability Cap')] as const).find(x => x[1])
      if (ph) return [fail(r, ph[0], `Cap is ${elsewhere(ph[1]!)}. Check it is at least ${r.minMonths} months of fees.`)]
      return [fail(r, cs[0] ?? null, cs.length ? 'Liability clause found but no cap amount could be read.' : 'No limitation of liability clause found.')]
    }
    case 'duration': {
      const re = userRe(r.match)
      for (const c of clauses) for (const s of sentences(c.body)) {
        if (!re.test(s) && !re.test(c.title)) continue
        if (/perpetu|indefinite|in perpetuity/i.test(s) && r.maxMonths !== undefined) return [fail(r, c, `Runs indefinitely; playbook maximum is ${r.maxMonths} months.`)]
        const d = firstDuration(s)
        if (!d) continue
        const m = d.months
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
        if (/^(?:Governing Law|Applicable Law|Jurisdiction)\b/.test(law)) return [fail(r, c, `Governing law is ${elsewhere(law)}. Confirm it is one of: ${r.allowed.join(', ')}.`)]
        const allowed = new Set(r.allowed.flatMap(jurisdictions))
        const ok = jurisdictions(law).every(j => allowed.has(j))
        return [ok ? pass(r, c, `${law} law.`) : fail(r, c, `${law} law is not in the allowed list (${r.allowed.join(', ')}).`)]
      }
      const gl = titleOrBody(clauses, /governing law|governed by/i)[0]
      const ph = gl && placeholder(gl.body, 'Law')
      if (ph) return [fail(r, gl, `Governing law is ${elsewhere(ph)}. Confirm it is one of: ${r.allowed.join(', ')}.`)]
      return [fail(r, gl ?? null, gl ? 'Governing law clause found but no jurisdiction could be read.' : 'No governing law clause found.')]
    }
    case 'paymentDays': {
      const titled = clauses.filter(c => /payment|invoic|fees/i.test(c.title) && !RE_OTHER_FEES.test(c.title))
      const rest = clauses.filter(c => !titled.includes(c) && /payment|invoice|fees/i.test(c.body))
      const verdict = (c: Clause, t: Term) => t.days > r.maxDays ? fail(r, c, `Payment due in ${saidAs(t)}; playbook maximum is ${r.maxDays}.`) : pass(r, c, `Payment due in ${saidAs(t)}.`)
      const first = (cs: Clause[], ok: (s: string) => boolean) => {
        for (const c of cs) for (const s of sentences(c.body)) { const t = ok(s) ? payTerm(s) : null; if (t) return verdict(c, t) }
        return null
      }
      // The sentence about paying comes before ones about refunds, disputes or late interest.
      const main = (s: string) => RE_PAY.test(s) && !RE_SIDE.test(s)
      const found = first(titled, main) ?? first(rest, main)
      if (found) return [found]
      const now = [...titled, ...rest].find(c => RE_PAY_NOW.test(c.body) && !RE_OTHER_FEES.test(c.body))
      if (now) return [pass(r, now, 'Payment due at once.')]
      const other = first(titled, s => RE_PAY.test(s)) ?? first(titled, () => true) ?? (titled.length ? null : first(rest, s => RE_PAY.test(s)))
      if (other) return [other]
      const clause = titled[0] ?? rest.find(c => RE_MUST_PAY.test(c.body) && !RE_OTHER_FEES.test(c.body))
      const ph = clause && placeholder(clause.body, 'Payment Period|Payment Terms?|Due Date')
      if (ph) return [fail(r, clause, `The payment period is ${elsewhere(ph)}. Check it is no more than ${r.maxDays} days.`)]
      return [clause ? fail(r, clause, 'Payment clause found but no payment period could be read.') : pass(r, null, 'No payment period found.')]
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
      const t = noticeTerm(c.body)
      const ph = t === null && placeholder(c.body, 'Notice Date|Notice Period|Renewal Date')
      if (ph) return [fail(r, c, `Renews automatically; the opt-out deadline is ${elsewhere(ph)}. Check it is no more than ${r.maxNoticeDays} days before renewal.`)]
      if (t === null) return [fail(r, c, 'Renews automatically with no notice window to opt out.')]
      return [t.days > r.maxNoticeDays ? fail(r, c, `Renews automatically unless you give ${plainDays(t) ? `${t.days} days'` : saidAs(t)} notice; playbook maximum is ${r.maxNoticeDays}.`) : pass(r, c, plainDays(t) ? `${t.days}-day notice window.` : `Notice window of ${saidAs(t)}.`)]
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
