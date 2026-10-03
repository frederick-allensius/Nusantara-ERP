# Revamp progress log

Work branch: `revamp/ui-and-accounting` — one checkpoint commit per finished step.
Update this file at every checkpoint so work can resume from it.

Decisions and findings live in `docs/` (Indonesian): 02 navigation map · 03 transaction
flows · 04 accounting rules · 05 status & correction model · 08 technical findings (T-xx)
· 09 UX findings (U-xx) & visual direction · MEETING_KIT.

## Working rules

- UI copy and Markdown in Indonesian; English only where the term is more familiar
  (Sales Order, PPN, e-Faktur, Job Costing, Recycle Bin).
- Preserve functionality, improve clarity: no feature removal. Entries hidden from the
  menu are listed in docs/02 §2 and stay reachable in code (menu-router ROUTES).
- No invented business requirements or business-specific terminology. Anything that
  cannot be determined from code/docs is marked **REQUIRES USER CONFIRMATION**.
- Documentation and UI describe the product only — no narrative about how the project
  came about.
- Accounting integrity over UI simplicity; no fake KPIs or meaningless charts.
- `tests/classic-bundle-smoke.test.ts` must stay green: every `#view-*` in app.html
  renders; every `NSAMenu.routes` label handles (> 40 routes).
- Markdown notes outside the repo (`D:\1. Work\ERP-Lisa-Kenneth\*.md`) stay untouched.

## Verify

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx vite build
```

Dev server: `.claude/launch.json` → `dev-local-quiet` (port 8088, `/app.html`). Signing in
needs credentials — the assistant does not type passwords; ask the user to sign in in the
Browser pane, otherwise rely on the tests.

## Done

### Documentation & meeting kit
- `docs/01–10`, `MEETING_KIT.md`, `README.md`, `ARSITEKTUR.md`, `API.md`, `DEPLOYMENT.md`;
  root README / QUICK_START / PROJECT_STRUCTURE rewritten; obsolete plan/spec docs removed.

### Accounting & stock integrity (Phase A)
- `core/gl.js` posting rules (docs/04): revenue/AR/PPN once per order↔invoice chain,
  PO receipt vs PI, DP logs not double-posted, Kas & Bank journals (other payment,
  deposit, bank transfer), tax-inclusive totals, rounding; manual JVs mirrored in
  `journalVouchers`.
- `core/balances.js` (new): one outstanding figure per chain, aging, due dates, status.
- Status transitions + Cancelled (`src/classic/core/doc-registry.js`); cancel/reversal
  flows for orders, invoices, settlements, returns, receipts, adjustments.
- Stock moves only through Warehouse (`src/core/stock.js` helpers), decimal quantities,
  delete guards, string ids.
- Rewritten views: invoice-view, return-view, quotation-view; fixes in erp-crud,
  sales-purchase-extras, bank-extras, budget-gl-extras, financial-reports, report-extras
  (Rekap PPN), notifications, doc-migrate, integrity (period lock), rbac collections,
  db collections, firestore.rules, functions/backup.js.
- Tests: `tests/accounting-integrity.test.ts`; typings in rbac/twofa tests.
- Fixed: T-01…T-05, T-07…T-17, T-23, T-25…T-28, T-31, T-39, T-41, T-42, T-43, most of
  T-32/T-38; T-29 partly.

### Navigation, shell & design system (Phase B, part 1)
- `ui/nav.js` rewritten: `MENU_CONFIG` = Ringkasan · Penjualan · Pembelian · Persediaan ·
  Kas & Bank · Akuntansi · Aset Tetap · Laporan · Data Master · Pengaturan (docs/02 §4).
  Accordion groups, collapsed icon mode (`nsa_nav_collapsed`) with popover, drawer on
  ≤768px, page context in the topbar + `document.title`, entry resolution that keeps the
  clicked entry highlighted (T-18). API: `window.NSANav.open(label)`,
  `.markActive(label)`, `.toggleCollapsed()`.
- `core/menu-router.js`: Indonesian labels, route args, openers in lazy chunks are
  invoked after `ensureView` (`LAZY_GLOBALS`).
- `core/rbac.js`: new `GROUP_MODULE` keys; `applyNavGating` gates each entry by its
  `data-module`.
- Openers: `_ledgerExtras.openTab(tab, filter)` (+ journal source filter),
  `_warehouseExtras.openTab(tab)`, `_masterExtras.openCustomers/openSuppliers`
  (`modules/master.js` lists one of them via `window._masterSection`). In-page tabs sync
  the menu (invoices, returns, quotations, financial reports, ledger, warehouse).
- Page tab bar (`ui/view-tabs.js`) removed. `ui/doc-tabs.js`: module header above the
  tabs, strip hidden while no document is open, max 5 tabs, styles moved to style.css.
- `app.html`: new shell (sidebar head/nav/foot, page context, search, Indonesian login),
  Inter + JetBrains Mono, unused view containers removed.
- Theme: `public/theme-init.js` follows the OS theme without a saved choice; nav.js follows
  OS changes and emits `nsa:themechange` (dashboard charts re-init).
- `src/core/auth.js`: no prefilled username (T-33). Notifications link to menu entries
  (`menu:<label>`). settings.js: user name targets `#topbar-username`.
- `style.css` rebuilt: light/dark palettes (tokens incl. `--primary-strong`,
  `--danger-strong`, `--chart-*`), base, sidebar, topbar, login, page header, cards, stat
  row, tables, badges, buttons, forms, filters, segmented tabs, document tabs, modal,
  toast, notification/user menu, empty/error states, notices, detail/balance/accounting
  effect/aging/summary blocks. `mobile.css`: old flyout/rail rules removed, drawer sizing.
- navigate wrap chain is now: lazy-views → rbac → doc-tabs → ui/nav.js.

### Terminology & data-driven defaults (Phase B, part 2)
- Page headers match their menu entries: erp-view list pages (Pesanan Penjualan/Pembelian,
  Barang & Stok, Surat Jalan, Daftar Aset, Pajak & PPN, Pengaturan Umum) and injected pages
  in asset/bank/master/tax/report/budget/inventory/settings extras, adjust-view,
  warehouse-view ("AI Business Analysis" → "Analisis Bisnis").
- No preset stone categories in the product: inventory filter categories
  (`FILTER_OPTIONS.inventory` getter) and item-category defaults come from the data
  (`_itemCategoryList`); unused `ITEM_CATEGORIES` removed; neutral placeholders.
- Warehouse and financial-report tabs use the segmented control.

### Findings fixed after the navigation work
- T-20 settings identity (name + role, calm account card), T-21 global search (party fields,
  invoices, delivery orders), T-24 backup import card (uses `erpBackup.importFromFile`, then
  reloads), T-34 `docNum` shows numbers as stored.

### Ringkasan / dashboard (T-22)
- `modules/dashboard.js` rebuilt: KPI tiles — Kas & bank (`GL.trialBalance`, CASH_BANK),
  Piutang/Hutang (`Balances.summary`), Penjualan bulan ini + laba kotor (REVENUE/COGS
  journal lines, vs last month); 6-month sales vs purchases chart from journals using
  `--chart-*` tokens; Perlu tindakan (statuses); Jatuh tempo terdekat; Stok menipis;
  Aktivitas terbaru (audit log, falls back to latest documents); company data checklist
  until complete; "Atur Tampilan" hides blocks per browser (`nsa_dash_hidden_v2`).
- `ui/doc-tabs.js`: a document opens as a tab only inside its own module view; from the
  dashboard, finance summary or other pages it opens as a dialog.

### Demo data (T-35)
- `src/core/demo-data.js` (new): `buildDemoData(now)` generates five months plus the current
  month relative to today, deterministic (seeded). Same product family as before (bulk
  materials, Ton/M3), fictional parties. Stock moves only through receipts, deliveries,
  returns, adjustments and transfers; orders take free stock only; items are reordered at a
  reorder level; salaries go through payroll runs plus payment vouchers; cash receipts are
  deposited Kas → BCA; one opening voucher carries opening cash, bank and inventory. Cases
  for the dashboard and the meeting demo: overdue receivable and payable, low stock, open
  orders in every status, a return, a down payment, a quotation converted to an order.
- `src/core/db.js`: old in-file seed removed. `emptyData` (structure only) fills keys missing
  from saved or imported data, so demo records are never injected into existing data;
  `initialData()` = demo dataset (empty when `VITE_SEED_DEMO=false`) for first run, Reset
  Data and the empty-Firestore seed (which also merges bank accounts, categories, units).
- `DocEngine.nextNumber(type, date, { docs })` scans the given documents for types outside
  the registry (OP/OD/BT in bank-extras, ADJ, JV), so a number is never issued twice.
- Tests: `tests/demo-data.test.ts` (stock, dates/numbers, links, payroll, invoice status,
  balanced ledger, inventory = stock value, no cash/bank account overdrawn on any day, demo
  cases); doc-engine `docs` option. Tuned against ten dates (month starts and ends).
- A browser that already has local data keeps it; the new demo data appears on a fresh
  store or after Reset Data.

### UI polish and figures that were misleading
- Hardcoded colors in `public/classic/**` → tokens (`--success/-bg`, `--danger/-bg`,
  `--warning/-bg`, `--info/-bg`, `--primary`, `--surface-sunken`, `--muted` …), so extras
  pages follow light and dark themes. Script: 307 replacements; SVG `stroke="#…"` →
  `currentColor` + token. Left as is: print/PDF templates (fixed colors on paper) and the
  unused Chart.js code in erp-view.js (task chip suggested to remove it).
- Emoji icons and markers → line icons or plain text: Daftar Laporan (icon per category,
  `.report-card-icon`), empty states (`.empty-state`), sync dialogs, warnings, buttons.
  The `⚠ Tujuan diubah` prefix stays: erp-crud.js stores and filters notes by it.
- Ringkasan: "Penjualan bulan ini" compares with the same days of last month
  (`_dashMonthly(months, throughDay)`), not the whole previous month.
- Analisis Bisnis (report-extras `openAIAnalysis`): figures now come from journals (revenue,
  cost of sales, purchases), invoices plus delivered orders without an invoice (top
  customers/items, without PPN) and `Balances.summary` (receivables). Before it summed all
  orders incl. drafts/cancelled and PPN, used purchases as cost, read a missing
  `customerName` field and shifted months through `toISOString()`. Findings are factual
  statements (no advice), month to date vs the same days last month.
- Uang Muka Penjualan/Pembelian show the order number (not the internal id); DP and
  Penggajian labels in Indonesian.

### Documentation synced with the code
- 08: all findings `Diperbaiki` except T-06 and T-44 (decision needed); T-27 still needs the
  Firestore rules/functions deploy; §E describes the demo generator; current test status.
- 05: §2/§3 marked as review findings; §5 lists the correction rules now in place.
- 02: Rekap PPN and Analisis Bisnis rows as implemented; tax entries follow the `tax` module.
- 04: `journalVouchers`, balance sheet and aging rows, demo opening voucher. 09: tabs
  decision and dashboard blocks as implemented, visual direction status. 01: evidence rows
  point to `demo-data.js`.
- ARSITEKTUR / PROJECT_STRUCTURE: view-tabs removed, navigate chain, `initialData` /
  `emptyData`, `demo-data.js`, `nextNumber({ docs })`, test list. MEETING_KIT: demo
  preparation, demo cases, presenter note.
- docs/pitch SKRIP_DEMO and FAQ_SANGGAHAN: menu names, login (username `admin`), and
  capabilities that exist now (roles, 2FA, printing, read-only API). The sample outputs in
  `docs/pitch/OUTPUT_LAPORAN.md` and the PDF/XLSX/PPTX files still show the earlier demo
  data and labels; regenerating them needs the user's go-ahead.

## Verifying in a browser without signing in

`harness.local/ui.html` (git-ignored by `*.local`) boots the classic bundle with the app's
demo data, like the smoke test. Open `http://localhost:8088/harness.local/ui.html`, drive it
with `NSANav.open('<menu label>')`. Delete the folder when the revamp is done.

## Next (in order)

Browser pass done in the harness: light/dark, collapsed sidebar + popover, drawer ≤768px,
document tab, ledger, sales list, dashboard.

1. Optional: inline-styled tables and stat cards in extras pages → shared classes. The
   pages already use the theme tokens and look consistent; low priority.
2. `public/classic/core/erp-view.js` has an uncommitted removal of unused chart code made by
   a separate session (task "Remove dead chart code from erp-view.js"); tests pass with it.
   Commit it on its own once that session is done — do not sweep it in with `git add -u`.
3. Final summary for the user: firestore rules/functions need a manual deploy; open
   decisions requiring confirmation; pitch sample outputs; remove `harness.local/`.

## Session 2026-10-03 — friend's branch + meeting requirements (IN PROGRESS)

Requirements: `D:\1. Work\ERP-Lisa-Kenneth\meeting notes 14092026.txt` + recording
`meeting 14092026.mkv` (speech 17–93 min). Transcript chunks (Whisper small, greedy) in the
session scratchpad `meeting/run3/part00–09.txt`; parts 04–09 were still transcribing.
If missing, re-run per chunk (ffmpeg split from 240 s, 600 s chunks; whisper `--model small
--language id --condition_on_previous_text False --beam_size 1 --temperature 0`).

Done (commits on this branch):
- 282703c merge of origin/feat/trading-refactor-pipeline (friend: weighbridge on goods
  receipts, Rekonsiliasi, SJ validation, funnels, Laporan per Periode, Entri Harian, dual-view).
- 3427750 adjustable text size (rem everywhere, "Ukuran teks" in user menu, default Besar).
- a02771d Ekspor Coretax (XML, corrected output-tax rows), tests/coretax-export.test.ts.
- b22c01a trading core: trading.js (pickup POs, SJ slots ceil(qty/35), quota + month-end
  cut-off, trips with bruto/tara/netto, supplier price by date, invoices from trips with doIds,
  recap matching + weight-change alerts), gl.js buildPickupJournals, balances unbilled trips,
  SO/PO 'Closed', DO 'Cancelled', menu group Pengambilan (#view-pickups) with placeholder
  pickup-view.js / pickup-billing.js. tests/trading-pickups.test.ts.

- 2997581 docs 11 (meeting requirements → solution → status) and 12 (security, cloud, cost, PC).
- 11b1c71 (merged) per-user "Akses menu": users/{uid}.modules narrows the role; rbac.js,
  erp-crud.js editor, firestore.rules moduleAllowed(), functions adminSetModules,
  tests/user-module-access.test.ts. Needs rules + functions deploy.
- 48020df Kelola Backup → Arsip Excel (archive-export.js, window.NSAArchive), test.
- ce49387 docs: access + archive (ARSITEKTUR §8/§10/§11, docs 11, 12).

Next (planned as parallel worktree agents; check `git worktree list` /
`.claude/worktrees/` for unfinished agent work before redoing):
1. Per-user module access — DONE (merged).
2. pickup-view.js pages (PO Pengambilan, Catat Pengambilan with ticket photo, Impor Rekap
   Timbangan, Perubahan Timbangan, Rekap Pengambilan) — agent started.
3. pickup-billing.js (Tagih Pelanggan weekly from trips; Tagihan Supplier with qty/price
   compare; invoice-view cancel → Trading.releaseInvoice; invoice print shows line notes).
4. Ringkasan pipeline view from trips (funnel-report rework, unbilled, alerts, cut-off),
   Entri Harian tasks, notifications for weight alerts/cut-off, exclude pickup slots from
   "pengiriman belum selesai"; friend modules → colour tokens.
5. Friend cleanup: receive-grid weighing columns lost in the merge; pipeline-extras
   invoiceFromReceipt (numeric id → DocEngine number, sourceType 'PO', terms due date).
6. Demo data for the trading flow; 7. docs (meeting requirements doc, docs sync, security
   & cloud/PC recommendation); remove harness.local/.
