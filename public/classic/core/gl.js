// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — General Ledger Engine  (gl.js)
//
// Data-driven double-entry posting. Journals are DERIVED from documents, never hand
// kept in sync: `reconcileAll()` rebuilds every auto-journal from the current state
// of the documents, so it is safe to run on every save (idempotent, stable ids — no
// sequence burn). Manual Journal Vouchers (source === 'manual') and imported
// journals are preserved across reconciles.
//
// Posting model (status-driven). Business action → accounting consequence:
//   • SO 'Delivered'   → Dr COGS / Cr Inventory (moving-average cost), plus — only
//                        while the order has no active Sales Invoice — Dr Receivable
//                        (+ Sales Discount) / Cr Sales + PPN Keluaran.
//   • Sales Invoice    → Dr Receivable (+ Sales Discount) / Cr Sales + PPN Keluaran.
//     (Outstanding/Paid) COGS only for an invoice without a source SO.
//   • PO 'Received'    → Dr Inventory / Expense + PPN Masukan / Cr Payable — only
//                        while the order has no active Purchase Invoice.
//   • Purchase Invoice → Dr Inventory / Expense + PPN Masukan / Cr Payable.
//   • PO invoiced per goods receipt (invoices with receiptId) → each posted
//                        receipt not invoiced yet posts the same entry itself
//                        (see receivedNotInvoiced).
//   • Payments         → SO/PO payment logs, Sales Receipts, Purchase Payments:
//                        Cash/Bank vs Receivable/Payable. Payment-log rows created by
//                        applying a down payment are skipped — the down-payment
//                        journals already move the cash.
//   • Returns, adjustments, down payments, payroll, other payments/deposits and bank
//     transfers: see the builders below. docs/04-AKUNTANSI.md describes the rules
//     for business users.
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.GL.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Default Chart of Accounts (Indonesian) ─────────────────────────────────
  // Seeded into DB.accountsChart when empty; accounts missing from an existing
  // chart are appended (add-only, user edits are never overwritten).
  const DEFAULT_CHART = [
    { no: '110101', name: 'Kas', type: 'CASH_BANK' },
    { no: '110102', name: 'Bank BCA', type: 'CASH_BANK' },
    { no: '110103', name: 'Bank Mandiri', type: 'CASH_BANK' },
    { no: '110201', name: 'Piutang Usaha', type: 'ACCOUNT_RECEIVABLE' },
    { no: '110401', name: 'Persediaan Barang', type: 'INVENTORY' },
    { no: '130101', name: 'PPN Masukan', type: 'OTHER_CURRENT_ASSET' },
    { no: '210101', name: 'Hutang Usaha', type: 'ACCOUNT_PAYABLE' },
    { no: '210201', name: 'Hutang PPN (PPN Keluaran)', type: 'OTHER_CURRENT_LIABILITY' },
    { no: '310101', name: 'Modal Disetor', type: 'EQUITY' },
    { no: '320101', name: 'Laba Ditahan', type: 'EQUITY' },
    { no: '400001', name: 'Penjualan', type: 'REVENUE' },
    { no: '400004', name: 'Diskon Penjualan', type: 'REVENUE' },
    { no: '510101', name: 'Beban Pokok Penjualan', type: 'COGS' },
    { no: '610101', name: 'Beban Operasional Lain', type: 'EXPENSE' },
    { no: '610201', name: 'Beban Penyesuaian Persediaan', type: 'EXPENSE' },
    { no: '210301', name: 'Uang Muka Penjualan', type: 'OTHER_CURRENT_LIABILITY' },
    { no: '130201', name: 'Uang Muka Pembelian', type: 'OTHER_CURRENT_ASSET' },
    { no: '610301', name: 'Beban Gaji', type: 'EXPENSE' },
    { no: '610302', name: 'Beban Tunjangan', type: 'EXPENSE' },
    { no: '210401', name: 'Hutang Gaji', type: 'OTHER_CURRENT_LIABILITY' },
    { no: '610401', name: 'Beban Administrasi Bank', type: 'EXPENSE' },
    { no: '710101', name: 'Pendapatan Lain-lain', type: 'OTHER_INCOME' },
  ];

  // Company-level default account per posting slot (3-layer resolution falls back
  // here after per-item accountMap and per-party glOverrides).
  const COMPANY_DEFAULTS = {
    cash: '110101',
    receivable: '110201',
    payable: '210101',
    inventory: '110401',
    sales: '400001',
    salesDiscount: '400004',
    cogs: '510101',
    purchaseExpense: '610101',
    inventoryAdjustment: '610201',
    ppnOut: '210201',
    ppnIn: '130101',
    advanceReceived: '210301',
    advancePaid: '130201',
    salaryExpense: '610301',
    allowanceExpense: '610302',
    salaryPayable: '210401',
    bankFee: '610401',
    otherIncome: '710101',
  };

  // Payment-method → cash/bank account.
  const METHOD_ACCOUNTS = {
    Tunai: '110101',
    'Transfer BCA': '110102',
    'Transfer Mandiri': '110103',
  };

  // Bank name → cash/bank account, for Kas & Bank accounts (settings.bankAccounts)
  // that don't carry an explicit glAccountNo.
  const BANK_NAME_ACCOUNTS = [
    ['BCA', '110102'],
    ['MANDIRI', '110103'],
  ];

  // Other Payment category → posting slot. Unlisted categories use purchaseExpense.
  const PAYMENT_CATEGORY_SLOTS = { Gaji: 'salaryExpense' };

  function db() {
    return window.DB || {};
  }

  // Seed the Chart of Accounts if the DB doesn't have one yet. Self-contained so it
  // works regardless of script load order (db.js applyDefaults runs before this
  // classic script loads, when window.GL isn't defined yet).
  function ensureChart() {
    const data = db();
    if (!Array.isArray(data.accountsChart) || data.accountsChart.length === 0) {
      data.accountsChart = DEFAULT_CHART.map(a => ({ ...a, balance: 0, currency: 'IDR' }));
      return data.accountsChart;
    }
    // Add-only merge: without it a journal could reference an account absent from
    // the chart and silently drop out of the trial balance.
    const have = new Set(data.accountsChart.map(a => a.no));
    DEFAULT_CHART.forEach(a => {
      if (!have.has(a.no)) {
        data.accountsChart.push({ ...a, balance: 0, currency: 'IDR' });
      }
    });
    return data.accountsChart;
  }

  function chart() {
    return db().accountsChart || [];
  }

  function accountName(no) {
    const a = chart().find(x => x.no === no);
    return a ? a.name : no;
  }

  // 3-layer account resolution: per-item → per-party → company default.
  function resolveAccount(slot, ctx) {
    ctx = ctx || {};
    if (ctx.item && ctx.item.accountMap && ctx.item.accountMap[slot]) {
      return ctx.item.accountMap[slot];
    }
    if (ctx.party && ctx.party.glOverrides && ctx.party.glOverrides[slot]) {
      return ctx.party.glOverrides[slot];
    }
    return COMPANY_DEFAULTS[slot] || null;
  }

  function cashAccountForMethod(method) {
    return METHOD_ACCOUNTS[method] || COMPANY_DEFAULTS.cash;
  }

  // Cash/bank account for a Kas & Bank record: the cash method books to Kas;
  // otherwise the chosen bank account's glAccountNo, or a match on its bank name.
  function bankAccountGL(bankAccountId, method) {
    if (method === 'Tunai') {
      return COMPANY_DEFAULTS.cash;
    }
    const accounts = (db().settings && db().settings.bankAccounts) || [];
    const acc = accounts.find(a => a.id === bankAccountId);
    if (acc && acc.glAccountNo) {
      return acc.glAccountNo;
    }
    const label = String((acc && (acc.bank || acc.name)) || '').toUpperCase();
    const hit = BANK_NAME_ACCOUNTS.find(([key]) => label.indexOf(key) !== -1);
    return hit ? hit[1] : COMPANY_DEFAULTS.cash;
  }

  function isDownPaymentLog(p) {
    return p.method === 'Down Payment' || p.source === 'DP';
  }

  function isActiveInvoice(inv) {
    return !!inv && (inv.status === 'Outstanding' || inv.status === 'Paid');
  }

  // Does an order already have an active invoice drawn from it?
  function hasActiveInvoice(collection, sourceType, orderId) {
    return (db()[collection] || []).some(
      inv =>
        isActiveInvoice(inv) &&
        inv.sourceId === orderId &&
        (!inv.sourceType || inv.sourceType === sourceType)
    );
  }

  function isCancelled(doc) {
    return doc.status === 'Cancelled';
  }

  function docTaxRate(doc) {
    if (typeof doc.taxRate === 'number' && doc.taxRate > 0) return doc.taxRate;
    return 0;
  }

  function docPPN(doc, dpp) {
    const rate = docTaxRate(doc);
    if (rate <= 0) return 0;
    if (typeof doc.tax === 'number') return round(doc.tax);
    return round(dpp * rate);
  }

  function round(n) {
    return Math.round(Number(n) || 0);
  }

  // Build a balanced journal object from raw {accountNo, debit, credit} entries.
  // Returns null if it carries no movement.
  function makeJournal(id, number, date, source, rawLines) {
    const lines = rawLines
      .filter(l => round(l.debit) !== 0 || round(l.credit) !== 0)
      .map(l => ({
        accountNo: l.accountNo,
        accountName: accountName(l.accountNo),
        debit: round(l.debit),
        credit: round(l.credit),
        memo: l.memo || '',
      }));
    if (lines.length === 0) {
      return null;
    }
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    return { id, number, date, source, lines, totals: { debit, credit } };
  }

  function lineGross(l) {
    return (Number(l.qty) || 0) * (Number(l.price) || 0);
  }

  function inventoryItem(itemId) {
    if (itemId === 'custom') {
      return null;
    }
    return (db().inventoryItems || []).find(i => String(i.id) === String(itemId)) || null;
  }

  // Cost of inventory lines at the static item.cost.
  function staticCost(lines) {
    return lines.reduce((s, l) => {
      const item = inventoryItem(l.itemId);
      return item ? s + (Number(l.qty) || 0) * (Number(item.cost) || 0) : s;
    }, 0);
  }

  // Debit/credit helpers that swap sides for reversing documents (returns).
  function sides(reverse) {
    return {
      dr: (accountNo, amount, memo) =>
        reverse ? { accountNo, credit: amount, memo } : { accountNo, debit: amount, memo },
      cr: (accountNo, amount, memo) =>
        reverse ? { accountNo, debit: amount, memo } : { accountNo, credit: amount, memo },
    };
  }

  // Revenue side of a sale (SO delivery, Sales Invoice) or its reversal (Sales
  // Return): receivable, sales discount, gross sales and PPN Keluaran. For a
  // tax-inclusive document the line subtotals already contain PPN, so the
  // receivable is the subtotal itself and sales exclude the PPN portion.
  function revenueLines(doc, party, label, reverse) {
    const lines = doc.lines || [];
    // Round the totals first so every derived amount is a whole rupiah and the
    // journal balances exactly (decimal quantities/prices included).
    const gross = round(lines.reduce((s, l) => s + lineGross(l), 0));
    const net = round(lines.reduce((s, l) => s + (Number(l.subtotal) || 0), 0));
    const disc = gross - net;
    const ppn = docPPN(doc, net);
    const incl = !!doc.taxInclusive && ppn > 0;
    const s = sides(reverse);
    return [
      s.dr(
        resolveAccount('receivable', { party }),
        incl ? net : net + ppn,
        reverse ? `Pengurangan piutang ${label}` : `Piutang ${label}`
      ),
      s.dr(
        resolveAccount('salesDiscount', { party }),
        disc,
        reverse ? 'Reversal diskon' : 'Diskon penjualan'
      ),
      s.cr(
        resolveAccount('sales', { party }),
        incl ? gross - ppn : gross,
        reverse ? `Retur penjualan ${label}` : `Penjualan ${label}`
      ),
      s.cr(
        resolveAccount('ppnOut', { party }),
        ppn,
        reverse ? `Reversal PPN Keluaran ${label}` : `PPN Keluaran ${label}`
      ),
    ];
  }

  // Purchase side (PO receipt, Purchase Invoice) or its reversal (Purchase Return):
  // inventory lines to Inventory, other lines to expense, PPN Masukan, payable.
  function purchaseLines(doc, party, label, reverse) {
    let invAmt = 0;
    let otherAmt = 0;
    (doc.lines || []).forEach(l => {
      const sub = Number(l.subtotal) || 0;
      if (inventoryItem(l.itemId)) {
        invAmt += sub;
      } else {
        otherAmt += sub;
      }
    });
    invAmt = round(invAmt);
    otherAmt = round(otherAmt);
    const gross = invAmt + otherAmt;
    const ppn = docPPN(doc, gross);
    if (doc.taxInclusive && ppn > 0 && gross > 0) {
      // Line subtotals include PPN: book only the net cost.
      const netTotal = gross - ppn;
      const invNet = round((invAmt * netTotal) / gross);
      otherAmt = netTotal - invNet;
      invAmt = invNet;
    }
    const s = sides(reverse);
    return [
      s.dr(
        resolveAccount('inventory', { party }),
        invAmt,
        reverse ? `Pengurangan persediaan ${label}` : `Persediaan ${label}`
      ),
      s.dr(
        resolveAccount('purchaseExpense', { party }),
        otherAmt,
        reverse ? `Reversal beban ${label}` : `Pembelian lain ${label}`
      ),
      s.dr(
        resolveAccount('ppnIn', { party }),
        ppn,
        reverse ? `Reversal PPN Masukan ${label}` : `PPN Masukan ${label}`
      ),
      s.cr(
        resolveAccount('payable', { party }),
        invAmt + otherAmt + ppn,
        reverse ? `Retur pembelian ${label}` : `Hutang ${label}`
      ),
    ];
  }

  // ── Sales Order posting ─────────────────────────────────────────────────────
  function buildSOJournals(o) {
    const out = [];
    const party = (db().customers || []).find(c => c.id === o.customerId) || null;

    // Pickup orders (trading flow) post per trip — see buildPickupJournals.
    if (o.status === 'Delivered' && !o.pickupFlow) {
      // COGS from the perpetual moving-average cost ledger when available; static
      // item.cost otherwise.
      let cogs = null;
      if (window.CostLedger && typeof window.CostLedger.cogsForSO === 'function') {
        cogs = window.CostLedger.cogsForSO(o.id);
      }
      if (cogs === null || cogs === undefined) {
        cogs = staticCost(o.lines || []);
      }
      cogs = round(cogs);

      // Once the order is invoiced, the invoice carries revenue, receivable and PPN;
      // the delivery keeps only the goods movement.
      const raw = hasActiveInvoice('salesInvoices', 'SO', o.id)
        ? []
        : revenueLines(o, party, o.id, false);
      raw.push(
        { accountNo: resolveAccount('cogs', { party }), debit: cogs, memo: 'HPP' },
        {
          accountNo: resolveAccount('inventory', { party }),
          credit: cogs,
          memo: 'Pengurangan persediaan',
        }
      );
      const j = makeJournal(`J:SO:${o.id}:rev`, o.id, o.date, { docType: 'SO', docId: o.id }, raw);
      if (j) {
        out.push(j);
      }
    }

    // Cash receipts from real payment records.
    (db().paymentLogs || [])
      .filter(p => p.type === 'SO' && p.orderId === o.id && !isDownPaymentLog(p))
      .forEach(p => {
        const j = makeJournal(
          `J:SO:${o.id}:pay:${p.id}`,
          o.id,
          p.date || o.date,
          { docType: 'SO', docId: o.id },
          [
            {
              accountNo: cashAccountForMethod(p.method),
              debit: p.amount,
              memo: `Penerimaan ${o.id}`,
            },
            {
              accountNo: resolveAccount('receivable', { party }),
              credit: p.amount,
              memo: `Pelunasan ${o.id}`,
            },
          ]
        );
        if (j) {
          out.push(j);
        }
      });

    return out;
  }

  // ── Purchase orders invoiced per goods receipt ──────────────────────────────
  // A PO can be billed one goods receipt at a time (pipeline-extras
  // invoiceFromReceipt: the invoice carries receiptId). From its first such
  // invoice the PO has an active invoice, so the PO-level receipt journal stops.
  // Instead, every posted goods receipt that no active invoice covers yet posts
  // on its own, and a PO marked Received with more than its receipts brought in
  // posts that remainder. Inventory and payable then carry everything received:
  // invoiced receipts through their invoices, the rest at receipt qty × unit
  // price (the receipt's price, else the PO's net price) and the PO's PPN.
  function sameId(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
  }

  function receiptInvoices(poId) {
    return (db().purchaseInvoices || []).filter(
      inv =>
        isActiveInvoice(inv) &&
        !!inv.receiptId &&
        sameId(inv.sourceId, poId) &&
        (!inv.sourceType || inv.sourceType === 'PO')
    );
  }

  function netUnitPrice(l) {
    const qty = Number(l.qty) || 0;
    return qty > 0 && l.subtotal != null ? (Number(l.subtotal) || 0) / qty : Number(l.price) || 0;
  }

  // A purchase-shaped document (lines, PPN, amount) for received quantities.
  function receivedDoc(po, lines) {
    const rate = docTaxRate(po);
    const incl = rate > 0 && !!po.taxInclusive;
    const net = round(lines.reduce((s, l) => s + l.subtotal, 0));
    const tax = rate > 0 ? round(incl ? (net * rate) / (1 + rate) : net * rate) : 0;
    return { lines, taxRate: rate, taxInclusive: incl, tax, amount: incl ? net : net + tax };
  }

  // What a PO invoiced per goods receipt has received but not invoiced yet:
  // [{ id, date, receiptId, doc }] (doc.amount includes PPN). Empty for any other
  // PO — those post through the PO-level journal or a PO-level invoice.
  function receivedNotInvoiced(po) {
    if (!po || po.pickupFlow || isCancelled(po)) {
      return [];
    }
    const invoiced = new Set(receiptInvoices(po.id).map(inv => String(inv.receiptId)));
    if (invoiced.size === 0) {
      return [];
    }
    const poLines = po.lines || [];
    const receipts = (db().goodsReceipts || []).filter(r => r.posted && sameId(r.poId, po.id));
    const out = [];
    receipts.forEach(r => {
      if (invoiced.has(String(r.id))) {
        return;
      }
      const lines = (r.items || []).map(it => {
        const pl =
          poLines.find(l => sameId(l.itemId, it.itemId)) ||
          poLines.find(l => l.itemName && l.itemName === it.itemName) ||
          {};
        const qty = Number(it.qty) || 0;
        const price = Number(it.unitPrice) > 0 ? Number(it.unitPrice) : netUnitPrice(pl);
        return { itemId: it.itemId || pl.itemId, qty, price, subtotal: qty * price };
      });
      out.push({ id: r.id, date: r.date || po.date, receiptId: r.id, doc: receivedDoc(po, lines) });
    });
    if (po.status === 'Received') {
      // Quantities the receipts did not bring in (PO set to Received directly).
      const got = new Map();
      receipts.forEach(r =>
        (r.items || []).forEach(it => {
          const key = String(it.itemId);
          got.set(key, (got.get(key) || 0) + (Number(it.qty) || 0));
        })
      );
      const rest = [];
      poLines.forEach(l => {
        const key = String(l.itemId);
        const qty = Number(l.qty) || 0;
        const have = got.get(key) || 0;
        const take = Math.min(have, qty);
        got.set(key, have - take);
        if (qty - take > 1e-9) {
          const price = netUnitPrice(l);
          rest.push({ itemId: l.itemId, qty: qty - take, price, subtotal: (qty - take) * price });
        }
      });
      if (rest.length) {
        out.push({ id: po.id, date: po.receivedAt || po.date, receiptId: null, doc: receivedDoc(po, rest) });
      }
    }
    return out;
  }

  // ── Purchase Order posting ──────────────────────────────────────────────────
  function buildPOJournals(o) {
    const out = [];
    const party = (db().suppliers || []).find(s => s.id === o.supplierId) || null;

    if (
      o.status === 'Received' &&
      !o.pickupFlow &&
      !hasActiveInvoice('purchaseInvoices', 'PO', o.id)
    ) {
      const j = makeJournal(
        `J:PO:${o.id}:recv`,
        o.id,
        o.date,
        { docType: 'PO', docId: o.id },
        purchaseLines(o, party, o.id, false)
      );
      if (j) {
        out.push(j);
      }
    }

    receivedNotInvoiced(o).forEach(p => {
      const j = p.receiptId
        ? makeJournal(
            `J:GR:${p.receiptId}:recv`,
            p.receiptId,
            p.date,
            { docType: 'GR', docId: p.receiptId },
            purchaseLines(p.doc, party, `${p.receiptId} (${o.number || o.id})`, false)
          )
        : makeJournal(
            `J:PO:${o.id}:recv`,
            o.id,
            p.date,
            { docType: 'PO', docId: o.id },
            purchaseLines(p.doc, party, o.id, false)
          );
      if (j) {
        out.push(j);
      }
    });

    (db().paymentLogs || [])
      .filter(p => p.type === 'PO' && p.orderId === o.id && !isDownPaymentLog(p))
      .forEach(p => {
        const j = makeJournal(
          `J:PO:${o.id}:pay:${p.id}`,
          o.id,
          p.date || o.date,
          { docType: 'PO', docId: o.id },
          [
            {
              accountNo: resolveAccount('payable', { party }),
              debit: p.amount,
              memo: `Pelunasan ${o.id}`,
            },
            {
              accountNo: cashAccountForMethod(p.method),
              credit: p.amount,
              memo: `Pembayaran ${o.id}`,
            },
          ]
        );
        if (j) {
          out.push(j);
        }
      });

    return out;
  }

  // ── Sales Invoice posting ───────────────────────────────────────────────────
  function invoiceSourceOrder(inv) {
    if (!inv.sourceId || (inv.sourceType && inv.sourceType !== 'SO')) {
      return null;
    }
    return (db().salesOrders || []).find(o => o.id === inv.sourceId) || null;
  }

  function buildSIJournals(inv) {
    if (!isActiveInvoice(inv)) {
      return [];
    }
    const party = (db().customers || []).find(c => c.id === inv.customerId) || null;
    const label = inv.number || inv.id;
    const raw = revenueLines(inv, party, label, false);
    // The goods movement belongs to the source order's delivery, or to the trips
    // an invoice was made from (doIds). Only an invoice with neither (e.g.
    // imported) books COGS itself, at item cost.
    const fromTrips = Array.isArray(inv.doIds) && inv.doIds.length > 0;
    if (!invoiceSourceOrder(inv) && !fromTrips) {
      const cogs = round(staticCost(inv.lines || []));
      raw.push(
        { accountNo: resolveAccount('cogs', { party }), debit: cogs, memo: 'HPP' },
        {
          accountNo: resolveAccount('inventory', { party }),
          credit: cogs,
          memo: 'Pengurangan persediaan',
        }
      );
    }
    const j = makeJournal(`J:SI:${inv.id}:rev`, label, inv.date, { docType: 'SI', docId: inv.id }, raw);
    return j ? [j] : [];
  }

  // ── Purchase Invoice posting ────────────────────────────────────────────────
  function buildPIJournals(inv) {
    if (!isActiveInvoice(inv)) {
      return [];
    }
    const party = (db().suppliers || []).find(s => s.id === inv.supplierId) || null;
    const label = inv.number || inv.id;
    const j = makeJournal(
      `J:PI:${inv.id}:recv`,
      label,
      inv.date,
      { docType: 'PI', docId: inv.id },
      purchaseLines(inv, party, label, false)
    );
    return j ? [j] : [];
  }

  // ── Trading pickups (trips) ─────────────────────────────────────────────────
  // A trip (delivery order with pickup:true, weighed) posts:
  //   • the purchase — Inventory + PPN Masukan / Payable — unless a purchase
  //     invoice made from trips covers it (the invoice posts it then);
  //   • the cost of sales at the trip's purchase price — HPP / Inventory; goods
  //     go straight from supplier to customer, so inventory nets to zero;
  //   • the sale — Receivable / Sales + PPN Keluaran — unless a sales invoice
  //     made from trips covers it.
  function tripCovered(collection, doId) {
    return (db()[collection] || []).some(
      inv =>
        isActiveInvoice(inv) &&
        Array.isArray(inv.doIds) &&
        inv.doIds.some(x => String(x) === String(doId))
    );
  }

  function buildPickupJournals(d) {
    if (!d || d.pickup !== true || d.status === 'Pending' || d.status === 'Cancelled') {
      return [];
    }
    const T = window.Trading;
    if (!T || !T.isTrip(d)) {
      return [];
    }
    const a = T.amounts(d);
    const supplier = (db().suppliers || []).find(s => String(s.id) === String(d.supplierId)) || null;
    const customer = (db().customers || []).find(c => String(c.id) === String(d.customerId)) || null;
    const label = d.sjNo || d.number || d.id;
    const raw = [];
    if (!tripCovered('purchaseInvoices', d.id)) {
      raw.push(
        { accountNo: resolveAccount('inventory', { party: supplier }), debit: a.purchase.dpp, memo: `Pembelian ${label}` },
        { accountNo: resolveAccount('ppnIn', { party: supplier }), debit: a.purchase.tax, memo: `PPN Masukan ${label}` },
        { accountNo: resolveAccount('payable', { party: supplier }), credit: a.purchase.total, memo: `Hutang ${label}` }
      );
    }
    raw.push(
      { accountNo: resolveAccount('cogs', { party: customer }), debit: a.purchase.dpp, memo: `HPP ${label}` },
      { accountNo: resolveAccount('inventory', { party: customer }), credit: a.purchase.dpp, memo: `Pengambilan ${label}` }
    );
    if (!tripCovered('salesInvoices', d.id)) {
      raw.push(
        { accountNo: resolveAccount('receivable', { party: customer }), debit: a.sale.total, memo: `Piutang ${label}` },
        { accountNo: resolveAccount('sales', { party: customer }), credit: a.sale.dpp, memo: `Penjualan ${label}` },
        { accountNo: resolveAccount('ppnOut', { party: customer }), credit: a.sale.tax, memo: `PPN Keluaran ${label}` }
      );
    }
    const j = makeJournal(`J:DO:${d.id}:trip`, label, d.date, { docType: 'DO', docId: d.id }, raw);
    return j ? [j] : [];
  }

  // ── Sales Receipt posting ───────────────────────────────────────────────────
  function buildSRJournals(r) {
    if (r.status !== 'Posted') {
      return [];
    }
    const party = (db().customers || []).find(c => c.id === r.customerId) || null;
    const j = makeJournal(
      `J:SR:${r.id}`,
      r.number || r.id,
      r.date,
      { docType: 'SR', docId: r.id },
      [
        {
          accountNo: cashAccountForMethod(r.paymentMethod || 'Tunai'),
          debit: round(r.amount),
          memo: `Penerimaan ${r.number || r.id}`,
        },
        {
          accountNo: resolveAccount('receivable', { party }),
          credit: round(r.amount),
          memo: `Pelunasan ${r.number || r.id}`,
        },
      ]
    );
    return j ? [j] : [];
  }

  // ── Purchase Payment posting ────────────────────────────────────────────────
  function buildPPJournals(p) {
    if (p.status !== 'Posted') {
      return [];
    }
    const party = (db().suppliers || []).find(s => s.id === p.supplierId) || null;
    const j = makeJournal(
      `J:PP:${p.id}`,
      p.number || p.id,
      p.date,
      { docType: 'PP', docId: p.id },
      [
        {
          accountNo: resolveAccount('payable', { party }),
          debit: round(p.amount),
          memo: `Pelunasan ${p.number || p.id}`,
        },
        {
          accountNo: cashAccountForMethod(p.paymentMethod || 'Tunai'),
          credit: round(p.amount),
          memo: `Pembayaran ${p.number || p.id}`,
        },
      ]
    );
    return j ? [j] : [];
  }

  // ── Sales Return posting ────────────────────────────────────────────────────
  // Posted: reverses the revenue side of the sale and returns the goods to
  // inventory at item cost (Dr Inventory / Cr COGS).
  function buildSRNJournals(r) {
    if (r.status !== 'Posted') {
      return [];
    }
    const party = (db().customers || []).find(c => c.id === r.customerId) || null;
    const raw = revenueLines(r, party, r.id, true);
    const cogs = round(staticCost(r.lines || []));
    raw.push(
      {
        accountNo: resolveAccount('inventory', { party }),
        debit: cogs,
        memo: 'Pengembalian persediaan ' + r.id,
      },
      { accountNo: resolveAccount('cogs', { party }), credit: cogs, memo: 'Reversal HPP ' + r.id }
    );
    const j = makeJournal('J:SRN:' + r.id, r.number || r.id, r.date, { docType: 'SRN', docId: r.id }, raw);
    return j ? [j] : [];
  }

  // ── Purchase Return posting ─────────────────────────────────────────────────
  // Posted: reverses the purchase (Dr Payable / Cr Inventory, Expense, PPN Masukan).
  function buildPRNJournals(r) {
    if (r.status !== 'Posted') {
      return [];
    }
    const party = (db().suppliers || []).find(s => s.id === r.supplierId) || null;
    const j = makeJournal(
      'J:PRN:' + r.id,
      r.number || r.id,
      r.date,
      { docType: 'PRN', docId: r.id },
      purchaseLines(r, party, r.id, true)
    );
    return j ? [j] : [];
  }

  // ── Item Adjustment posting ─────────────────────────────────────────────────
  // Inventory increase  → Dr Inventory / Cr Beban Penyesuaian (a gain).
  // Inventory decrease  → Dr Beban Penyesuaian / Cr Inventory (a loss).
  // The signed value comes from the cost ledger (moving-average for outs).
  function buildAdjustmentJournals(a) {
    let value = 0;
    if (window.CostLedger && typeof window.CostLedger.valueForAdjustment === 'function') {
      value = round(window.CostLedger.valueForAdjustment(a.id));
    }
    if (value === 0) {
      return [];
    }
    const inv = resolveAccount('inventory', {});
    const adj = resolveAccount('inventoryAdjustment', {});
    const raw =
      value > 0
        ? [
            { accountNo: inv, debit: value, memo: `Penyesuaian + ${a.id}` },
            { accountNo: adj, credit: value, memo: 'Selisih persediaan (lebih)' },
          ]
        : [
            { accountNo: adj, debit: -value, memo: 'Selisih persediaan (kurang)' },
            { accountNo: inv, credit: -value, memo: `Penyesuaian − ${a.id}` },
          ];
    const j = makeJournal(
      `J:ADJ:${a.id}`,
      a.number || a.id,
      a.date,
      { docType: 'ADJ', docId: a.id },
      raw
    );
    return j ? [j] : [];
  }

  // ── Down Payment posting ────────────────────────────────────────────────────
  // Sales DP (Received):   Dr Cash / Cr Uang Muka Penjualan
  // Sales DP (Applied):    Dr Uang Muka Penjualan / Cr Receivable
  // Purchase DP (Paid):    Dr Uang Muka Pembelian / Cr Cash
  // Purchase DP (Applied): Dr Payable / Cr Uang Muka Pembelian
  function buildSalesDPJournals(dp) {
    const out = [];
    const amt = round(dp.amount);
    if (amt <= 0) return out;
    const adv = resolveAccount('advanceReceived', {});
    if (dp.status === 'Received' || dp.status === 'Applied') {
      const j = makeJournal(
        `J:SDP:${dp.id}:recv`,
        dp.id,
        dp.date,
        { docType: 'SDP', docId: dp.id },
        [
          { accountNo: cashAccountForMethod(dp.method || 'Tunai'), debit: amt, memo: `DP diterima ${dp.id}` },
          { accountNo: adv, credit: amt, memo: `Uang muka ${dp.orderId}` },
        ]
      );
      if (j) out.push(j);
    }
    if (dp.status === 'Applied') {
      const party = (db().customers || []).find(c => c.name === dp.customerName) || null;
      const j = makeJournal(
        `J:SDP:${dp.id}:apply`,
        dp.id,
        dp.appliedDate || dp.date,
        { docType: 'SDP', docId: dp.id },
        [
          { accountNo: adv, debit: amt, memo: `Penerapan DP ${dp.id}` },
          { accountNo: resolveAccount('receivable', { party }), credit: amt, memo: `Potong piutang ${dp.orderId}` },
        ]
      );
      if (j) out.push(j);
    }
    return out;
  }

  function buildPurchaseDPJournals(dp) {
    const out = [];
    const amt = round(dp.amount);
    if (amt <= 0) return out;
    const adv = resolveAccount('advancePaid', {});
    if (dp.status === 'Paid' || dp.status === 'Applied') {
      const j = makeJournal(
        `J:PDP:${dp.id}:paid`,
        dp.id,
        dp.date,
        { docType: 'PDP', docId: dp.id },
        [
          { accountNo: adv, debit: amt, memo: `Uang muka ${dp.orderId}` },
          { accountNo: cashAccountForMethod(dp.method || 'Tunai'), credit: amt, memo: `DP dibayar ${dp.id}` },
        ]
      );
      if (j) out.push(j);
    }
    if (dp.status === 'Applied') {
      const party = (db().suppliers || []).find(s => s.name === dp.supplierName) || null;
      const j = makeJournal(
        `J:PDP:${dp.id}:apply`,
        dp.id,
        dp.appliedDate || dp.date,
        { docType: 'PDP', docId: dp.id },
        [
          { accountNo: resolveAccount('payable', { party }), debit: amt, memo: `Potong hutang ${dp.orderId}` },
          { accountNo: adv, credit: amt, memo: `Penerapan DP ${dp.id}` },
        ]
      );
      if (j) out.push(j);
    }
    return out;
  }

  // ── Payroll posting ─────────────────────────────────────────────────────────
  function buildPayrollJournals(run) {
    if (!run.posted || !run.totalAmount) return [];
    const salary = (run.details || []).reduce((s, d) => s + (d.salary || 0), 0);
    const allowance = (run.details || []).reduce((s, d) => s + (d.transport || 0) + (d.meal || 0), 0);
    const total = round(salary + allowance);
    if (total <= 0) return [];
    const lines = [];
    if (salary > 0) lines.push({ accountNo: resolveAccount('salaryExpense', {}), debit: round(salary), memo: `Gaji ${run.period}` });
    if (allowance > 0) lines.push({ accountNo: resolveAccount('allowanceExpense', {}), debit: round(allowance), memo: `Tunjangan ${run.period}` });
    lines.push({ accountNo: resolveAccount('salaryPayable', {}), credit: total, memo: `Hutang gaji ${run.period}` });
    const j = makeJournal(`J:PAY:${run.id}`, run.id, run.date, { docType: 'PAY', docId: run.id }, lines);
    return j ? [j] : [];
  }

  // ── Kas & Bank: other payments, other deposits, bank transfers ──────────────
  // Other Payment : Dr expense (record's accountNo, else by category) / Cr cash-bank
  // Other Deposit : Dr cash-bank / Cr other income (category 'Penjualan' → Sales)
  // Bank Transfer : Dr destination (+ Dr bank fee) / Cr source (amount + fee)
  function buildOtherPaymentJournals(p) {
    const amt = round(p.amount);
    if (amt <= 0 || isCancelled(p)) return [];
    const label = p.number || p.id;
    const expense =
      p.accountNo || resolveAccount(PAYMENT_CATEGORY_SLOTS[p.category] || 'purchaseExpense', {});
    const j = makeJournal(`J:OP:${p.id}`, label, p.date, { docType: 'OP', docId: p.id }, [
      {
        accountNo: expense,
        debit: amt,
        memo: [p.category, p.payee].filter(Boolean).join(' — ') || `Pengeluaran ${label}`,
      },
      { accountNo: bankAccountGL(p.bankAccountId, p.method), credit: amt, memo: `Pengeluaran ${label}` },
    ]);
    return j ? [j] : [];
  }

  function buildOtherDepositJournals(d) {
    const amt = round(d.amount);
    if (amt <= 0 || isCancelled(d)) return [];
    const label = d.number || d.id;
    const income =
      d.accountNo || resolveAccount(d.category === 'Penjualan' ? 'sales' : 'otherIncome', {});
    const j = makeJournal(`J:OD:${d.id}`, label, d.date, { docType: 'OD', docId: d.id }, [
      { accountNo: bankAccountGL(d.bankAccountId, d.method), debit: amt, memo: `Penerimaan ${label}` },
      {
        accountNo: income,
        credit: amt,
        memo: [d.category, d.payer].filter(Boolean).join(' — ') || `Penerimaan ${label}`,
      },
    ]);
    return j ? [j] : [];
  }

  function buildBankTransferJournals(t) {
    const amt = round(t.amount);
    const fee = round(t.fee);
    if (amt <= 0 || isCancelled(t)) return [];
    const label = t.number || t.id;
    const j = makeJournal(`J:BT:${t.id}`, label, t.date, { docType: 'BT', docId: t.id }, [
      { accountNo: bankAccountGL(t.toAccountId), debit: amt, memo: `Transfer masuk ${label}` },
      { accountNo: resolveAccount('bankFee', {}), debit: fee, memo: `Biaya transfer ${label}` },
      { accountNo: bankAccountGL(t.fromAccountId), credit: amt + fee, memo: `Transfer keluar ${label}` },
    ]);
    return j ? [j] : [];
  }

  // ── Reconcile: rebuild all auto-journals, preserve manual + imported ones ───
  function isManual(j) {
    return j.source === 'manual' || (j.source && j.source.docType === 'JV');
  }
  function isAccurate(j) {
    return !!j._accurateId;
  }

  function reconcileAll() {
    const data = db();
    ensureChart();
    // Drop the cost-ledger cache so COGS reflects the current stock state.
    if (window.CostLedger && typeof window.CostLedger.invalidate === 'function') {
      window.CostLedger.invalidate();
    }
    const manual = (data.journals || []).filter(isManual);
    // Manual vouchers are also kept in DB.journalVouchers — the store that syncs
    // across devices (derived journals don't). Merge vouchers that arrived from
    // another device, and backfill the store with vouchers that only exist here.
    if (!Array.isArray(data.journalVouchers)) {
      data.journalVouchers = [];
    }
    const inLedger = new Set(manual.map(j => j.id));
    data.journalVouchers.forEach(j => {
      if (j && !inLedger.has(j.id)) {
        manual.push(j);
        inLedger.add(j.id);
      }
    });
    const inStore = new Set(data.journalVouchers.map(j => j && j.id));
    manual.forEach(j => {
      if (!inStore.has(j.id)) {
        data.journalVouchers.push(JSON.parse(JSON.stringify(j)));
      }
    });
    const accurate = (data.journals || []).filter(isAccurate);
    const auto = [];
    const add = (collection, build) =>
      (data[collection] || []).forEach(d => build(d).forEach(j => auto.push(j)));
    add('salesOrders', buildSOJournals);
    add('purchaseOrders', buildPOJournals);
    add('itemAdjustments', buildAdjustmentJournals);
    add('salesInvoices', buildSIJournals);
    add('purchaseInvoices', buildPIJournals);
    add('salesReceipts', buildSRJournals);
    add('purchasePayments', buildPPJournals);
    add('salesReturns', buildSRNJournals);
    add('purchaseReturns', buildPRNJournals);
    add('salesDownPayments', buildSalesDPJournals);
    add('purchaseDownPayments', buildPurchaseDPJournals);
    add('payrollRuns', buildPayrollJournals);
    add('otherPayments', buildOtherPaymentJournals);
    add('otherDeposits', buildOtherDepositJournals);
    add('bankTransfers', buildBankTransferJournals);
    add('deliveryOrders', buildPickupJournals);
    data.journals = [...accurate, ...manual, ...auto];
    return auto.length;
  }

  // Journals derived from one document (e.g. for a "Dampak akuntansi" panel).
  function journalsForDoc(docType, docId) {
    return (db().journals || []).filter(
      j =>
        j &&
        j.source &&
        typeof j.source === 'object' &&
        j.source.docType === docType &&
        String(j.source.docId) === String(docId)
    );
  }

  // ── Trial Balance (computed live from journals) ─────────────────────────────
  function trialBalance() {
    ensureChart();
    const sums = new Map(); // no -> {debit, credit}
    (db().journals || []).forEach(j => {
      (j.lines || []).forEach(l => {
        const cur = sums.get(l.accountNo) || { debit: 0, credit: 0 };
        cur.debit += Number(l.debit) || 0;
        cur.credit += Number(l.credit) || 0;
        sums.set(l.accountNo, cur);
      });
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;
    // Iterate the union of chart accounts and any account that actually appears in a
    // journal, so a line referencing an account missing from the chart still shows
    // (and keeps the trial balance balanced).
    const order = chart().map(a => a.no);
    const seen = new Set(order);
    sums.forEach((_v, no) => {
      if (!seen.has(no)) {
        order.push(no);
        seen.add(no);
      }
    });
    order.forEach(no => {
      const acc = chart().find(a => a.no === no) || { no, name: accountName(no), type: 'UNKNOWN' };
      const s = sums.get(acc.no);
      if (!s) {
        return;
      }
      // Net the account, then present it on a single side: positive net → Debit,
      // negative net → Credit. Totals stay equal as long as every journal balances.
      const net = s.debit - s.credit;
      const debit = round(net > 0 ? net : 0);
      const credit = round(net < 0 ? -net : 0);
      // A fully-settled account (net zero) is omitted from the trial balance.
      if (debit === 0 && credit === 0) {
        return;
      }
      rows.push({ no: acc.no, name: acc.name, type: acc.type, debit, credit });
      totalDebit += debit;
      totalCredit += credit;
    });

    return {
      rows,
      totalDebit,
      totalCredit,
      balanced: totalDebit === totalCredit,
    };
  }

  // ── Manual Journal Voucher (double-entry enforced) ──────────────────────────
  function postJournalVoucher(date, rawLines, memo) {
    const data = db();
    if (!Array.isArray(data.journals)) {
      data.journals = [];
    }
    const number =
      window.DocEngine && typeof window.DocEngine.nextNumber === 'function'
        ? window.DocEngine.nextNumber('JV', date, { sequences: data.numberSequences, docs: data.journals, commit: true })
        : `JV-${Date.now()}`;
    const j = makeJournal(`J:JV:${number}`, number, date, 'manual', rawLines);
    if (!j) {
      throw new Error('Jurnal kosong — tidak ada nilai debit/kredit');
    }
    if (j.totals.debit !== j.totals.credit) {
      throw new Error(`Jurnal tidak seimbang: debit ${j.totals.debit} ≠ kredit ${j.totals.credit}`);
    }
    if (memo) {
      j.memo = memo;
    }
    data.journals.push(j);
    if (!Array.isArray(data.journalVouchers)) {
      data.journalVouchers = [];
    }
    data.journalVouchers.push(JSON.parse(JSON.stringify(j)));
    return j;
  }

  const GL = {
    DEFAULT_CHART,
    COMPANY_DEFAULTS,
    ensureChart,
    resolveAccount,
    accountName,
    bankAccountGL,
    hasActiveInvoice,
    receivedNotInvoiced,
    buildSOJournals,
    buildPOJournals,
    buildSIJournals,
    buildPIJournals,
    buildSRJournals,
    buildPPJournals,
    buildAdjustmentJournals,
    buildSRNJournals,
    buildPRNJournals,
    buildSalesDPJournals,
    buildPurchaseDPJournals,
    buildPayrollJournals,
    buildOtherPaymentJournals,
    buildOtherDepositJournals,
    buildBankTransferJournals,
    buildPickupJournals,
    journalsForDoc,
    reconcileAll,
    trialBalance,
    postJournalVoucher,
  };

  window.GL = GL;
  try {
    if (!window.ERP) {
      window.ERP = {};
    }
    window.ERP.gl = GL;
  } catch {
    /* window.GL is the canonical handle */
  }
})();
