import { dialog, download, expect, HAND_A, HAND_B, issuesCsv, matter, row, stat, tab, test } from './fixtures.ts'

test('landing page leads to the sample', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Open the app' }).click()
  await page.getByRole('button', { name: /NDA/ }).first().click()
  await expect(page).toHaveURL(/\/app\/p\//)
  await expect(page.locator('.page-head .synthetic')).toHaveText('Synthetic')
  await tab(page, 'Issues')
  // The sample NDA moves governing law to Texas, makes the duties one way and lengthens survival from 2 to 5 years.
  await expect(row(page, 'Governing law')).toContainText('Texas law is not in the allowed list')
  await expect(row(page, 'Mutual obligations')).toContainText('one way')
  await expect(row(page, 'Confidentiality period')).toContainText('five (5) years exceeds the playbook maximum of 36 months')
})

test('a sample opens from its link, and only once', async ({ page }) => {
  await page.goto('/app?sample=msa&tab=rounds')
  await expect(page.locator('table.rounds')).toBeVisible()
  await page.goto('/app?sample=msa')
  await expect(page).toHaveURL(/\/app\/p\//)
  await page.goto('/app')
  await expect(page.locator('.project-card')).toHaveCount(1)
})

test('version pickers swap the comparison', async ({ page }) => {
  await matter(page, [HAND_A, HAND_B])
  await page.getByLabel('Base').selectOption({ label: 'v2' })
  await page.getByLabel('Compared').selectOption({ label: 'v1' })
  // Backwards, the insertion and the deletion trade places and the counts stay 1 and 1.
  await expect(page.locator('.cmp-row.inserted .cell.b')).toContainText('Assignment')
  await expect(page.locator('.cmp-row.deleted .cell.a')).toContainText('Audit')
})

test('conceding, filtering and reopening an issue', async ({ page }) => {
  await matter(page, [HAND_A, HAND_B])
  await tab(page, 'Issues')
  await page.getByRole('radio', { name: /^High/ }).click()
  await expect(page.locator('table.issues .sev-medium')).toHaveCount(0)
  await row(page, 'Liability cap').getByRole('button', { name: 'Concede' }).click()
  await expect(row(page, 'Liability cap')).toHaveClass(/conceded/)
  expect((await issuesCsv(page)).find(r => r[2].startsWith('Liability cap'))![5]).toBe('conceded')
  await page.reload()
  await expect(row(page, 'Liability cap')).toHaveClass(/conceded/)
  await row(page, 'Liability cap').getByRole('button', { name: 'Reopen' }).click()
  await expect(row(page, 'Liability cap')).not.toHaveClass(/conceded/)
})

test('rounds: open, new and resolved, with a note that survives reload', async ({ page }) => {
  // v1 caps at 12 months (passes), v2 at 3 (fails), v3 back at 12 (passes). Texas law only in v2 and v3.
  const law = (s: string) => `7. Governing Law. This Agreement is governed by the laws of the State of ${s}.\n`
  await matter(page, [HAND_A + law('Delaware'), HAND_B + law('Texas'), HAND_B.replace('three (3)', 'twelve (12)') + law('Texas')])
  await tab(page, 'Rounds')
  const r = (s: string) => page.locator('table.rounds tbody tr').filter({ hasText: s })
  await expect(r('Liability cap').locator('.status')).toHaveText('Resolved')
  await expect(r('Governing law').locator('.status')).toHaveText('Open')
  await expect(r('Governing law').locator('.dot.clear')).toHaveCount(1)
  await r('Governing law').locator('input').fill('Traded for the cap')
  await r('Governing law').locator('input').blur()
  await r('Governing law').getByRole('button', { name: 'Concede' }).click()
  await expect(r('Governing law').locator('.status')).toHaveText('Conceded')
  await page.reload()
  await expect(r('Governing law').locator('input')).toHaveValue('Traded for the cap')
  await expect(r('Governing law').locator('.status')).toHaveText('Conceded')
  await tab(page, 'Issues')
  await page.getByRole('link', { name: 'Memo', exact: true }).click()
  await expect(page.locator('.paper')).toContainText('Note: Traded for the cap')
})

test('defined terms: unused, undefined and changed', async ({ page }) => {
  const t = (d: string) => `1. Definitions.\n1.1 "Platform" means ${d}.\n1.2 "Affiliate" means a company under common control.\n2. Use. Customer may use the Platform, and the Support Team will help.\n`
  await matter(page, [t('the hosted claims tool'), t('the hosted claims tool and its archive')])
  await tab(page, 'Terms & refs')
  await expect(page.locator('.findings')).toContainText('“Affiliate” is defined but never used.')
  await expect(page.locator('.findings')).toContainText('“Support Team” is used 1× like a defined term but is never defined.')
  await expect(page.locator('table.compact tr', { hasText: 'Platform' }).locator('.badge')).toHaveText('changed')
})

test('an edited rule changes the verdict and persists', async ({ page }) => {
  await matter(page, [HAND_A, HAND_B])
  await tab(page, 'Playbook')
  await page.getByLabel('Minimum months of fees').fill('3')
  await page.getByRole('button', { name: 'Save rules' }).click()
  await expect(page.locator('.toasts')).toContainText('Playbook saved')
  await page.reload()
  await expect(page.getByLabel('Minimum months of fees')).toHaveValue('3')
  await tab(page, 'Issues')
  // 3 months against a minimum of 3 passes.
  await expect(row(page, 'Stale reference')).toBeVisible()
  await expect(row(page, 'Liability cap')).toHaveCount(0)
  await tab(page, 'Playbook')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByLabel('Minimum months of fees')).toHaveValue('12')
})

test('matter and versions persist; deletes can be undone', async ({ page }) => {
  await matter(page, [HAND_A, HAND_B])
  await page.reload()
  await expect(stat(page, 'modified')).toHaveText('2')
  await tab(page, 'Versions')
  await page.locator('.timeline li').nth(1).getByRole('button', { name: 'Delete' }).click()
  await dialog(page).getByRole('button', { name: 'Delete version' }).click()
  await expect(page.locator('.timeline li')).toHaveCount(1)
  await page.locator('.toasts').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.timeline li')).toHaveCount(2)
  await tab(page, 'Compare')
  await expect(stat(page, 'modified')).toHaveText('2')
  await page.goto('/app')
  await page.locator('.project-card').getByRole('button', { name: 'Delete' }).click()
  await dialog(page).getByRole('button', { name: 'Delete matter' }).click()
  await expect(page.locator('.project-card')).toHaveCount(0)
  await page.locator('.toasts').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.project-card')).toHaveCount(1)
  await page.reload()
  await page.getByRole('link', { name: 'Test matter' }).click()
  await expect(stat(page, 'modified')).toHaveText('2')
})

test('JSON backup holds the matter, its text and no account data', async ({ page }) => {
  await matter(page, [HAND_A, HAND_B])
  await page.goto('/settings')
  const [name, body] = await download(page, page.getByRole('button', { name: 'Export all my data (JSON)' }))
  expect(name).toMatch(/^redline-desk-export-\d{4}-\d\d-\d\d\.json$/)
  const data = JSON.parse(body.toString('utf8'))
  expect(data.projects).toHaveLength(1)
  expect(Object.values(data.projects[0].dataset)).toEqual([HAND_A, HAND_B])
  expect(body.toString('utf8')).not.toMatch(/auth-token|password|access_token/)
})

test('settings persist and appear on the memo', async ({ page }) => {
  await page.goto('/settings')
  await page.getByLabel('Reviewer name (on memos)').fill('A. Reviewer')
  await page.getByLabel('Reviewer name (on memos)').blur()
  await page.getByRole('radio', { name: 'Ivory (light)' }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light')
  await matter(page, [HAND_A, HAND_B])
  await page.getByRole('link', { name: /^Issues memo/ }).click()
  await expect(page.locator('.paper-head')).toContainText('by A. Reviewer')
})

test('HTML in a contract is shown, never run', async ({ page }) => {
  const evil = '<img src=x onerror="window.__ran=1"><script>window.__ran=1</script>'
  await matter(page, [HAND_A, HAND_B.replace('during business hours', evil)])
  await expect(page.locator('.cmp')).toContainText('onerror')
  await tab(page, 'Issues')
  await page.getByRole('link', { name: 'HTML redline' }).click()
  await expect(page.locator('.redline-doc')).toContainText('onerror')
  expect(await page.evaluate(() => (window as unknown as { __ran?: number }).__ran)).toBeUndefined()
  await expect(page.locator('.redline-doc img, .redline-doc script')).toHaveCount(0)
})

test('keyboard, docs, privacy, unknown routes and phone width', async ({ page }) => {
  await matter(page, [HAND_A, HAND_B])
  await page.keyboard.press('2')
  await expect(page.locator('table.issues')).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.locator('.paper')).toBeVisible()
  for (const path of ['/docs', '/privacy']) { await page.goto(path); await expect(page.getByRole('heading', { level: 1 })).toBeVisible() }
  await page.goto('/app/p/not-a-matter')
  await expect(page.getByText('This clause does not exist')).toBeVisible()
  await page.goto('/nowhere')
  await expect(page.getByText('This clause does not exist')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/app', '/docs', '/settings']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390)
  }
})
