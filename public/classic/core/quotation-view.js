// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Quotations  (quotation-view.js)
//
// Sales Quotation (SQ) and Purchase Quotation (PQ) at #view-quotations.
//   Draft → Sent → Accepted / Rejected. Drafts can be edited or deleted; a sent
//   quotation can go back to Draft for changes. An accepted quotation converts
//   ONCE into a Draft SO/PO (lines copied, link kept in `convertedTo` and the
//   order's `sourceQuotation`). Quotations never touch stock or the ledger.
//
// All buttons use data-action delegation (the hosting CSP blocks inline handlers).
// Global-scope rule: classic <script>, IIFE-wrapped; exposes window.renderQuotations,
// window.viewQuotation and window._quotationExtras.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'SQ'; // 'SQ' | 'PQ'

  const TYPES = {
    SQ: {
      label: 'Penawaran Penjualan',
      sub: 'Penawaran harga ke pelanggan sebelum pesanan dibuat',
      coll: 'salesQuotations',
      party: 'customer',
      partyId: 'customerId',
      partyColl: 'customers',
      partyLabel: 'Pelanggan',
      priceField: 'sell',
      target: 'SO',
      targetColl: 'salesOrders',
      targetLabel: 'Sales Order',
    },
    PQ: {
      label: 'Penawaran Pembelian',
      sub: 'Penawaran harga dari supplier sebelum pembelian',
      coll: 'purchaseQuotations',
      party: 'supplier',
      partyId: 'supplierId',
      partyColl: 'suppliers',
      partyLabel: 'Supplier',
      priceField: 'cost',
      target: 'PO',
      targetColl: 'purchaseOrders',
      targetLabel: 'Purchase Order',
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
  function todayStr() {
    return typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
  }
  function save() {
    if (typeof window.saveDB === 'function') {
      window.saveDB();
    }
  }
  function findQuote(type, id) {
    return (db()[TYPES[type].coll] || []).find(d => same(d.id, id)) || null;
  }

  // The order created from a quotation (explicit link, or a legacy order that
  // references the quotation number).
  function convertedOrder(type, q) {
    const t = TYPES[type];
    const orders = db()[t.targetColl] || [];
    if (q.convertedTo) {
      const hit = orders.find(o => same(o.id, q.convertedTo));
      if (hit) {
        return hit;
      }
    }
    return orders.find(o => o.sourceQuotation && (o.sourceQuotation === q.number || o.sourceQuotation === q.id)) || null;
  }

  // ── List ────────────────────────────────────────────────────────────────────
  function listHTML(type) {
    const t = TYPES[type];
    const docs = (db()[t.coll] || []).slice().sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
    if (docs.length === 0) {
      return `<div class="card"><div class="empty-state">
        <div class="empty-title">Belum ada ${esc(t.label.toLowerCase())}</div>
        <div class="empty-text">Penawaran bisa dikonversi menjadi ${esc(t.targetLabel)} setelah diterima.</div>
        <button class="btn" data-action="qtNew">Buat Penawaran</button>
      </div></div>`;
    }
    const today = todayStr();
    const rows = docs
      .map(d => {
        const order = convertedOrder(type, d);
        const expired = d.validUntil && d.validUntil < today && (d.status === 'Draft' || d.status === 'Sent');
        let action = `<button class="btn-ghost btn-sm" data-action="qtView" data-id="${esc(d.id)}" data-type="${type}">Lihat</button>`;
        if (d.status === 'Draft') {
          action = `<button class="action-primary" data-action="qtSend" data-id="${esc(d.id)}" data-type="${type}">Tandai Dikirim</button>`;
        } else if (d.status === 'Accepted' && !order) {
          action = `<button class="action-primary" data-action="qtConvert" data-id="${esc(d.id)}" data-type="${type}">Buat ${t.target}</button>`;
        }
        return `<tr class="row-link" data-action="qtView" data-id="${esc(d.id)}" data-type="${type}">
          <td class="doc-no">${esc(docNo(d))}</td>
          <td class="t-strong">${esc(d[t.party] || '—')}</td>
          <td class="t-muted">${esc(d.date || '')}</td>
          <td class="${expired ? 't-danger' : 't-muted'}">${esc(d.validUntil || '—')}</td>
          <td class="t-num">${money(d.amount || 0)}</td>
          <td>${badge(d.status)}${order ? ` <span class="chip">→ ${esc(docNo(order))}</span>` : ''}</td>
          <td class="t-actions">${quotationRowMenu(type, d)}</td>
        </tr>`;
      })
      .join('');
    return `<div class="card card-flush"><div class="table-wrap"><table class="data-table">
      <thead><tr><th>No. Penawaran</th><th>${t.partyLabel}</th><th>Tanggal</th><th>Berlaku s/d</th><th class="t-num">Jumlah</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }

  // ── Row Menu with Status Panel ──────────────────────────────────────────────
  function _menuItem(label, attrs, cls, role) {
    return `<button type="button" role="${role || 'menuitem'}" tabindex="-1" class="row-menu-item${cls ? ' ' + cls : ''}" ${attrs}>${esc(label)}</button>`;
  }

  function quotationRowMenu(type, q) {
    const t = TYPES[type];
    const id = esc(q.id);
    const num = esc(docNo(q));
    const order = convertedOrder(type, q);
    const isDraft = q.status === 'Draft';
    const canDelete = isDraft;

    const main = [
      _menuItem('Lihat detail', `data-action="qtView" data-id="${id}" data-type="${type}"`),
      _menuItem('Ubah status', 'data-action="rowMenuPanel" data-panel="status" aria-haspopup="menu"'),
      isDraft ? _menuItem('Edit', `data-action="qtEdit" data-id="${id}" data-type="${type}"`) : '',
      _menuItem('Duplikat', `data-action="qtDuplicate" data-id="${id}" data-type="${type}"`),
      q.status === 'Accepted' && !order ? _menuItem(`Buat ${t.target}`, `data-action="qtConvert" data-id="${id}" data-type="${type}"`, 'action-primary') : '',
      '<div class="row-menu-sep" role="separator"></div>',
      canDelete ? _menuItem('Hapus', `data-action="qtDelete" data-id="${id}" data-type="${type}"`, 'is-danger') : '',
    ].filter(Boolean).join('');

    const statuses = type === 'SQ' ? window.SQ_STATUSES : window.PQ_STATUSES;
    const options = statuses ? statuses.filter(([v]) =>
      v === q.status || (window.DocEngine && window.DocEngine.canTransition && window.DocEngine.canTransition(type, q.status, v))
    ) : [];
    const choices = options
      .map(([v, l]) =>
        v === q.status
          ? _menuItem(l, 'aria-checked="true" disabled', 'is-current', 'menuitemradio')
          : _menuItem(
              l,
              `aria-checked="false" data-action="setQuotationStatus" data-id="${id}" data-type="${type}" data-status="${esc(v)}"`,
              '',
              'menuitemradio'
            )
      )
      .join('');
    const none = options.filter(([v]) => v !== q.status).length === 0
      ? '<div class="row-menu-note">Status ini tidak bisa diubah dari daftar.</div>'
      : '';

    const statusPanel = `<div class="row-menu-panel" data-panel="status" hidden>
      ${_menuItem('‹ Kembali', 'data-action="rowMenuPanel" data-panel="main"', 'row-menu-back')}
      <div class="row-menu-head" role="presentation">Ubah status</div>
      ${choices}${none}
    </div>`;

    return `<button type="button" class="row-menu-btn" data-action="rowMenu" aria-haspopup="menu" aria-expanded="false"
        aria-label="Aksi ${num}" title="Aksi">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button><div class="row-menu" role="menu" aria-label="Aksi ${num}" hidden>
        <div class="row-menu-panel" data-panel="main">${main}</div>${statusPanel}
      </div>`;
  }

  function renderQuotations() {
    const t = TYPES[activeTab];
    const header =
      typeof window.secHdr === 'function'
        ? window.secHdr(t.label, t.sub, 'Buat Penawaran', 'qtNew')
        : `<h1>${esc(t.label)}</h1>`;
    return header + listHTML(activeTab);
  }

  function refresh() {
    const el = document.getElementById('view-quotations');
    if (el && window.activeView === 'quotations') {
      el.innerHTML = renderQuotations();
    } else if (typeof window.invalidateView === 'function') {
      window.invalidateView('quotations');
    }
  }

  // ── Create / edit ───────────────────────────────────────────────────────────
  function itemOptions(type, selectedId) {
    const priceField = TYPES[type].priceField;
    return (db().inventoryItems || [])
      .map(
        i =>
          `<option value="${esc(i.id)}" data-price="${Number(i[priceField]) || 0}" data-name="${esc(i.name)}" data-unit="${esc(i.unit || '')}"${same(i.id, selectedId) ? ' selected' : ''}>${esc(i.name)}${i.unit ? ` (${esc(i.unit)})` : ''}</option>`
      )
      .join('');
  }

  function lineRowHTML(type, line) {
    line = line || {};
    const isCustom = !line.itemId || line.itemId === 'custom';
    return `<tr class="qt-line">
      <td>
        <select class="form-select qt-item">
          <option value="custom"${isCustom ? ' selected' : ''}>Barang/jasa lain (tulis manual)</option>
          ${itemOptions(type, isCustom ? null : line.itemId)}
        </select>
        <input class="form-input qt-custom" type="text" placeholder="Nama barang / jasa" value="${isCustom ? esc(line.itemName || '') : ''}" style="margin-top:4px;${isCustom ? '' : 'display:none'}">
      </td>
      <td><input class="form-input t-num qt-qty" type="number" min="0" step="any" value="${line.qty || 1}" style="width:90px"></td>
      <td><input class="form-input t-num qt-price" type="number" min="0" step="any" value="${line.price || 0}" style="width:130px"></td>
      <td class="t-num qt-sub">${money(Math.round((Number(line.qty) || 0) * (Number(line.price) || 0)))}</td>
      <td class="t-actions"><button type="button" class="icon-btn qt-del" title="Hapus baris" aria-label="Hapus baris">✕</button></td>
    </tr>`;
  }

  function openFormModal(type, existing) {
    const t = TYPES[type];
    if (!window.openModal) {
      return;
    }
    if (existing && existing.status !== 'Draft') {
      toast('Hanya penawaran Draft yang bisa diubah', 'info');
      return;
    }
    // A name shared by two records is offered as "Name · Site" (DocEngine.partyLabel).
    const partyList = db()[t.partyColl] || [];
    const label = p => (window.DocEngine ? window.DocEngine.partyLabel(p, partyList) : p.name);
    const parties = partyList
      .map(p => `<option value="${esc(label(p))}"${p.address ? ` label="${esc(p.address)}"` : ''}>`)
      .join('');
    const current = existing && partyList.find(p => existing[t.partyId] != null && String(p.id) === String(existing[t.partyId]));
    const partyValue = current ? label(current) : existing ? existing[t.party] || '' : '';
    const lines = existing && existing.lines && existing.lines.length ? existing.lines : [null];

    window.openModal(
      existing ? `Ubah ${t.label} ${esc(docNo(existing))}` : `Buat ${t.label}`,
      `<div class="form-row">
        <div class="form-group">
          <label class="form-label" for="qt-party">${t.partyLabel} <span class="req">*</span></label>
          <input class="form-input" id="qt-party" type="text" list="qt-parties" value="${esc(partyValue)}" placeholder="Nama ${t.partyLabel.toLowerCase()}">
          <datalist id="qt-parties">${parties}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label" for="qt-date">Tanggal</label>
          <input class="form-input" id="qt-date" type="date" value="${esc(existing ? existing.date : todayStr())}">
        </div>
        <div class="form-group">
          <label class="form-label" for="qt-valid">Berlaku s/d</label>
          <input class="form-input" id="qt-valid" type="date" value="${esc(existing ? existing.validUntil || '' : '')}">
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-head">
          <div class="detail-section-title">Barang</div>
          <button type="button" class="btn-ghost btn-sm" id="qt-add-line">+ Tambah baris</button>
        </div>
        <table class="data-table compact">
          <thead><tr><th>Barang</th><th class="t-num">Qty</th><th class="t-num">Harga</th><th class="t-num">Subtotal</th><th></th></tr></thead>
          <tbody id="qt-lines">${lines.map(l => lineRowHTML(type, l)).join('')}</tbody>
        </table>
        <div class="inline-total">Total <strong id="qt-total">${money(0)}</strong></div>
      </div>
      <div class="form-row">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label" for="qt-note">Catatan</label>
          <input class="form-input" id="qt-note" type="text" value="${esc(existing ? existing.note || '' : '')}" placeholder="Syarat & ketentuan (opsional)">
        </div>
      </div>`,
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="qt-save">${existing ? 'Simpan Perubahan' : 'Simpan'}</button>`,
      true
    );

    setTimeout(() => {
      const body = document.getElementById('qt-lines');
      const totalEl = document.getElementById('qt-total');
      if (!body) {
        return;
      }
      function lineValues(tr) {
        const qty = parseFloat(tr.querySelector('.qt-qty').value) || 0;
        const price = parseFloat(tr.querySelector('.qt-price').value) || 0;
        return { qty, price, sub: Math.round(qty * price) };
      }
      function recalc() {
        let total = 0;
        body.querySelectorAll('tr').forEach(tr => {
          const v = lineValues(tr);
          tr.querySelector('.qt-sub').textContent = money(v.sub);
          total += v.sub;
        });
        totalEl.textContent = money(total);
      }
      function wireRow(tr) {
        const sel = tr.querySelector('.qt-item');
        const custom = tr.querySelector('.qt-custom');
        sel.addEventListener('change', () => {
          const opt = sel.options[sel.selectedIndex];
          const isCustom = sel.value === 'custom';
          custom.style.display = isCustom ? '' : 'none';
          if (!isCustom && opt && opt.dataset.price) {
            tr.querySelector('.qt-price').value = opt.dataset.price;
          }
          recalc();
        });
        tr.querySelector('.qt-qty').addEventListener('input', recalc);
        tr.querySelector('.qt-price').addEventListener('input', recalc);
        tr.querySelector('.qt-del').addEventListener('click', () => {
          tr.remove();
          recalc();
        });
      }
      body.querySelectorAll('tr').forEach(wireRow);
      recalc();

      document.getElementById('qt-add-line').addEventListener('click', () => {
        const tmp = document.createElement('tbody');
        tmp.innerHTML = lineRowHTML(type, null);
        const tr = tmp.firstElementChild;
        body.appendChild(tr);
        wireRow(tr);
      });

      document.getElementById('qt-save').addEventListener('click', () => {
        const partyInput = (document.getElementById('qt-party').value || '').trim();
        if (!partyInput) {
          toast(`${t.partyLabel} harus diisi`, 'warning');
          return;
        }
        const pick = window.DocEngine ? window.DocEngine.pickParty(partyList, partyInput) : { party: null };
        if (pick.ambiguous) {
          toast(`Ada beberapa ${t.partyLabel.toLowerCase()} bernama "${partyInput}". Pilih dari daftar yang sesuai lokasinya.`, 'warning');
          return;
        }
        const partyName = pick.party ? pick.party.name : partyInput;
        const date = document.getElementById('qt-date').value || todayStr();
        const collected = [];
        let missingName = false;
        body.querySelectorAll('tr').forEach(tr => {
          const sel = tr.querySelector('.qt-item');
          const v = lineValues(tr);
          if (v.qty <= 0 || v.price <= 0) {
            return;
          }
          if (sel.value === 'custom') {
            const name = (tr.querySelector('.qt-custom').value || '').trim();
            if (!name) {
              missingName = true;
              return;
            }
            collected.push({ itemId: 'custom', itemName: name, unit: 'ls', qty: v.qty, price: v.price, lineDiscount: 0, subtotal: v.sub });
          } else {
            const opt = sel.options[sel.selectedIndex];
            collected.push({
              itemId: String(sel.value),
              itemName: (opt && opt.dataset.name) || '',
              unit: (opt && opt.dataset.unit) || '',
              qty: v.qty,
              price: v.price,
              lineDiscount: 0,
              subtotal: v.sub,
            });
          }
        });
        if (missingName) {
          toast('Isi nama untuk barang/jasa yang ditulis manual', 'warning');
          return;
        }
        if (collected.length === 0) {
          toast('Tambahkan minimal 1 barang dengan jumlah dan harga', 'warning');
          return;
        }
        const data = db();
        if (!Array.isArray(data[t.coll])) {
          data[t.coll] = [];
        }
        const fields = {
          date,
          validUntil: document.getElementById('qt-valid').value || '',
          amount: collected.reduce((s, l) => s + l.subtotal, 0),
          lines: collected,
          note: (document.getElementById('qt-note').value || '').trim(),
          [t.party]: partyName,
          [t.partyId]: pick.party ? pick.party.id : null,
        };
        let number;
        if (existing) {
          Object.assign(existing, fields);
          number = docNo(existing);
        } else {
          number = window.DocEngine
            ? window.DocEngine.nextNumber(type, date, { sequences: data.numberSequences, commit: true })
            : `${type}-${Date.now()}`;
          data[t.coll].push(Object.assign({ id: `${type}-${Date.now()}`, number, status: 'Draft' }, fields));
        }
        save();
        if (window.closeModal) {
          window.closeModal();
        }
        refresh();
        toast(existing ? `${number} diperbarui` : `${number} dibuat`, 'success');
      });
    }, 50);
  }

  // ── Status changes ──────────────────────────────────────────────────────────
  function setStatus(type, id, next) {
    const q = findQuote(type, id);
    if (!q) {
      return;
    }
    if (window.DocEngine && !window.DocEngine.canTransition(type, q.status, next)) {
      toast('Perubahan status ini tidak diizinkan', 'warning');
      return;
    }
    q.status = next;
    save();
    if (window.closeModal) {
      window.closeModal();
    }
    refresh();
    const labels = { Sent: 'ditandai dikirim', Accepted: 'diterima', Rejected: 'ditolak', Draft: 'dikembalikan ke Draft' };
    toast(`${docNo(q)} ${labels[next] || next}`, 'success');
  }

  async function deleteDraft(type, id) {
    const list = db()[TYPES[type].coll] || [];
    const idx = list.findIndex(d => same(d.id, id));
    if (idx === -1 || list[idx].status !== 'Draft') {
      toast('Hanya penawaran Draft yang bisa dihapus', 'info');
      return;
    }
    if (!(await window.confirmAsk(`Hapus ${docNo(list[idx])}?`))) {
      return;
    }
    const removed = list.splice(idx, 1)[0];
    save();
    if (window.closeModal) {
      window.closeModal();
    }
    refresh();
    toast(`${docNo(removed)} dihapus`, 'success');
  }

  // ── Convert to SO/PO (once) ─────────────────────────────────────────────────
  function convertQuotation(type, id) {
    const t = TYPES[type];
    const q = findQuote(type, id);
    if (!q || q.status !== 'Accepted') {
      return;
    }
    const existing = convertedOrder(type, q);
    if (existing) {
      toast(`${docNo(q)} sudah dikonversi menjadi ${docNo(existing)}`, 'info');
      return;
    }
    const data = db();
    if (!Array.isArray(data[t.targetColl])) {
      data[t.targetColl] = [];
    }
    const date = todayStr();
    const order = {
      id:
        typeof window.nextId === 'function'
          ? window.nextId(t.target, data[t.targetColl])
          : `${t.target}-${Date.now()}`,
      number: window.DocEngine ? window.DocEngine.nextNumber(t.target, date, { commit: true }) : undefined,
      date,
      status: 'Draft',
      lines: (q.lines || []).map(l => Object.assign({}, l)),
      taxRate: 0,
      tax: 0,
      amount: q.amount || 0,
      sourceQuotation: docNo(q),
      stockMutated: false,
      [t.party]: q[t.party] || '',
      [t.partyId]: q[t.partyId] != null ? String(q[t.partyId]) : null,
    };
    data[t.targetColl].unshift(order);
    q.convertedTo = order.id;
    save();
    if (window.closeModal) {
      window.closeModal();
    }
    refresh();
    toast(`${docNo(q)} → ${docNo(order)} (Draft). Lengkapi PPN dan gudang di pesanan.`, 'success');
  }

  // ── Detail ──────────────────────────────────────────────────────────────────
  function viewQuotation(type, id) {
    const t = TYPES[type];
    const q = findQuote(type, id);
    if (!q || !window.openModal) {
      return;
    }
    const row = (l, v) =>
      typeof window.detailRow === 'function'
        ? window.detailRow(l, v)
        : `<div><strong>${esc(l)}:</strong> ${v}</div>`;
    const order = convertedOrder(type, q);
    const orderLink = order
      ? `<button class="link-btn" data-action="${t.target === 'SO' ? 'viewSO' : 'viewPO'}" data-id="${esc(order.id)}">${esc(docNo(order))}</button>`
      : '';
    const buttons = ['<button class="btn-ghost" data-action="closeModal">Tutup</button>'];
    if (window.DocFlow) {
      buttons.push(window.DocFlow.button(type, id));
    }
    if (q.status === 'Draft') {
      buttons.push(`<button class="btn-ghost btn-danger-text" data-action="qtDelete" data-id="${esc(id)}" data-type="${type}">Hapus</button>`);
      buttons.push(`<button class="btn-ghost" data-action="qtEdit" data-id="${esc(id)}" data-type="${type}">Ubah</button>`);
      buttons.push(`<button class="btn" data-action="qtSend" data-id="${esc(id)}" data-type="${type}">Tandai Dikirim</button>`);
    } else if (q.status === 'Sent') {
      buttons.push(`<button class="btn-ghost" data-action="qtToDraft" data-id="${esc(id)}" data-type="${type}">Kembalikan ke Draft</button>`);
      buttons.push(`<button class="btn-ghost btn-danger-text" data-action="qtReject" data-id="${esc(id)}" data-type="${type}">Ditolak</button>`);
      buttons.push(`<button class="btn" data-action="qtAccept" data-id="${esc(id)}" data-type="${type}">Diterima</button>`);
    } else if (q.status === 'Accepted' && !order) {
      buttons.push(`<button class="btn" data-action="qtConvert" data-id="${esc(id)}" data-type="${type}">Buat ${t.targetLabel}</button>`);
    }
    window.openModal(
      `${t.label} ${esc(docNo(q))}`,
      `<div class="detail-grid">
        ${row('Nomor', `<span class="doc-no">${esc(docNo(q))}</span>`)}
        ${row('Status', badge(q.status))}
        <div class="detail-divider"></div>
        ${row(t.partyLabel, esc(q[t.party] || '—'))}
        ${row('Tanggal', esc(q.date || '—'))}
        ${row('Berlaku s/d', esc(q.validUntil || '—'))}
        ${order ? row(t.targetLabel, orderLink) : ''}
        ${q.note ? row('Catatan', esc(q.note)) : ''}
      </div>
      ${typeof window.linesDetailHTML === 'function' ? window.linesDetailHTML(q.lines || [], 'Total penawaran', q) : ''}`,
      buttons.join(''),
      true
    );
  }

  // ── Wire up ─────────────────────────────────────────────────────────────────
  window.renderQuotations = renderQuotations;
  window.viewQuotation = viewQuotation; // used by doc-flow.js "Jejak" navigation

  // Tab → its sidebar entry (ui/nav.js), kept highlighted when switching tabs.
  const TAB_ENTRY = { SQ: 'Penawaran Penjualan', PQ: 'Penawaran Pembelian' };
  function syncMenu() {
    if (TAB_ENTRY[activeTab] && window.NSANav && typeof window.NSANav.markActive === 'function') {
      window.NSANav.markActive(TAB_ENTRY[activeTab]);
    }
  }

  function navToTab(tab) {
    activeTab = tab;
    if (typeof window.invalidateView === 'function') {
      window.invalidateView('quotations');
    }
    if (typeof window.navigate === 'function') {
      window.navigate('quotations');
    }
    syncMenu();
  }
  window._quotationExtras = {
    openSalesQuotation: function () {
      navToTab('SQ');
    },
    openPurchaseQuotation: function () {
      navToTab('PQ');
    },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    const reg = (name, fn) =>
      window.ERP.registerAction(name, function (id, type, val) {
        fn(id, type, val);
        return true;
      });
    reg('qtNew', () => openFormModal(activeTab));
    reg('qtView', (id, type) => id && TYPES[type] && viewQuotation(type, id));
    reg('qtEdit', (id, type) => {
      const q = id && TYPES[type] ? findQuote(type, id) : null;
      if (q) {
        openFormModal(type, q);
      }
    });
    reg('qtDelete', (id, type) => id && TYPES[type] && deleteDraft(type, id));
    reg('qtSend', (id, type) => id && TYPES[type] && setStatus(type, id, 'Sent'));
    reg('qtToDraft', (id, type) => id && TYPES[type] && setStatus(type, id, 'Draft'));
    reg('qtAccept', (id, type) => id && TYPES[type] && setStatus(type, id, 'Accepted'));
    reg('qtReject', (id, type) => id && TYPES[type] && setStatus(type, id, 'Rejected'));
    reg('qtConvert', (id, type) => id && TYPES[type] && convertQuotation(type, id));
    reg('qtDuplicate', (id, type) => {
      const q = id && TYPES[type] ? findQuote(type, id) : null;
      if (q) {
        const dup = JSON.parse(JSON.stringify(q));
        dup.id = Date.now().toString();
        dup.number = '';
        dup.status = 'Draft';
        dup.date = todayStr();
        dup.convertedTo = null;
        const coll = db()[TYPES[type].coll];
        if (coll) {
          coll.push(dup);
          save();
          refresh();
          toast(`Penawaran diduplikat`, 'success');
        }
      }
    });
    reg('setQuotationStatus', (id, type, status) => {
      if (id && TYPES[type] && status) {
        setQuotationStatus(type, id, status);
      }
    });
  }

  function setQuotationStatus(type, id, newStatus) {
    const q = findQuote(type, id);
    if (!q) {
      return;
    }
    const old = q.status;

    if (old !== newStatus && window.DocEngine && window.DocEngine.canTransition && !window.DocEngine.canTransition(type, old, newStatus)) {
      toast(`Transisi ${old} → ${newStatus} tidak diizinkan`, 'warning');
      refresh();
      return;
    }

    q.status = newStatus;
    save();
    refresh();
    const statuses = type === 'SQ' ? window.SQ_STATUSES : window.PQ_STATUSES;
    const statusLabel = statuses && statuses.find(([v]) => v === newStatus)?.[1] || newStatus;
    toast(`${docNo(q)} → ${statusLabel}`, 'success');
  }

  })();
