import { Link } from './ui.tsx'

export default function Privacy() {
  return (
    <section className="page narrow prose">
      <div className="eyebrow">Privacy</div>
      <h1>Your documents never leave your browser</h1>
      <p className="lede">Redline Desk has no document server. Parsing, comparison, playbook checks and exports all run on your device.</p>
      <h2>What stays on your device</h2>
      <ul>
        <li>Contract text from every DOCX, PDF or paste. It is stored in this browser’s IndexedDB and is never uploaded.</li>
        <li>Generated redlines (DOCX and HTML) and memos, which are built in the page and saved by your browser.</li>
      </ul>
      <h2>What syncs if you sign in (optional)</h2>
      <ul>
        <li>Matter names, counterparty, your playbook rules, each version’s label, file name and issue list, and conceded issues and notes.</li>
        <li>Issue lists include the clause label, the finding and the fallback text, for example “§ 8.1 Cap: Cap is fees from 3 months”. They do not include the contract text.</li>
        <li>Contract text syncs <b>only</b> if you turn on “Sync this matter’s document text” for a matter, and only up to 1.5 MB.</li>
      </ul>
      <p>Synced data is stored in a Supabase Postgres database with row-level security, so only your account can read your rows. From the account menu you can export everything as JSON, delete your cloud data, or delete your account.</p>
      <h2>No tracking</h2>
      <p>No analytics, ads or third-party scripts. The only third-party requests are Google Fonts and, when you sign in, the sync service.</p>
      <h2>Not legal advice</h2>
      <p>Redline Desk is a drafting aid. The sample contracts are synthetic, written for this app with fictional parties.</p>
      <p><Link href="/docs">Formats and limits</Link></p>
    </section>
  )
}
