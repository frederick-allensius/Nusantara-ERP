// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Invoices, Receipts & Payments  (invoice-view.js)
//
// One view (#view-invoices), shown per side:
//   Penjualan  → SI Faktur Penjualan · SR Penerimaan Pembayaran
//   Pembelian  → PI Faktur Pembelian · PP Pembayaran ke Supplier
//
// Business rules (docs/03-ALUR-TRANSAKSI.md, docs/04-AKUNTANSI.md):
//   • An invoice is created from one SO/PO and inherits its lines and PPN.
//     An order has at most one active invoice.
//   • Once an order is invoiced, the invoice carries revenue & receivable (or
//     inventory & payable) in the ledger; gl.js stops posting the order's own entry.
//   • Receipts/payments settle an invoice. Its status follows the balance from
//     Balances, which also counts payments logged on the source order.
//   • Corrections: cancel the receipt/payment first, then the invoice. Cancelled
//     documents stay listed and post nothing.
//   • Invoices made from pickups (pickup-billing.js) list their trips in doIds;
//     cancelling one frees the trips for the next invoice (Trading.releaseInvoice).
//
// Global-scope rule: classic <script>, IIFE-wrapped; exposes window.renderInvoices,
// window.viewInvoiceDoc and window._invoiceExtras.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'SI'; // 'SI' | 'PI' | 'SR' | 'PP'

  const TYPES = {
    SI: {
      label: 'Faktur Penjualan',
      sub: 'Tagihan ke pelanggan atas pesanan yang sudah dikirim',
      add: 'Buat Faktur',
      coll: 'salesInvoices',
      side: 'sales',
      party: 'customer',
      partyId: 'customerId',
      partyLabel: 'Pelanggan',
      srcType: 'SO',
      srcColl: 'salesOrders',
      srcStatus: 'Delivered',
      srcLabel: 'Sales Order',
      settleType: 'SR',
      returnsColl: 'salesReturns',
      pair: 'SR',
    },
    PI: {
      label: 'Faktur Pembelian',
      sub: 'Tagihan dari supplier atas pesanan yang sudah diterima',
      add: 'Buat Faktur',
      coll: 'purchaseInvoices',
      side: 'purchases',
      party: 'supplier',
      partyId: 'supplierId',
      partyLabel: 'Supplier',
      srcType: 'PO',
      srcColl: 'purchaseOrders',
      srcStatus: 'Received',
      srcLabel: 'Purchase Order',
      settleType: 'PP',
      returnsColl: 'purchaseReturns',
      pair: 'PP',
    },
    SR: {
      label: 'Penerimaan Pembayaran',
      sub: 'Uang masuk dari pelanggan untuk melunasi faktur',
      add: 'Catat Penerimaan',
      coll: 'salesReceipts',
      side: 'sales',
      party: 'customer',
      partyId: 'customerId',
      partyLabel: 'Pelanggan',
      invType: 'SI',
      pair: 'SI',
    },
    PP: {
      label: 'Pembayaran ke Supplier',
      sub: 'Uang keluar untuk melunasi faktur supplier',
      add: 'Catat Pembayaran',
      coll: 'purchasePayments',
      side: 'purchases',
      party: 'supplier',
      partyId: 'supplierId',
      partyLabel: 'Supplier',
      invType: 'PI',
      pair: 'PI',
    },
  };
  const METHODS = ['Transfer BCA', 'Transfer Mandiri', 'Tunai', 'Lainnya'];

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s === null || s === undefined ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : `Rp ${v}`;
  }
  function db() {
    return window.DB || {};
  }
  function B() {
    return window.Balances;
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    }
  }
  function badge(status) {
    return typeof window.badge === 'function' ? window.badge(status) : esc(status);
  }
  function todayStr() {
    return typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
  }
  function docNo(d) {
    return d ? d.number || d.id : '';
  }
  function same(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
  }
  function findDoc(type, id) {
    return (db()[TYPES[type].coll] || []).find(d => same(d.id, id)) || null;
  }
  function fmtDate(iso) {
    if (!iso) {
      return '—';
    }
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d)
      ? esc(iso)
      : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function currentUser() {
    try {
      const u = window.erpAuth && window.erpAuth.getCurrentUser && window.erpAuth.getCurrentUser();
      return (u && (u.username || u.displayName || u.email)) || '';
    } catch (_) {
      return '';
    }
  }
  function save() {
    if (typeof window.saveDB === 'function') {
      window.saveDB();
    }
  }
  function isInvoice(type) {
    return type === 'SI' || type === 'PI';
  }

  // ── List ────────────────────────────────────────────────────────────────────
  function tabsHTML() {
    const tabs = TYPES[activeTab].side === 'sales' ? ['SI', 'SR'] : ['PI', 'PP'];
    return (
      '<div class="seg-tabs" role="tablist">' +
      tabs
        .map(
          t =>
            `<button class="seg-tab${t === activeTab ? ' active' : ''}" role="tab" aria-selected="${t === activeTab}" data-action="invTab" data-val="${t}">${esc(TYPES[t].label)}</button>`
        )
        .join('') +
      '</div>'
    );
  }

  function statsHTML(type) {
    const t = TYPES[type];
    const statRow = window.statRow;
    if (typeof statRow !== 'function' || !B()) {
      return '';
    }
    const month = todayStr().slice(0, 7);
    if (isInvoice(type)) {
      const items = B()
        .openItems(t.side)
        .filter(it => it.docType === type);
      const outstanding = items.reduce((s, it) => s + it.outstanding, 0);
      const overdueItems = items.filter(it => it.overdue);
      const overdue = overdueItems.reduce((s, it) => s + it.outstanding, 0);
      const thisMonth = (db()[t.coll] || []).filter(
        d => B().isActiveInvoice(d) && String(d.date || '').slice(0, 7) === month
      );
      return statRow([
        { label: 'Belum dibayar', value: money(outstanding), sub: `${items.length} faktur` },
        {
          label: 'Lewat jatuh tempo',
          value: money(overdue),
          sub: `${overdueItems.length} faktur`,
          color: overdue > 0 ? 'var(--danger)' : undefined,
        },
        {
          label: 'Faktur bulan ini',
          value: money(thisMonth.reduce((s, d) => s + (Number(d.amount) || 0), 0)),
          sub: `${thisMonth.length} faktur`,
        },
      ]);
    }
    const posted = (db()[t.coll] || []).filter(d => d.status === 'Posted');
    const monthDocs = posted.filter(d => String(d.date || '').slice(0, 7) === month);
    return statRow([
      {
        label: type === 'SR' ? 'Diterima bulan ini' : 'Dibayar bulan ini',
        value: money(monthDocs.reduce((s, d) => s + (Number(d.amount) || 0), 0)),
        sub: `${monthDocs.length} transaksi`,
      },
      {
        label: 'Total tercatat',
        value: money(posted.reduce((s, d) => s + (Number(d.amount) || 0), 0)),
        sub: `${posted.length} transaksi`,
      },
    ]);
  }

  function byDateDesc(a, b) {
    const da = a.date || '';
    const dbb = b.date || '';
    if (da !== dbb) {
      return da < dbb ? 1 : -1;
    }
    return String(b.number || b.id).localeCompare(String(a.number || a.id));
  }

  function emptyHTML(type) {
    const t = TYPES[type];
    const hint = isInvoice(type)
      ? `Faktur dibuat dari ${t.srcLabel} yang sudah ${type === 'SI' ? 'terkirim' : 'diterima'}.`
      : `${t.label} dicatat untuk melunasi faktur yang belum lunas.`;
    return `<div class="card"><div class="empty-state">
      <div class="empty-title">Belum ada ${esc(t.label.toLowerCase())}</div>
      <div class="empty-text">${esc(hint)}</div>
      <button class="btn" data-action="invNew">${esc(t.add)}</button>
    </div></div>`;
  }

  function listHTML(type) {
    const t = TYPES[type];
    const docs = (db()[t.coll] || []).slice().sort(byDateDesc);
    if (docs.length === 0) {
      return emptyHTML(type);
    }
    const today = todayStr();
    let head;
    let rows;
    if (isInvoice(type)) {
      head = `<th>No. Faktur</th><th>${t.partyLabel}</th><th>Tanggal</th><th>Jatuh Tempo</th><th class="t-num">Total</th><th class="t-num">Sisa</th><th>Status</th><th></th>`;
      rows = docs
        .map(d => {
          const active = B() && B().isActiveInvoice(d);
          const bal = active ? B().invoiceBalance(t.side, d) : null;
          const due = active ? B().dueDateFor(t.side, d) : d.dueDate || '';
          const overdue = active && bal.outstanding > B().EPS && due && due < today;
          return `<tr class="row-link" data-action="invView" data-id="${esc(d.id)}" data-type="${type}">
            <td class="doc-no">${esc(docNo(d))}</td>
            <td class="t-strong">${esc(d[t.party] || '—')}</td>
            <td class="t-muted">${fmtDate(d.date)}</td>
            <td class="${overdue ? 't-danger' : 't-muted'}">${fmtDate(due)}</td>
            <td class="t-num">${money(d.amount || 0)}</td>
            <td class="t-num">${bal ? (bal.outstanding > B().EPS ? money(bal.outstanding) : '<span class="t-muted">—</span>') : '<span class="t-muted">—</span>'}</td>
            <td>${badge(d.status)}${overdue ? ' <span class="chip chip-danger">Lewat tempo</span>' : ''}</td>
            <td class="t-actions"><button class="action-ghost" data-action="invView" data-id="${esc(d.id)}" data-type="${type}">Lihat</button></td>
          </tr>`;
        })
        .join('');
    } else {
      const invColl = TYPES[t.invType].coll;
      head = `<th>No.</th><th>${t.partyLabel}</th><th>Tanggal</th><th>Faktur</th><th>Metode</th><th class="t-num">Jumlah</th><th>Status</th><th></th>`;
      rows = docs
        .map(d => {
          const inv = (db()[invColl] || []).find(i => same(i.id, d.invoiceId));
          return `<tr class="row-link" data-action="invView" data-id="${esc(d.id)}" data-type="${type}">
            <td class="doc-no">${esc(docNo(d))}</td>
            <td class="t-strong">${esc(d[t.party] || '—')}</td>
            <td class="t-muted">${fmtDate(d.date)}</td>
            <td class="t-muted">${esc(inv ? docNo(inv) : d.invoiceNumber || d.invoiceId || '—')}</td>
            <td class="t-muted">${esc(d.paymentMethod || '—')}</td>
            <td class="t-num">${money(d.amount || 0)}</td>
            <td>${badge(d.status)}</td>
            <td class="t-actions"><button class="action-ghost" data-action="invView" data-id="${esc(d.id)}" data-type="${type}">Lihat</button></td>
          </tr>`;
        })
        .join('');
    }
    return `<div class="card card-flush"><div class="table-wrap"><table class="data-table">
      <thead><tr>${head}</tr></thead><tbody>${rows}</tbody>
    </table></div></div>`;
  }

  function renderInvoices() {
    const t = TYPES[activeTab];
    const header =
      typeof window.secHdr === 'function'
        ? window.secHdr(t.label, t.sub, t.add, 'invNew')
        : `<h1>${esc(t.label)}</h1>`;
    return `${header}${tabsHTML()}${statsHTML(activeTab)}${listHTML(activeTab)}`;
  }

  function refresh() {
    const el = document.getElementById('view-invoices');
    if (el && window.activeView === 'invoices') {
      el.innerHTML = renderInvoices();
    } else if (typeof window.invalidateView === 'function') {
      window.invalidateView('invoices');
    }
  }

  // ── Create invoice ──────────────────────────────────────────────────────────
  function invoiceTotals(src) {
    const lines = src.lines || [];
    const net = lines.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
    const rate = Number(src.taxRate) || 0;
    const incl = rate > 0 && !!src.taxInclusive;
    let tax = 0;
    if (rate > 0) {
      tax =
        typeof src.tax === 'number'
          ? Math.round(src.tax)
          : Math.round(incl ? (net * rate) / (1 + rate) : net * rate);
    }
    return { net, rate, incl, tax, dpp: incl ? net - tax : net, amount: incl ? net : net + tax };
  }

  function sourceCandidates(type) {
    const t = TYPES[type];
    return (db()[t.srcColl] || []).filter(
      o => o.status === t.srcStatus && !(B() && B().activeInvoiceFor(t.side, o.id))
    );
  }

  function openInvoiceModal(type, preselectId) {
    const t = TYPES[type];
    if (!window.openModal || !B()) {
      return;
    }
    const candidates = sourceCandidates(type);
    if (preselectId) {
      const src = (db()[t.srcColl] || []).find(o => same(o.id, preselectId));
      if (!src) {
        toast('Dokumen sumber tidak ditemukan', 'warning');
        return;
      }
      const existing = B().activeInvoiceFor(t.side, src.id);
      if (existing) {
        toast(`${docNo(src)} sudah difakturkan (${docNo(existing)})`, 'info');
        viewDoc(type, existing.id);
        return;
      }
      if (src.status === 'Draft' || src.status === 'Cancelled') {
        toast(`${docNo(src)} masih ${src.status === 'Draft' ? 'Draft' : 'dibatalkan'} — belum bisa difakturkan`, 'warning');
        return;
      }
      if (!candidates.includes(src)) {
        candidates.unshift(src);
      }
    }
    const opts = candidates
      .map(
        o =>
          `<option value="${esc(o.id)}">${esc(docNo(o))} · ${esc(o[t.party] || '—')} · ${money(o.amount || 0)}</option>`
      )
      .join('');
    const today = todayStr();

    window.openModal(
      `${t.add} — ${t.label}`,
      candidates.length === 0
        ? `<div class="empty-state compact">
            <div class="empty-title">Tidak ada ${esc(t.srcLabel)} yang siap difakturkan</div>
            <div class="empty-text">Faktur dibuat dari ${esc(t.srcLabel)} berstatus ${type === 'SI' ? 'Terkirim' : 'Diterima'} yang belum memiliki faktur.</div>
          </div>`
        : `<div class="form-row">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label" for="inv-src">${esc(t.srcLabel)} <span class="req">*</span></label>
              <select class="form-select" id="inv-src"><option value="">Pilih pesanan…</option>${opts}</select>
            </div>
          </div>
          <div id="inv-preview"></div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="inv-date">Tanggal Faktur</label>
              <input class="form-input" id="inv-date" type="date" value="${today}">
            </div>
            <div class="form-group">
              <label class="form-label" for="inv-due">Jatuh Tempo</label>
              <input class="form-input" id="inv-due" type="date">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label" for="inv-note">Catatan</label>
              <input class="form-input" id="inv-note" type="text" placeholder="Opsional">
            </div>
          </div>`,
      candidates.length === 0
        ? '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
        : `<button class="btn-ghost" data-action="closeModal">Batal</button>
           <button class="btn" id="inv-save">Simpan Faktur</button>`,
      false
    );
    if (candidates.length === 0) {
      return;
    }

    setTimeout(() => {
      const srcSel = document.getElementById('inv-src');
      const dateInp = document.getElementById('inv-date');
      const dueInp = document.getElementById('inv-due');
      const preview = document.getElementById('inv-preview');
      let dueTouched = false;
      dueInp?.addEventListener('input', () => {
        dueTouched = true;
      });

      function currentSrc() {
        return candidates.find(o => same(o.id, srcSel && srcSel.value)) || null;
      }
      function suggestDue() {
        const src = currentSrc();
        if (!src || dueTouched || !dueInp) {
          return;
        }
        const party = (db()[t.side === 'sales' ? 'customers' : 'suppliers'] || []).find(
          p => same(p.id, src[t.partyId]) || p.name === src[t.party]
        );
        dueInp.value = src.dueDate || B().addDays(dateInp.value || today, B().termDays(party));
      }
      function renderPreview() {
        const src = currentSrc();
        if (!preview) {
          return;
        }
        if (!src) {
          preview.innerHTML = '';
          return;
        }
        const tot = invoiceTotals(src);
        const notPosted = src.status !== t.srcStatus;
        preview.innerHTML = `<div class="inline-summary">
          <div><span class="t-muted">${esc(t.partyLabel)}</span><strong>${esc(src[t.party] || '—')}</strong></div>
          <div><span class="t-muted">Item</span><strong>${(src.lines || []).length} baris</strong></div>
          <div><span class="t-muted">DPP</span><strong>${money(tot.dpp)}</strong></div>
          <div><span class="t-muted">PPN${tot.rate ? ` ${Math.round(tot.rate * 100)}%` : ''}</span><strong>${money(tot.tax)}</strong></div>
          <div><span class="t-muted">Total</span><strong>${money(tot.amount)}</strong></div>
        </div>${
          notPosted
            ? `<div class="notice notice-warning">${esc(t.srcLabel)} ini belum berstatus ${type === 'SI' ? 'Terkirim' : 'Diterima'}. Faktur akan mencatat ${type === 'SI' ? 'pendapatan' : 'hutang'} sebelum barang ${type === 'SI' ? 'dikirim' : 'diterima'}.</div>`
            : ''
        }`;
      }

      srcSel?.addEventListener('change', () => {
        renderPreview();
        suggestDue();
      });
      dateInp?.addEventListener('change', suggestDue);
      if (preselectId && srcSel) {
        srcSel.value = String(preselectId);
        renderPreview();
        suggestDue();
      }

      document.getElementById('inv-save')?.addEventListener('click', () => {
        const src = currentSrc();
        if (!src) {
          toast(`Pilih ${t.srcLabel} terlebih dahulu`, 'warning');
          return;
        }
        saveInvoice(type, src, {
          date: dateInp?.value || today,
          dueDate: dueInp?.value || '',
          note: (document.getElementById('inv-note')?.value || '').trim(),
        });
      });
    }, 50);
  }

  function saveInvoice(type, src, form) {
    const t = TYPES[type];
    const data = db();
    if (B().activeInvoiceFor(t.side, src.id)) {
      toast(`${docNo(src)} sudah difakturkan`, 'warning');
      return;
    }
    if (!Array.isArray(data[t.coll])) {
      data[t.coll] = [];
    }
    const number = window.DocEngine
      ? window.DocEngine.nextNumber(type, form.date, { sequences: data.numberSequences, commit: true })
      : `${type}-${Date.now()}`;
    const tot = invoiceTotals(src);
    const doc = {
      id: `${type}-${Date.now()}`,
      number,
      date: form.date,
      dueDate: form.dueDate || null,
      status: 'Outstanding',
      [t.party]: src[t.party] || '',
      [t.partyId]: src[t.partyId] != null ? String(src[t.partyId]) : null,
      sourceId: src.id,
      sourceType: t.srcType,
      sourceNumber: docNo(src),
      lines: (src.lines || []).map(l => Object.assign({}, l)),
      taxRate: tot.rate,
      taxInclusive: tot.incl,
      tax: tot.tax,
      amount: tot.amount,
      note: form.note,
      createdBy: currentUser(),
    };
    data[t.coll].push(doc);
    save();
    if (typeof window.closeModal === 'function') {
      window.closeModal();
    }
    refresh();
    toast(`${number} dibuat untuk ${docNo(src)}`, 'success');
  }

  // ── Record receipt / payment ───────────────────────────────────────────────
  function openSettlementModal(type, preselectInvoiceId) {
    const t = TYPES[type];
    const it = TYPES[t.invType];
    if (!window.openModal || !B()) {
      return;
    }
    const open = (db()[it.coll] || []).filter(
      inv => inv.status === 'Outstanding' && B().invoiceBalance(it.side, inv).outstanding > B().EPS
    );
    if (preselectInvoiceId && !open.some(inv => same(inv.id, preselectInvoiceId))) {
      toast('Faktur ini sudah lunas atau tidak aktif', 'info');
      return;
    }
    const opts = open
      .map(inv => {
        const bal = B().invoiceBalance(it.side, inv);
        return `<option value="${esc(inv.id)}">${esc(docNo(inv))} · ${esc(inv[it.party] || '—')} · sisa ${money(bal.outstanding)}</option>`;
      })
      .join('');
    const today = todayStr();

    window.openModal(
      t.add,
      open.length === 0
        ? `<div class="empty-state compact">
            <div class="empty-title">Tidak ada faktur yang belum lunas</div>
            <div class="empty-text">${esc(t.label)} dicatat untuk ${esc(it.label.toLowerCase())} berstatus Belum Lunas.</div>
          </div>`
        : `<div class="form-row">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label" for="st-inv">${esc(it.label)} <span class="req">*</span></label>
              <select class="form-select" id="st-inv"><option value="">Pilih faktur…</option>${opts}</select>
            </div>
          </div>
          <div id="st-preview"></div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="st-date">Tanggal</label>
              <input class="form-input" id="st-date" type="date" value="${today}">
            </div>
            <div class="form-group">
              <label class="form-label" for="st-amount">Jumlah (Rp) <span class="req">*</span></label>
              <input class="form-input t-num" id="st-amount" type="number" min="0" step="any" placeholder="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="st-method">${type === 'SR' ? 'Diterima di' : 'Dibayar dari'}</label>
              <select class="form-select" id="st-method">${METHODS.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label class="form-label" for="st-note">Catatan / No. referensi</label>
              <input class="form-input" id="st-note" type="text" placeholder="No. transfer, giro, dll.">
            </div>
          </div>`,
      open.length === 0
        ? '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
        : `<button class="btn-ghost" data-action="closeModal">Batal</button>
           <button class="btn" id="st-save">Simpan</button>`,
      false
    );
    if (open.length === 0) {
      return;
    }

    setTimeout(() => {
      const sel = document.getElementById('st-inv');
      const amountInp = document.getElementById('st-amount');
      const preview = document.getElementById('st-preview');
      function currentInv() {
        return open.find(inv => same(inv.id, sel && sel.value)) || null;
      }
      function renderPreview() {
        const inv = currentInv();
        if (!preview) {
          return;
        }
        if (!inv) {
          preview.innerHTML = '';
          return;
        }
        const bal = B().invoiceBalance(it.side, inv);
        preview.innerHTML = `<div class="inline-summary">
          <div><span class="t-muted">${esc(it.partyLabel)}</span><strong>${esc(inv[it.party] || '—')}</strong></div>
          <div><span class="t-muted">Total faktur</span><strong>${money(bal.total)}</strong></div>
          ${bal.payments ? `<div><span class="t-muted">Dibayar lewat pesanan</span><strong>${money(bal.payments)}</strong></div>` : ''}
          ${bal.settlements ? `<div><span class="t-muted">${type === 'SR' ? 'Penerimaan' : 'Pembayaran'} sebelumnya</span><strong>${money(bal.settlements)}</strong></div>` : ''}
          ${bal.returns ? `<div><span class="t-muted">Retur</span><strong>${money(bal.returns)}</strong></div>` : ''}
          <div><span class="t-muted">Sisa tagihan</span><strong>${money(bal.outstanding)}</strong></div>
        </div>`;
        if (amountInp) {
          amountInp.value = Math.round(bal.outstanding);
        }
      }
      sel?.addEventListener('change', renderPreview);
      if (preselectInvoiceId && sel) {
        sel.value = String(preselectInvoiceId);
        renderPreview();
      }

      document.getElementById('st-save')?.addEventListener('click', () => {
        const inv = currentInv();
        if (!inv) {
          toast('Pilih faktur terlebih dahulu', 'warning');
          return;
        }
        const amount = Math.max(0, parseFloat(amountInp?.value) || 0);
        if (amount <= 0) {
          toast('Jumlah harus lebih dari 0', 'warning');
          return;
        }
        const bal = B().invoiceBalance(it.side, inv);
        if (
          amount > bal.outstanding + B().EPS &&
          !window.confirm(
            `Jumlah ${money(amount)} melebihi sisa tagihan ${money(bal.outstanding)}. Tetap simpan?`
          )
        ) {
          return;
        }
        saveSettlement(type, inv, {
          date: document.getElementById('st-date')?.value || today,
          amount,
          method: document.getElementById('st-method')?.value || 'Tunai',
          note: (document.getElementById('st-note')?.value || '').trim(),
        });
      });
    }, 50);
  }

  function saveSettlement(type, inv, form) {
    const t = TYPES[type];
    const it = TYPES[t.invType];
    const data = db();
    if (!Array.isArray(data[t.coll])) {
      data[t.coll] = [];
    }
    const number = window.DocEngine
      ? window.DocEngine.nextNumber(type, form.date, { sequences: data.numberSequences, commit: true })
      : `${type}-${Date.now()}`;
    data[t.coll].push({
      id: `${type}-${Date.now()}`,
      number,
      date: form.date,
      status: 'Posted',
      [t.party]: inv[it.party] || '',
      [t.partyId]: inv[it.partyId] != null ? String(inv[it.partyId]) : null,
      invoiceId: inv.id,
      invoiceNumber: docNo(inv),
      amount: form.amount,
      paymentMethod: form.method,
      note: form.note,
      createdBy: currentUser(),
    });
    B().recalcInvoiceStatus(it.side, inv);
    save();
    if (typeof window.closeModal === 'function') {
      window.closeModal();
    }
    refresh();
    toast(
      `${number} dicatat · ${docNo(inv)} ${inv.status === 'Paid' ? 'lunas' : 'masih ada sisa'}`,
      'success'
    );
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────
  function cancelInvoice(type, id) {
    const t = TYPES[type];
    const inv = findDoc(type, id);
    if (!inv || !B() || !B().isActiveInvoice(inv)) {
      return;
    }
    const settleColl = TYPES[t.settleType].coll;
    const settlements = (db()[settleColl] || []).filter(
      r => r.status === 'Posted' && same(r.invoiceId, inv.id)
    );
    if (settlements.length) {
      toast(
        `Batalkan dulu ${settlements.length} ${type === 'SI' ? 'penerimaan' : 'pembayaran'} untuk ${docNo(inv)}`,
        'warning'
      );
      return;
    }
    const returns = (db()[t.returnsColl] || []).filter(
      r => r.status !== 'Cancelled' && r.sourceType === type && same(r.sourceId, inv.id)
    );
    if (returns.length) {
      toast(`${docNo(inv)} memiliki retur — faktur tidak bisa dibatalkan`, 'warning');
      return;
    }
    const src = B().sourceOrder(t.side, inv);
    const trips = Array.isArray(inv.doIds) ? inv.doIds.length : 0;
    const effect = trips
      ? type === 'SI'
        ? `${trips} pengambilan kembali menjadi belum ditagih; piutang dan penjualan dicatat lagi dari pengambilan.`
        : `${trips} pengambilan kembali menjadi belum difakturkan supplier; hutang dicatat lagi dari pengambilan.`
      : src
        ? type === 'SI'
          ? `Pendapatan dan piutang kembali dicatat dari pengiriman ${docNo(src)}.`
          : `Persediaan dan hutang kembali dicatat dari penerimaan ${docNo(src)}.`
        : 'Jurnal faktur ini tidak lagi dibentuk.';
    if (
      !window.confirm(
        `Batalkan ${docNo(inv)}?\n\n${effect}\nDokumen tetap tersimpan dengan status Dibatalkan.`
      )
    ) {
      return;
    }
    inv.status = 'Cancelled';
    inv.cancelledAt = new Date().toISOString();
    inv.cancelledBy = currentUser();
    // An invoice made from trips frees them for the next invoice.
    if (window.Trading && typeof window.Trading.releaseInvoice === 'function') {
      window.Trading.releaseInvoice(type === 'SI' ? 'sales' : 'purchases', inv);
    }
    save();
    if (typeof window.closeModal === 'function') {
      window.closeModal();
    }
    refresh();
    toast(`${docNo(inv)} dibatalkan`, 'success');
  }

  function cancelSettlement(type, id) {
    const t = TYPES[type];
    const it = TYPES[t.invType];
    const doc = findDoc(type, id);
    if (!doc || doc.status !== 'Posted') {
      return;
    }
    if (
      !window.confirm(
        `Batalkan ${docNo(doc)} sebesar ${money(doc.amount || 0)}?\n\nSaldo kas/bank dan ${type === 'SR' ? 'piutang' : 'hutang'} dikembalikan, lalu status faktur dihitung ulang.`
      )
    ) {
      return;
    }
    doc.status = 'Cancelled';
    doc.cancelledAt = new Date().toISOString();
    doc.cancelledBy = currentUser();
    const inv = findDoc(t.invType, doc.invoiceId);
    if (inv && B()) {
      if (inv.status === 'Paid') {
        inv.status = 'Outstanding';
      }
      B().recalcInvoiceStatus(it.side, inv);
    }
    save();
    if (typeof window.closeModal === 'function') {
      window.closeModal();
    }
    refresh();
    toast(`${docNo(doc)} dibatalkan`, 'success');
  }

  // ── Post a draft (legacy/imported drafts) ───────────────────────────────────
  function postDoc(type, id) {
    const doc = findDoc(type, id);
    if (!doc || doc.status !== 'Draft') {
      return;
    }
    doc.status = isInvoice(type) ? 'Outstanding' : 'Posted';
    if (isInvoice(type) && B()) {
      B().recalcInvoiceStatus(TYPES[type].side, doc);
    }
    save();
    refresh();
    toast(`${docNo(doc)} diposting`, 'success');
  }

  // ── Detail ──────────────────────────────────────────────────────────────────
  function row(label, value) {
    return typeof window.detailRow === 'function'
      ? window.detailRow(label, value)
      : `<div><strong>${esc(label)}:</strong> ${value}</div>`;
  }

  function effectHTML(type, id) {
    return typeof window.accountingEffectHTML === 'function' ? window.accountingEffectHTML(type, id) : '';
  }

  function viewDoc(type, id) {
    const t = TYPES[type];
    const doc = t ? findDoc(type, id) : null;
    if (!doc || !window.openModal) {
      toast('Dokumen tidak ditemukan', 'warning');
      return;
    }
    if (isInvoice(type)) {
      viewInvoice(type, doc);
    } else {
      viewSettlement(type, doc);
    }
  }

  function viewInvoice(type, inv) {
    const t = TYPES[type];
    const active = B() && B().isActiveInvoice(inv);
    const bal = active ? B().invoiceBalance(t.side, inv) : null;
    const due = B() ? B().dueDateFor(t.side, inv) : inv.dueDate;
    const overdue = active && bal.outstanding > B().EPS && due && due < todayStr();
    const src = B() ? B().sourceOrder(t.side, inv) : null;
    const srcBtn = src
      ? `<button class="link-btn" data-action="${type === 'SI' ? 'viewSO' : 'viewPO'}" data-id="${esc(src.id)}">${esc(docNo(src))}</button>`
      : esc(inv.sourceNumber || inv.sourceId || '—');
    const settlements = (db()[TYPES[t.settleType].coll] || []).filter(r => same(r.invoiceId, inv.id));
    // Invoices made from pickups (trading.js) list their trucks' surat jalan.
    const tripIds = Array.isArray(inv.doIds) ? inv.doIds : [];
    const sjNos = tripIds.map(id => {
      const d = (db().deliveryOrders || []).find(x => same(x.id, id));
      return d ? d.sjNo || d.number || d.id : id;
    });
    const tripsHTML = tripIds.length
      ? `<div class="detail-item" style="grid-column:1 / -1">
          <div class="detail-label">Dari pengambilan</div>
          <div class="detail-value">${tripIds.length} truk, periode ${fmtDate(inv.periodFrom)} – ${fmtDate(inv.periodTo)}
            <div class="t-muted" style="font-size:.75rem">${esc(sjNos.join(', '))}</div></div>
        </div>`
      : '';

    const balanceHTML = bal
      ? `<div class="balance-panel">
          <div><span>Total faktur</span><strong>${money(bal.total)}</strong></div>
          ${bal.payments ? `<div><span>Dibayar lewat ${esc(t.srcLabel)}</span><strong>− ${money(bal.payments)}</strong></div>` : ''}
          ${bal.settlements ? `<div><span>${type === 'SI' ? 'Penerimaan' : 'Pembayaran'}</span><strong>− ${money(bal.settlements)}</strong></div>` : ''}
          ${bal.returns ? `<div><span>Retur</span><strong>− ${money(bal.returns)}</strong></div>` : ''}
          <div class="balance-total${bal.outstanding > B().EPS ? '' : ' is-settled'}"><span>Sisa tagihan</span><strong>${money(bal.outstanding)}</strong></div>
        </div>`
      : '';

    const settleHTML = settlements.length
      ? `<div class="detail-section">
          <div class="detail-section-title">${type === 'SI' ? 'Penerimaan pembayaran' : 'Pembayaran'}</div>
          <table class="data-table compact"><tbody>${settlements
            .map(
              r => `<tr class="row-link" data-action="invView" data-id="${esc(r.id)}" data-type="${t.settleType}">
              <td class="doc-no">${esc(docNo(r))}</td><td class="t-muted">${fmtDate(r.date)}</td>
              <td class="t-muted">${esc(r.paymentMethod || '')}</td><td class="t-num">${money(r.amount || 0)}</td><td>${badge(r.status)}</td></tr>`
            )
            .join('')}</tbody></table>
        </div>`
      : '';

    const canSettle = active && inv.status === 'Outstanding' && bal.outstanding > B().EPS;
    const footer = [
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
      window.DocFlow ? window.DocFlow.button(type, inv.id) : '',
      `<button class="btn-ghost" data-action="invPrint" data-id="${esc(inv.id)}" data-type="${type}">Cetak</button>`,
      active ? `<button class="btn-ghost btn-danger-text" data-action="invCancel" data-id="${esc(inv.id)}" data-type="${type}">Batalkan</button>` : '',
      inv.status === 'Draft' ? `<button class="btn" data-action="invPost" data-id="${esc(inv.id)}" data-type="${type}">Posting</button>` : '',
      canSettle ? `<button class="btn" data-action="invSettle" data-id="${esc(inv.id)}" data-type="${t.settleType}">${esc(TYPES[t.settleType].add)}</button>` : '',
    ].join('');

    window.openModal(
      `${t.label} ${esc(docNo(inv))}`,
      `<div class="detail-grid">
        ${row('Nomor', `<span class="doc-no">${esc(docNo(inv))}</span>`)}
        ${row('Status', badge(inv.status) + (overdue ? ' <span class="chip chip-danger">Lewat tempo</span>' : ''))}
        <div class="detail-divider"></div>
        ${row(t.partyLabel, esc(inv[t.party] || '—'))}
        ${row('Tanggal', fmtDate(inv.date))}
        ${row('Jatuh tempo', fmtDate(due))}
        ${row(t.srcLabel, srcBtn)}
        ${inv.supplierRef ? row('No. faktur supplier', esc(inv.supplierRef)) : ''}
        ${tripsHTML}
        ${inv.note ? row('Catatan', esc(inv.note)) : ''}
        ${inv.status === 'Cancelled' ? row('Dibatalkan', `${fmtDate(inv.cancelledAt)}${inv.cancelledBy ? ' · ' + esc(inv.cancelledBy) : ''}`) : ''}
      </div>
      ${typeof window.linesDetailHTML === 'function' ? window.linesDetailHTML(inv.lines || [], 'Total faktur', inv) : ''}
      ${balanceHTML}
      ${settleHTML}
      ${effectHTML(type, inv.id)}`,
      footer,
      true
    );
  }

  function viewSettlement(type, doc) {
    const t = TYPES[type];
    const inv = findDoc(t.invType, doc.invoiceId);
    const invBtn = inv
      ? `<button class="link-btn" data-action="invView" data-id="${esc(inv.id)}" data-type="${t.invType}">${esc(docNo(inv))}</button>`
      : esc(doc.invoiceNumber || doc.invoiceId || '—');
    window.openModal(
      `${t.label} ${esc(docNo(doc))}`,
      `<div class="detail-grid">
        ${row('Nomor', `<span class="doc-no">${esc(docNo(doc))}</span>`)}
        ${row('Status', badge(doc.status))}
        <div class="detail-divider"></div>
        ${row(t.partyLabel, esc(doc[t.party] || '—'))}
        ${row('Tanggal', fmtDate(doc.date))}
        ${row('Faktur', invBtn)}
        ${row(type === 'SR' ? 'Diterima di' : 'Dibayar dari', esc(doc.paymentMethod || '—'))}
        ${row('Jumlah', `<strong>${money(doc.amount || 0)}</strong>`)}
        ${doc.note ? row('Catatan', esc(doc.note)) : ''}
        ${doc.status === 'Cancelled' ? row('Dibatalkan', `${fmtDate(doc.cancelledAt)}${doc.cancelledBy ? ' · ' + esc(doc.cancelledBy) : ''}`) : ''}
      </div>
      ${effectHTML(type, doc.id)}`,
      [
        '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
        window.DocFlow ? window.DocFlow.button(type, doc.id) : '',
        doc.status === 'Posted'
          ? `<button class="btn-ghost btn-danger-text" data-action="invCancelSettlement" data-id="${esc(doc.id)}" data-type="${type}">Batalkan</button>`
          : '',
        doc.status === 'Draft'
          ? `<button class="btn" data-action="invPost" data-id="${esc(doc.id)}" data-type="${type}">Posting</button>`
          : '',
      ].join('')
    );
  }

  function printDoc(type, id) {
    const doc = findDoc(type, id);
    if (!doc) {
      return;
    }
    if (typeof window.printDocument === 'function') {
      window.printDocument(type, doc);
    } else {
      toast('Fungsi cetak belum siap', 'warning');
    }
  }

  // ── Wire up ─────────────────────────────────────────────────────────────────
  window.renderInvoices = renderInvoices;
  window.viewInvoiceDoc = viewDoc; // used by doc-flow.js "Jejak" navigation

  // Tab → its sidebar entry (ui/nav.js), kept highlighted when switching tabs.
  const TAB_ENTRY = {
    SI: 'Faktur Penjualan',
    PI: 'Faktur Pembelian',
    SR: 'Penerimaan Pembayaran',
    PP: 'Pembayaran ke Supplier',
  };
  function syncMenu() {
    if (TAB_ENTRY[activeTab] && window.NSANav && typeof window.NSANav.markActive === 'function') {
      window.NSANav.markActive(TAB_ENTRY[activeTab]);
    }
  }

  function navToTab(tab) {
    activeTab = tab;
    if (typeof window.invalidateView === 'function') {
      window.invalidateView('invoices');
    }
    if (typeof window.navigate === 'function') {
      window.navigate('invoices');
    }
    syncMenu();
  }

  window._invoiceExtras = {
    openSalesInvoice: function () {
      navToTab('SI');
    },
    openPurchaseInvoice: function () {
      navToTab('PI');
    },
    openSalesReceipt: function () {
      navToTab('SR');
    },
    openPurchasePayment: function () {
      navToTab('PP');
    },
    // "Buat Faktur" on SO/PO detail: open the invoice form with the order selected.
    createFromSource: function (type, srcId) {
      if (!isInvoice(type)) {
        return;
      }
      activeTab = type;
      openInvoiceModal(type, srcId);
    },
    // "Catat Penerimaan/Pembayaran" for a specific invoice.
    settle: function (invoiceType, invoiceId) {
      if (!isInvoice(invoiceType)) {
        return;
      }
      openSettlementModal(TYPES[invoiceType].settleType, invoiceId);
    },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    window.ERP.registerAction('invTab', function (_id, _type, val) {
      if (val && TYPES[val]) {
        activeTab = val;
        refresh();
        syncMenu();
      }
      return true;
    });
    window.ERP.registerAction('invNew', function () {
      if (isInvoice(activeTab)) {
        openInvoiceModal(activeTab);
      } else {
        openSettlementModal(activeTab);
      }
      return true;
    });
    window.ERP.registerAction('invView', function (id, type) {
      if (id && TYPES[type]) {
        viewDoc(type, id);
      }
      return true;
    });
    window.ERP.registerAction('invPost', function (id, type) {
      if (id && TYPES[type]) {
        postDoc(type, id);
      }
      return true;
    });
    window.ERP.registerAction('invPrint', function (id, type) {
      if (id && isInvoice(type)) {
        printDoc(type, id);
      }
      return true;
    });
    window.ERP.registerAction('invCancel', function (id, type) {
      if (id && isInvoice(type)) {
        cancelInvoice(type, id);
      }
      return true;
    });
    window.ERP.registerAction('invSettle', function (id, type) {
      if (id && (type === 'SR' || type === 'PP')) {
        openSettlementModal(type, id);
      }
      return true;
    });
    window.ERP.registerAction('invCancelSettlement', function (id, type) {
      if (id && (type === 'SR' || type === 'PP')) {
        cancelSettlement(type, id);
      }
      return true;
    });
  }
})();
