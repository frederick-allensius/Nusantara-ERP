// ══════════════════════════════════════════════════════════════════════════════
//  REPORT EXTRAS  — Report List, SPT PPN / PPNBM, AI Analysis
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
  }
  function money(v) {
    return window.idrFull ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function toast(msg, type) {
    window.showToast && window.showToast(msg, type || 'success');
  }

  var TH =
    'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';
  var VAT_RATE = 0.11;

  function injectView(html) {
    window.invalidateView && window.invalidateView('reports');
    window.navigate && window.navigate('reports');
    setTimeout(function () {
      var el = document.getElementById('view-reports');
      if (el) el.innerHTML = html;
    }, 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 1  REPORT LIST
  // ══════════════════════════════════════════════════════════════════════════
  function openReportList() {
    var reports = [
      {
        cat: 'Keuangan',
        name: 'Laporan Laba Rugi (P&L)',
        desc: 'Pendapatan dan beban per periode',
        action: 'openFinPL',
      },
      {
        cat: 'Keuangan',
        name: 'Neraca (Balance Sheet)',
        desc: 'Posisi aset, kewajiban, dan ekuitas',
        action: 'openFinBS',
      },
      {
        cat: 'Keuangan',
        name: 'Laporan Arus Kas',
        desc: 'Cash flow operasional, investasi, pendanaan',
        action: 'openFinCF',
      },
      {
        cat: 'Penjualan',
        name: 'Rekap Sales Order',
        desc: 'Ringkasan SO per periode, pelanggan, item',
        view: 'sales',
      },
      {
        cat: 'Penjualan',
        name: 'Faktur Penjualan Belum Lunas',
        desc: 'Tagihan pelanggan yang belum dibayar',
        action: 'openInvoiceTab',
        val: 'SI',
      },
      {
        cat: 'Pembelian',
        name: 'Rekap Purchase Order',
        desc: 'Ringkasan PO per periode, supplier, item',
        view: 'purchase',
      },
      {
        cat: 'Pembelian',
        name: 'Hutang ke Supplier',
        desc: 'Faktur pembelian yang belum dibayar',
        action: 'openInvoiceTab',
        val: 'PI',
      },
      {
        cat: 'Persediaan',
        name: 'Nilai Persediaan',
        desc: 'Nilai stok per barang',
        view: 'inventory',
      },
      {
        cat: 'Persediaan',
        name: 'Stok di Bawah Minimum',
        desc: 'Barang yang perlu dibeli lagi',
        view: 'inventory',
      },
      {
        cat: 'Pajak',
        name: 'Rekap PPN',
        desc: 'PPN masukan dan keluaran per periode',
        action: 'openSPTPPN',
      },
      {
        cat: 'Buku Besar',
        name: 'Audit Jurnal',
        desc: 'Seluruh entri jurnal dengan filter lengkap',
        action: 'openAuditJournal',
      },
      {
        cat: 'Buku Besar',
        name: 'Riwayat Akun',
        desc: 'Riwayat transaksi per akun',
        action: 'openAccountHistory',
      },
    ];

    var cats = {};
    reports.forEach(function (r) {
      if (!cats[r.cat]) cats[r.cat] = [];
      cats[r.cat].push(r);
    });

    // Line icon per report category.
    function reportIcon(cat) {
      var paths = {
        Keuangan:
          '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
        Penjualan: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
        Pembelian:
          '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
        Persediaan:
          '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
        Pajak:
          '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        'Buku Besar':
          '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
      };
      return (
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        (paths[cat] || paths.Keuangan) +
        '</svg>'
      );
    }

    function reportCard(r) {
      var search = esc((r.name + ' ' + r.desc + ' ' + r.cat).toLowerCase());
      return (
        '<button class="report-card-item" data-search="' +
        search +
        '" ' +
        (r.action
          ? 'data-action="' + r.action + '"' + (r.val ? ' data-val="' + esc(r.val) + '"' : '')
          : 'data-action="navView" data-view="' + esc(r.view || '') + '"') +
        ' style="display:flex;align-items:center;gap:11px;padding:12px 13px;border:1px solid var(--border);border-radius:10px;cursor:pointer;background:var(--surface);text-align:left;width:100%">' +
        '<span class="report-card-icon" aria-hidden="true">' +
        reportIcon(r.cat) +
        '</span>' +
        '<span style="min-width:0;flex:1"><span style="display:block;font-size:13px;font-weight:700">' +
        esc(r.name) +
        '</span><span style="display:block;font-size:11px;color:var(--muted)">' +
        esc(r.desc) +
        '</span></span>' +
        '<svg style="flex:none;color:var(--muted)" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</button>'
      );
    }

    var sections = Object.keys(cats)
      .map(function (cat) {
        var items = cats[cat].map(reportCard).join('');
        return (
          '<div class="report-cat-block" style="margin-bottom:18px">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">' +
          '<span style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.6px">' +
          esc(cat) +
          '</span>' +
          '<span style="font-size:10px;font-weight:700;color:var(--muted);background:var(--bg);border-radius:99px;padding:1px 8px">' +
          cats[cat].length +
          '</span>' +
          '</div>' +
          '<div class="report-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">' +
          items +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>Daftar Laporan</h1><p>' +
        reports.length +
        ' laporan tersedia dalam sistem Nusantara ERP</p></div></div>' +
        '<div style="position:relative;max-width:380px;margin-bottom:18px">' +
        '<svg style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted)" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input id="report-search" type="text" placeholder="Cari laporan…" autocomplete="off" ' +
        'style="width:100%;padding:9px 12px 9px 34px;border:1px solid var(--border);border-radius:9px;font-size:13px;background:var(--surface);color:var(--text)">' +
        '</div>' +
        '<div id="report-list-body">' +
        sections +
        '<div id="report-empty" style="display:none;padding:30px;text-align:center;color:var(--muted);font-size:13px">Tidak ada laporan yang cocok dengan pencarian.</div>' +
        '</div>'
    );
  }

  // Live-filter the report list as the user types (no re-render, keeps focus).
  document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'report-search') return;
    var q = e.target.value.trim().toLowerCase();
    var anyVisible = false;
    document.querySelectorAll('.report-card-item').forEach(function (card) {
      var match = !q || (card.dataset.search || '').indexOf(q) !== -1;
      card.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    });
    // Hide category blocks whose cards are all filtered out.
    document.querySelectorAll('.report-cat-block').forEach(function (block) {
      var visible = block.querySelectorAll('.report-card-item:not([style*="display: none"])').length;
      block.style.display = visible ? '' : 'none';
    });
    var empty = document.getElementById('report-empty');
    if (empty) empty.style.display = anyVisible ? 'none' : '';
  });

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  SPT PPN / PPNBM
  // ══════════════════════════════════════════════════════════════════════════
  function openSPTPPN() {
    var curPeriod = today().slice(0, 7);
    var periods = {};
    periods[curPeriod] = true;
    ['salesOrders', 'purchaseOrders', 'salesInvoices', 'purchaseInvoices'].forEach(function (coll) {
      (db()[coll] || []).forEach(function (o) {
        if (o.date) periods[o.date.slice(0, 7)] = true;
      });
    });
    var periodList = Object.keys(periods).sort().reverse();
    renderSPT(curPeriod, periodList);
  }

  // PPN of one document: DPP and PPN from its lines and stored tax (handles
  // tax-inclusive prices). Documents without PPN return zeros.
  function taxOf(d) {
    var rate = Number(d.taxRate) || 0;
    if (rate <= 0) return { dpp: 0, ppn: 0, rate: 0 };
    var net = (d.lines || []).reduce(function (s, l) {
      return s + (Number(l.subtotal) || 0);
    }, 0);
    var incl = !!d.taxInclusive;
    var ppn =
      typeof d.tax === 'number' ? Math.round(d.tax) : Math.round(incl ? (net * rate) / (1 + rate) : net * rate);
    return { dpp: incl ? net - ppn : net, ppn: ppn, rate: rate };
  }

  // PPN per tax period from the documents that post PPN to the ledger:
  // output — active sales invoices, delivered SOs not yet invoiced, minus posted
  // sales returns; input — active purchase invoices, received POs not yet
  // invoiced, minus posted purchase returns. Drafts and cancelled documents never count.
  function taxRows(period) {
    var B = window.Balances;
    function inPeriod(d) {
      return d.date && d.date.slice(0, 7) === period;
    }
    function collect(spec) {
      var rows = [];
      function add(d, kind, sign) {
        var t = taxOf(d);
        if (t.ppn === 0) return;
        rows.push({
          date: d.date,
          number: d.number || d.id,
          party: d[spec.party] || '—',
          kind: kind,
          rate: t.rate,
          dpp: sign * t.dpp,
          ppn: sign * t.ppn,
        });
      }
      (db()[spec.invColl] || []).forEach(function (inv) {
        if (inPeriod(inv) && B && B.isActiveInvoice(inv)) add(inv, 'Faktur', 1);
      });
      (db()[spec.orderColl] || []).forEach(function (o) {
        if (inPeriod(o) && o.status === spec.posted && !(B && B.activeInvoiceFor(spec.side, o.id))) {
          add(o, spec.orderKind, 1);
        }
      });
      (db()[spec.returnColl] || []).forEach(function (r) {
        if (inPeriod(r) && r.status === 'Posted') add(r, 'Retur', -1);
      });
      return rows.sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
    }
    return {
      output: collect({
        invColl: 'salesInvoices',
        orderColl: 'salesOrders',
        returnColl: 'salesReturns',
        posted: 'Delivered',
        side: 'sales',
        party: 'customer',
        orderKind: 'SO terkirim (belum difakturkan)',
      }),
      input: collect({
        invColl: 'purchaseInvoices',
        orderColl: 'purchaseOrders',
        returnColl: 'purchaseReturns',
        posted: 'Received',
        side: 'purchases',
        party: 'supplier',
        orderKind: 'PO diterima (belum difakturkan)',
      }),
    };
  }

  var lastSPT = null; // rows of the period on screen, for the CSV export

  function renderSPT(period, periodList) {
    var pOpts = periodList
      .map(function (p) {
        return (
          '<option value="' + p + '"' + (p === period ? ' selected' : '') + '>' + p + '</option>'
        );
      })
      .join('');

    var data = taxRows(period);
    lastSPT = { period: period, output: data.output, input: data.input };
    var sum = function (rows, key) {
      return rows.reduce(function (s, r) {
        return s + r[key];
      }, 0);
    };
    var outputDPP = sum(data.output, 'dpp');
    var outputPPN = sum(data.output, 'ppn');
    var inputDPP = sum(data.input, 'dpp');
    var inputPPN = sum(data.input, 'ppn');
    var soInPeriod = data.output;
    var poInPeriod = data.input;

    var ppnKurang = outputPPN - inputPPN;
    var ppnStatus = ppnKurang > 0 ? 'Kurang Bayar' : ppnKurang < 0 ? 'Lebih Bayar' : 'Nihil';
    var ppnColor = ppnKurang > 0 ? 'var(--danger)' : ppnKurang < 0 ? 'var(--info)' : 'var(--muted)';

    function rowsHTML(rows, emptyText) {
      return (
        rows
          .map(function (r) {
            return (
              '<tr><td class="td-p" style="font-size:11px">' +
              esc(r.date) +
              '</td>' +
              '<td class="td-p" style="font-size:11px">' +
              esc(r.number) +
              '<div style="font-size:10px;color:var(--muted)">' +
              esc(r.kind) +
              '</div></td>' +
              '<td class="td-p">' +
              esc(r.party) +
              '</td>' +
              '<td class="td-p" style="text-align:right">' +
              money(r.dpp) +
              '</td>' +
              '<td class="td-p" style="text-align:right">' +
              money(r.ppn) +
              '</td>' +
              '</tr>'
            );
          })
          .join('') ||
        '<tr><td colspan="5" style="text-align:center;padding:12px;color:var(--muted)">' +
          emptyText +
          '</td></tr>'
      );
    }
    var soRows = rowsHTML(data.output, 'Tidak ada penjualan ber-PPN di periode ini.');
    var poRows = rowsHTML(data.input, 'Tidak ada pembelian ber-PPN di periode ini.');

    injectView(
      '<div class="sec-hdr"><div><h1>Rekap PPN</h1><p>PPN keluaran dan masukan per masa pajak dari dokumen yang sudah diposting. Faktur pajak dan pelaporan SPT tetap dilakukan melalui aplikasi DJP.</p></div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<select class="form-select" id="spt-period" style="font-size:13px">' +
        pOpts +
        '</select>' +
        '<button class="btn" data-action="refreshSPT">Tampilkan</button>' +
        '<button class="btn-ghost" data-action="exportSPT">Ekspor CSV</button>' +
        '</div></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">PPN Keluaran</div><div class="stat-val" style="color:var(--danger)">' +
        money(outputPPN) +
        '</div><div class="stat-sub">DPP ' +
        money(outputDPP) +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">PPN Masukan</div><div class="stat-val" style="color:var(--success)">' +
        money(inputPPN) +
        '</div><div class="stat-sub">DPP ' +
        money(inputDPP) +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">' +
        ppnStatus +
        '</div><div class="stat-val" style="color:' +
        ppnColor +
        '">' +
        money(Math.abs(ppnKurang)) +
        '</div><div class="stat-sub">PPN neto</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Periode</div><div class="stat-val" style="font-size:18px">' +
        period +
        '</div><div class="stat-sub">Masa Pajak</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">' +
        'PPN Keluaran — Penjualan (' +
        soInPeriod.length +
        ' transaksi)</div>' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">Dokumen</th><th style="' +
        TH +
        '">Pelanggan</th>' +
        '<th style="' +
        TH +
        'text-align:right">DPP</th><th style="' +
        TH +
        'text-align:right">PPN</th></tr></thead>' +
        '<tbody>' +
        soRows +
        '</tbody>' +
        '<tfoot><tr><td colspan="3" class="td-p" style="font-weight:700;font-size:12px">TOTAL</td>' +
        '<td class="td-p" style="text-align:right;font-weight:700">' +
        money(outputDPP) +
        '</td>' +
        '<td class="td-p" style="text-align:right;font-weight:700;color:var(--danger)">' +
        money(outputPPN) +
        '</td></tr></tfoot>' +
        '</table></div></div>' +
        '<div class="card">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">' +
        'PPN Masukan — Pembelian (' +
        poInPeriod.length +
        ' transaksi)</div>' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Tanggal</th><th style="' +
        TH +
        '">Dokumen</th><th style="' +
        TH +
        '">Supplier</th>' +
        '<th style="' +
        TH +
        'text-align:right">DPP</th><th style="' +
        TH +
        'text-align:right">PPN</th></tr></thead>' +
        '<tbody>' +
        poRows +
        '</tbody>' +
        '<tfoot><tr><td colspan="3" class="td-p" style="font-weight:700;font-size:12px">TOTAL</td>' +
        '<td class="td-p" style="text-align:right;font-weight:700">' +
        money(inputDPP) +
        '</td>' +
        '<td class="td-p" style="text-align:right;font-weight:700;color:var(--success)">' +
        money(inputPPN) +
        '</td></tr></tfoot>' +
        '</table></div></div>'
    );

    // Attach refresh handler
    setTimeout(function () {
      var btn = document.getElementById('spt-period');
      if (!btn) return;
      var refreshBtn = document.querySelector('[data-action="refreshSPT"]');
      if (refreshBtn)
        refreshBtn.addEventListener('click', function () {
          var p = document.getElementById('spt-period').value;
          renderSPT(p, periodList);
        });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  ANALISIS BISNIS (simple rules on journals and documents)
  // ══════════════════════════════════════════════════════════════════════════
  function openAIAnalysis() {
    var data = db();
    var now = new Date();
    var monthKey = function (d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    };
    var curMonth = monthKey(now);
    var prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    var curYear = String(now.getFullYear());
    // This month so far is compared with the same days of last month.
    var prevDays = Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate());

    // Revenue, cost of sales and purchases from posted journals — the same source as
    // the financial reports and the Ringkasan dashboard.
    var types = {};
    (data.accountsChart || []).forEach(function (a) {
      types[a.no] = a.type;
    });
    var months = {};
    for (var i = 5; i >= 0; i--) {
      months[monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))] = { rev: 0, pur: 0 };
    }
    var totalRevenue = 0;
    var totalCogs = 0;
    var curMonthRevenue = 0;
    var prevToDateRevenue = 0;
    (data.journals || []).forEach(function (j) {
      var date = String(j.date || '');
      var key = date.slice(0, 7);
      var src = j.source && j.source.docType;
      var purchaseDoc = src === 'PI' || src === 'PO' || src === 'PRN';
      (j.lines || []).forEach(function (l) {
        var t = types[l.accountNo];
        var dr = Number(l.debit) || 0;
        var cr = Number(l.credit) || 0;
        if (t === 'REVENUE') {
          if (date.slice(0, 4) === curYear) totalRevenue += cr - dr;
          if (key === curMonth) curMonthRevenue += cr - dr;
          if (key === prevMonth && Number(date.slice(8, 10)) <= prevDays) prevToDateRevenue += cr - dr;
          if (months[key]) months[key].rev += cr - dr;
        } else if (t === 'COGS' && date.slice(0, 4) === curYear) {
          totalCogs += dr - cr;
        }
        if (purchaseDoc && months[key] && (t === 'INVENTORY' || t === 'EXPENSE' || t === 'COGS')) {
          months[key].pur += dr - cr;
        }
      });
    });
    var grossProfit = totalRevenue - totalCogs;
    var profitMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;
    var revenueGrowth =
      prevToDateRevenue > 0
        ? (((curMonthRevenue - prevToDateRevenue) / prevToDateRevenue) * 100).toFixed(1)
        : null;
    var trendData = Object.keys(months).map(function (k) {
      return { month: k.slice(5, 7) + '/' + k.slice(2, 4), rev: months[k].rev, pur: months[k].pur };
    });

    // Sales this year by customer and item, without PPN: invoices, plus delivered
    // orders without an invoice (both post revenue).
    var sales = (data.salesInvoices || []).filter(function (inv) {
      return (
        (inv.status === 'Outstanding' || inv.status === 'Paid') &&
        String(inv.date || '').slice(0, 4) === curYear
      );
    });
    (data.salesOrders || []).forEach(function (o) {
      var invoiced =
        window.GL && typeof window.GL.hasActiveInvoice === 'function'
          ? window.GL.hasActiveInvoice('salesInvoices', 'SO', o.id)
          : false;
      if (o.status === 'Delivered' && !invoiced && String(o.date || '').slice(0, 4) === curYear) {
        sales.push(o);
      }
    });
    var custMap = {};
    var itemMap = {};
    var salesTotal = 0;
    sales.forEach(function (doc) {
      (doc.lines || []).forEach(function (l) {
        var value = Number(l.subtotal) || (Number(l.qty) || 0) * (Number(l.price) || 0);
        var cust = doc.customer || '—';
        var item = l.itemName || l.name || l.itemId || '—';
        custMap[cust] = (custMap[cust] || 0) + value;
        itemMap[item] = (itemMap[item] || 0) + value;
        salesTotal += value;
      });
    });
    var ranked = function (map) {
      return Object.keys(map)
        .map(function (n) {
          return { name: n, total: map[n] };
        })
        .sort(function (a, b) {
          return b.total - a.total;
        })
        .slice(0, 5);
    };
    var top5Cust = ranked(custMap);
    var top5Items = ranked(itemMap);

    // Receivables from invoice balances (payments and returns applied).
    var ar =
      window.Balances && typeof window.Balances.summary === 'function'
        ? window.Balances.summary('sales')
        : { total: 0, overdue: 0, count: 0, overdueCount: 0 };

    // Findings from simple rules on the transactions
    var insights = [];
    if (revenueGrowth === null) {
      insights.push({
        type: 'info',
        text: 'Belum ada penjualan pada hari yang sama bulan lalu untuk dibandingkan.',
      });
    } else {
      insights.push({
        type: Number(revenueGrowth) < -10 ? 'warn' : Number(revenueGrowth) > 10 ? 'good' : 'info',
        text:
          'Penjualan bulan ini sampai hari ini <strong>' +
          (Number(revenueGrowth) >= 0 ? '+' : '−') +
          Math.abs(revenueGrowth) +
          '%</strong> dibanding tanggal 1–' +
          prevDays +
          ' bulan lalu.',
      });
    }

    if (totalRevenue > 0)
      insights.push({
        type: 'info',
        text:
          'Margin kotor tahun ini <strong>' +
          profitMargin +
          '%</strong>: laba kotor ' +
          money(grossProfit) +
          ' dari penjualan ' +
          money(totalRevenue) +
          '.',
      });

    if (ar.overdueCount)
      insights.push({
        type: 'warn',
        text:
          '<strong>' +
          ar.overdueCount +
          ' faktur</strong> senilai ' +
          money(ar.overdue) +
          ' sudah lewat jatuh tempo, dari total piutang ' +
          money(ar.total) +
          '.',
      });
    else if (ar.count)
      insights.push({
        type: 'info',
        text:
          'Piutang ' +
          money(ar.total) +
          ' dari ' +
          ar.count +
          ' dokumen; belum ada yang lewat jatuh tempo.',
      });

    if (top5Cust.length && salesTotal > 0) {
      var share = Math.round((top5Cust[0].total / salesTotal) * 100);
      insights.push({
        type: share > 50 ? 'warn' : 'info',
        text:
          'Pelanggan terbesar tahun ini: <strong>' +
          esc(top5Cust[0].name) +
          '</strong>, ' +
          share +
          '% dari penjualan.',
      });
    }

    if (top5Items.length)
      insights.push({
        type: 'info',
        text:
          'Barang dengan penjualan terbesar tahun ini: <strong>' +
          esc(top5Items[0].name) +
          '</strong> (' +
          money(top5Items[0].total) +
          ').',
      });

    var insightHtml = insights
      .map(function (ins) {
        var cls =
          ins.type === 'good' ? 'notice-success' : ins.type === 'warn' ? 'notice-warning' : 'notice-info';
        return '<div class="notice ' + cls + '" style="margin-bottom:8px">' + ins.text + '</div>';
      })
      .join('');

    // Trend chart (simple bar)
    var maxRev =
      Math.max.apply(
        null,
        trendData.map(function (d) {
          return d.rev;
        })
      ) || 1;
    var trendBars = trendData
      .map(function (d) {
        var pct = Math.round((d.rev / maxRev) * 100);
        var pctP = Math.round((d.pur / maxRev) * 100);
        return (
          '<div style="flex:1;text-align:center">' +
          '<div style="display:flex;gap:2px;align-items:flex-end;justify-content:center;height:80px;margin-bottom:4px">' +
          '<div style="width:12px;background:var(--primary);border-radius:3px 3px 0 0;height:' +
          pct +
          '%;min-height:2px" title="Penjualan ' +
          money(d.rev) +
          '"></div>' +
          '<div style="width:12px;background:var(--warning);border-radius:3px 3px 0 0;height:' +
          pctP +
          '%;min-height:2px" title="Pembelian ' +
          money(d.pur) +
          '"></div>' +
          '</div>' +
          '<div style="font-size:10px;color:var(--muted)">' +
          d.month +
          '</div></div>'
        );
      })
      .join('');

    var top5CustHtml = top5Cust.length
      ? top5Cust
          .map(function (c, i) {
            var pct = salesTotal > 0 ? Math.round((c.total / salesTotal) * 100) : 0;
            return (
              '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
              '<span style="font-size:14px;font-weight:800;color:var(--muted);width:18px">' +
              (i + 1) +
              '</span>' +
              '<div style="flex:1"><div style="font-size:13px;font-weight:600;margin-bottom:2px">' +
              esc(c.name) +
              '</div>' +
              '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;background:var(--primary);width:' +
              pct +
              '%"></div></div>' +
              '</div><div style="font-size:12px;font-weight:700;text-align:right;white-space:nowrap">' +
              money(c.total) +
              '</div></div>'
            );
          })
          .join('')
      : '<div style="color:var(--muted);font-size:12px">Belum ada data penjualan.</div>';

    var top5ItemHtml = top5Items.length
      ? top5Items
          .map(function (it, i) {
            var pct =
              top5Items[0].total > 0 ? Math.round((it.total / top5Items[0].total) * 100) : 0;
            return (
              '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
              '<span style="font-size:14px;font-weight:800;color:var(--muted);width:18px">' +
              (i + 1) +
              '</span>' +
              '<div style="flex:1"><div style="font-size:13px;font-weight:600;margin-bottom:2px">' +
              esc(it.name) +
              '</div>' +
              '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;background:var(--warning);width:' +
              pct +
              '%"></div></div>' +
              '</div><div style="font-size:12px;font-weight:700;text-align:right;white-space:nowrap">' +
              money(it.total) +
              '</div></div>'
            );
          })
          .join('')
      : '<div style="color:var(--muted);font-size:12px">Belum ada data item terjual.</div>';

    injectView(
      '<div class="sec-hdr"><div><h1>Analisis Bisnis</h1><p>Dihitung dari jurnal dan dokumen yang tercatat, per ' +
        today() +
        '</p></div>' +
        '<button class="btn-ghost" data-action="refreshAI">Muat ulang</button></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Penjualan Tahun Ini</div><div class="stat-val" style="font-size:18px">' +
        money(totalRevenue) +
        '</div><div class="stat-sub">' +
        sales.length.toLocaleString('id-ID') +
        ' dokumen penjualan</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Laba Kotor Tahun Ini</div><div class="stat-val" style="font-size:18px;color:' +
        (grossProfit >= 0 ? 'var(--success)' : 'var(--danger)') +
        '">' +
        money(grossProfit) +
        '</div><div class="stat-sub">Margin ' +
        profitMargin +
        '%</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Bulan Ini</div><div class="stat-val" style="font-size:18px">' +
        money(curMonthRevenue) +
        '</div><div class="stat-sub"' +
        (revenueGrowth === null
          ? '>Belum ada pembanding'
          : ' style="color:' +
            (Number(revenueGrowth) >= 0 ? 'var(--success)' : 'var(--danger)') +
            '">' +
            (Number(revenueGrowth) >= 0 ? '+' : '−') +
            Math.abs(revenueGrowth) +
            '% vs tgl 1–' +
            prevDays +
            ' bulan lalu') +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Piutang Belum Lunas</div><div class="stat-val" style="font-size:18px' +
        (ar.overdueCount ? ';color:var(--warning)' : '') +
        '">' +
        money(ar.total) +
        '</div><div class="stat-sub">' +
        (ar.overdueCount ? money(ar.overdue) + ' lewat jatuh tempo' : ar.count + ' dokumen') +
        '</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Temuan dari data transaksi</div>' +
        insightHtml +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">' +
        '<div class="card"><div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">5 Pelanggan Teratas</div>' +
        top5CustHtml +
        '</div>' +
        '<div class="card"><div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">5 Barang Terlaris</div>' +
        top5ItemHtml +
        '</div>' +
        '</div>' +
        '<div class="card">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Tren 6 Bulan Terakhir</div>' +
        '<div style="display:flex;align-items:flex-end;gap:6px;height:100px">' +
        trendBars +
        '</div>' +
        '<div style="display:flex;gap:16px;font-size:11px;margin-top:8px">' +
        '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;background:var(--primary);border-radius:2px;display:inline-block"></span>Penjualan</span>' +
        '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;background:var(--warning);border-radius:2px;display:inline-block"></span>Pembelian</span>' +
        '</div></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    switch (action) {
      case 'openSPTPPN':
        openSPTPPN();
        break;
      case 'openAIAnalysis':
        openAIAnalysis();
        break;
      case 'refreshAI':
        openAIAnalysis();
        break;
      case 'navView': {
        var view = btn.dataset.view;
        if (view && window.navigate) {
          window.invalidateView && window.invalidateView(view);
          window.navigate(view);
        }
        break;
      }
      // Financial reports are tabs inside the 'financials' view — open the right
      // tab via the financial module rather than navigating to a non-existent view.
      case 'openFinPL':
        if (window._financialExtras) window._financialExtras.openPL();
        break;
      case 'openFinBS':
        if (window._financialExtras) window._financialExtras.openBS();
        break;
      case 'openFinCF':
        if (window._financialExtras) window._financialExtras.openCF();
        break;
      case 'exportSPT': {
        if (!lastSPT) {
          toast('Buka Rekap PPN terlebih dahulu', 'warning');
          break;
        }
        var csvCell = function (v) {
          var s = String(v == null ? '' : v);
          return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        var csv = [['Jenis', 'Tanggal', 'Dokumen', 'Keterangan', 'Pihak', 'Tarif', 'DPP', 'PPN'].join(';')];
        [
          ['PPN Keluaran', lastSPT.output],
          ['PPN Masukan', lastSPT.input],
        ].forEach(function (group) {
          group[1].forEach(function (r) {
            csv.push(
              [group[0], r.date, r.number, r.kind, r.party, Math.round(r.rate * 100) + '%', r.dpp, r.ppn]
                .map(csvCell)
                .join(';')
            );
          });
        });
        var blob = new Blob(['﻿' + csv.join('\n')], { type: 'text/csv;charset=utf-8' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'Rekap-PPN-' + lastSPT.period + '.csv';
        document.body.appendChild(link);
        link.click();
        setTimeout(function () {
          URL.revokeObjectURL(link.href);
          link.remove();
        }, 0);
        break;
      }
      case 'openAuditJournal':
        if (window._budgetGLExtras) window._budgetGLExtras.openAuditJournal();
        break;
      case 'openAccountHistory':
        if (window._budgetGLExtras) window._budgetGLExtras.openAccountHistory();
        break;
      case 'openInvoiceTab': {
        var invTab = btn.dataset.val === 'PI' ? 'openPurchaseInvoice' : 'openSalesInvoice';
        var openTab = function () {
          if (window._invoiceExtras) window._invoiceExtras[invTab]();
        };
        if (window._invoiceExtras || typeof window.ensureView !== 'function') {
          openTab();
        } else {
          window.ensureView('invoices').then(openTab);
        }
        break;
      }
    }
  });

  window._reportExtras = {
    openReportList: openReportList,
    openSPTPPN: openSPTPPN,
    openAIAnalysis: openAIAnalysis,
  };
  console.log('[ReportExtras] Report extras ready');
})();
