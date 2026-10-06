// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Navigation  (ui/nav.js)
//
// • Sidebar: one labeled menu whose groups follow daily work
//   (docs/02-PETA-MODUL-DAN-NAVIGASI.md §4). A group opens like an accordion; the
//   sidebar can collapse to icons, where a group opens as a popover instead.
// • Page context: the active group and page in the topbar and document title.
// • window.navigate(id): renders #view-<id> (cached until invalidateView).
// • User menu, notification panel, theme toggle and connection chip.
//
// Wrapped in an IIFE so its top-level declarations stay local. As classic
// scripts share one global scope, names like `charts`, `getRenderer`, etc. are
// already declared by erp-view.js — redeclaring them at global scope is a
// SyntaxError that would silently kill this whole file.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  const _renderedViews = new Set();

  // Bridge to the renderer/chart functions defined in erp-view.js (globals).
  let destroyCharts = () => {
    if (typeof window.destroyCharts === 'function') {
      window.destroyCharts();
    }
  };
  let initCharts = () => {
    if (typeof window.initCharts === 'function') {
      window.initCharts();
    }
  };
  let getRenderer = id =>
    typeof window.getRenderer === 'function' ? window.getRenderer(id) : null;

  const escapeHtml =
    window.escapeHtml ||
    (text =>
      String(text).replace(
        /[&<>"']/g,
        m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
      ));

  const showToast = window.showToast || (msg => console.log('Toast:', msg));

  // Make these available globally for other modules to set
  window.setNavDependencies = function (deps) {
    if (deps.destroyCharts) {
      destroyCharts = deps.destroyCharts;
    }
    if (deps.initCharts) {
      initCharts = deps.initCharts;
    }
    if (deps.getRenderer) {
      getRenderer = deps.getRenderer;
    }
    if (deps.charts) {
      Object.assign(charts, deps.charts);
    }
  };

  // ── Menu structure ──────────────────────────────────────────────────────────
  // `label` doubles as the key in core/menu-router.js ROUTES; entries without a
  // route open `view` directly. `view` is the #view-* container the entry renders
  // into, which keeps the highlight on the entry that was opened. `module` (RBAC)
  // defaults to the group's module; entries that moved between groups keep the
  // visibility they had. `modal` entries open a dialog without leaving the page;
  // `home` marks the entry shown when a shared view is opened programmatically.
  const MENU_CONFIG = {
    dashboard: {
      title: 'Ringkasan',
      icon: 'grid',
      view: 'dashboard',
      module: 'dashboard',
      items: [],
    },
    entri: {
      title: 'Entri Harian',
      icon: 'edit-3',
      view: 'entriHarian',
      module: 'purchases',
      items: [],
    },
    pickups: {
      title: 'Pengambilan',
      icon: 'truck',
      module: 'purchases',
      items: [
        { label: 'PO Pengambilan', view: 'pickups', home: true },
        { label: 'Catat Pengambilan', view: 'pickups' },
        { label: 'Impor Rekap Timbangan', view: 'pickups' },
        { label: 'Perubahan Timbangan', view: 'pickups' },
        { label: 'Rekap Pengambilan', view: 'pickups' },
        { label: 'Tagih Pelanggan', view: 'pickups', module: 'sales' },
        { label: 'Tagihan Supplier', view: 'pickups' },
      ],
    },
    sales: {
      title: 'Penjualan',
      icon: 'trending-up',
      module: 'sales',
      items: [
        { label: 'Penawaran Penjualan', view: 'quotations' },
        { label: 'Pesanan Penjualan', view: 'sales' },
        { label: 'Surat Jalan', view: 'logistics' },
        { label: 'Faktur Penjualan', view: 'invoices' },
        { label: 'Penerimaan Pembayaran', view: 'invoices' },
        { label: 'Uang Muka Penjualan', view: 'sales' },
        { label: 'Retur Penjualan', view: 'returns' },
        { label: 'Target Penjualan', view: 'sales' },
        { label: 'Pelanggan', view: 'master' },
      ],
    },
    purchases: {
      title: 'Pembelian',
      icon: 'shopping-cart',
      module: 'purchases',
      items: [
        { label: 'Penawaran Pembelian', view: 'quotations' },
        { label: 'Pesanan Pembelian', view: 'purchase' },
        { label: 'Penerimaan Barang', view: 'purchase' },
        { label: 'Rekonsiliasi Timbangan', view: 'purchase' },
        { label: 'Validasi SJ Supplier', view: 'purchase' },
        { label: 'Faktur Pembelian', view: 'invoices' },
        { label: 'Pembayaran ke Supplier', view: 'invoices' },
        { label: 'Uang Muka Pembelian', view: 'purchase' },
        { label: 'Retur Pembelian', view: 'returns' },
        { label: 'Harga Supplier', view: 'purchase' },
        { label: 'Supplier', view: 'master' },
      ],
    },
    inventory: {
      title: 'Persediaan',
      icon: 'package',
      module: 'inventory',
      items: [
        { label: 'Barang & Stok', view: 'inventory' },
        { label: 'Gudang', view: 'warehouse' },
        { label: 'Transfer Antar Gudang', view: 'warehouse' },
        { label: 'Penyesuaian Stok', view: 'adjustments' },
        { label: 'Permintaan Barang', view: 'inventory' },
        { label: 'Job Costing', view: 'inventory' },
      ],
    },
    cashbank: {
      title: 'Kas & Bank',
      icon: 'credit-card',
      module: 'gl',
      items: [
        { label: 'Pengeluaran Lain', view: 'finance' },
        { label: 'Penerimaan Lain', view: 'finance' },
        { label: 'Transfer Antar Rekening', view: 'finance' },
        { label: 'Rekening Koran', view: 'finance' },
        { label: 'Riwayat Kas & Bank', view: 'finance' },
        { label: 'Rekonsiliasi Bank', view: 'finance' },
      ],
    },
    accounting: {
      title: 'Akuntansi',
      icon: 'book',
      module: 'gl',
      items: [
        { label: 'Ringkasan Keuangan', view: 'finance', home: true },
        { heading: 'Buku Besar' },
        { label: 'Neraca Saldo', view: 'ledger' },
        { label: 'Jurnal', view: 'ledger' },
        { label: 'Jurnal Umum', view: 'ledger' },
        { label: 'Bagan Akun', view: 'ledger' },
        { label: 'Riwayat Akun', view: 'finance' },
        { label: 'Audit Jurnal', view: 'finance' },
        { heading: 'Biaya & Anggaran' },
        { label: 'Biaya Akrual', view: 'finance' },
        { label: 'Penggajian', view: 'finance' },
        { label: 'Anggaran', view: 'finance' },
        { label: 'Realisasi Anggaran', view: 'finance' },
        { label: 'Transfer Anggaran', view: 'finance' },
        { heading: 'Pajak' },
        { label: 'Pajak & PPN', view: 'tax', module: 'tax' },
        { label: 'Ekspor Coretax', view: 'tax', module: 'tax' },
      ],
    },
    assets: {
      title: 'Aset Tetap',
      icon: 'briefcase',
      module: 'assets',
      items: [
        { label: 'Daftar Aset', view: 'assets' },
        { label: 'Kategori Aset', view: 'assets' },
        { label: 'Golongan Aset Fiskal', view: 'assets' },
        { label: 'Riwayat Perubahan Aset', view: 'assets' },
        { label: 'Mutasi Aset', view: 'assets' },
        { label: 'Pelepasan Aset', view: 'assets' },
        { label: 'Aset per Lokasi', view: 'assets' },
      ],
    },
    reports: {
      title: 'Laporan',
      icon: 'bar-chart-2',
      module: 'reports',
      items: [
        { label: 'Daftar Laporan', view: 'reports' },
        { label: 'Laporan per Periode', view: 'reports' },
        { label: 'Laba Rugi', view: 'financials' },
        { label: 'Neraca', view: 'financials' },
        { label: 'Arus Kas', view: 'financials' },
        { label: 'Rekap PPN', view: 'reports' },
      ],
    },
    master: {
      title: 'Data Master',
      icon: 'database',
      module: 'master',
      items: [
        { label: 'Karyawan', view: 'master', module: 'admin' },
        { label: 'Kontak', view: 'master', module: 'admin' },
        { label: 'Kategori Pelanggan', view: 'master', module: 'sales' },
        { label: 'Kategori Supplier', view: 'master', module: 'purchases' },
        { label: 'Kategori Penjualan', view: 'settings', module: 'sales' },
        { label: 'Satuan Barang', view: 'inventory', module: 'inventory' },
        { label: 'Kategori Barang', view: 'inventory', module: 'inventory' },
        { label: 'Merek Barang', view: 'inventory', module: 'inventory' },
      ],
    },
    settings: {
      title: 'Pengaturan',
      icon: 'settings',
      module: 'admin',
      items: [
        { label: 'Pengaturan Umum', view: 'settings' },
        { label: 'Profil Perusahaan', view: 'settings', modal: true },
        { label: 'Termin Pembayaran', view: 'settings' },
        { label: 'Metode Pengiriman', view: 'settings' },
        { label: 'Kalender', view: 'settings' },
        { label: 'Transaksi Favorit', view: 'settings' },
        { label: 'Log Aktivitas', view: 'settings' },
        { label: 'Recycle Bin', view: 'settings' },
        { label: 'Import dari Excel', view: 'excelImport', module: ['admin', 'inventory'] },
      ],
    },
  };

  // Feather-style icon paths (24×24 viewBox, stroke = currentColor).
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    'shopping-cart':
      '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    package:
      '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    briefcase:
      '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    'bar-chart-2':
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    database:
      '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
    'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    install:
      '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><polyline points="9 9 12 12 15 9"/><line x1="12" y1="12" x2="12" y2="5"/>',
    globe:
      '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    'log-out':
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'alert-triangle':
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'alert-circle':
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    dollar:
      '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    refresh:
      '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    truck:
      '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    'edit-3': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  };

  function _svg(name, size, cls) {
    return (
      `<svg${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `${ICONS[name] || ICONS.info}</svg>`
    );
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const NAV_COLLAPSED_KEY = 'nsa_nav_collapsed';
  const COMPACT_WIDTH = 1100; // up to this width the sidebar starts as icons
  const DRAWER_WIDTH = 768; // up to this width it is a drawer (mobile.css, mobile-ui.js)
  const PENDING_TTL = 4000; // ms an opened entry waits for its navigate()

  let _activeEntry = null; // { group, label } of the page on screen
  let _pendingEntry = null; // entry just opened, until its view renders
  let _popoverGroup = null;

  function _modulesOf(item, group) {
    const m = item.module || group.module;
    return Array.isArray(m) ? m.join(' ') : m || '';
  }

  function _renderSidebar() {
    const nav = document.getElementById('nav');
    if (!nav) {
      return false;
    }
    nav.innerHTML = Object.keys(MENU_CONFIG)
      .map(key => {
        const g = MENU_CONFIG[key];
        const title = escapeHtml(g.title);
        if (!g.items.length) {
          return (
            `<div class="nav-section" data-group="${key}">` +
            `<button type="button" class="rail-item nav-group-head" data-menu="${key}" data-view="${g.view}" title="${title}">` +
            `${_svg(g.icon, 17, 'nav-icon')}<span class="nav-label">${title}</span></button></div>`
          );
        }
        const items = g.items
          .map(it =>
            it.heading
              ? `<div class="nav-subhead">${escapeHtml(it.heading)}</div>`
              : `<button type="button" class="nav-item" data-group="${key}" data-view="${it.view}" ` +
                `data-label="${escapeHtml(it.label)}" data-module="${_modulesOf(it, g)}">${escapeHtml(it.label)}</button>`
          )
          .join('');
        return (
          `<div class="nav-section" data-group="${key}">` +
          `<button type="button" class="rail-item nav-group-head" data-menu="${key}" aria-expanded="false" ` +
          `aria-controls="nav-items-${key}" title="${title}">${_svg(g.icon, 17, 'nav-icon')}` +
          `<span class="nav-label">${title}</span>${_svg('chevron-down', 14, 'nav-chevron')}</button>` +
          `<div class="nav-group-items" id="nav-items-${key}" role="group" aria-label="${title}">${items}</div></div>`
        );
      })
      .join('');
    if (window.RBAC && typeof window.RBAC.applyNavGating === 'function') {
      window.RBAC.applyNavGating();
    }
    return true;
  }

  // Accordion: opening a group closes the others.
  function _setGroupOpen(key, open) {
    document.querySelectorAll('#nav .nav-section').forEach(sec => {
      if (!sec.querySelector('.nav-group-items')) {
        return;
      }
      const next = sec.dataset.group === key ? open : false;
      sec.classList.toggle('open', next);
      const head = sec.querySelector('.nav-group-head');
      if (head) {
        head.setAttribute('aria-expanded', String(next));
      }
    });
  }

  function _isDrawer() {
    return window.innerWidth <= DRAWER_WIDTH;
  }

  function _isCollapsed() {
    return document.body.classList.contains('nav-collapsed');
  }

  function _applyCollapsed() {
    let pref = null;
    try {
      const v = localStorage.getItem(NAV_COLLAPSED_KEY);
      pref = v === null ? null : v === '1';
    } catch (_) {
      /* storage unavailable */
    }
    const collapsed = (pref === null ? window.innerWidth <= COMPACT_WIDTH : pref) && !_isDrawer();
    document.body.classList.toggle('nav-collapsed', collapsed);
    const btn = document.getElementById('sidebar-collapse');
    if (btn) {
      const label = collapsed ? 'Lebarkan menu' : 'Ciutkan menu';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.setAttribute('aria-expanded', String(!collapsed));
    }
  }

  function toggleCollapsed() {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, _isCollapsed() ? '0' : '1');
    } catch (_) {
      /* storage unavailable */
    }
    _closePopover();
    _applyCollapsed();
  }

  function _openPopover(key, head, focusFirst) {
    const list = head.closest('.nav-section')?.querySelector('.nav-group-items');
    if (!list) {
      return;
    }
    let el = document.getElementById('nav-popover');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nav-popover';
      el.className = 'nav-popover';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="nav-popover-title">${escapeHtml(MENU_CONFIG[key].title)}</div>${list.innerHTML}`;
    el.hidden = false;
    const sidebar = document.getElementById('sidebar');
    const r = head.getBoundingClientRect();
    const left = (sidebar ? sidebar.getBoundingClientRect().right : r.right) + 8;
    const top = Math.max(8, Math.min(r.top, window.innerHeight - el.offsetHeight - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    _popoverGroup = key;
    if (focusFirst) {
      const first = Array.from(el.querySelectorAll('.nav-item')).find(b => b.style.display !== 'none');
      if (first) {
        first.focus();
      }
    }
  }

  function _closePopover() {
    const el = document.getElementById('nav-popover');
    if (el) {
      el.hidden = true;
    }
    _popoverGroup = null;
  }

  function _itemView(entry) {
    const g = entry && MENU_CONFIG[entry.group];
    if (!g) {
      return null;
    }
    if (!entry.label) {
      return g.view;
    }
    const it = g.items.find(i => i.label === entry.label);
    return it ? it.view : null;
  }

  // Which entry represents `viewId`: the one just opened, else the current one
  // while it still shows this view, else the view's home entry.
  function _resolveEntry(viewId) {
    const pending = _pendingEntry;
    _pendingEntry = null;
    if (pending && (_itemView(pending) === viewId || Date.now() - pending.ts < PENDING_TTL)) {
      return { group: pending.group, label: pending.label };
    }
    if (_activeEntry && _itemView(_activeEntry) === viewId) {
      return _activeEntry;
    }
    let first = null;
    for (const key of Object.keys(MENU_CONFIG)) {
      const g = MENU_CONFIG[key];
      if (g.view === viewId) {
        return { group: key, label: null };
      }
      for (const it of g.items) {
        if (it.view !== viewId || it.modal) {
          continue;
        }
        if (it.home) {
          return { group: key, label: it.label };
        }
        if (!first) {
          first = { group: key, label: it.label };
        }
      }
    }
    return first;
  }

  function _markActive(entry) {
    const prevGroup = _activeEntry && _activeEntry.group;
    _activeEntry = entry;
    document.querySelectorAll('#nav .nav-item, #nav-popover .nav-item').forEach(b => {
      const on = !!entry && b.dataset.group === entry.group && b.dataset.label === entry.label;
      b.classList.toggle('active', on);
      if (on) {
        b.setAttribute('aria-current', 'page');
      } else {
        b.removeAttribute('aria-current');
      }
    });
    document.querySelectorAll('#nav .nav-group-head').forEach(h => {
      const inGroup = !!entry && h.dataset.menu === entry.group;
      const direct = !h.hasAttribute('aria-expanded');
      h.classList.toggle('active', inGroup && direct);
      h.classList.toggle('has-active', inGroup && !direct);
      if (inGroup && direct) {
        h.setAttribute('aria-current', 'page');
      } else {
        h.removeAttribute('aria-current');
      }
    });
    if (entry && entry.group !== prevGroup && MENU_CONFIG[entry.group].items.length) {
      _setGroupOpen(entry.group, true);
      const btn = document.querySelector('#nav .nav-item.active');
      if (btn && typeof btn.scrollIntoView === 'function') {
        btn.scrollIntoView({ block: 'nearest' });
      }
    }
    _renderPageContext(entry);
  }

  function _renderPageContext(entry) {
    const g = entry && MENU_CONFIG[entry.group];
    const group = g ? g.title : '';
    const page = entry && entry.label ? entry.label : '';
    const el = document.getElementById('page-context');
    if (el) {
      el.innerHTML = page
        ? `<span class="ctx-group">${escapeHtml(group)}</span>${_svg('chevron-right', 12, 'ctx-sep')}` +
          `<span class="ctx-page">${escapeHtml(page)}</span>`
        : `<span class="ctx-page">${escapeHtml(group)}</span>`;
    }
    document.title = `${page || group ? `${page || group} · ` : ''}Nusantara ERP`;
  }

  // Open a menu entry exactly as a click would (also used by notification and
  // dashboard links through window.NSANav.open).
  function _openEntry(group, label) {
    const g = MENU_CONFIG[group];
    const item = g && g.items.find(i => i.label === label);
    if (!item) {
      return false;
    }
    if (!item.modal) {
      _pendingEntry = { group, label, ts: Date.now() };
    }
    const handled =
      window.NSAMenu &&
      typeof window.NSAMenu.handle === 'function' &&
      window.NSAMenu.handle(item.view, label);
    if (!handled && !item.modal) {
      // The entry shows its view's own page: drop the cached copy, which may
      // still hold a page another entry drew into the same view (e.g. Ekspor
      // Coretax inside Pajak & PPN).
      if (typeof window.invalidateView === 'function') {
        window.invalidateView(item.view);
      }
      window.navigate(item.view);
    }
    return true;
  }

  function _onNavClick(e) {
    if (e.target.closest('#sidebar-collapse')) {
      e.preventDefault();
      toggleCollapsed();
      return;
    }

    const item = e.target.closest('#nav .nav-item, #nav-popover .nav-item');
    if (item) {
      e.preventDefault();
      _closePopover();
      _openEntry(item.dataset.group, item.dataset.label);
      return;
    }

    const head = e.target.closest('#nav .nav-group-head');
    if (head) {
      e.preventDefault();
      const key = head.dataset.menu;
      const g = MENU_CONFIG[key];
      if (!g) {
        return;
      }
      if (!g.items.length) {
        _closePopover();
        _pendingEntry = { group: key, label: null, ts: Date.now() };
        window.navigate(g.view);
      } else if (_isCollapsed()) {
        if (_popoverGroup === key) {
          _closePopover();
        } else {
          // detail 0 = activated from the keyboard → move focus into the popover
          _openPopover(key, head, e.detail === 0);
        }
      } else {
        _setGroupOpen(key, !head.closest('.nav-section').classList.contains('open'));
      }
      return;
    }

    if (_popoverGroup && !e.target.closest('#nav-popover')) {
      _closePopover();
    }
  }

  function initSidebarNav() {
    _renderSidebar();
    _applyCollapsed();

    document.addEventListener('click', _onNavClick);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _popoverGroup) {
        const head = document.querySelector(`#nav .nav-group-head[data-menu="${_popoverGroup}"]`);
        _closePopover();
        if (head) {
          head.focus();
        }
      }
    });
    window.addEventListener('resize', () => {
      _closePopover();
      _applyCollapsed();
    });
    document.getElementById('nav')?.addEventListener('scroll', _closePopover, { passive: true });

    // User menu button — dropdown with profile / password / backup / logout
    const userMenuBtn = document.getElementById('user-menu-btn');
    if (userMenuBtn) {
      userMenuBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        _toggleUserMenu();
      });
    }

    const notifBtn = document.getElementById('notif-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _toggleNotifPanel();
      });
    }

    // Hamburger + sidebar backdrop are wired by public/mobile-ui.js (which also
    // handles Escape, swipe-to-close and resize). A second toggle handler here
    // would cancel it out on tap.

    _markActive(_resolveEntry(window.activeView || 'dashboard'));

    initTheme();
    initSearchToggle();
    initDbStatusIndicator();
  }

  // ── Connection status chip ──────────────────────────────────────────────────
  function initDbStatusIndicator() {
    const chip = document.getElementById('db-status-chip');
    const dot = document.getElementById('db-status-dot');
    const label = document.getElementById('db-status-label');
    if (!chip || !dot || !label) {
      return;
    }

    function _fmt(ts) {
      if (!ts) {
        return '';
      }
      return new Date(ts).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    function _update() {
      const mode = window.__nsaDataMode;
      if (mode === 'firestore') {
        dot.className = 'db-status-dot online';
        label.className = 'db-status-label online';
        label.textContent = 'Cloud';
        const sync = window.__nsaLastSync ? ' · sinkron ' + _fmt(window.__nsaLastSync) : '';
        chip.title = 'Data tersimpan di cloud (Firebase)' + sync;
      } else if (mode === 'local') {
        dot.className = 'db-status-dot offline';
        label.className = 'db-status-label offline';
        label.textContent = 'Lokal';
        chip.title = 'Mode lokal — data disimpan di perangkat ini';
      } else {
        dot.className = 'db-status-dot';
        label.className = 'db-status-label';
        label.textContent = '…';
        chip.title = 'Memuat…';
      }
    }

    _update();
    // Poll so the chip reflects changes (e.g. after migration or reconnect)
    setInterval(_update, 3000);
  }

  // ── Search focus shortcut ───────────────────────────────────────────────────
  function initSearchToggle() {
    const input = document.getElementById('search-input');
    if (!input) {
      return;
    }
    // "/" focuses the search field from anywhere
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          input.focus();
          input.select();
        }
      }
    });
  }

  // ── User menu ───────────────────────────────────────────────────────────────
  let _userMenuOpen = false;

  function _toggleUserMenu() {
    if (_userMenuOpen) {
      _closeUserMenu();
      return;
    }

    let panel = document.getElementById('user-menu-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'user-menu-panel';
      // On <body>, not inside the topbar, so position:fixed anchors to the
      // viewport (the mobile bottom-sheet rules in mobile.css rely on it).
      panel.className = 'notif-panel user-menu-panel';
      document.body.appendChild(panel);
    }

    const u = (typeof DB !== 'undefined' && DB.settings && DB.settings.user) || {};
    const me = window.__ERP_USER || {};
    const roleLabels = (window.erpUsers && window.erpUsers.roleLabels) || {};
    const displayName = u.name || me.displayName || 'Pengguna';
    const role = roleLabels[me.role] || me.role || u.role || 'Pengguna';
    const canManageUsers =
      window.RBAC && typeof window.RBAC.canManageUsers === 'function' && window.RBAC.canManageUsers();
    const langEn = window.I18N && window.I18N.getLang && window.I18N.getLang() === 'en';

    const item = (action, icon, label, meta) =>
      `<button type="button" class="user-menu-item${action === 'logout' ? ' danger' : ''}" data-user-action="${action}">` +
      `${_svg(icon, 15)}<span>${label}</span>${meta ? `<span class="user-menu-meta">${meta}</span>` : ''}</button>`;

    panel.innerHTML =
      `<div class="notif-panel-hdr user-menu-hdr"><div class="user-menu-name">${escapeHtml(displayName)}</div>` +
      `<div class="user-menu-role">${escapeHtml(role)}</div></div>` +
      '<div class="user-menu-list">' +
      item('editIdentity', 'user', 'Profil & Perusahaan') +
      (canManageUsers ? item('manageUsers', 'users', 'Manajemen Pengguna') : '') +
      item('changePassword', 'lock', 'Ganti Password') +
      item('manage2FA', 'shield', 'Verifikasi 2 Langkah') +
      item('manageBackup', 'download', 'Kelola Backup') +
      // Here (not only in Pengaturan) so every role can install the PWA.
      item('installPwaApp', 'install', 'Instal Aplikasi') +
      item('toggleLang', 'globe', 'Bahasa', langEn ? 'EN' : 'ID') +
      _textSizeControl() +
      '<div class="user-menu-sep"></div>' +
      item('logout', 'log-out', 'Keluar') +
      '</div>';

    panel.style.display = 'block';
    _userMenuOpen = true;
    setTimeout(function () {
      document.addEventListener('click', _closeUserMenuOnOutside);
    }, 0);
  }

  // ── Text size ("Ukuran teks") ──────────────────────────────────────────────
  // The root font size scales every screen font (style.css uses rem); the choice
  // is per device, like the theme. public/theme-init.js applies it before paint
  // and reads the same storage key; without a saved choice the size is Normal.
  const TEXT_SIZES = [
    ['normal', 'Normal'],
    ['besar', 'Besar'],
    ['sangat-besar', 'Sangat besar'],
  ];
  const TEXT_SIZE_KEY = 'erp_text_size_v2';

  function _currentTextSize() {
    return document.documentElement.getAttribute('data-text-size') || 'normal';
  }

  function _textSizeControl() {
    const cur = _currentTextSize();
    return (
      '<div class="user-menu-textsize"><span class="user-menu-textsize-label">Ukuran teks</span>' +
      '<div class="seg-tabs seg-tabs-sm" role="group" aria-label="Ukuran teks">' +
      TEXT_SIZES.map(
        ([value, label]) =>
          `<button type="button" class="seg-tab${value === cur ? ' active' : ''}" data-text-size-option="${value}" aria-pressed="${value === cur}">${label}</button>`
      ).join('') +
      '</div></div>'
    );
  }

  function setTextSize(value) {
    if (!TEXT_SIZES.some(([v]) => v === value)) {
      return;
    }
    document.documentElement.setAttribute('data-text-size', value);
    try {
      localStorage.setItem(TEXT_SIZE_KEY, value);
    } catch (_e) {
      /* storage unavailable — the choice lasts for this visit */
    }
    document.querySelectorAll('[data-text-size-option]').forEach(btn => {
      const on = btn.getAttribute('data-text-size-option') === value;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    window.dispatchEvent(new CustomEvent('nsa:textsizechange', { detail: { size: value } }));
  }

  document.addEventListener('click', function (e) {
    const opt = e.target.closest && e.target.closest('[data-text-size-option]');
    if (opt) {
      setTextSize(opt.getAttribute('data-text-size-option'));
    }
  });

  function _closeUserMenu() {
    const panel = document.getElementById('user-menu-panel');
    if (panel) {
      panel.style.display = 'none';
    }
    _userMenuOpen = false;
    document.removeEventListener('click', _closeUserMenuOnOutside);
  }

  function _closeUserMenuOnOutside(e) {
    const path = e.composedPath ? e.composedPath() : [];
    const panel = document.getElementById('user-menu-panel');
    const btn = document.getElementById('user-menu-btn');
    if (!path.includes(panel) && !path.includes(btn)) {
      _closeUserMenu();
    }
  }

  document.addEventListener('click', function (e) {
    const item = e.target.closest('[data-user-action]');
    if (!item) {
      return;
    }
    e.preventDefault();
    _closeUserMenu();
    const action = item.dataset.userAction;
    const actions = window.ERP && ERP.registry && ERP.registry.actions;
    const run = name => {
      if (actions && actions.has(name)) {
        actions.get(name)();
        return true;
      }
      return false;
    };
    if (action === 'toggleLang') {
      if (window.I18N && window.I18N.toggleLang) {
        window.I18N.toggleLang();
      }
    } else if (action === 'manageUsers') {
      if (typeof window.showUserManagement === 'function') {
        window.showUserManagement();
      }
    } else if (action === 'logout') {
      if (window.erpAuth && window.erpAuth.logout) {
        window.erpAuth.logout();
      }
    } else {
      run(action);
    }
  });

  // ── Notification panel ──────────────────────────────────────────────────────
  let _notifPanelOpen = false;
  const NOTIF_TYPES = ['warning', 'danger', 'info', 'success'];
  // alert.icon (src/core/notifications.js) → icon; falls back to the alert type.
  const NOTIF_ICON = {
    receivable: 'clock',
    payable: 'credit-card',
    stock: 'package',
    budget: 'dollar',
    warning: 'alert-triangle',
    danger: 'alert-circle',
    info: 'info',
    success: 'info',
  };

  function _renderNotifPanel(panel) {
    const notif = window.NSANotif;
    const alerts = notif ? notif.getAlerts() : [];
    if (notif) {
      notif.markAllRead();
    }

    const rows = alerts.length
      ? alerts
          .map(a => {
            const type = NOTIF_TYPES.indexOf(a.type) === -1 ? 'info' : a.type;
            return (
              `<button type="button" class="notif-item" data-type="${type}" data-notif-link="${escapeHtml(a.link || '')}">` +
              `<span class="notif-ico">${_svg(NOTIF_ICON[a.icon] || NOTIF_ICON[type], 16)}</span>` +
              `<span class="notif-body"><span class="notif-title">${escapeHtml(a.title)}` +
              `${a.count ? `<span class="notif-count">${a.count}</span>` : ''}</span>` +
              `<span class="notif-text">${escapeHtml(a.body)}</span></span>` +
              `${_svg('chevron-right', 14, 'notif-chevron')}</button>`
            );
          })
          .join('')
      : `<div class="notif-empty">${_svg('bell', 20)}` +
        '<div class="notif-empty-title">Tidak ada yang perlu ditindaklanjuti</div>' +
        '<div class="notif-empty-text">Piutang dan hutang jatuh tempo, stok menipis, dan anggaran terlampaui akan muncul di sini.</div></div>';

    const perm =
      'Notification' in window && Notification.permission === 'default'
        ? `<div class="notif-perm">${_svg('bell', 14)}<div>` +
          '<div class="notif-perm-title">Aktifkan notifikasi perangkat</div>' +
          '<div class="notif-perm-text">Terima peringatan meskipun tab aplikasi tidak aktif.</div>' +
          '<button type="button" id="notif-allow-btn" class="btn btn-sm">Izinkan</button></div></div>'
        : '';

    panel.innerHTML =
      '<div class="notif-panel-hdr">' +
      `<span class="notif-hdr-title">Notifikasi${alerts.length ? `<span class="notif-hdr-badge">${alerts.length}</span>` : ''}</span>` +
      `<button type="button" id="notif-check-btn" class="notif-refresh" title="Periksa ulang">${_svg('refresh', 12)}Perbarui</button>` +
      `</div><div class="notif-list">${rows}</div>${perm}`;

    panel.querySelector('#notif-allow-btn')?.addEventListener('click', function () {
      if (!window.NSANotif) {
        return;
      }
      window.NSANotif.requestPermission().then(function (result) {
        if (result === 'granted') {
          showToast('Notifikasi perangkat diaktifkan', 'success');
          _renderNotifPanel(panel);
        }
      });
    });
    panel.querySelector('#notif-check-btn')?.addEventListener('click', function () {
      if (window.NSANotif) {
        window.NSANotif.checkAlerts();
      }
      _renderNotifPanel(panel);
    });
    panel.querySelectorAll('[data-notif-link]').forEach(function (el) {
      el.addEventListener('click', function () {
        const link = el.dataset.notifLink;
        _closeNotifPanel();
        if (!link) {
          return;
        }
        if (link.indexOf('menu:') === 0) {
          window.NSANav.open(link.slice(5));
        } else if (window.navigate) {
          window.navigate(link);
        }
      });
    });
  }

  function _toggleNotifPanel() {
    if (_notifPanelOpen) {
      _closeNotifPanel();
      return;
    }
    let panel = document.getElementById('notif-alerts-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'notif-alerts-panel';
      // Sizing lives in CSS (dropdown on desktop, bottom sheet in mobile.css).
      panel.className = 'notif-panel';
      document.body.appendChild(panel);
    }
    _renderNotifPanel(panel);
    panel.style.display = 'block';
    _notifPanelOpen = true;
    setTimeout(function () {
      document.addEventListener('click', _closeNotifPanelOnOutside);
    }, 0);
  }

  function _closeNotifPanel() {
    const panel = document.getElementById('notif-alerts-panel');
    if (panel) {
      panel.style.display = 'none';
    }
    _notifPanelOpen = false;
    document.removeEventListener('click', _closeNotifPanelOnOutside);
  }

  // composedPath() is captured at dispatch, so a click on a control that
  // re-renders the panel (e.g. "Perbarui") still counts as inside.
  function _closeNotifPanelOnOutside(e) {
    const path = e.composedPath ? e.composedPath() : [];
    const panel = document.getElementById('notif-alerts-panel');
    const btn = document.getElementById('notif-btn');
    if (!path.includes(panel) && !path.includes(btn)) {
      _closeNotifPanel();
    }
  }

  // ── Theme (light / dark) ────────────────────────────────────────────────────
  // public/theme-init.js applies the saved theme (or the system theme) before
  // first paint; the toggle stores an explicit choice.
  const THEME_KEY = 'erp_theme';

  function _savedTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (_) {
      return null;
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    window.dispatchEvent(new CustomEvent('nsa:themechange', { detail: { theme } }));
  }

  function initTheme() {
    const saved = _savedTheme();
    if (saved) {
      applyTheme(saved);
    }
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const follow = () => {
        if (!_savedTheme()) {
          applyTheme(mq.matches ? 'dark' : 'light');
        }
      };
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', follow);
      }
    }

    const toggle = document.getElementById('theme-toggle');
    if (!toggle) {
      return;
    }
    toggle.addEventListener('click', function () {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (_) {
        /* ignore */
      }
    });
  }

  // Charts read theme colors when they are created — rebuild them on a switch.
  window.addEventListener('nsa:themechange', function () {
    if (window.activeView === 'dashboard' && _renderedViews.has('dashboard')) {
      destroyCharts();
      requestAnimationFrame(() => requestAnimationFrame(initCharts));
    }
  });

  // ── Views ───────────────────────────────────────────────────────────────────
  function navigate(id) {
    const sameView = id === window.activeView;
    window.activeView = id;

    // Drop any filter sheet parked on <body> for the mobile bottom-sheet, so it
    // doesn't survive the re-render and collide on id with the fresh in-card drop.
    if (typeof _cleanupParkedFilters === 'function') {
      _cleanupParkedFilters();
    }

    _closePopover();
    _markActive(_resolveEntry(id));

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${id}`);
    if (!el) {
      return;
    }

    if (_renderedViews.has(id) && !sameView) {
      if (id === 'dashboard') {
        destroyCharts();
        requestAnimationFrame(() => requestAnimationFrame(initCharts));
      }
    } else {
      destroyCharts();
      try {
        const renderer = getRenderer(id);
        el.innerHTML = renderer ? renderer() : _placeholderHTML();
        _renderedViews.add(id);
      } catch (err) {
        el.innerHTML = _renderErrorFallback(id, err);
        console.error(`[ERP] Renderer "${id}" threw:`, err);
        showToast('Halaman gagal dimuat', 'danger');
        _renderedViews.delete(id);
      }
      if (id === 'dashboard') {
        requestAnimationFrame(() => requestAnimationFrame(initCharts));
      }
    }

    el.classList.add('active');
  }

  function _placeholderHTML() {
    return (
      '<div class="state-block"><div class="state-title">Halaman tidak tersedia</div>' +
      '<div class="state-text">Pilih menu di sidebar untuk melanjutkan.</div></div>'
    );
  }

  function _renderErrorFallback(viewId, err) {
    const msg = err && err.message ? escapeHtml(err.message) : 'Kesalahan tidak diketahui';
    return (
      '<div class="state-block state-error" role="alert">' +
      `<div class="state-ico">${_svg('alert-circle', 22)}</div>` +
      '<div class="state-title">Halaman gagal dimuat</div>' +
      '<div class="state-text">Terjadi kesalahan saat menampilkan halaman ini; data tidak berubah. ' +
      'Coba lagi, dan bila masih terjadi sampaikan detail teknis di bawah ke admin.</div>' +
      `<details class="state-detail"><summary>Detail teknis</summary><code>${msg}</code></details>` +
      `<button type="button" class="btn-ghost" data-action="retryView" data-id="${escapeHtml(viewId)}">Coba Lagi</button>` +
      '</div>'
    );
  }

  window.navigate = navigate;
  window.__NSA_MENU_CONFIG = MENU_CONFIG;
  window.activeView = 'dashboard';

  // Force a full re-render of a view on its next navigate (clears the cache).
  window.invalidateView = function (id) {
    _renderedViews.delete(id || window.activeView);
  };

  window.NSANav = {
    setTextSize,
    // Open an entry by its menu label, as a sidebar click would.
    open(label) {
      const group = Object.keys(MENU_CONFIG).find(k =>
        MENU_CONFIG[k].items.some(i => i.label === label)
      );
      return group ? _openEntry(group, label) : false;
    },
    // Highlight an entry of the current view without navigating (in-page tabs).
    markActive(label) {
      const group = Object.keys(MENU_CONFIG).find(k =>
        MENU_CONFIG[k].items.some(i => i.label === label && i.view === window.activeView)
      );
      if (group) {
        _markActive({ group, label });
      }
    },
    toggleCollapsed,
  };

  if (typeof window.ERP !== 'undefined' && window.ERP.registerAction) {
    window.ERP.registerAction('retryView', function retryView(id) {
      _renderedViews.delete(id || window.activeView);
      window.navigate(id || window.activeView);
      return true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarNav);
  } else {
    initSidebarNav();
  }
})();
