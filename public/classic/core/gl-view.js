// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Buku Besar  (gl-view.js)
//
// The ledger view (#view-ledger) with three tabs — Neraca Saldo (trial balance),
// Jurnal (every journal, filterable by source) and Bagan Akun (chart of
// accounts) — plus the Jurnal Umum entry modal, which enforces Dr === Cr through
// GL.postJournalVoucher().
//
// Loaded lazily (lazy-views.js). Global-scope rule: classic <script>,
// IIFE-wrapped; exposes window.renderLedger, window._ledgerExtras (sidebar
// entries open a tab through it) and ERP action registrations.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  let activeTab = 'trial'; // 'trial' | 'journals' | 'chart'
  let journalFilter = 'all'; // 'all' | 'auto' | 'manual'
  // Journals list one page at a time (hundreds of journals otherwise render at once).
  const JOURNAL_PAGE_SIZE = 20;
  let journalPage = 1;
  // Tab → its sidebar entry (ui/nav.js), kept highlighted when switching tabs.
  const TAB_ENTRY = { trial: 'Neraca Saldo', journals: 'Jurnal', chart: 'Bagan Akun' };

  function syncMenu() {
    if (window.NSANav && typeof window.NSANav.markActive === 'function') {
      window.NSANav.markActive(TAB_ENTRY[activeTab]);
    }
  }

  function esc(s) {
    if (typeof window.escapeHtml === 'function') {
      return window.escapeHtml(s);
    }
    return String(s === null || s === undefined ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function' ? window.idrFull(v) : `Rp ${v}`;
  }
  function db() {
    return window.DB || {};
  }

  const TYPE_LABEL = {
    CASH_BANK: 'Kas & Bank',
    ACCOUNT_RECEIVABLE: 'Piutang',
    INVENTORY: 'Persediaan',
    OTHER_CURRENT_ASSET: 'Aset Lancar Lain',
    FIXED_ASSET: 'Aset Tetap',
    ACCUMULATED_DEPRECIATION: 'Akumulasi Penyusutan',
    OTHER_ASSET: 'Aset Lain',
    ACCOUNT_PAYABLE: 'Hutang',
    OTHER_CURRENT_LIABILITY: 'Kewajiban Lancar Lain',
    LONG_TERM_LIABILITY: 'Kewajiban Jangka Panjang',
    EQUITY: 'Ekuitas',
    REVENUE: 'Pendapatan',
    COGS: 'HPP',
    EXPENSE: 'Beban',
    OTHER_EXPENSE: 'Beban Lain',
    OTHER_INCOME: 'Pendapatan Lain',
  };

  // ── Trial Balance tab ───────────────────────────────────────────────────────
  // Account rows in regular weight; only the TOTAL row is bold (style.css .gl-…).
  function trialTab() {
    const tb = window.GL
      ? window.GL.trialBalance()
      : { rows: [], totalDebit: 0, totalCredit: 0, balanced: true };
    const rows =
      tb.rows.length === 0
        ? `<tr><td colspan="4" class="gl-empty">
             Belum ada jurnal. Saldo akun terbentuk saat dokumen diposting atau jurnal umum dicatat.
           </td></tr>`
        : tb.rows
            .map(
              r => `<tr>
          <td class="acct-no">${esc(r.no)}</td>
          <td>${esc(r.name)}<span class="t-muted"> · ${esc(TYPE_LABEL[r.type] || r.type)}</span></td>
          <td class="t-num">${r.debit ? money(r.debit) : '—'}</td>
          <td class="t-num">${r.credit ? money(r.credit) : '—'}</td>
        </tr>`
            )
            .join('');

    // Debit/Kredit totals are in the TOTAL row; only the balance check is shown here.
    return `
    <div class="gl-balance ${tb.balanced ? 'is-ok' : 'is-off'}" role="status">${
      tb.balanced ? 'Seimbang · Debit = Kredit' : 'Tidak seimbang · periksa jurnal'
    }</div>
    <div class="card">
      <div class="table-wrap">
        <table class="gl-tb">
          <thead><tr>
            <th class="gl-col-code">Kode</th>
            <th>Nama Akun</th>
            <th class="t-num gl-col-amt">Debit</th>
            <th class="t-num gl-col-amt">Kredit</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="gl-total">
            <td colspan="2" class="gl-total-label">TOTAL</td>
            <td class="t-num">${money(tb.totalDebit)}</td>
            <td class="t-num">${money(tb.totalCredit)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }

  // ── Journals tab ────────────────────────────────────────────────────────────
  // Besides the source (Semua / Otomatis / Jurnal Umum), journals filter by date,
  // account and a search over number, memo and source document. The menu label
  // Audit Jurnal opens this page.
  let journalQuery = { from: '', to: '', acc: '', q: '' };

  function lineAccount(l) {
    return l.accountNo || l.account || l.accountCode || '';
  }

  function matchesQuery(j) {
    const f = journalQuery;
    if (f.from && (j.date || '') < f.from) {
      return false;
    }
    if (f.to && (j.date || '') > f.to) {
      return false;
    }
    if (f.acc && !(j.lines || j.entries || []).some(l => lineAccount(l) === f.acc)) {
      return false;
    }
    if (f.q) {
      const src =
        j.source && typeof j.source === 'object'
          ? `${j.source.docType || ''} ${j.source.docId || ''}`
          : j.source === 'manual'
            ? 'Jurnal Umum'
            : j.source || '';
      const hay = `${j.number || j.ref || j.id || ''} ${j.memo || j.description || ''} ${j.date || ''} ${src}`;
      if (hay.toLowerCase().indexOf(f.q.toLowerCase()) < 0) {
        return false;
      }
    }
    return true;
  }

  function journalFilterBar() {
    const f = journalQuery;
    const accOpts =
      '<option value="">Semua akun</option>' +
      (db().accountsChart || [])
        .map(
          a =>
            `<option value="${esc(a.no)}"${a.no === f.acc ? ' selected' : ''}>${esc(a.no)} — ${esc(a.name)}</option>`
        )
        .join('');
    const active = f.from || f.to || f.acc || f.q;
    return `<div class="fin-period gl-jfilter">
      <div><label class="form-label" for="gl-f-from">Dari</label>
        <input class="form-input" id="gl-f-from" type="date" value="${esc(f.from)}"></div>
      <div><label class="form-label" for="gl-f-to">Sampai</label>
        <input class="form-input" id="gl-f-to" type="date" value="${esc(f.to)}"></div>
      <div><label class="form-label" for="gl-f-acc">Akun</label>
        <select class="form-select" id="gl-f-acc">${accOpts}</select></div>
      <div class="gl-jfilter-q"><label class="form-label" for="gl-f-q">Cari</label>
        <input class="form-input" id="gl-f-q" value="${esc(f.q)}" placeholder="No. jurnal, memo, dokumen"></div>
      <button class="btn-ghost" data-action="glJournalQuery">Terapkan</button>
      ${active ? '<button class="btn-ghost" data-action="glJournalQueryReset">Reset</button>' : ''}
    </div>`;
  }

  function journalsTab() {
    const journals = (db().journals || [])
      .filter(j =>
        journalFilter === 'manual'
          ? j.source === 'manual'
          : journalFilter === 'auto'
            ? j.source !== 'manual'
            : true
      )
      .filter(matchesQuery)
      .reverse(); // newest first
    const filters = [
      ['all', 'Semua'],
      ['auto', 'Otomatis dari dokumen'],
      ['manual', 'Jurnal Umum'],
    ]
      .map(
        ([id, label]) =>
          `<button class="seg-tab${journalFilter === id ? ' active' : ''}" role="tab" aria-selected="${journalFilter === id}" data-action="glJournalFilter" data-val="${id}">${label}</button>`
      )
      .join('');
    const head = `<div class="card-head">
        <div class="gl-count t-muted">${journals.length} jurnal</div>
        <div class="seg-tabs seg-tabs-sm" role="tablist" aria-label="Sumber jurnal">${filters}</div>
      </div>`;
    const query = journalQuery.from || journalQuery.to || journalQuery.acc || journalQuery.q;
    if (journals.length === 0) {
      const empty = query
        ? 'Tidak ada jurnal yang cocok dengan filter.'
        : journalFilter === 'manual'
          ? 'Belum ada jurnal umum. Gunakan <strong>Buat Jurnal Umum</strong> untuk saldo awal, penyesuaian, atau transaksi yang tidak berasal dari dokumen.'
          : 'Belum ada jurnal. Jurnal otomatis terbentuk saat barang dikirim atau diterima, faktur diterbitkan, pembayaran dicatat, dan transaksi kas & bank disimpan.';
      return `${journalFilterBar()}<div class="card">${head}<div class="empty-inline">${empty}</div></div>`;
    }
    const pg = window.NSAPager
      ? window.NSAPager.page(journals, journalPage, JOURNAL_PAGE_SIZE)
      : { rows: journals, page: 1 };
    journalPage = pg.page;
    const cards = pg.rows
      .map(j => {
        const src =
          j.source === 'manual'
            ? 'Jurnal Umum'
            : j.source && j.source.docType
              ? `${esc(j.source.docType)} ${esc(j.source.docId)}`
              : '—';
        const lines = (j.lines || [])
          .map(
            l => `<tr>
            <td class="jv-code acct-no">${esc(l.accountNo)}</td>
            <td>${esc(l.accountName)}${l.memo ? `<span class="t-muted"> · ${esc(l.memo)}</span>` : ''}</td>
            <td class="jv-debit t-num">${l.debit ? money(l.debit) : ''}</td>
            <td class="jv-credit t-num">${l.credit ? money(l.credit) : ''}</td>
          </tr>`
          )
          .join('');
        // One box per journal (style.css .gl-jv): number and source on top, the
        // lines in regular weight, only the Total row bold.
        return `<div class="gl-jv">
          <div class="gl-jv-head">
            <div><span class="doc-no">${esc(j.number || j.id)}</span><span class="t-muted"> · ${esc(src)}</span></div>
            <div class="jv-date t-muted">${esc(j.date || '')}</div>
          </div>
          <div class="jv-scroll"><table class="jv-lines">
            <tbody>${lines}</tbody>
            <tfoot><tr class="gl-total">
              <td class="jv-code"></td>
              <td class="gl-total-label">Total</td>
              <td class="jv-debit t-num">${money(j.totals ? j.totals.debit : 0)}</td>
              <td class="jv-credit t-num">${money(j.totals ? j.totals.credit : 0)}</td>
            </tr></tfoot>
          </table></div>
        </div>`;
      })
      .join('');
    const pager = window.NSAPager
      ? window.NSAPager.html({
          total: journals.length,
          page: journalPage,
          size: JOURNAL_PAGE_SIZE,
          action: 'glJournalPage',
        })
      : '';
    return `${journalFilterBar()}<div class="card">${head}${cards}${pager}</div>`;
  }

  // ── Chart of Accounts tab ───────────────────────────────────────────────────
  function chartTab() {
    const chart = db().accountsChart || [];
    const rows = chart
      .map(
        a => `<tr>
        <td class="acct-no">${esc(a.no)}</td>
        <td>${esc(a.name)}</td>
        <td class="t-muted">${esc(TYPE_LABEL[a.type] || a.type)}</td>
        <td class="t-num t-muted">${esc(a.currency || 'IDR')}</td>
      </tr>`
      )
      .join('');
    // The tab already names the list; the card head only carries the count.
    return `<div class="card">
      <div class="gl-count t-muted">${chart.length} akun</div>
      <div class="table-wrap"><table class="gl-tb">
        <thead><tr>
          <th class="gl-col-code">Kode</th>
          <th>Nama Akun</th>
          <th class="gl-col-type">Tipe</th>
          <th class="t-num gl-col-cur">Mata Uang</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }

  // Neraca Saldo, Jurnal and Bagan Akun are separate sidebar entries; the page
  // title is the entry that is open.
  function renderLedger() {
    const title = TAB_ENTRY[activeTab] || TAB_ENTRY.trial;
    const header =
      typeof window.secHdr === 'function'
        ? window.secHdr(title, '', 'Buat Jurnal Umum', 'glPostJV')
        : `<h1>${esc(title)}</h1>`;
    let bodyHtml = '';
    if (activeTab === 'journals') {
      bodyHtml = journalsTab();
    } else if (activeTab === 'chart') {
      bodyHtml = chartTab();
    } else {
      bodyHtml = trialTab();
    }
    return `
    ${header}
    ${bodyHtml}`;
  }

  function refresh() {
    const el = document.getElementById('view-ledger');
    if (el) {
      el.innerHTML = renderLedger();
    }
  }

  // ── Journal Voucher entry modal ─────────────────────────────────────────────
  function accountOptions(selected) {
    return (db().accountsChart || [])
      .map(
        a =>
          `<option value="${esc(a.no)}"${selected === a.no ? ' selected' : ''}>${esc(a.no)} — ${esc(a.name)}</option>`
      )
      .join('');
  }

  function jvRowHTML() {
    return `<tr>
      <td style="padding:4px 6px">
        <select class="form-select jv-acc" style="font-size:.75rem;padding:5px 8px;width:100%">
          <option value="">— Pilih Akun —</option>${accountOptions('')}
        </select>
      </td>
      <td style="padding:4px 6px">
        <input class="form-input jv-debit" type="number" min="0" value="0" style="font-size:.75rem;padding:5px 8px;width:120px">
      </td>
      <td style="padding:4px 6px">
        <input class="form-input jv-credit" type="number" min="0" value="0" style="font-size:.75rem;padding:5px 8px;width:120px">
      </td>
      <td style="padding:4px 6px;text-align:center">
        <button type="button" class="jv-del" title="Hapus baris"
          style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.125rem;line-height:1">×</button>
      </td>
    </tr>`;
  }

  function openJVModal() {
    if (!window.openModal || !window.GL) {
      return;
    }
    const today =
      typeof window.today === 'function' ? window.today() : new Date().toISOString().slice(0, 10);
    window.openModal(
      'Jurnal Umum',
      `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tanggal</label>
          <input class="form-input" id="jv-date" type="date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">Keterangan</label>
          <input class="form-input" id="jv-memo" type="text" placeholder="Deskripsi jurnal (opsional)">
        </div>
      </div>
      <div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="form-label" style="margin:0;font-size:.8125rem">Baris Jurnal</span>
          <button type="button" class="btn-ghost" id="jv-add" style="font-size:.75rem;padding:4px 10px">+ Tambah Baris</button>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--surface-sunken)">
            <th style="padding:6px 8px;font-size:.75rem;text-align:left">Akun</th>
            <th style="padding:6px 8px;font-size:.75rem;text-align:left;width:130px">Debit</th>
            <th style="padding:6px 8px;font-size:.75rem;text-align:left;width:130px">Kredit</th>
            <th style="width:30px"></th>
          </tr></thead>
          <tbody id="jv-body">${jvRowHTML()}${jvRowHTML()}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:18px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:.75rem">
          <span>Debit: <strong id="jv-td">Rp 0</strong></span>
          <span>Kredit: <strong id="jv-tc">Rp 0</strong></span>
          <span id="jv-bal" ></span>
        </div>
      </div>`,
      `<button class="btn-ghost" data-action="closeModal">Batal</button>
       <button class="btn" id="jv-save">Simpan Jurnal</button>`,
      true
    );

    setTimeout(() => {
      const body = document.getElementById('jv-body');
      const tdEl = document.getElementById('jv-td');
      const tcEl = document.getElementById('jv-tc');
      const balEl = document.getElementById('jv-bal');

      function recalc() {
        let td = 0;
        let tc = 0;
        body.querySelectorAll('tr').forEach(tr => {
          td += parseFloat(tr.querySelector('.jv-debit')?.value) || 0;
          tc += parseFloat(tr.querySelector('.jv-credit')?.value) || 0;
        });
        tdEl.textContent = money(td);
        tcEl.textContent = money(tc);
        const balanced = Math.round(td) === Math.round(tc) && td > 0;
        balEl.textContent = balanced ? 'Seimbang ✓' : 'Belum seimbang';
        balEl.style.color = balanced ? 'var(--success)' : 'var(--warning)';
      }

      function wireRow(tr) {
        tr.querySelector('.jv-debit')?.addEventListener('input', recalc);
        tr.querySelector('.jv-credit')?.addEventListener('input', recalc);
        tr.querySelector('.jv-del')?.addEventListener('click', () => {
          tr.remove();
          recalc();
        });
      }
      body.querySelectorAll('tr').forEach(wireRow);

      document.getElementById('jv-add')?.addEventListener('click', () => {
        const tmp = document.createElement('tbody');
        tmp.innerHTML = jvRowHTML();
        const tr = tmp.firstElementChild;
        body.appendChild(tr);
        wireRow(tr);
        recalc();
      });

      document.getElementById('jv-save')?.addEventListener('click', () => {
        const date = document.getElementById('jv-date').value;
        const memo = document.getElementById('jv-memo').value.trim();
        const lines = [];
        body.querySelectorAll('tr').forEach(tr => {
          const accountNo = tr.querySelector('.jv-acc')?.value;
          const debit = parseFloat(tr.querySelector('.jv-debit')?.value) || 0;
          const credit = parseFloat(tr.querySelector('.jv-credit')?.value) || 0;
          if (accountNo && (debit > 0 || credit > 0)) {
            lines.push({ accountNo, debit, credit, memo });
          }
        });
        if (lines.length < 2) {
          window.showToast?.('Jurnal memerlukan minimal 2 baris dengan nilai', 'warning');
          return;
        }
        try {
          window.GL.postJournalVoucher(date, lines, memo);
          window.saveDB?.();
          window.closeModal?.();
          activeTab = 'journals';
          refresh();
          syncMenu();
          window.showToast?.('Jurnal umum berhasil disimpan', 'success');
        } catch (err) {
          window.showToast?.(err.message || 'Gagal menyimpan jurnal', 'danger');
        }
      });

      recalc();
    }, 50);
  }

  // ── Wire up ─────────────────────────────────────────────────────────────────
  window.renderLedger = renderLedger;

  window._ledgerExtras = {
    // Open a tab (and, for Jurnal, a source filter) from the sidebar.
    openTab: function (tab, filter) {
      activeTab = TAB_ENTRY[tab] ? tab : 'trial';
      if (filter) {
        journalFilter = filter;
        journalPage = 1;
        journalQuery = { from: '', to: '', acc: '', q: '' };
      }
      if (typeof window.invalidateView === 'function') {
        window.invalidateView('ledger');
      }
      if (typeof window.navigate === 'function') {
        window.navigate('ledger');
      }
      syncMenu();
    },
  };

  if (window.ERP && typeof window.ERP.registerAction === 'function') {
    window.ERP.registerAction('glJournalPage', function (id, type, val) {
      const page = Number(val);
      if (page >= 1) {
        journalPage = page;
        refresh();
      }
      return true;
    });
    window.ERP.registerAction('glJournalQuery', function () {
      const val = id => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };
      journalQuery = { from: val('gl-f-from'), to: val('gl-f-to'), acc: val('gl-f-acc'), q: val('gl-f-q') };
      journalPage = 1;
      refresh();
      return true;
    });
    window.ERP.registerAction('glJournalQueryReset', function () {
      journalQuery = { from: '', to: '', acc: '', q: '' };
      journalPage = 1;
      refresh();
      return true;
    });
    window.ERP.registerAction('glJournalFilter', function (id, type, val) {
      if (val) {
        journalFilter = val;
        journalPage = 1;
        refresh();
        syncMenu();
      }
      return true;
    });
    window.ERP.registerAction('glPostJV', function () {
      openJVModal();
      return true;
    });
  }
})();
