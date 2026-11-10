# Redline Desk

Contract version comparison and playbook review that works without Word track-changes and without sending documents to a server.

**Live:** https://redline-desk.vercel.app

## The problem

The counterparty sends back a PDF, or a Word file with no tracked changes, and you have to work out what moved. Renumbering makes a plain diff useless. A liability cap that drops from twelve months of fees to three, a governing-law clause moved to the end, or a "Section 8.2" that now points at the wrong clause can all slip past on a second read.

## What it does

- **Import** two or more versions as DOCX (list numbering rebuilt), PDF (text layer, headings reconstructed) or pasted text. A validation report lists duplicate or skipped numbers by line.
- **Clause-aware compare**: segmentation (1., 1.1, (a), Article/Section, ALL-CAPS headings), similarity-based alignment that handles renumbering and moved clauses, and a Myers word diff inside each clause.
- **Defined terms**: unused, undefined or inconsistently capitalised terms, and definitions whose wording changed.
- **Cross-references**: references that no longer exist, or that now land on a different clause after renumbering.
- **Values**: amounts, percentages, periods, dates and fee multiples shown as before → after.
- **Playbooks**: editable rules per matter with severity and fallback language. Starters for a mutual NDA, a customer-side MSA/SaaS agreement and a freelancer agreement. Rule types: required clauses, forbidden phrases, liability cap, term and survival length, governing law, payment days, IP assignment scope, non-compete and non-solicit, auto-renewal notice, and mutuality.
- **Actions**: issues list as CSV, a printable memo, a DOCX redline (coloured underline and strikethrough) and a printable HTML redline.
- **Rounds**: v1 → v2 → v3 tracking of open, new, resolved and conceded issues, with notes.
- **Workspace**: multiple matters stored locally in IndexedDB. Optional Supabase sign-in syncs playbooks, issue lists and status; contract text syncs only if you opt in per matter (1.5 MB cap).

Two synthetic contract sets are included. Not legal advice.

## Run locally

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # engine tests (node --test)
npm run build
```

Optional sync needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. Without them, the app runs fully local.
