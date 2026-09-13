// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Document Tabs  (doc-tabs.js)
//
// Inside a transaction module, each opened document becomes a tab beside the
// module's list, so a few documents can stay open while returning to the list:
//
//   Pesanan Penjualan                                  [ + Buat SO Baru ]
//   [ Daftar ] [ SO.2026.06.00066 × ] [ SO.2026.06.00071 × ]
//
// • The module header (title + create button) stays above the tabs.
// • "Daftar" = the module's own list — the DOM the renderer produced.
// • One tab per opened document (at most MAX_DOC_TABS; the oldest closes first).
// • The strip is hidden while no document is open.
//
// How the doc capture works: every module's "view a document" entry point is a
// global function (viewPO/viewSO/viewDO/viewItem/viewAsset/viewCustomer/
// viewSupplier/viewInvoiceDoc). We wrap each one so that, for the duration of the
// call, window.openModal renders its (title, body, footer) into an inline panel
// + sub-tab instead of the shared overlay. Nested dialogs opened later (Edit,
// Hapus, …) fall outside the capture window, so they still use the real modal.
//
// The list DOM is regenerated wholesale by nav.js's renderer on every
// pagination/sort/filter (invalidateView → navigate). A MutationObserver
// re-wraps the fresh list back into the "Daftar" panel and restores open doc
// tabs from in-memory state, so the sub-tab strip survives those re-renders.
//
// Load order (vite.config.js classicOrder): after ui/nav.js and before
// core/rbac.js (rbac's navigate wrap stays outermost). Styles live in style.css.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // module view-id → config. `viewFns` are the global doc-open functions to wrap.
  var MODULES = {
    purchase: { viewFns: ['viewPO'], listLabel: 'Daftar' },
    sales: { viewFns: ['viewSO'], listLabel: 'Daftar' },
    logistics: { viewFns: ['viewDO'], listLabel: 'Daftar' },
    inventory: { viewFns: ['viewItem'], listLabel: 'Daftar' },
    assets: { viewFns: ['viewAsset'], listLabel: 'Daftar' },
    master: { viewFns: ['viewCustomer', 'viewSupplier'], listLabel: 'Daftar' },
    invoices: { viewFns: ['viewInvoiceDoc'], listLabel: 'Daftar' },
  };

  var LIST = '__list__';
  var MAX_DOC_TABS = 5;

  // viewFn name → module view-id (built from MODULES above).
  var FN_TO_MODULE = {};
  Object.keys(MODULES).forEach(function (mod) {
    MODULES[mod].viewFns.forEach(function (fn) {
      FN_TO_MODULE[fn] = mod;
    });
  });

  // Per-module tab state: mod → { tabs: [{id,title,body,footer}], active: id }.
  var state = {};
  function st(mod) {
    if (!state[mod]) {
      state[mod] = { tabs: [], active: LIST };
    }
    return state[mod];
  }

  // Set while a wrapped view fn runs, so the openModal wrap knows to capture.
  var captureModule = null;
  // Guards our own DOM writes from re-triggering the MutationObserver.
  var busy = false;

  var esc =
    window.escapeHtml ||
    function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    };

  // "Detail PO — PO.2026.06.00066" → "PO.2026.06.00066" for the tab label.
  function shortLabel(title) {
    var t = String(title || '');
    var i = t.lastIndexOf('—');
    if (i === -1) {
      i = t.lastIndexOf(' - ');
      if (i !== -1) {
        return t.slice(i + 3).trim();
      }
    }
    return i === -1 ? t : t.slice(i + 1).trim();
  }

  // Stable tab id from the modal title (re-opening a doc reuses its tab).
  function tabId(title) {
    return 'd' + String(title).replace(/[^a-zA-Z0-9]+/g, '_');
  }

  function viewEl(mod) {
    return document.getElementById('view-' + mod);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function barHtml(mod) {
    var s = st(mod);
    var cfg = MODULES[mod];
    var html =
      '<button class="doctab' +
      (s.active === LIST ? ' active' : '') +
      '" data-doctab="' +
      LIST +
      '"><span class="doctab-label">' +
      esc(cfg.listLabel) +
      '</span></button>';

    s.tabs.forEach(function (t) {
      var on = s.active === t.id;
      html +=
        '<button class="doctab' +
        (on ? ' active' : '') +
        '" data-doctab="' +
        esc(t.id) +
        '" title="' +
        esc(t.title) +
        '"><span class="doctab-label">' +
        esc(shortLabel(t.title)) +
        '</span><span class="doctab-x" data-doctab-close="' +
        esc(t.id) +
        '" role="button" aria-label="Tutup">×</span></button>';
    });
    return html;
  }

  // Build (or rebuild) the sub-tab structure inside #view-{mod}, preserving the
  // freshly-rendered list DOM as the "Daftar" panel.
  function enhance(mod) {
    var el = viewEl(mod);
    if (!el) {
      return;
    }
    busy = true;
    try {
      var body = el.querySelector(':scope > .doctabs-body');
      var header = el.querySelector(':scope > .sec-hdr');
      var listPanel;

      if (body) {
        // Already enhanced — keep the existing list panel as-is.
        listPanel = body.querySelector(':scope > .doctabs-panel[data-panel="' + LIST + '"]');
      } else {
        // Renderer just wrote raw list markup. Move those nodes into a list panel.
        listPanel = document.createElement('div');
        listPanel.className = 'doctabs-panel';
        listPanel.setAttribute('data-panel', LIST);
        while (el.firstChild) {
          listPanel.appendChild(el.firstChild);
        }
        // The module header stays above the tabs.
        var first = listPanel.firstElementChild;
        if (first && first.classList.contains('sec-hdr')) {
          header = first;
        }
        body = document.createElement('div');
        body.className = 'doctabs-body';
        body.appendChild(listPanel);
      }

      // Rebuild the bar.
      var bar = el.querySelector(':scope > .doctabs-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'doctabs-bar';
        bar.setAttribute('role', 'tablist');
      }
      bar.innerHTML = barHtml(mod);

      // Rebuild doc panels from state (drop stale ones, add/refresh current).
      var s = st(mod);
      var keep = {};
      s.tabs.forEach(function (t) {
        keep[t.id] = 1;
        var p = body.querySelector(':scope > .doctabs-panel[data-panel="' + t.id + '"]');
        if (!p) {
          p = document.createElement('div');
          p.className = 'doctabs-panel';
          p.setAttribute('data-panel', t.id);
          body.appendChild(p);
        }
        p.innerHTML =
          '<div class="modal-body doctab-docbody">' +
          t.body +
          '</div>' +
          (t.footer ? '<div class="modal-footer doctab-docfoot">' + t.footer + '</div>' : '');
      });
      // Remove panels whose tab was closed.
      body.querySelectorAll(':scope > .doctabs-panel').forEach(function (p) {
        var id = p.getAttribute('data-panel');
        if (id !== LIST && !keep[id]) {
          p.remove();
        }
      });

      // Assemble in order: module header, bar, body.
      if (header) {
        el.insertBefore(header, el.firstChild);
      }
      el.insertBefore(bar, header ? header.nextSibling : el.firstChild);
      if (bar.nextSibling !== body) {
        el.insertBefore(body, bar.nextSibling);
      }
      bar.hidden = s.tabs.length === 0;

      applyActive(mod);
    } finally {
      busy = false;
    }
    ensureObserver(mod);
  }

  // Toggle which panel is visible + which tab is highlighted.
  function applyActive(mod) {
    var el = viewEl(mod);
    if (!el) {
      return;
    }
    var s = st(mod);
    var body = el.querySelector(':scope > .doctabs-body');
    if (body) {
      body.querySelectorAll(':scope > .doctabs-panel').forEach(function (p) {
        p.hidden = p.getAttribute('data-panel') !== s.active;
      });
    }
    var bar = el.querySelector(':scope > .doctabs-bar');
    if (bar) {
      bar.querySelectorAll('.doctab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-doctab') === s.active);
      });
      var act = bar.querySelector('.doctab.active');
      if (act && act.scrollIntoView) {
        act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  function setActive(mod, id) {
    st(mod).active = id;
    applyActive(mod);
  }

  // ── Tab ops ──────────────────────────────────────────────────────────────────
  function addDocTab(mod, title, bodyHtml, footerHtml) {
    var s = st(mod);
    var id = tabId(title);
    var existing = null;
    for (var i = 0; i < s.tabs.length; i++) {
      if (s.tabs[i].id === id) {
        existing = s.tabs[i];
        break;
      }
    }
    if (existing) {
      existing.title = title;
      existing.body = bodyHtml;
      existing.footer = footerHtml || '';
    } else {
      s.tabs.push({ id: id, title: title, body: bodyHtml, footer: footerHtml || '' });
      if (s.tabs.length > MAX_DOC_TABS) {
        s.tabs.shift();
      }
    }
    s.active = id;
    enhance(mod);
  }

  function closeDocTab(mod, id) {
    var s = st(mod);
    var i = -1;
    for (var k = 0; k < s.tabs.length; k++) {
      if (s.tabs[k].id === id) {
        i = k;
        break;
      }
    }
    if (i === -1) {
      return;
    }
    s.tabs.splice(i, 1);
    if (s.active === id) {
      var next = s.tabs[Math.min(i, s.tabs.length - 1)];
      s.active = next ? next.id : LIST;
    }
    enhance(mod);
  }

  // ── MutationObserver: survive list re-renders ────────────────────────────────
  var observers = {};
  function ensureObserver(mod) {
    if (observers[mod]) {
      return;
    }
    var el = viewEl(mod);
    if (!el || typeof MutationObserver === 'undefined') {
      return;
    }
    var obs = new MutationObserver(function () {
      if (busy) {
        return;
      }
      // If our bar is gone (renderer replaced innerHTML), re-wrap.
      if (!el.querySelector(':scope > .doctabs-bar')) {
        enhance(mod);
      }
    });
    obs.observe(el, { childList: true });
    observers[mod] = obs;
  }

  // ── Interceptions ────────────────────────────────────────────────────────────
  function wrapOpenModal() {
    if (typeof window.openModal !== 'function' || window.openModal.__docTabWrapped) {
      return;
    }
    var orig = window.openModal;
    var wrapped = function (title, body, footer /*, wide*/) {
      if (captureModule) {
        var mod = captureModule;
        captureModule = null; // capture only the first modal per view call
        addDocTab(mod, title, body, footer);
        return;
      }
      return orig.apply(this, arguments);
    };
    wrapped.__docTabWrapped = true;
    wrapped.__orig = orig;
    window.openModal = wrapped;
  }

  function wrapViewFns() {
    Object.keys(FN_TO_MODULE).forEach(function (fnName) {
      var orig = window[fnName];
      if (typeof orig !== 'function' || orig.__docTabWrapped) {
        return;
      }
      var mod = FN_TO_MODULE[fnName];
      var wrapped = function () {
        // Tabs live inside the module's own view; opened from anywhere else
        // (dashboard, finance summary, another module) the document is a dialog.
        if (window.activeView !== mod) {
          return orig.apply(this, arguments);
        }
        var prev = captureModule;
        captureModule = mod;
        try {
          return orig.apply(this, arguments);
        } finally {
          // If the fn didn't open a modal (e.g. "not found" toast), clear it.
          captureModule = prev;
        }
      };
      wrapped.__docTabWrapped = true;
      wrapped.__orig = orig;
      window[fnName] = wrapped;
    });
  }

  // Delegate clicks inside any module view: sub-tab select/close/new, and
  // rewire a doc panel's "Tutup" (data-action=closeModal) to close the tab.
  function wireDelegation() {
    document.addEventListener(
      'click',
      function (e) {
        var mod = null;
        var host = e.target.closest && e.target.closest('.view[id^="view-"]');
        if (host) {
          mod = host.id.replace(/^view-/, '');
        }
        if (!mod || !MODULES[mod]) {
          return;
        }

        // "Tutup" button inside a doc panel → close that sub-tab, not the overlay.
        var closeBtn = e.target.closest('[data-action="closeModal"]');
        if (closeBtn) {
          var panel = closeBtn.closest('.doctabs-panel');
          if (panel && panel.getAttribute('data-panel') !== LIST) {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeDocTab(mod, panel.getAttribute('data-panel'));
            return;
          }
        }

        var closeTab = e.target.closest('[data-doctab-close]');
        if (closeTab) {
          e.preventDefault();
          e.stopPropagation();
          closeDocTab(mod, closeTab.getAttribute('data-doctab-close'));
          return;
        }
        var tab = e.target.closest('[data-doctab]');
        if (tab) {
          e.preventDefault();
          setActive(mod, tab.getAttribute('data-doctab'));
        }
      },
      true
    );
  }

  // After navigating into a module, make sure its sub-tab strip is present.
  function wrapNavigate() {
    if (typeof window.navigate !== 'function' || window.navigate.__docTabNav) {
      return;
    }
    var orig = window.navigate;
    var wrapped = function (id) {
      var r = orig.apply(this, arguments);
      if (MODULES[id]) {
        // Renderer has run synchronously inside orig; wrap the list now.
        enhance(id);
      }
      return r;
    };
    wrapped.__docTabNav = true;
    window.navigate = wrapped;
  }

  function init() {
    wrapOpenModal();
    wrapViewFns();
    wireDelegation();
    wrapNavigate();
    // If we booted straight into a module view, enhance it.
    if (window.activeView && MODULES[window.activeView]) {
      enhance(window.activeView);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Debug / programmatic access.
  window.docTabs = {
    open: addDocTab,
    close: closeDocTab,
    activate: setActive,
    // Re-wrap freshly-defined viewX globals. lazy-views.js calls this after a
    // lazy view chunk loads so its doc-openers (e.g. viewInvoiceDoc) get the
    // inline sub-tab behaviour that init()'s one-time wrapViewFns() missed.
    rewrap: wrapViewFns,
    state: function () {
      return state;
    },
    modules: MODULES,
  };
})();
