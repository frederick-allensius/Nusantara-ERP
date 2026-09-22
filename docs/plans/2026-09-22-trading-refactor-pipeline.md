# Trading Ubin & Material Alam — Refactor & Pipeline Plan

**Date:** 2026-09-22
**Source handoff:** Trading Ubin & Material Alam project handoff (six sections)
**Target:** `Nusantara-ERP` (this repo)

## Guiding principle

Wire the operational trading pipeline end-to-end without breaking the existing
engine. The accounting core (GL derive-on-save, cost-ledger, doc-engine, RBAC) is
carried over untouched; new work rides on the existing shapes (`goodsReceipts`,
`purchaseOrders`/`salesOrders`, `deliveryOrders`, `purchase`/`salesInvoices`,
`salesReceipts`) so parity with the current system is preserved.

- **Preserve** the classic IIFE bundle convention: each new file is an IIFE that
  declares no top-level globals, exposes exactly one `window.X` object, and is
  registered in the `classicAll` array in `vite.config.js` at the correct
  dependency position (before `rbac.js`/`lazy-views.js`).
- **Extend, don't replace** working modules. No modules were deleted; only
  demonstrably dead fields were flagged (see Section 1 notes).
- Every section stands on its own, is committed separately, and passes
  `npm run test:run` + `npm run type-check` + `npm run lint` + `npm run build`
  before the next one lands.

The handoff's six sections map to features FEAT-002 … FEAT-006, finalized by
FEAT-007. The ordering front-loads Section 1 (the pipeline) because the other
sections read its weighbridge/reconciliation data.

---

## Handoff section → feature → status

| # | Handoff section | Feature | Status |
|---|-----------------|---------|--------|
| 1 | Core refactor + end-to-end pipeline (PO → Surat Jalan & Timbangan → Reconciliation → Multi-Invoice → Payment) | FEAT-002 | ✅ Implemented |
| 3 | Dashboard funnel analytics + custom-range reporting | FEAT-003 | ✅ Implemented |
| 5 | Dual-view role-based access (data-entry vs executive) | FEAT-004 | ✅ Implemented |
| 6 | Senior-friendly (50s-club) UI/UX | FEAT-005 | ✅ Implemented |
| 2 | Supplier SJ validation cross-check + mismatch alert + demo | FEAT-006 | ✅ Implemented (live email ingestion deferred as a pluggable adapter) |
| 4 | Coretax export format | — | ⏸ Deferred (spec unavailable — see below) |

---

## Section 1 — Core refactor & end-to-end pipeline — ✅ FEAT-002

Operational transaction pipeline wired so data flows without breaks:
**PO Supplier → Surat Jalan & Timbangan → Rekonsiliasi → Multi-Invoice → Payment.**

1. ✅ **Weighbridge / Timbangan capture** on the receiving flow
   (`public/classic/core/sales-purchase-extras.js`). The Penerimaan Barang line
   grid captures per line: Qty Terima, Surat Jalan qty, Bruto (gross), Tara (tare),
   a live-derived Netto (`netQty = gross − tare`), and unit price. Each receipt line
   persists a `weighing` object `{ suratJalanQty, grossQty, tareQty, netQty }` plus
   `unitPrice`.
2. ✅ **Reconciliation** (`public/classic/core/pipeline-extras.js`,
   `window._pipelineExtras`). The `openReconciliation` view shows ordered vs.
   surat-jalan vs. bruto/tara/netto side by side, computes per-line variances, and
   lets the operator confirm a `reconciledQty` per line; saving stamps
   `reconciled: true`, `reconciledAt`, and the per-line `reconciledQty`.
3. ✅ **Reconciled qty is the invoice basis.** `invoiceBasisQty` prefers
   `reconciledQty` → weighed netto → surat-jalan qty → ordered qty (in that order),
   so invoices bill the reconciled tonnage, not the raw ordered qty. This is the
   guard against over- and under-invoicing.
4. ✅ **Multi-invoice.** A single PO / multiple staged receipts can generate one or
   more purchase invoices; on the sales side, staged pickups (Pengambilan Bertahap)
   produce multiple sales invoices from one SO. Delivery Order status transitions
   `Partially invoiced` / `Invoiced` (doc-registry) are honored. GL journals are
   **derived** from the documents by `gl-sync.js` `reconcileAll` on save — never
   hand-written.
5. ✅ **Payment closes the loop.** PI → PP (Purchase Payment) and SI → SR (Sales
   Receipt) feed outstanding balances for the reconciled/multi-invoice documents.
6. ✅ **Wiring:** `pipeline-extras.js` added to `classicAll` after
   `sales-purchase-extras.js`; `menu-router.js` route `Rekonsiliasi →
   ['_pipelineExtras','openReconciliation']`; `nav.js` Purchases menu entry.
7. ✅ **Tests:** `tests/pipeline-reconciliation.test.ts` (14) cover weighing
   derivation, variance math, `invoiceBasisQty`, multi-invoice DO status, and a
   balanced derived PI journal.

**Clean-up (conservative):** no modules or fields deleted. The legacy DO statuses
`In Transit` / `Delivered` were kept alongside the new `Partially invoiced` /
`Invoiced` for backward compatibility with existing seed/records; flagged for a
future review only.

## Section 3 — Dashboard funnels & custom-range reporting — ✅ FEAT-003

New classic module `public/classic/core/funnel-report.js`
(`window._funnelReport`).

1. ✅ **Purchase funnel** with the exact handoff stages:
   **Open PO Supplier → Surat Jalan / Truk Jalan → Tiba/Timbang → Reconciled →
   Invoiced Supplier.** Counts derived from `purchaseOrders`, purchase-side
   `deliveryOrders`/`goodsReceipts`, weighed records (`weighing.netQty > 0`), the
   FEAT-002 `reconciled` flag, and `purchaseInvoices`.
2. ✅ **Sales funnel** with stages: **Open PO Customer (SO) → Pengambilan Bertahap
   (staged pickups / DOs) → Draft Invoice → Invoiced → Paid.** Counts derived from
   `salesOrders`, `deliveryOrders`, `salesInvoices` (Draft / Outstanding / Paid),
   and `salesReceipts`.
3. ✅ **Custom-range report** (`openCustomRange`) filterable by date range (from/to),
   month shortcut, customer, supplier, and PO number, showing matching transactions
   with per-kind totals. Reachable from the Reports menu (`nav.js` MENU_CONFIG +
   `menu-router.js` route `Laporan Custom Range`).
4. ✅ **Graceful empty state:** funnels and the report show "Belum ada data" (or
   "Belum ada data yang cocok") instead of throwing.
5. ✅ **Tests:** `tests/funnel-report.test.ts` (11) assert the five-stage
   labels/order, per-stage counts, empty-DB degradation, and the filter include/
   exclude logic.

## Section 5 — Dual-view role-based access — ✅ FEAT-004

Two focused experiences layered on the existing RBAC, gated through `rbac.js`
without weakening the server-enforced boundary.

1. ✅ **Persona mapping (no new roles):** Owner/Management → `admin` + `manajer`;
   Admin/Accounting data-entry → `akunting` + `penjualan`. A UI-only `surface`
   concept (`ROLE_SURFACES`, `surfaceFor`/`canViewSurface`, `ENTRI_ACTIONS`,
   `EXECUTIVE_ANALYTICS`) sits on top of the resolved role; `firestore.rules` and
   the `saveDB` safety net are untouched.
2. ✅ **Entri Harian (data-entry surface):** new
   `public/classic/core/entri-harian.js` (`window.renderEntriHarian` /
   `window._entriHarian`) exposes exactly four operational task cards — PO, Surat
   Jalan/DO, Timbangan, and Biaya Operasional — routing to existing handlers.
   Operational-cost entry reuses the existing Other Payment path (`otherPayments`);
   Transport / ATK / Entertain were added to `PAY_CATS` in `bank-extras.js`.
3. ✅ **Executive surface:** the dashboard surfaces the FEAT-003 funnels plus a
   real-time margin widget (revenue vs. COGS via `window.CostLedger.cogsForSO`) and
   a piutang-aging widget (0-30 / 31-60 / 61-90 / >90). Detailed AR aging already
   existed in `erp-view.js` and is surfaced rather than rebuilt.
4. ✅ **Gating** driven through existing `rbac.js` `GROUP_MODULE` / `VIEW_MODULE` /
   `applyNavGating`. Registered in `app.html`, `erp-view.js` `getRenderer`,
   `nav.js`, `menu-router.js`, and `vite.config.js` `classicAll`.
5. ✅ **Tests:** `tests/dual-view.test.ts` (6) assert the persona → surface mapping
   and that the entri surface exposes exactly the four operational tasks.

## Section 6 — Senior-friendly (50s-club) UI/UX — ✅ FEAT-005

Cross-cutting styling pass; no business logic changed.

1. ✅ **Type scale tokens** in `style.css` `:root`: `--fs-base:16px`, `--fs-xs:13px`,
   `--fs-sm:14px`, `--fs-md:15px`, `--fs-lg:17px`, `--fs-xl:20px`, `--tap-min:44px`.
   Body raised to 16px base; nothing critical reads below ~13-14px.
2. ✅ **~44px touch targets:** buttons, form inputs/selects, nav rail/subnav/filter
   items given a ~44px minimum height with comfortable padding.
3. ✅ **Higher contrast** in both dark and light themes (muted/secondary text
   nudged), emerald primary `#10b981` unchanged.
4. ✅ **Mobile mirror:** `mobile.css` `<=768px` and `<=480px` blocks raised so phones
   never drop below the readable floor.
5. ✅ **New surfaces inherit** the larger type/targets — pipeline, reconciliation,
   funnels, custom report, and Entri Harian screen-specific inline fonts bumped from
   11-12px up to 13-14px.

## Section 2 — Supplier SJ validation — ✅ FEAT-006 (live email deferred)

New classic module `public/classic/core/sj-validation.js`
(`window.SJValidation`). Prevents under-invoicing by cross-checking the field Surat
Jalan tonnage/price (the FEAT-002 weighbridge data) against the supplier's recap.

1. ✅ **Cross-check engine** `crossCheck(fieldLines, recapRows, options)` — a pure
   function with a configurable tolerance (absolute *or* percentage band for both
   tonnage and price). Rows match on PO/DO number + item; the item name is the
   primary matching token (supplier recaps carry names, not internal codes) with
   code/id fallback. Flags every tonnage or price mismatch beyond tolerance.
2. ✅ **Recap parsing** (`parseRecapWorkbook` / `rowsFromAoa`) reuses the SheetJS
   reader pattern from `excel-import.js` and accepts both the
   Template-Import-Nusantara "Delivery Orders" headers and Indonesian recap headers.
3. ✅ **Pluggable ingestion contract** `registerRecapSource({ id, label,
   fetchRecaps() })` with a shipped manual **upload** source. A future email-mailbox
   source implements the same contract — the live mailbox provider is **deferred**
   (no email API available in this environment) and intentionally not wired.
4. ✅ **Mismatch alert UI:** the "Validasi SJ Supplier" view (Purchases menu) lists
   receipts, attaches a supplier recap, runs the cross-check, and shows color-coded
   mismatch badges plus a red pre-invoice warning banner before an invoice is issued.
5. ✅ **Demo:** `seedDemo()` seeds a reconciled receipt (one matching item, one
   overstating tonnage + price) via a "Muat Contoh Demo" button; how-it-works guide
   at `docs/SJ_VALIDATION_DEMO.md`.
6. ✅ **Tests:** `tests/sj-validation.test.ts` (14) assert tonnage/price mismatch
   flags, within-tolerance passes, unmatched rows, DO-number matching, the demo seed,
   and the source contract.

## Section 4 — Coretax export format — ⏸ DEFERRED

**Status: deferred.** The exact Coretax (DJP) export file specification is not
available in this pass, so the format-specific exporter is **out of scope**. Guessing
the field layout, delimiters, and header contract would risk shipping an exporter that
DJP rejects, so no format mapping was written.

**What is ready for a future exporter.** Sales and purchase transaction data is already
structured and stored so a Coretax export can be added later without a data migration.
The tax view (`public/classic/core/tax-extras.js`, `getVatInvoices()`) already
assembles, per invoice, exactly the fields a Coretax mapping would need:

| Coretax field (typical) | Already captured | Source |
|-------------------------|------------------|--------|
| Party / customer (supplier on the purchase side) | `customerName` (+ `supplierName` on PI) | `customers` / `suppliers` master, SO/PO |
| NPWP / tax id | `npwp` | `customers[].npwp` (blank when not set) |
| Tax rate | PPN 11% (`VAT_RATE`) | `tax-extras.js` |
| Document number | `id` / `efakturNo` | invoice id + `efakturNo` field |
| Document date | `date` | invoice / order date |
| Line qty / price | `qty`, `unitPrice` | reconciled invoice lines (FEAT-002 basis) |
| Line tax (DPP / PPN) | `dpp`, `ppn`, `total` | derived in `getVatInvoices()` |

A future Coretax source therefore only needs to add a **format adapter** that maps this
existing structured record to the Coretax file layout — the same pluggable-adapter shape
already proven by the SJ-validation recap sources (Section 2). No schema change is
expected; only the format-specific serializer.

---

## Final status summary

| # | Section | Feature | Status |
|---|---------|---------|--------|
| 1 | Pipeline (PO → SJ/Timbang → Rekonsiliasi → Multi-Invoice → Payment) | FEAT-002 | ✅ |
| 3 | Dashboard funnels + custom-range report | FEAT-003 | ✅ |
| 5 | Dual-view (Entri Harian vs Executive) | FEAT-004 | ✅ |
| 6 | Senior-friendly UI | FEAT-005 | ✅ |
| 2 | Supplier SJ validation (+ pluggable recap sources) | FEAT-006 | ✅ (live email deferred) |
| 4 | Coretax export | — | ⏸ Deferred (spec unavailable) |
| — | Finalization & documentation | FEAT-007 | ✅ (this doc) |

## Verification (each feature)

- `npm run test:run` — 269 tests / 22 files pass (baseline 224 → +45 across
  FEAT-002/003/004/006).
- `npm run type-check` — only the 12 pre-existing baseline errors
  (`rbac.test.ts` ×11 + `twofa-flow.test.ts` ×1); zero new.
- `npm run lint` — clean (only the harmless `.eslintignore` deprecation warning).
- `npm run build` — succeeds; `dist/classic/bundle.js` emitted.

## Risk notes

- **Classic bundle wiring** is fragile (shared global scope; IIFE-wrapped to avoid
  redeclare `SyntaxError`s). Every new classic file was added to `classicAll` in
  `vite.config.js` at the correct dependency position and exposes exactly one
  `window.X` object.
- **Coretax format drift:** the deferred exporter must be validated against a real
  DJP-accepted sample before shipping; the data-side fields above are stable, the
  file format is not yet pinned.
- **Legacy DO statuses** (`In Transit` / `Delivered`) coexist with the new
  invoice-aware statuses; kept for backward compatibility, review later.
