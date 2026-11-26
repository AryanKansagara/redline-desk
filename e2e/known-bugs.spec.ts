import type { Page } from '@playwright/test'
import { clause, confirmVersion, dialog, docx, download, expect, issuesCsv, matter, newMatter, openImport, pasteText, pdf, row, stat, tab, test, textFile, upload } from './fixtures.ts'

// Each test states the behaviour an open issue asks for. `test.fail` is removed by the pull request that fixes it.
const soon = { timeout: 10_000 }
const other = '\n2. Other. Nothing in this clause changes at all.\n'
const badges = (page: Page, title: string) => clause(page, title).locator('.badge.num')
const ready = (page: Page) => expect(page.locator('.cmp')).toBeVisible()
const issuesReady = async (page: Page) => { await tab(page, 'Issues'); await expect(page.locator('table.issues')).toBeVisible() }

test('#2 amounts: unseparated digits, unit words and currency', async ({ page }) => {
  test.fail()
  const t = (a: string, b: string, c: string) => `1. Fees. Customer pays ${a} each year, plus ${b} on signing and ${c} on exit.${other}`
  await matter(page, [t('$50000', '$5 Million', '$100'), t('$50090', '$5 Thousand', '€100')])
  await ready(page)
  await expect(badges(page, 'Fees')).toHaveText(['$50000 → $50090', '$5 Million → $5 Thousand', '$100 → €100'], soon)
})

test('#3 a capitalisation-only edit is a change', async ({ page }) => {
  test.fail()
  const t = (s: string) => `1. Use. Receiver will protect all ${s}.${other}`
  await matter(page, [t('Confidential Information'), t('confidential information')])
  await ready(page)
  await expect(stat(page, 'modified')).toHaveText('1', soon)
  await expect(clause(page, 'Use').locator('ins')).toHaveText(['confidential information'], soon)
})

test('#4 a new clause at the cited number does not hide a stale reference', async ({ page }) => {
  const body = (n: number) => `${n}. Liability. Each party caps its liability at the yearly fees.\n${n + 1}. Insurance. Provider keeps cover in force at all times.\n${n + 2}. Remedies. See Section 1 for the limit that applies here.\n`
  await matter(page, [body(1), '1. Audit. Customer may inspect the books once every year.\n' + body(2)])
  await issuesReady(page)
  await expect(row(page, 'Stale reference to Section 1')).toContainText('Section 1 (Liability) is now § 2', soon)
})

test('#5 the cap rule reads multiples of a period and does not pass a bare amount', async ({ page }) => {
  test.fail()
  const t = (s: string) => `1. Limitation of Liability. Total liability will not exceed ${s}.${other}`
  await matter(page, [t('two (2) times the fees paid in the three (3) months before the claim'), t('$100')])
  await tab(page, 'Rounds')
  const cap = page.locator('table.rounds tbody tr').filter({ hasText: 'Liability cap' })
  await expect(page.locator('table.rounds tbody tr').first()).toBeVisible()
  // 2 x 3 = 6 months is under 12; a fixed $100 cannot be compared with months.
  await expect(cap.locator('.dot.sev-high')).toHaveCount(2, soon)
})

const WRAPPED = ['1. Term. The agreement ends as set out in', 'Section 5 of this Agreement and the fees under Sections 3.1 and', '3.2 shall apply.', '2. Fees. Customer pays.']
test('#6 wrapped reference lines stay in their clause (pasted)', async ({ page }) => {
  test.fail()
  await newMatter(page)
  await pasteText(page, WRAPPED.join('\n'))
  await expect(dialog(page).locator('.outline li').first()).toBeVisible()
  await expect(dialog(page).locator('.outline li b')).toHaveText(['§ 1 Term', '§ 2 Fees'], soon)
})

test('#6 wrapped reference lines stay in their clause (PDF)', async ({ page }) => {
  test.fail()
  await newMatter(page)
  await upload(page, pdf([WRAPPED]))
  await expect(dialog(page).locator('.outline li').first()).toBeVisible()
  await expect(dialog(page).locator('.outline li b')).toHaveText(['§ 1 Term', '§ 2 Fees'], soon)
})

test('#7 a deleted version leaves no text behind', async ({ page }) => {
  test.fail()
  await matter(page, [`1. One. Kept words stay here.${other}`, `1. One. Removed secret words.${other}`])
  await tab(page, 'Versions')
  await page.locator('.timeline li').nth(1).getByRole('button', { name: 'Delete' }).click()
  await dialog(page).getByRole('button', { name: 'Delete version' }).click()
  await expect(page.locator('.timeline li')).toHaveCount(1)
  await page.goto('/settings')
  const [, body] = await download(page, page.getByRole('button', { name: 'Export all my data (JSON)' }))
  expect(body.toString('utf8')).toContain('Kept words')
  expect(body.toString('utf8')).not.toContain('Removed secret words')
})

test('#8 an unfixed stale reference stays open in later rounds', async ({ page }) => {
  test.fail()
  const L = 'Liability. Each party caps its liability at the yearly fees.', I = 'Insurance. Provider keeps cover in force at all times.'
  const t = (a: string, b: string) => `1. ${a}\n2. ${b}\n3. Remedies. See Section 1 for the limit that applies here.\n`
  await matter(page, [t(L, I), t(I, L), t(I, L)])
  await tab(page, 'Rounds')
  const r = page.locator('table.rounds tbody tr').filter({ hasText: 'Stale reference to Section 1' })
  await expect(r).toBeVisible()
  await expect(r.locator('.status')).toHaveText('Open', soon)
})

test('#9 PDF pages without text are named in the review', async ({ page }) => {
  test.fail()
  await newMatter(page)
  await upload(page, pdf([['1. Services. Provider hosts.'], [], ['2. Payment. Customer pays.']]))
  await expect(dialog(page).locator('.outline li').first()).toBeVisible()
  await expect(dialog(page)).toContainText(/page 2/i, soon)
})

test('#10 one Word list keeps counting across paragraphs', async ({ page }) => {
  test.fail()
  await newMatter(page)
  await upload(page, await docx(['# Services. Provider hosts.', 'An ordinary paragraph.', '# Payment. Customer pays.']))
  await expect(dialog(page).locator('.outline li').first()).toBeVisible()
  await expect(dialog(page).locator('.outline li b')).toHaveText(['§ 1 Services', '§ 2 Payment'], soon)
})

test('#11 statutes are not references; lower-case clause references are', async ({ page }) => {
  test.fail()
  const t = `1. Release. A release under Section 1542 of the California Civil Code, Section 365(n) of the Bankruptcy Code and Article 28 of the GDPR.\n2. Term. Ends as set out in clause 9.9 of this deed.\n`
  await matter(page, [t, t])
  await tab(page, 'Terms & refs')
  await expect(page.getByRole('heading', { name: 'Cross-references' })).toBeVisible()
  await expect(page.locator('tr.bad')).toHaveCount(1, soon)
  await expect(page.locator('tr.bad')).toContainText('9.9', soon)
})

test('#12 contract text never becomes a CSV formula', async ({ page }) => {
  test.fail()
  const t = (s: string) => `1. Def. ${s} (the "Widget").\n2. Use. Customer uses the Widget daily.\n`
  await matter(page, [t('=HYPERLINK(A1)'), t('Another thing')])
  const rows = await issuesCsv(page)
  expect(rows.some(r => r.join().includes('HYPERLINK'))).toBe(true)
  for (const c of rows.flat()) expect(c).not.toMatch(/^[=+@\t\r-]/)
})

test('#13 a written-out 120-day payment term fails a 30-day rule', async ({ page }) => {
  test.fail()
  await matter(page, [`1. Payment. Customer will pay within one hundred twenty (120) days of invoice.${other}`], 'freelancer')
  await issuesReady(page)
  await expect(row(page, 'Payment within 30 days')).toContainText('120', soon)
})

test('#13 hyphenated periods are compared', async ({ page }) => {
  test.fail()
  const t = (s: string) => `1. Term. This contract runs for a ${s} period from signing.${other}`
  await matter(page, [t('12-month'), t('6-month')])
  await ready(page)
  await expect(badges(page, 'Term')).toHaveCount(1, soon)
})

test('#14 RTF is refused', async ({ page }) => {
  test.fail()
  await newMatter(page)
  await upload(page, textFile('a.rtf', '{\\rtf1\\ansi 1. Services. Hosts.\\par\n2. Payment. Pays.\\par}', 'application/rtf'))
  await expect(dialog(page).getByRole('alert')).toContainText(/docx/i, soon)
})

test('#14 Windows-1252 quotes survive', async ({ page }) => {
  test.fail()
  await newMatter(page)
  await upload(page, textFile('a.txt', Buffer.from('1. Defs. \x93Fees\x94 means sums due.\r\n2. Pay. Customer pays the Fees.\r\n', 'latin1')))
  await expect(dialog(page).locator('.outline li').first()).toBeVisible()
  await expect(dialog(page).locator('.outline')).toContainText('“Fees” means', soon)
})

test('#15 the HTML redline marks a changed title', async ({ page }) => {
  test.fail()
  const t = (s: string) => `1. ${s}. Provider grants Customer a right to use the platform.${other}`
  await matter(page, [t('Exclusive Licence'), t('Licence')])
  await tab(page, 'Issues')
  await page.getByRole('link', { name: 'HTML redline' }).click()
  await expect(page.locator('.redline-doc section').first()).toBeVisible()
  await expect(page.locator('.redline-doc')).toContainText('Exclusive Licence', soon)
})

test('#16 Kansas law is not Arkansas law', async ({ page }) => {
  test.fail()
  await newMatter(page)
  await page.keyboard.press('Escape')
  await tab(page, 'Playbook')
  await page.getByLabel('Allowed (comma separated)').fill('Arkansas')
  await page.getByRole('button', { name: 'Save rules' }).click()
  await expect(page.locator('.toasts')).toContainText('Playbook saved')
  await openImport(page)
  await pasteText(page, `1. Governing Law. This Agreement is governed by the laws of the State of Kansas.${other}`)
  await confirmVersion(page, 1)
  await issuesReady(page)
  await expect(row(page, 'Governing law')).toContainText('Kansas law is not in the allowed list', soon)
})

test('#17 “will not compete” is a non-compete', async ({ page }) => {
  test.fail()
  await matter(page, [`1. Conduct. Contractor will not compete with Client for one year.${other}`], 'freelancer')
  await issuesReady(page)
  await expect(row(page, 'No non-compete')).toContainText('Non-compete restriction', soon)
})

test('#18 a concession does not cover a different forbidden phrase', async ({ page }) => {
  test.fail()
  const t = (s: string) => `1. Memory. Receiver may use ${s} freely.${other}`
  await matter(page, [t('residuals')], 'nda-mutual')
  await issuesReady(page)
  await row(page, 'No residuals clause').getByRole('button', { name: 'Concede' }).click()
  await expect(row(page, 'No residuals clause')).toHaveClass(/conceded/)
  await pasteText(page, t('its unaided memory'))
  await confirmVersion(page, 2)
  await issuesReady(page)
  await expect(row(page, 'unaided memory').first()).toBeVisible()
  await expect(row(page, 'unaided memory')).not.toHaveClass(/conceded/, soon)
})
