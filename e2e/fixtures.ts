import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { Document, LevelFormat, Packer, Paragraph } from 'docx'
import { readFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

// Fonts get an empty stylesheet. Every other outside request, Supabase included, is refused and fails the test.
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

export const test = base.extend<{ external: string[] }>({
  external: async ({}, use) => { await use([]) },
  context: async ({ context, baseURL, external }, use) => {
    const errors: string[] = []
    const origin = new URL(baseURL!).origin
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) return route.continue()
      if (FONT_HOSTS.has(url.host)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      external.push(url.host)
      return route.abort('blockedbyclient')
    })
    context.on('weberror', e => errors.push(String(e.error())))
    await use(context)
    expect(errors, 'uncaught page errors').toEqual([])
    expect(external, 'requests to outside hosts').toEqual([])
  },
})

export { expect }

// ---------- Driving the app ----------

export type Playbook = 'nda-mutual' | 'msa-customer' | 'freelancer'
export type TabName = 'Compare' | 'Issues' | 'Rounds' | 'Terms & refs' | 'Playbook' | 'Versions'

export const dialog = (page: Page) => page.locator('dialog[open]')
export const stat = (page: Page, name: string) => page.locator('.stat', { hasText: new RegExp(`^\\d+${name}$`) }).locator('b')
export const tab = (page: Page, name: TabName) => page.getByRole('navigation', { name: 'Matter sections' }).getByRole('link', { name: new RegExp(`^${name}`) }).click()
export const row = (page: Page, issue: string | RegExp) => page.locator('table.issues tbody tr').filter({ hasText: issue })
/** The compare row whose new-version heading carries this text. */
export const clause = (page: Page, title: string | RegExp) => page.locator('.cmp-row').filter({ has: page.locator('.cell.b h4', { hasText: title }) })

export async function newMatter(page: Page, name = 'Test matter', playbook: Playbook = 'msa-customer') {
  await page.goto('/app')
  await page.getByRole('button', { name: /^(Import your data|New matter)/ }).click()
  await dialog(page).getByLabel('Matter name').fill(name)
  await dialog(page).getByLabel('Playbook').selectOption(playbook)
  await dialog(page).getByRole('button', { name: 'Create and import' }).click()
  await expect(dialog(page)).toContainText('Import v1')
}

export async function confirmVersion(page: Page, n: number) {
  await dialog(page).getByRole('button', { name: 'Add version' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.locator('.page-head')).toContainText(`${n} version${n === 1 ? '' : 's'}`)
}

export async function openImport(page: Page) {
  if (!(await dialog(page).count())) await page.getByRole('button', { name: /^Add version/ }).click()
  await expect(dialog(page)).toContainText('Import v')
}

export async function pasteText(page: Page, text: string) {
  await openImport(page)
  await dialog(page).locator('textarea').fill(text)
  await dialog(page).getByRole('button', { name: 'Check pasted text' }).click()
}

export interface Upload { name: string; mimeType: string; buffer: Buffer }
export async function upload(page: Page, file: Upload) {
  await openImport(page)
  await dialog(page).locator('input[type=file]').setInputFiles(file)
}

/** A matter whose versions are the given pasted texts, in order. Ends on the Compare tab (Issues for one version). */
export async function matter(page: Page, texts: string[], playbook: Playbook = 'msa-customer') {
  await newMatter(page, 'Test matter', playbook)
  for (const [i, t] of texts.entries()) { await pasteText(page, t); await confirmVersion(page, i + 1) }
}

export async function download(page: Page, trigger: Locator): Promise<[string, Buffer]> {
  const [d] = await Promise.all([page.waitForEvent('download'), trigger.click()])
  return [d.suggestedFilename(), await readFile((await d.path())!)]
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [[]]
  for (const m of csv.matchAll(/("(?:[^"]|"")*"|[^,\r\n]*)(,|\r\n|$)/g)) {
    if (!m[0] && m.index === csv.length) break
    rows.at(-1)!.push(m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1])
    if (m[2] === '\r\n') rows.push([])
  }
  return rows.filter(r => r.length)
}

export async function issuesCsv(page: Page) {
  await tab(page, 'Issues')
  const [, buf] = await download(page, page.getByRole('button', { name: 'CSV', exact: true }))
  return parseCsv(buf.toString('utf8'))
}

// ---------- Files ----------

export const textFile = (name: string, body: string | Buffer, mimeType = 'text/plain'): Upload => ({ name, mimeType, buffer: Buffer.from(body as string) })
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Word document. A leading "# " makes an auto-numbered paragraph and "## " a second-level one, all in one list. */
export async function docx(paras: string[], name = 'contract.docx'): Promise<Upload> {
  const doc = new Document({
    numbering: { config: [{ reference: 'n', levels: [0, 1].map(level => ({ level, format: LevelFormat.DECIMAL, text: level ? '%1.%2' : '%1.' })) }] },
    sections: [{ children: paras.map(p => { const m = p.match(/^(#{1,2}) (.*)$/); return m ? new Paragraph({ text: m[2], numbering: { reference: 'n', level: m[1].length - 1 } }) : new Paragraph(p) }) }],
  })
  return { name, mimeType: DOCX, buffer: await Packer.toBuffer(doc) }
}

/** Minimal PDF: one array of lines per page, 11pt Helvetica, 14pt leading. An empty array is a page with no text layer. */
export function pdf(pages: string[][], name = 'contract.pdf'): Upload {
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  pages.forEach((lines, i) => {
    const s = lines.length ? `BT /F1 11 Tf 14 TL 72 740 Td ${lines.map(l => `(${l.replace(/[\\()]/g, '\\$&')}) Tj T*`).join('\n')} ET` : '0.9 g 72 72 400 600 re f'
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${s.length} >>\nstream\n${s}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const at = objs.map((o, i) => { const p = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return p })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(out, 'latin1') }
}

/** One entry of a zip archive, as text. */
export function unzip(buf: Buffer, entry: string): string {
  const end = buf.lastIndexOf(Buffer.from('PK\x05\x06', 'latin1'))
  let at = buf.readUInt32LE(end + 16)
  for (let n = buf.readUInt16LE(end + 10); n > 0; n--) {
    const nameLen = buf.readUInt16LE(at + 28)
    if (buf.toString('utf8', at + 46, at + 46 + nameLen) === entry) {
      const head = buf.readUInt32LE(at + 42)
      const start = head + 30 + buf.readUInt16LE(head + 26) + buf.readUInt16LE(head + 28)
      const raw = buf.subarray(start, start + buf.readUInt32LE(at + 20))
      return (buf.readUInt16LE(at + 10) === 8 ? inflateRawSync(raw) : raw).toString('utf8')
    }
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
  }
  throw new Error(`${entry} is not in the archive`)
}

export interface Run { text: string; kind: 'eq' | 'ins' | 'del' }
/** Text runs of a DOCX redline: double underline is an insertion, strikethrough a deletion. */
export const redlineRuns = (file: Buffer): Run[] => [...unzip(file, 'word/document.xml').matchAll(/<w:r>(.*?)<\/w:r>/gs)].map(m => ({
  text: [...m[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'),
  kind: /<w:strike\/>/.test(m[1]) ? 'del' : /<w:u w:val="double"/.test(m[1]) ? 'ins' : 'eq',
}))

// ---------- The hand-worked pair ----------

/*
 * Base                                 Compared
 * 1 Services  (cites Section 2)        1 Notices                  moved up from 5
 * 2 Payment   30 days                  2 Services                 was 1, same words
 * 3 Insurance                          3 Audit                    new
 * 4 Limitation of Liability 12 months  4 Payment   60 days        was 2, changed
 * 5 Notices                            5 Insurance                was 3, same words
 * 6 Assignment                         6 Limitation  3 months     was 4, changed
 *                                      (Assignment is gone)
 *
 * modified 2 (Payment, Limitation); moved 1 (Notices: every other survivor keeps its order); inserted 1 (Audit);
 * deleted 1 (Assignment); renumbered 5 (all five survivors); unchanged 2 (Services, Insurance: same words, not moved).
 * "Section 2" meant Payment, which is now 4, so the untouched citation is stale.
 * The cap is 3 months of fees and the MSA playbook asks for at least 12, so it fails. 60 payment days is within its 90.
 */
export const HAND_A = `1. Services. Provider will host the claims platform, subject to timely payment under Section 2.
2. Payment. Customer will pay every invoice within thirty (30) days of receipt.
3. Insurance. Provider will keep general cover in force at its own cost throughout.
4. Limitation of Liability. Total liability will not exceed the fees paid in the twelve (12) months before the claim.
5. Notices. Every notice must be written down and sent by courier to the registered address.
6. Assignment. Neither side may transfer this contract unless the other consents first.
`
export const HAND_B = `1. Notices. Every notice must be written down and sent by courier to the registered address.
2. Services. Provider will host the claims platform, subject to timely payment under Section 2.
3. Audit. Customer may inspect security logs once per calendar quarter during business hours.
4. Payment. Customer will pay every invoice within sixty (60) days of receipt.
5. Insurance. Provider will keep general cover in force at its own cost throughout.
6. Limitation of Liability. Total liability will not exceed the fees paid in the three (3) months before the claim.
`
