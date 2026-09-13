// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Ringkasan (dashboard)  (modules/dashboard.js)
//
// Answers "what does the owner or admin need to know right now?" (docs/09 §4),
// using only records the application keeps:
//   • Kas & bank          — ledger balance of cash/bank accounts (GL.trialBalance)
//   • Piutang / Hutang     — open items, overdue and due soon (Balances.summary)
//   • Penjualan bulan ini  — revenue and COGS journal lines, compared with last month
//   • Tren 6 bulan         — revenue vs purchases per month from journals
//   • Perlu tindakan       — documents waiting for their next step (statuses)
//   • Jatuh tempo, stok menipis, aktivitas terbaru (audit log)
// Blocks can be hidden per browser ("Atur Tampilan"); the company data checklist
// shows until the basics are filled in.
//
// Classic script sharing the bundle's global scope: renderDashboard, initCharts,
// destroyCharts and _initChartsImpl are globals used by nav.js and erp-view.js.
// ═══════════════════════════════════════════════════════════════════════════════

var DASH_HIDDEN_KEY = 'nsa_dash_hidden_v2';
var DASH_BLOCKS = [
  { id: 'trend', label: 'Penjualan & pembelian 6 bulan' },
  { id: 'actions', label: 'Perlu tindakan' },
  { id: 'due', label: 'Jatuh tempo terdekat' },
  { id: 'stock', label: 'Stok menipis' },
  { id: 'activity', label: 'Aktivitas terbaru' },
];
var DASH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var DASH_COLLECTIONS = {
  salesOrders: 'Pesanan penjualan',
  purchaseOrders: 'Pesanan pembelian',
  salesInvoices: 'Faktur penjualan',
  purchaseInvoices: 'Faktur pembelian',
  salesReceipts: 'Penerimaan pembayaran',
  purchasePayments: 'Pembayaran ke supplier',
  salesReturns: 'Retur penjualan',
  purchaseReturns: 'Retur pembelian',
  salesQuotations: 'Penawaran penjualan',
  purchaseQuotations: 'Penawaran pembelian',
  deliveryOrders: 'Surat jalan',
  goodsReceipts: 'Penerimaan barang',
  salesDownPayments: 'Uang muka penjualan',
  purchaseDownPayments: 'Uang muka pembelian',
  itemAdjustments: 'Penyesuaian stok',
  itemTransfers: 'Transfer antargudang',
  otherPayments: 'Pengeluaran lain',
  otherDeposits: 'Penerimaan lain',
  bankTransfers: 'Transfer antarrekening',
  paymentLogs: 'Pembayaran',
  journals: 'Jurnal umum',
  inventoryItems: 'Barang',
  customers: 'Pelanggan',
  suppliers: 'Supplier',
};
var DASH_VERBS = { create: 'dibuat', update: 'diubah', status: 'status diubah', delete: 'dihapus' };

// ── Preferences ──────────────────────────────────────────────────────────────
function _dashHidden() {
  try {
    var v = JSON.parse(localStorage.getItem(DASH_HIDDEN_KEY));
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function _dashSetHidden(ids) {
  try {
    localStorage.setItem(DASH_HIDDEN_KEY, JSON.stringify(ids));
  } catch (_) {
    /* storage unavailable */
  }
}

function _refreshDashboard() {
  if (typeof window.invalidateView === 'function') {
    window.invalidateView('dashboard');
  }
  navigate('dashboard');
}

// ── Charts (called by nav.js on every visit and theme change) ────────────────
function destroyCharts() {
  if (typeof _chartInitTimer !== 'undefined' && _chartInitTimer !== null) {
    clearTimeout(_chartInitTimer);
    _chartInitTimer = null;
  }
  Object.values(charts).forEach(function (c) {
    try {
      c.destroy();
    } catch (_) {
      /* already gone */
    }
  });
  charts = {};
}

function initCharts() {
  if (typeof _chartInitTimer !== 'undefined' && _chartInitTimer !== null) {
    clearTimeout(_chartInitTimer);
  }
  _chartInitTimer = setTimeout(_initChartsImpl, 60);
}

function _initChartsImpl() {
  var canvas = document.getElementById('dashTrendChart');
  if (typeof Chart === 'undefined' || !canvas || !document.body.contains(canvas)) {
    return;
  }
  var css = getComputedStyle(document.documentElement);
  var tok = function (name, fallback) {
    return (css.getPropertyValue(name) || '').trim() || fallback;
  };
  var series = _dashMonthly(6);
  var font = { family: tok('--font-sans', 'system-ui, sans-serif'), size: 11 };
  var money = typeof idr === 'function' ? idr : String;
  var short = typeof idrShort === 'function' ? idrShort : String;

  charts.dashTrend = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.keys.map(function (k) {
        return DASH_MONTHS[Number(k.slice(5, 7)) - 1];
      }),
      datasets: [
        {
          label: 'Penjualan',
          data: series.keys.map(function (k) {
            return Math.round(series.data[k].revenue);
          }),
          backgroundColor: tok('--chart-1', '#06845c'),
          borderRadius: 4,
          maxBarThickness: 22,
        },
        {
          label: 'Pembelian',
          data: series.keys.map(function (k) {
            return Math.round(series.data[k].purchases);
          }),
          backgroundColor: tok('--chart-3', '#d97706'),
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tok('--surface-raised', '#ffffff'),
          titleColor: tok('--text', '#161b19'),
          bodyColor: tok('--text-secondary', '#46514d'),
          borderColor: tok('--border-strong', 'rgba(0,0,0,0.15)'),
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          titleFont: Object.assign({}, font, { weight: '600' }),
          bodyFont: font,
          callbacks: {
            label: function (c) {
              return c.dataset.label + ': ' + money(c.raw);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: font, color: tok('--chart-text', '#66716d') },
        },
        y: {
          grid: { color: tok('--chart-grid', 'rgba(0,0,0,0.07)') },
          border: { display: false },
          ticks: {
            font: font,
            color: tok('--chart-text', '#66716d'),
            maxTicksLimit: 5,
            callback: function (v) {
              return short(v).replace('Rp ', '');
            },
          },
        },
      },
    },
  });
}

// ── Data ─────────────────────────────────────────────────────────────────────
function _dashMonthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function _dashAccountTypes() {
  var chart =
    typeof GL !== 'undefined' && typeof GL.ensureChart === 'function'
      ? GL.ensureChart()
      : DB.accountsChart || [];
  var map = {};
  chart.forEach(function (a) {
    map[a.no] = a.type;
  });
  return map;
}

// Revenue, cost of goods sold and purchases per month for the last `months`
// months. Purchases are the stock/expense debits of purchase documents (invoice,
// receipt of an uninvoiced order) net of purchase returns — PPN excluded.
function _dashMonthly(months) {
  var types = _dashAccountTypes();
  var now = new Date();
  var keys = [];
  var data = {};
  for (var i = months - 1; i >= 0; i--) {
    var k = _dashMonthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
    keys.push(k);
    data[k] = { revenue: 0, cogs: 0, purchases: 0 };
  }
  (DB.journals || []).forEach(function (j) {
    var m = data[String(j.date || '').slice(0, 7)];
    if (!m) {
      return;
    }
    var src = j.source && j.source.docType;
    var purchaseDoc = src === 'PI' || src === 'PO' || src === 'PRN';
    (j.lines || []).forEach(function (l) {
      var t = types[l.accountNo];
      var dr = Number(l.debit) || 0;
      var cr = Number(l.credit) || 0;
      if (t === 'REVENUE') {
        m.revenue += cr - dr;
      } else if (t === 'COGS') {
        m.cogs += dr - cr;
      }
      if (purchaseDoc && (t === 'INVENTORY' || t === 'EXPENSE' || t === 'COGS')) {
        m.purchases += dr - cr;
      }
    });
  });
  return { keys: keys, data: data };
}

function _dashCash() {
  var tb =
    typeof GL !== 'undefined' && typeof GL.trialBalance === 'function'
      ? GL.trialBalance()
      : { rows: [] };
  var accounts = tb.rows
    .filter(function (r) {
      return r.type === 'CASH_BANK';
    })
    .map(function (r) {
      return { name: r.name, balance: r.debit - r.credit };
    });
  return {
    accounts: accounts,
    total: accounts.reduce(function (s, a) {
      return s + a.balance;
    }, 0),
  };
}

function _dashBalances(side) {
  if (typeof Balances === 'undefined' || typeof Balances.summary !== 'function') {
    return { total: 0, overdue: 0, dueSoon: 0, count: 0, overdueCount: 0, items: [] };
  }
  return Balances.summary(side);
}

function _dashActions() {
  var so = DB.salesOrders || [];
  var po = DB.purchaseOrders || [];
  var invoiced = function (side, id) {
    return (
      typeof Balances !== 'undefined' &&
      typeof Balances.activeInvoiceFor === 'function' &&
      !!Balances.activeInvoiceFor(side, id)
    );
  };
  var drafts = [so, po, DB.salesInvoices || [], DB.purchaseInvoices || []].reduce(function (n, list) {
    return (
      n +
      list.filter(function (d) {
        return d.status === 'Draft';
      }).length
    );
  }, 0);
  return [
    {
      label: 'Pesanan penjualan belum dikirim',
      hint: 'Dikonfirmasi atau lunas, barang belum keluar',
      count: so.filter(function (o) {
        return o.status === 'Confirmed' || o.status === 'Paid';
      }).length,
      open: 'Pesanan Penjualan',
    },
    {
      label: 'Pengiriman belum selesai',
      hint: 'Surat jalan pending atau dalam perjalanan',
      count: (DB.deliveryOrders || []).filter(function (d) {
        return d.status === 'Pending' || d.status === 'In Transit';
      }).length,
      open: 'Surat Jalan',
    },
    {
      label: 'Pesanan terkirim tanpa faktur',
      hint: 'Barang sudah dikirim, faktur belum dibuat',
      count: so.filter(function (o) {
        return o.status === 'Delivered' && !invoiced('sales', o.id);
      }).length,
      open: 'Faktur Penjualan',
    },
    {
      label: 'Penawaran menunggu jawaban',
      hint: 'Penawaran penjualan yang sudah dikirim',
      count: (DB.salesQuotations || []).filter(function (q) {
        return q.status === 'Sent';
      }).length,
      open: 'Penawaran Penjualan',
    },
    {
      label: 'Pesanan pembelian belum diterima',
      hint: 'Dikonfirmasi atau lunas, barang belum masuk',
      count: po.filter(function (o) {
        return o.status === 'Confirmed' || o.status === 'Paid';
      }).length,
      open: 'Pesanan Pembelian',
    },
    {
      label: 'Dokumen masih draft',
      hint: 'Pesanan dan faktur yang belum diposting',
      count: drafts,
      open: 'Pesanan Penjualan',
    },
  ].filter(function (r) {
    return r.count > 0;
  });
}

function _dashLowStock() {
  return (DB.inventoryItems || [])
    .map(function (i) {
      return { item: i, min: Number(i.min != null ? i.min : i.minStock) || 0, stock: Number(i.stock) || 0 };
    })
    .filter(function (x) {
      return x.min > 0 && x.stock <= x.min;
    })
    .sort(function (a, b) {
      return a.stock / a.min - b.stock / b.min;
    });
}

// Company data checklist — shown until every basic item is in place.
function _companyPrepChecks() {
  var c = (DB.settings && DB.settings.company) || {};
  var u = (DB.settings && DB.settings.user) || {};
  var chart =
    typeof GL !== 'undefined' && typeof GL.ensureChart === 'function'
      ? GL.ensureChart()
      : DB.accountsChart || [];
  return [
    { label: 'Nama perusahaan', ok: !!c.name, action: 'editIdentity' },
    { label: 'Alamat perusahaan', ok: !!c.address, action: 'editIdentity' },
    { label: 'Telepon perusahaan', ok: !!c.phone, action: 'editIdentity' },
    { label: 'Nama pengguna', ok: !!u.name, action: 'editIdentity' },
    { label: 'Jabatan pengguna', ok: !!u.role, action: 'editIdentity' },
    { label: 'Bagan akun', ok: !!(chart && chart.length), open: 'Bagan Akun' },
    { label: 'Data pelanggan', ok: !!(DB.customers && DB.customers.length), open: 'Pelanggan' },
    { label: 'Data supplier', ok: !!(DB.suppliers && DB.suppliers.length), open: 'Supplier' },
    { label: 'Data barang', ok: !!(DB.inventoryItems && DB.inventoryItems.length), open: 'Barang & Stok' },
  ];
}

function _companyPrepComplete() {
  return _companyPrepChecks().every(function (c) {
    return c.ok;
  });
}

// ── Formatting ───────────────────────────────────────────────────────────────
function _dashDate(iso) {
  var p = String(iso || '').split('-');
  return p.length === 3 ? Number(p[2]) + ' ' + DASH_MONTHS[Number(p[1]) - 1] + ' ' + p[0] : iso || '';
}

function _dashTime(ts) {
  var d = new Date(ts);
  if (isNaN(d.getTime())) {
    return String(ts || '');
  }
  var hm = String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
  return d.toDateString() === new Date().toDateString()
    ? 'Hari ini ' + hm
    : d.getDate() + ' ' + DASH_MONTHS[d.getMonth()] + ' ' + hm;
}

function _dashCard(title, sub, body, more) {
  return (
    '<div class="card dash-list">' +
    '<div class="card-head"><div><div class="card-title">' +
    escapeHtml(title) +
    '</div>' +
    (sub ? '<div class="card-sub">' + escapeHtml(sub) + '</div>' : '') +
    '</div>' +
    (more
      ? '<button type="button" class="link-btn" data-dash-open="' +
        escapeHtml(more) +
        '">Lihat semua</button>'
      : '') +
    '</div>' +
    body +
    '</div>'
  );
}

function _dashEmpty(text) {
  return '<div class="empty-inline">' + escapeHtml(text) + '</div>';
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderDashboard() {
  var money = typeof idr === 'function' ? idr : String;
  var short = typeof idrShort === 'function' ? idrShort : money;
  var hidden = _dashHidden();
  var show = function (id) {
    return hidden.indexOf(id) === -1;
  };
  var now = new Date();
  var todayIso =
    typeof Balances !== 'undefined' && Balances.todayISO ? Balances.todayISO() : _dashMonthKey(now);

  // KPI tiles
  var cash = _dashCash();
  var ar = _dashBalances('sales');
  var ap = _dashBalances('purchases');
  var months = _dashMonthly(2);
  var cur = months.data[months.keys[1]];
  var prev = months.data[months.keys[0]];
  var gross = cur.revenue - cur.cogs;
  var delta =
    prev.revenue > 0 ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 100) : null;
  var prevMonth = DASH_MONTHS[Number(months.keys[0].slice(5, 7)) - 1];

  var tile = function (o) {
    return (
      '<button type="button" class="card kpi-tile" data-dash-open="' +
      escapeHtml(o.open) +
      '">' +
      '<span class="kpi-tile-label">' +
      escapeHtml(o.label) +
      '</span>' +
      '<span class="kpi-tile-value">' +
      escapeHtml(o.value) +
      '</span>' +
      '<span class="kpi-tile-sub' +
      (o.tone ? ' is-' + o.tone : '') +
      '">' +
      escapeHtml(o.sub) +
      '</span></button>'
    );
  };

  var tiles = [
    tile({
      label: 'Kas & bank',
      value: money(cash.total),
      sub: cash.accounts.length
        ? cash.accounts
            .slice(0, 3)
            .map(function (a) {
              return a.name + ' ' + short(a.balance);
            })
            .join(' · ')
        : 'Belum ada saldo kas atau bank',
      open: 'Riwayat Kas & Bank',
    }),
    tile({
      label: 'Piutang',
      value: money(ar.total),
      sub: ar.overdueCount
        ? short(ar.overdue) + ' lewat jatuh tempo · ' + ar.overdueCount + ' dokumen'
        : ar.count
          ? ar.count + ' dokumen belum lunas, belum ada yang lewat tempo'
          : 'Tidak ada tagihan terbuka',
      tone: ar.overdueCount ? 'warning' : '',
      open: 'Faktur Penjualan',
    }),
    tile({
      label: 'Hutang',
      value: money(ap.total),
      sub: ap.overdueCount
        ? short(ap.overdue) + ' lewat jatuh tempo · ' + ap.overdueCount + ' dokumen'
        : ap.dueSoon
          ? short(ap.dueSoon) + ' jatuh tempo dalam 7 hari'
          : ap.count
            ? ap.count + ' dokumen belum lunas'
            : 'Tidak ada hutang terbuka',
      tone: ap.overdueCount ? 'danger' : ap.dueSoon ? 'warning' : '',
      open: 'Faktur Pembelian',
    }),
    tile({
      label: 'Penjualan bulan ini',
      value: money(cur.revenue),
      sub:
        'Laba kotor ' +
        short(gross) +
        (delta === null ? '' : ' · ' + (delta >= 0 ? '+' : '−') + Math.abs(delta) + '% vs ' + prevMonth),
      open: 'Laba Rugi',
    }),
  ].join('');

  // Company data checklist
  var prep = '';
  if (!_companyPrepComplete()) {
    var checks = _companyPrepChecks();
    var missing = checks.filter(function (c) {
      return !c.ok;
    });
    prep =
      '<div class="card dash-prep">' +
      '<div class="card-head"><div><div class="card-title">Lengkapi data dasar</div>' +
      '<div class="card-sub">' +
      (checks.length - missing.length) +
      ' dari ' +
      checks.length +
      ' siap. Data ini dipakai pada dokumen dan laporan.</div></div></div>' +
      '<div class="dash-prep-list">' +
      missing
        .map(function (c) {
          return (
            '<button type="button" class="btn-ghost btn-sm" ' +
            (c.action
              ? 'data-action="' + c.action + '"'
              : 'data-dash-open="' + escapeHtml(c.open) + '"') +
            '>' +
            escapeHtml(c.label) +
            '</button>'
          );
        })
        .join('') +
      '</div></div>';
  }

  // Trend
  var trend = '';
  if (show('trend')) {
    var six = _dashMonthly(6);
    var anyData = six.keys.some(function (k) {
      return six.data[k].revenue || six.data[k].purchases;
    });
    trend =
      '<div class="card dash-trend">' +
      '<div class="card-head"><div><div class="card-title">Penjualan & pembelian</div>' +
      '<div class="card-sub">6 bulan terakhir, dari jurnal yang diposting</div></div>' +
      (anyData
        ? '<div class="chart-legend"><span><i style="background:var(--chart-1)"></i>Penjualan</span>' +
          '<span><i style="background:var(--chart-3)"></i>Pembelian</span></div>'
        : '') +
      '</div>' +
      (anyData
        ? '<div class="chart-wrap"><canvas id="dashTrendChart" role="img" aria-label="Grafik penjualan dan pembelian enam bulan terakhir"></canvas></div>'
        : _dashEmpty('Belum ada penjualan atau pembelian yang diposting dalam 6 bulan terakhir.')) +
      '</div>';
  }

  // Needs action
  var actions = '';
  if (show('actions')) {
    var rows = _dashActions();
    actions = _dashCard(
      'Perlu tindakan',
      'Dokumen yang menunggu langkah berikutnya',
      rows.length
        ? '<div class="dash-list-body">' +
            rows
              .map(function (r) {
                return (
                  '<button type="button" class="dash-list-row" data-dash-open="' +
                  escapeHtml(r.open) +
                  '"><span class="dash-list-main"><span class="dash-list-title">' +
                  escapeHtml(r.label) +
                  '</span><span class="dash-list-sub">' +
                  escapeHtml(r.hint) +
                  '</span></span><span class="dash-count">' +
                  r.count +
                  '</span></button>'
                );
              })
              .join('') +
            '</div>'
        : _dashEmpty('Tidak ada dokumen yang menunggu tindakan.')
    );
  }

  // Due soon (receivables and payables)
  var due = '';
  if (show('due')) {
    var dueItems = ar.items
      .map(function (it) {
        return Object.assign({ side: 'Piutang' }, it);
      })
      .concat(
        ap.items.map(function (it) {
          return Object.assign({ side: 'Hutang' }, it);
        })
      )
      .filter(function (it) {
        return it.dueDate;
      })
      .sort(function (a, b) {
        return String(a.dueDate).localeCompare(String(b.dueDate));
      })
      .slice(0, 6);
    due = _dashCard(
      'Jatuh tempo terdekat',
      'Piutang dan hutang yang belum lunas',
      dueItems.length
        ? '<div class="dash-list-body">' +
            dueItems
              .map(function (it) {
                var open =
                  it.docType === 'SI' || it.docType === 'PI'
                    ? 'data-action="invView" data-type="' + it.docType + '"'
                    : 'data-action="' + (it.docType === 'SO' ? 'viewSO' : 'viewPO') + '"';
                var days =
                  typeof Balances !== 'undefined' && Balances.daysBetween
                    ? Balances.daysBetween(todayIso, it.dueDate)
                    : null;
                var chip = it.overdue
                  ? '<span class="chip chip-danger">Lewat ' + it.daysOverdue + ' hari</span>'
                  : days !== null && days <= 7
                    ? '<span class="chip chip-warning">' +
                      (days === 0 ? 'Hari ini' : days === 1 ? 'Besok' : days + ' hari lagi') +
                      '</span>'
                    : '<span class="t-muted">' + escapeHtml(_dashDate(it.dueDate)) + '</span>';
                return (
                  '<button type="button" class="dash-list-row" ' +
                  open +
                  ' data-id="' +
                  escapeHtml(it.id) +
                  '"><span class="dash-list-main"><span class="dash-list-title"><span class="doc-no">' +
                  escapeHtml(docNum(it.number, it.id)) +
                  '</span></span><span class="dash-list-sub">' +
                  escapeHtml(it.side + ' · ' + (it.party || '—')) +
                  '</span></span><span class="dash-list-side"><span class="t-strong t-num">' +
                  escapeHtml(money(it.outstanding)) +
                  '</span>' +
                  chip +
                  '</span></button>'
                );
              })
              .join('') +
            '</div>'
        : _dashEmpty('Tidak ada piutang atau hutang yang belum lunas.'),
      'Ringkasan Keuangan'
    );
  }

  // Low stock
  var stock = '';
  if (show('stock')) {
    var low = _dashLowStock();
    stock = _dashCard(
      'Stok menipis',
      low.length ? low.length + ' barang di bawah atau sama dengan stok minimum' : 'Stok minimum per barang',
      low.length
        ? '<div class="dash-list-body">' +
            low
              .slice(0, 6)
              .map(function (x) {
                return (
                  '<button type="button" class="dash-list-row" data-action="viewItem" data-id="' +
                  escapeHtml(x.item.id) +
                  '"><span class="dash-list-main"><span class="dash-list-title">' +
                  escapeHtml(x.item.name || x.item.id) +
                  '</span><span class="dash-list-sub">Minimum ' +
                  x.min +
                  ' ' +
                  escapeHtml(x.item.unit || '') +
                  '</span></span><span class="dash-list-side">' +
                  (x.stock <= 0
                    ? '<span class="chip chip-danger">Habis</span>'
                    : '<span class="t-strong t-num">' + x.stock + ' ' + escapeHtml(x.item.unit || '') + '</span>') +
                  '</span></button>'
                );
              })
              .join('') +
            '</div>'
        : _dashEmpty('Semua barang di atas stok minimum.'),
      low.length ? 'Barang & Stok' : ''
    );
  }

  // Activity: audit log, or the latest documents while the log is still empty
  var activity = '';
  if (show('activity')) {
    var log = (DB.auditLog || []).slice(-6).reverse();
    var body;
    var title = 'Aktivitas terbaru';
    var sub = 'Perubahan data yang tercatat';
    if (log.length) {
      body =
        '<div class="dash-list-body">' +
        log
          .map(function (e) {
            var what = DASH_COLLECTIONS[e.collection] || e.collection || 'Data';
            return (
              '<div class="dash-list-row is-static"><span class="dash-list-main"><span class="dash-list-title">' +
              escapeHtml(what) +
              (e.number ? ' <span class="doc-no">' + escapeHtml(e.number) + '</span>' : '') +
              ' ' +
              escapeHtml(DASH_VERBS[e.action] || e.action || '') +
              '</span><span class="dash-list-sub">' +
              escapeHtml(_dashTime(e.ts) + (e.user ? ' · ' + e.user : '')) +
              '</span></span>' +
              (e.summary ? '<span class="dash-list-side"><span class="chip">' + escapeHtml(e.summary) + '</span></span>' : '') +
              '</div>'
            );
          })
          .join('') +
        '</div>';
    } else {
      title = 'Dokumen terbaru';
      sub = 'Berdasarkan tanggal dokumen';
      var docs = []
        .concat(
          (DB.salesOrders || []).map(function (d) {
            return { d: d, what: 'Pesanan penjualan', party: d.customer, action: 'viewSO' };
          }),
          (DB.purchaseOrders || []).map(function (d) {
            return { d: d, what: 'Pesanan pembelian', party: d.supplier, action: 'viewPO' };
          }),
          (DB.deliveryOrders || []).map(function (d) {
            return { d: d, what: 'Surat jalan', party: d.customer, action: 'viewDO' };
          })
        )
        .filter(function (x) {
          return x.d.date;
        })
        .sort(function (a, b) {
          return String(b.d.date).localeCompare(String(a.d.date));
        })
        .slice(0, 6);
      body = docs.length
        ? '<div class="dash-list-body">' +
          docs
            .map(function (x) {
              return (
                '<button type="button" class="dash-list-row" data-action="' +
                x.action +
                '" data-id="' +
                escapeHtml(x.d.id) +
                '"><span class="dash-list-main"><span class="dash-list-title">' +
                escapeHtml(x.what) +
                ' <span class="doc-no">' +
                escapeHtml(docNum(x.d.number, x.d.id)) +
                '</span></span><span class="dash-list-sub">' +
                escapeHtml(_dashDate(x.d.date) + (x.party ? ' · ' + x.party : '')) +
                '</span></span></button>'
              );
            })
            .join('') +
          '</div>'
        : _dashEmpty('Belum ada dokumen.');
    }
    activity = _dashCard(title, sub, body);
  }

  var rowA = [trend, actions].filter(Boolean);
  var rowB = [due, stock, activity].filter(Boolean);
  var dateLabel = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    '<div class="sec-hdr"><div><h1>Ringkasan</h1><p>' +
    escapeHtml(dateLabel) +
    ' · dihitung dari transaksi yang tercatat</p></div>' +
    '<div><button type="button" class="btn-ghost" data-action="dashLayout">Atur Tampilan</button></div></div>' +
    prep +
    '<div class="dash-kpis">' +
    tiles +
    '</div>' +
    (rowA.length ? '<div class="dash-row dash-row-a">' + rowA.join('') + '</div>' : '') +
    (rowB.length ? '<div class="dash-row dash-row-b">' + rowB.join('') + '</div>' : '')
  );
}

// ── Interactions ─────────────────────────────────────────────────────────────
// Tiles, list rows and links carry the sidebar entry they open.
document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-dash-open]') : null;
  if (!el) {
    return;
  }
  e.preventDefault();
  if (window.NSANav) {
    window.NSANav.open(el.getAttribute('data-dash-open'));
  }
});

(function _registerDashActions() {
  function _reg() {
    ERP.registerAction('dashLayout', function () {
      var hidden = _dashHidden();
      var body =
        '<p class="form-hint" style="margin:0 0 12px">Pilih bagian yang ditampilkan. Pilihan tersimpan di browser ini.</p>' +
        DASH_BLOCKS.map(function (b) {
          return (
            '<label class="dash-opt"><input type="checkbox" class="dash-opt-input" value="' +
            b.id +
            '"' +
            (hidden.indexOf(b.id) === -1 ? ' checked' : '') +
            '><span>' +
            escapeHtml(b.label) +
            '</span></label>'
          );
        }).join('');
      if (typeof openModal === 'function') {
        openModal(
          'Atur Tampilan Ringkasan',
          body,
          '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
            '<button class="btn" data-action="dashLayoutApply">Terapkan</button>'
        );
      }
      return true;
    });

    ERP.registerAction('dashLayoutApply', function () {
      var hidden = [];
      document.querySelectorAll('.dash-opt-input').forEach(function (b) {
        if (!b.checked) {
          hidden.push(b.value);
        }
      });
      _dashSetHidden(hidden);
      if (typeof closeModal === 'function') {
        closeModal();
      }
      _refreshDashboard();
      return true;
    });
  }

  if (typeof ERP !== 'undefined' && ERP.registerAction) {
    _reg();
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof ERP !== 'undefined' && ERP.registerAction) {
        _reg();
      }
    });
  }
})();
