// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Returns  (return-view.js)
//
// Sales Return (SRN) and Purchase Return (PRN) at #view-returns.
//   • A return is drawn from a delivered SO / active sales invoice (SRN) or a
//     received PO / active purchase invoice (PRN). Quantities are capped at what
//     was sold/bought minus what was already returned against the same order or
//     its invoice.
//   • Lines keep the source's price and a prorated line discount; PPN follows the
//     source document.
//   • Draft → Posted moves stock (back into / out of the source warehouse) and the
//     ledger derives the reversal journal. Drafts can be cancelled; posted returns
//     are final (correct with a new document).
//
// Global-scope rule: classic <script>, IIFE-wrapped; exposes window.renderReturns
// and window._returnExtras (+ ERP action registrations).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'SRN'; // 'SRN' | 'PRN'

  const TYPES = {
    SRN: {
      label: 'Retur Penjualan',
      sub: 'Barang yang dikembalikan pelanggan',
      coll: 'salesReturns',
      party: 'customer',
      partyId: 'customerId',
      partyLabel: 'Pelanggan',
      side: 'sales',
      orderType: 'SO',
      orderColl: 'salesOrders',
      orderStatus: 'Delivered',
      orderLabel: 'Sales Order',
      invType: 'SI',
      invColl: 'salesInvoices',
      invLabel: 'Faktur Penjualan',
      stockDir: 'in',
    },
    PRN: {
      label: 'Retur Pembelian',
      sub: 'Barang yang dikembalikan ke supplier',
      coll: 'purchaseReturns',
      party: 'supplier',
      partyId: 'supplierId',
      partyLabel: 'Supplier',
      side: 'purchases',
      orderType: 'PO',
      orderColl: 'purchaseOrders',
      orderStatus: 'Received',
      orderLabel: 'Purchase Order',
      invType: 'PI',
      invColl: 'purchaseInvoices',
      invLabel: 'Faktur Pembelian',
      stockDir: 'out',
    },
  };

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : 'Rp ' + v;
  }
  function db() {
    return window.DB || {};
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    }
  }
  function badge(s) {
    return typeof window.badge === 'function' ? window.badge(s) : esc(s);
  }
  function same(a, b) {
    return a !== null && a !== undefined && String(a) === String(b);
  }
  function docNo(d) {
    return d ? d.number || d.id : '';
  }
  function qtyFmt(v) {
    return (Number(v) || 0).toLocaleString('id-ID', { maximumFractionDigits: 3 });
  }
  function save() {
    if (typeof window.saveDB === 'function') {
      window.saveDB();
    }
  }
  function currentUser() {
    try {
      const u = window.erpAuth && window.erpAuth.getCurrentUser && window.erpAuth.getCurrentUser();
      return (u && (u.username || u.displayName || u.email)) || '';
    } catch (_) {
      return '';
    }
  }
  function findReturn(type, id) {
    return (db()[TYPES[type].coll] || []).find(d => same(d.id, id)) || null;
  }

  // ── Sources ─────────────────────────────────────────────────────────────────
  function sources(type) {
    const t = TYPES[type];
    const B = window.Balances;
    const out = [];
    (db()[t.orderColl] || []).forEach(o => {
      if (o.status === t.orderStatus) {
        out.push({ srcType: t.orderType, doc: o });
      }
    });
    (db()[t.invColl] || []).forEach(inv => {
      const active = B ? B.isActiveInvoice(inv) : inv.status === 'Outstanding' || inv.status === 'Paid';
      if (active) {
        out.push({ srcType: t.invType, doc: inv });
      }
    });
    return out;
  }

  // An order and its active invoice describe the same goods: returns against
  // either count toward the quantity already returned.
  function relatedKeys(type, srcType, doc) {
    const t = TYPES[type];
    const B = window.Balances;
    const keys = [[srcType, doc.id]];
    if (B) {
      if (srcType === t.orderType) {
        const inv = B.activeInvoiceFor(t.side, doc.id);
        if (inv) {
          keys.push([t.invType, inv.id]);
        }
      } else {
        const order = B.sourceOrder(t.side, doc);
        if (order) {
          keys.push([t.orderType, order.id]);
        }
      }
    }
    return keys;
  }

  function lineKey(l) {
    return String(l.itemId) + '|' + (l.itemId === 'custom' ? l.itemName || '' : '');
  }

  function returnedQty(type, srcType, doc, excludeId) {
    const keys = relatedKeys(type, srcType, doc);
    const map = new Map();
    (db()[TYPES[type].coll] || []).forEach(r => {
      if (r.status === 'Cancelled' || same(r.id, excludeId)) {
        return;
      }
      if (!keys.some(([st, sid]) => r.sourceType === st && same(r.sourceId, sid))) {
        return;
      }
      (r.lines || []).forEach(l => {
        const k = lineKey(l);
        map.set(k, (map.get(k) || 0) + (Number(l.qty) || 0));
      });
    });
    return map;
  }

  function warehouseFor(type, srcType, doc) {
    const t = TYPES[type];
    if (srcType === t.orderType) {
      return doc.warehouseId || null;
    }
    const order = window.Balances ? window.Balances.sourceOrder(t.side, doc) : null;
    return (order && order.warehouseId) || null;
  }

  // ── List ────────────────────────────────────────────────────────────────────
  function listHTML(type) {
    const t = TYPES[type];
    const docs = (db()[t.coll] || []).slice().sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
    if (docs.length === 0) {
      return `<div class="card"><div class="empty-state">
        <div class="empty-title">Belum ada ${esc(t.label.toLowerCase())}</div>
        <div class="empty-text">Retur dibuat dari ${esc(t.orderLabel)} yang sudah ${type === 'SRN' ? 'terkirim' : 'diterima'} atau dari fakturnya.</div>
        <button class="btn" data-action="rtNew">Buat Retur</button>
      </div></div>`;
    }
    const rows = docs
      .map(
        d => `<tr class="row-link" data-action="rtView" data-id="${esc(d.id)}" data-type="${type}">
          <td class="doc-no">${esc(docNo(d))}</td>
          <td class="t-strong">${esc(d[t.party] || '—')}</td>
          <td class="t-muted">${esc(d.sourceNumber || d.sourceId || '—')}</td>
          <td class="t-muted">${esc(d.date || '')}</td>
          <td class="t-num">${money(d.amount || 0)}</td>
          <td>${badge(d.status)}</td>
          <td class="t-actions">${
            d.status === 'Draft'
              ? `<button class="action-primary" data-action="rtPost" data-id="${esc(d.id)}" data-type="${type}">Posting</button>`
              : `<button class="btn-ghost btn-sm" data-action="rtView" data-id="${esc(d.id)}" data-type="${type}">Lihat</button>`
          }</td>
        </tr>`
      )
      .join('');
    return `<div class="card card-flush"><div class="table-wrap"><table class="data-table">
      <thead><tr><th>No. Retur</th><th>${t.partyLabel}</th><th>Sumber</th><th>Tanggal</th><th class="t-num">Jumlah</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }

  function renderReturns() {
    const t = TYPES[activeTab];
    const header =
      typeof window.secHdr === 'function'
        ? window.secHdr(t.label, t.sub, 'Buat Retur', 'rtNew')
        : `<h1>${esc(t.label)}</h1>`;
    return header + listHTML(activeTab);
  }

  function refresh() {
    const el = document.getElementById('view-returns');
    if (el && window.activeView === 'returns') {
      el.innerHTML = renderReturns();
    } else if (typeof window.invalidateView === 'function') {
      window.invalidateView('returns');
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  function openNewModal(type) {
    const t = TYPES[type];
    if (!window.openModal) {
      return;
    }
    const today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    const list = sources(type);
    const opts = list
      .map(
        (s, i) =>
          `<option value="${i}">${esc(docNo(s.doc))} · ${esc(s.srcType === t.orderType ? t.orderLabel : t.invLabel)} · ${esc(s.doc[t.party] || '—')}</option>`
      )
      .join('');

    window.openModal(
      `Buat ${t.label}`,
      list.length === 0
        ? `<div class="empty-state compact">
            <div class="empty-title">Belum ada dokumen yang bisa diretur</div>
            <div class="empty-text">Retur dibuat dari ${esc(t.orderLabel)} berstatus ${type === 'SRN' ? 'Terkirim' : 'Diterima'} atau dari ${esc(t.invLabel.toLowerCase())} yang aktif.</div>
          </div>`
        : `<div class="form-row">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label" for="rt-src">Dokumen sumber <span class="req">*</span></label>
              <select class="form-select" id="rt-src"><option value="">Pilih dokumen…</option>${opts}</select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="rt-party">${t.partyLabel}</label>
              <input class="form-input" id="rt-party" type="text" readonly>
            </div>
            <div class="form-group">
              <label class="form-label" for="rt-date">Tanggal retur</label>
              <input class="form-input" id="rt-date" type="date" value="${today}">
            </div>
          </div>
          <div class="detail-section">
            <div class="detail-section-title">Barang yang diretur</div>
            <div id="rt-lines-wrap" class="empty-inline">Pilih dokumen sumber terlebih dahulu.</div>
          </div>
          <div class="form-row">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label" for="rt-reason">Alasan retur</label>
              <input class="form-input" id="rt-reason" type="text" placeholder="Contoh: barang rusak, tidak sesuai pesanan">
            </div>
          </div>`,
      list.length === 0
        ? '<button class="btn-ghost" data-action="closeModal">Tutup</button>'
        : `<button class="btn-ghost" data-action="closeModal">Batal</button>
           <button class="btn" id="rt-save">Simpan sebagai Draft</button>`,
      true
    );
    if (list.length === 0) {
      return;
    }

    setTimeout(() => {
      const srcSel = document.getElementById('rt-src');
      const partyInp = document.getElementById('rt-party');
      const wrap = document.getElementById('rt-lines-wrap');
      let current = null;
      let rows = [];

      function totals() {
        const net = rows.reduce((s, r) => s + r.subtotal(), 0);
        const src = current ? current.doc : {};
        const rate = Number(src.taxRate) || 0;
        const incl = rate > 0 && !!src.taxInclusive;
        const tax = rate > 0 ? Math.round(incl ? (net * rate) / (1 + rate) : net * rate) : 0;
        return { net, rate, incl, tax, amount: incl ? net : net + tax };
      }
      function renderTotals() {
        const el = document.getElementById('rt-total');
        if (!el) {
          return;
        }
        const tot = totals();
        el.innerHTML = `${tot.rate ? `PPN ${Math.round(tot.rate * 100)}%: ${money(tot.tax)} · ` : ''}<strong>Total retur ${money(tot.amount)}</strong>`;
      }

      srcSel.addEventListener('change', () => {
        current = srcSel.value === '' ? null : list[Number(srcSel.value)];
        rows = [];
        if (!current) {
          partyInp.value = '';
          wrap.className = 'empty-inline';
          wrap.innerHTML = 'Pilih dokumen sumber terlebih dahulu.';
          return;
        }
        partyInp.value = current.doc[t.party] || '';
        const already = returnedQty(type, current.srcType, current.doc);
        rows = (current.doc.lines || []).map(l => {
          const origQty = Number(l.qty) || 0;
          const done = already.get(lineKey(l)) || 0;
          const r = { line: l, origQty, done, max: Math.max(0, origQty - done), qty: 0 };
          r.subtotal = function () {
            const price = Number(l.price) || 0;
            const disc = origQty > 0 ? Math.round(((Number(l.lineDiscount) || 0) * r.qty) / origQty) : 0;
            return Math.round(r.qty * price - disc);
          };
          return r;
        });
        if (rows.length === 0) {
          wrap.className = 'empty-inline';
          wrap.innerHTML = 'Dokumen ini tidak memiliki baris barang.';
          return;
        }
        wrap.className = '';
        wrap.innerHTML = `<table class="data-table compact">
          <thead><tr><th>Barang</th><th class="t-num">Qty asal</th><th class="t-num">Sudah diretur</th><th class="t-num">Qty retur</th><th class="t-num">Harga</th><th class="t-num">Subtotal</th></tr></thead>
          <tbody>${rows
            .map(
              (r, i) => `<tr>
              <td>${esc(r.line.itemName || r.line.itemId || 'Barang')}</td>
              <td class="t-num">${qtyFmt(r.origQty)} ${esc(r.line.unit || '')}</td>
              <td class="t-num t-muted">${r.done ? qtyFmt(r.done) : '—'}</td>
              <td class="t-num"><input class="form-input t-num rt-qty" data-idx="${i}" type="number" min="0" step="any" max="${r.max}" value="0" ${r.max <= 0 ? 'disabled' : ''} style="width:90px"></td>
              <td class="t-num">${money(r.line.price || 0)}</td>
              <td class="t-num rt-sub" data-idx="${i}">${money(0)}</td>
            </tr>`
            )
            .join('')}</tbody>
          </table>
          <div class="inline-total" id="rt-total"></div>`;
        wrap.querySelectorAll('.rt-qty').forEach(inp => {
          inp.addEventListener('input', () => {
            const r = rows[Number(inp.dataset.idx)];
            let q = parseFloat(inp.value) || 0;
            if (q > r.max) {
              q = r.max;
              inp.value = String(r.max);
            }
            r.qty = Math.max(0, q);
            const subEl = wrap.querySelector(`.rt-sub[data-idx="${inp.dataset.idx}"]`);
            if (subEl) {
              subEl.textContent = money(r.subtotal());
            }
            renderTotals();
          });
        });
        renderTotals();
      });

      document.getElementById('rt-save').addEventListener('click', () => {
        if (!current) {
          toast('Pilih dokumen sumber', 'warning');
          return;
        }
        const chosen = rows.filter(r => r.qty > 0);
        if (chosen.length === 0) {
          toast('Isi jumlah barang yang diretur', 'warning');
          return;
        }
        const data = db();
        if (!Array.isArray(data[t.coll])) {
          data[t.coll] = [];
        }
        const date = document.getElementById('rt-date').value || today;
        const number = window.DocEngine
          ? window.DocEngine.nextNumber(type, date, { sequences: data.numberSequences, commit: true })
          : `${type}-${Date.now()}`;
        const lines = chosen.map(r => {
          const disc =
            r.origQty > 0 ? Math.round(((Number(r.line.lineDiscount) || 0) * r.qty) / r.origQty) : 0;
          return {
            itemId: r.line.itemId,
            itemName: r.line.itemName || r.line.itemId,
            unit: r.line.unit || '',
            qty: r.qty,
            price: Number(r.line.price) || 0,
            lineDiscount: disc,
            subtotal: r.subtotal(),
          };
        });
        const tot = totals();
        const src = current.doc;
        data[t.coll].push({
          id: `${type}-${Date.now()}`,
          number,
          date,
          status: 'Draft',
          sourceId: src.id,
          sourceType: current.srcType,
          sourceNumber: docNo(src),
          warehouseId: warehouseFor(type, current.srcType, src),
          [t.party]: src[t.party] || '',
          [t.partyId]: src[t.partyId] != null ? String(src[t.partyId]) : null,
          lines,
          taxRate: tot.rate,
          taxInclusive: tot.incl,
          tax: tot.tax,
          amount: tot.amount,
          reason: (document.getElementById('rt-reason').value || '').trim(),
          createdBy: currentUser(),
        });
        save();
        if (window.closeModal) {
          window.closeModal();
        }
        refresh();
        toast(`${number} disimpan sebagai Draft. Posting untuk memperbarui stok dan jurnal.`, 'success');
      });
    }, 50);
  }

  // ── Post / cancel ───────────────────────────────────────────────────────────
  async function postReturn(type, id) {
    const t = TYPES[type];
    const doc = findReturn(type, id);
    if (!doc || doc.status !== 'Draft') {
      return;
    }
    if (t.stockDir === 'out' && typeof window.stockShortages === 'function') {
      const short = window.stockShortages(doc.lines, doc.warehouseId);
      if (short.length) {
        toast(
          'Stok tidak cukup untuk dikembalikan: ' +
            short.map(p => `${p.itemName} (tersedia ${p.available})`).join('; '),
          'danger'
        );
        return;
      }
    }
    if (
      !(await window.confirmAsk(`Posting ${docNo(doc)}?\n\nStok ${type === 'SRN' ? 'bertambah' : 'berkurang'} dan jurnal retur dibentuk. Retur yang sudah diposting tidak bisa dibatalkan.`))
    ) {
      return;
    }
    if (typeof window.moveStockLines === 'function') {
      window.moveStockLines(doc.lines, t.stockDir, doc.warehouseId);
    }
    doc.status = 'Posted';
    doc.postedAt = new Date().toISOString();
    doc.postedBy = currentUser();
    const B = window.Balances;
    if (B) {
      const inv =
        doc.sourceType === t.invType
          ? (db()[t.invColl] || []).find(i => same(i.id, doc.sourceId))
          : B.activeInvoiceFor(t.side, doc.sourceId);
      if (inv) {
        B.recalcInvoiceStatus(t.side, inv);
      }
    }
    save();
    if (window.closeModal) {
      window.closeModal();
    }
    refresh();
    toast(`${docNo(doc)} diposting`, 'success');
  }

  async function cancelDraft(type, id) {
    const doc = findReturn(type, id);
    if (!doc || doc.status !== 'Draft') {
      return;
    }
    if (!(await window.confirmAsk(`Batalkan draft ${docNo(doc)}?`))) {
      return;
    }
    doc.status = 'Cancelled';
    doc.cancelledAt = new Date().toISOString();
    doc.cancelledBy = currentUser();
    save();
    if (window.closeModal) {
      window.closeModal();
    }
    refresh();
    toast(`${docNo(doc)} dibatalkan`, 'success');
  }

  // ── Detail ──────────────────────────────────────────────────────────────────
  function viewReturn(type, id) {
    const t = TYPES[type];
    const doc = findReturn(type, id);
    if (!doc || !window.openModal) {
      return;
    }
    const row = (l, v) =>
      typeof window.detailRow === 'function'
        ? window.detailRow(l, v)
        : `<div><strong>${esc(l)}:</strong> ${v}</div>`;
    const srcLabel = doc.sourceType === t.orderType ? t.orderLabel : doc.sourceType === t.invType ? t.invLabel : 'Sumber';
    window.openModal(
      `${t.label} ${esc(docNo(doc))}`,
      `<div class="detail-grid">
        ${row('Nomor', `<span class="doc-no">${esc(docNo(doc))}</span>`)}
        ${row('Status', badge(doc.status))}
        <div class="detail-divider"></div>
        ${row(t.partyLabel, esc(doc[t.party] || '—'))}
        ${row('Tanggal', esc(doc.date || '—'))}
        ${row(srcLabel, esc(doc.sourceNumber || doc.sourceId || '—'))}
        ${doc.warehouseId && window.Warehouse ? row('Gudang', esc(window.Warehouse.warehouseName(doc.warehouseId))) : ''}
        ${doc.reason ? row('Alasan', esc(doc.reason)) : ''}
      </div>
      ${typeof window.linesDetailHTML === 'function' ? window.linesDetailHTML(doc.lines || [], 'Total retur', doc) : ''}
      ${typeof window.accountingEffectHTML === 'function' ? window.accountingEffectHTML(type, doc.id) : ''}`,
      [
        '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
        doc.status === 'Draft'
          ? `<button class="btn-ghost btn-danger-text" data-action="rtCancel" data-id="${esc(doc.id)}" data-type="${type}">Batalkan Draft</button>
             <button class="btn" data-action="rtPost" data-id="${esc(doc.id)}" data-type="${type}">Posting</button>`
          : '',
      ].join(''),
      true
    );
  }

  // ── Wire up ─────────────────────────────────────────────────────────────────
  window.renderReturns = renderReturns;

  // Tab → its sidebar entry (ui/nav.js), kept highlighted when switching tabs.
  const TAB_ENTRY = { SRN: 'Retur Penjualan', PRN: 'Retur Pembelian' };
  function syncMenu() {
    if (TAB_ENTRY[activeTab] && window.NSANav && typeof window.NSANav.markActive === 'function') {
      window.NSANav.markActive(TAB_ENTRY[activeTab]);
    }
  }

  function navToTab(tab) {
    activeTab = tab;
    if (typeof window.invalidateView === 'function') {
      window.invalidateView('returns');
    }
    if (typeof window.navigate === 'function') {
      window.navigate('returns');
    }
    syncMenu();
  }
  window._returnExtras = {
    openSalesReturn: function () {
      navToTab('SRN');
    },
    openPurchaseReturn: function () {
      navToTab('PRN');
    },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    window.ERP.registerAction('rtNew', function () {
      openNewModal(activeTab);
      return true;
    });
    window.ERP.registerAction('rtView', function (id, type) {
      if (id && TYPES[type]) {
        viewReturn(type, id);
      }
      return true;
    });
    window.ERP.registerAction('rtPost', function (id, type) {
      if (id && TYPES[type]) {
        postReturn(type, id);
      }
      return true;
    });
    window.ERP.registerAction('rtCancel', function (id, type) {
      if (id && TYPES[type]) {
        cancelDraft(type, id);
      }
      return true;
    });
  }
})();
