import { clause, download, expect, HAND_A, HAND_B, issuesCsv, matter, redlineRuns, row, stat, tab, test } from './fixtures.ts'

// Every expectation here follows from the table in fixtures.ts, worked out on paper.
test.describe('hand-worked contract pair', () => {
  test.beforeEach(async ({ page }) => { await matter(page, [HAND_A, HAND_B]) })

  test('counts, moves and renumbering', async ({ page }) => {
    for (const [name, n] of [['modified', 2], ['moved', 1], ['inserted', 1], ['deleted', 1], ['renumbered', 5], ['unchanged', 2]] as const) await expect(stat(page, name)).toHaveText(String(n))
    await expect(clause(page, 'Notices').locator('.badge')).toHaveText(['Moved from § 5'])
    await expect(clause(page, 'Payment').locator('.badge')).toHaveText(['Was § 2', 'thirty (30) days → sixty (60) days'])
    await expect(clause(page, 'Audit').locator('.badge')).toHaveText(['Inserted'])
    await expect(page.locator('.cmp-row.deleted .cell.a')).toContainText('§ 6 Assignment')
    await expect(page.locator('.cmp-row.ghost')).toContainText('↓ moved to § 1')
  })

  test('word diff marks only the words that changed', async ({ page }) => {
    const pay = clause(page, 'Payment')
    await expect(pay.locator('.cell.a del')).toHaveText(['thirty (30']) 
    await expect(pay.locator('.cell.b ins')).toHaveText(['sixty (60'])
    await page.getByRole('radio', { name: 'Redline' }).click()
    const inline = page.locator('.cmp-row', { hasText: '§ 4 Payment' }).locator('p')
    await expect(inline).toHaveText('Customer will pay every invoice within thirty (30sixty (60) days of receipt.')
    await page.getByLabel('Changes only').check()
    // All six new clauses moved, changed or were renumbered; with the deletion and the moved clause's old place that is 8 rows.
    await expect(page.locator('.cmp-row')).toHaveCount(8)
  })

  test('the cap fails, the payment term passes, the citation is stale', async ({ page }) => {
    await tab(page, 'Issues')
    await expect(row(page, 'Liability cap')).toContainText('Cap is fees from 3 months; playbook minimum is 12.')
    await expect(row(page, 'Liability cap')).toContainText('§ 6 Limitation of Liability')
    await expect(row(page, 'Stale reference to Section 2')).toContainText('Section 2 (Payment) is now § 4')
    await expect(row(page, 'Payment terms')).toHaveCount(0)
    await tab(page, 'Terms & refs')
    await expect(page.locator('tr.bad')).toHaveCount(1)
  })

  test('issues CSV carries the same verdicts', async ({ page }) => {
    const rows = await issuesCsv(page)
    expect(rows[0]).toEqual(['Severity', 'Clause', 'Issue', 'Detail', 'Suggested fallback', 'Status'])
    expect(rows.every(r => r.length === 6)).toBe(true)
    const find = (s: string) => rows.find(r => r[2].startsWith(s))!
    expect(find('Liability cap').slice(0, 2)).toEqual(['high', '§ 6 Limitation of Liability'])
    expect(rows.filter(r => r[2] === 'Period changed').map(r => r[3]).sort()).toEqual(['thirty (30) days → sixty (60) days', 'twelve (12) months → three (3) months'])
  })

  test('DOCX redline: dropping deletions gives the new text, dropping insertions the old', async ({ page }) => {
    await tab(page, 'Issues')
    const [name, file] = await download(page, page.getByRole('button', { name: 'DOCX redline' }))
    expect(name).toBe('Test matter redline v1 to v2.docx')
    const runs = redlineRuns(file)
    const i = runs.findIndex(r => r.text.startsWith('§ 4 Payment'))
    const body: typeof runs = []
    for (const r of runs.slice(i + 2)) { body.push(r); if (r.text.endsWith('of receipt.')) break }
    expect(body.filter(r => r.kind !== 'del').map(r => r.text).join('')).toBe('Customer will pay every invoice within sixty (60) days of receipt.')
    expect(body.filter(r => r.kind !== 'ins').map(r => r.text).join('')).toBe('Customer will pay every invoice within thirty (30) days of receipt.')
    expect(runs.find(r => r.text.startsWith('Customer may inspect'))!.kind).toBe('ins')
    expect(runs.find(r => r.text.startsWith('Neither side'))!.kind).toBe('del')
    expect(runs.some(r => r.text === '[§ 5 Notices moved to § 1 Notices]')).toBe(true)
  })

  test('memo and HTML redline', async ({ page }) => {
    await tab(page, 'Issues')
    await page.getByRole('link', { name: 'Memo', exact: true }).click()
    await expect(page.locator('.paper')).toContainText('2 clauses modified, 1 moved, 1 inserted and 1 deleted.')
    await expect(page.locator('.paper')).toContainText('v2 compared against v1')
    await expect(page.locator('.paper')).toContainText('twelve (12) months → three (3) months')
    await page.goBack()
    await page.getByRole('link', { name: 'HTML redline' }).click()
    const pay = page.locator('.redline-doc section', { hasText: 'Payment' }).filter({ hasText: 'invoice' })
    await expect(pay.locator('del')).toHaveText(['thirty (30'])
    await expect(pay.locator('ins')).toHaveText(['sixty (60'])
  })
})
