import { Document, HeadingLevel, LevelFormat, Packer, Paragraph } from 'docx'
import { clause, confirmVersion, dialog, DOCX, docx, download, expect, newMatter, pasteText, pdf, stat, tab, test, textFile, upload, type Upload } from './fixtures.ts'

const outline = (page: import('@playwright/test').Page) => dialog(page).locator('.outline li b')
const P1 = ['1. Services. Provider hosts the platform.', '2. Payment. Customer pays in thirty (30) days.']
const P2 = ['3. Liability. The cap is fees paid in twelve (12) months.', '4. Notices. Send by courier.']

test('DOCX: auto-numbering is rebuilt and the version compares', async ({ page }) => {
  await newMatter(page)
  await upload(page, await docx(['# Services', '## Hosting. Provider hosts the platform.', '## Support. Provider answers tickets.', '# Payment. Customer pays in thirty (30) days.']))
  await expect(outline(page)).toHaveText(['§ 1 Services', '§ 1.1 Hosting', '§ 1.2 Support', '§ 2 Payment'])
  await expect(dialog(page)).toContainText('Numbering is consistent')
  await confirmVersion(page, 1)
  await upload(page, await docx(['# Services', '## Hosting. Provider hosts the platform.', '## Support. Provider answers tickets.', '# Payment. Customer pays in forty-five (45) days.'], 'v2.docx'))
  await confirmVersion(page, 2)
  await expect(stat(page, 'modified')).toHaveText('1')
  await expect(clause(page, 'Payment').locator('.badge')).toHaveText(['thirty (30) days → forty-five (45) days'])
})

const level = (n: number, text: string, format: (typeof LevelFormat)[keyof typeof LevelFormat] = LevelFormat.DECIMAL) => ({ level: n, format, text })
const word = async (children: Paragraph[]): Promise<Upload> => ({ name: 'lists.docx', mimeType: DOCX, buffer: await Packer.toBuffer(new Document({
  numbering: { config: [
    { reference: 'main', levels: [level(0, '%1.'), level(1, '%1.%2'), level(2, '(%3)', LevelFormat.LOWER_LETTER)] },
    { reference: 'other', levels: [level(0, '%1.')] },
  ] },
  sections: [{ children }],
})) })
const item = (text: string, depth = 0, reference = 'main', instance = 0) => new Paragraph({ text, numbering: { reference, level: depth, instance } })

test('DOCX: numbered headings and nested items share their list, across headings and paragraphs', async ({ page }) => {
  await newMatter(page)
  const h = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, numbering: { reference: 'main', level: 0 } })
  await upload(page, await word([h('Services'), item('Hosting. Provider hosts.', 1), new Paragraph('An ordinary paragraph.'), item('first thing here', 2), new Paragraph('Another paragraph.'), item('second thing here', 2), item('Support. Provider answers.', 1), h('Payment'), item('Fees. Customer pays.', 1)]))
  await expect(outline(page)).toHaveText(['§ 1 Services', '§ 1.1 Hosting', '§ 1.1(a)', '§ 1.1(b)', '§ 1.2 Support', '§ 2 Payment', '§ 2.1 Fees'])
})

test('DOCX: a different list, or a restarted one, starts again', async ({ page }) => {
  await newMatter(page)
  await upload(page, await word([item('Services. Hosts.'), item('Payment. Pays.'), new Paragraph('Further terms'), item('Scope. Hosting.', 0, 'other'), new Paragraph('More'), item('Extent. All of it.', 0, 'other'), new Paragraph('Annex'), item('Again. From the top.', 0, 'other', 1), item('Term. One year.')]))
  await expect(outline(page)).toHaveText(['§ 1 Services', '§ 2 Payment', '§ 1 Scope', '§ 2 Extent', '§ 1 Again', '§ 3 Term'])
})

test('PDF: lines become clauses, page numbers are dropped', async ({ page }) => {
  await newMatter(page)
  await upload(page, pdf([[...P1, 'Page 1 of 2'], P2]))
  await expect(dialog(page).locator('.report-grid')).toContainText('PDF')
  await expect(outline(page)).toHaveText(['§ 1 Services', '§ 2 Payment', '§ 3 Liability', '§ 4 Notices'])
  await expect(dialog(page)).not.toContainText('Page 1')
})

test('Markdown: nested lists are renumbered and emphasis is stripped', async ({ page }) => {
  await newMatter(page)
  await upload(page, textFile('csa.md', '# Terms\n\n1. **Services**.\n    1. **Access.** Provider hosts.\n    2. **Support.** Provider answers.\n2. **Payment.** Customer pays.\n'))
  await expect(outline(page)).toHaveText(['Terms', '§ 1 Services', '§ 1.1 Access', '§ 1.2 Support', '§ 2 Payment'])
  await expect(dialog(page)).not.toContainText('**')
})

test('text: a BOM and CRLF do not change the result', async ({ page }) => {
  await newMatter(page)
  await upload(page, textFile('a.txt', [...P1, ...P2].join('\n')))
  await confirmVersion(page, 1)
  await upload(page, textFile('b.txt', '﻿' + [...P1, ...P2].join('\r\n')))
  await confirmVersion(page, 2)
  await expect(stat(page, 'unchanged')).toHaveText('4')
  await expect(stat(page, 'modified')).toHaveText('0')
})

test('pasted text: duplicate and skipped numbers are reported by line', async ({ page }) => {
  await newMatter(page)
  await pasteText(page, '1. One. First clause.\n2. Two. Second clause.\n2. Two again. Third clause.\n5. Five. Fourth clause.')
  await expect(dialog(page).locator('.callout.warn li')).toHaveText(['line 3 Number 2 is used twice (first on line 2).', 'line 4 Numbering jumps from 2 to 5.'])
})

test('the version text downloads exactly as imported', async ({ page }) => {
  await newMatter(page)
  await pasteText(page, P1.join('\n'))
  await confirmVersion(page, 1)
  await tab(page, 'Versions')
  const [name, body] = await download(page, page.getByRole('button', { name: 'Text', exact: true }))
  expect(name).toBe('v1.txt')
  expect(body.toString('utf8')).toBe(P1.join('\n'))
})

test.describe('files that must be refused', () => {
  const cut = (f: Upload, n: number): Upload => ({ ...f, buffer: f.buffer.subarray(0, Math.floor(f.buffer.length * n)) })
  const bad: [string, () => Upload | Promise<Upload>, RegExp][] = [
    ['an empty text file', () => textFile('empty.txt', ''), /No text found in this file/],
    ['a blank text file', () => textFile('blank.txt', ' \r\n\t\n'), /No text found in this file/],
    ['an old .doc', () => textFile('old.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), 'application/msword'), /old\.doc is not a DOCX, PDF or text file.*save as \.docx/],
    ['an image', () => textFile('scan.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png'), /scan\.png is not a DOCX, PDF or text file/],
    ['another zip', () => textFile('x.zip', 'PK\x03\x04', 'application/zip'), /x\.zip is not a DOCX/],
    ['an empty DOCX', () => textFile('e.docx', '', DOCX), /e\.docx is not a DOCX/],
    ['a scanned PDF', () => pdf([[], []]), /no text layer.*OCR/],
    ['a truncated PDF', () => cut(pdf([P1, P2]), 0.6), /Invalid PDF/],
    ['a PDF cut before its index', () => cut(pdf([P1, P2]), 0.85), /Invalid PDF/],
    ['a truncated DOCX', async () => cut(await docx(['# Services. Hosts.', '# Payment. Pays.']), 0.5), /Corrupted zip/],
    ['a file over 15 MB', () => textFile('big.txt', Buffer.alloc(15 * 1024 * 1024 + 1, 'a')), /big\.txt is 15\.0 MB; the limit is 15 MB/],
  ]
  for (const [name, make, message] of bad) test(name, async ({ page }) => {
    await newMatter(page)
    await upload(page, await make())
    await expect(dialog(page).getByRole('alert')).toContainText(message)
    await expect(dialog(page).getByRole('button', { name: 'Add version' })).toHaveCount(0)
  })

  test('a one-line document cannot be added', async ({ page }) => {
    await newMatter(page)
    await upload(page, textFile('one.txt', 'just one line'))
    await expect(dialog(page)).toContainText('Only one clause was found')
    await expect(dialog(page).getByRole('button', { name: 'Add version' })).toBeDisabled()
  })
})
