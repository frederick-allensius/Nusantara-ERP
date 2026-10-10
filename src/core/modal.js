// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Modal System
// Modal dialogs and toast notifications
// ═══════════════════════════════════════════════════════════════════════════════

import { escapeHtml } from './helpers.js';

let modalEl = null;

/**
 * Ensure modal element exists
 */
function ensureModal() {
  if (modalEl) {
    return;
  }
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.id = 'modalOverlay';
  document.body.appendChild(modalEl);

  modalEl.addEventListener('click', e => {
    if (e.target === modalEl) {
      closeModal();
    }
  });

  // Toast container
  const tw = document.createElement('div');
  tw.className = 'toast-wrap';
  tw.id = 'toastWrap';
  document.body.appendChild(tw);
}

/**
 * Open modal dialog
 */
export function openModal(title, bodyHtml, footerHtml, wide) {
  ensureModal();
  const safeTitle = escapeHtml(title);
  modalEl.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-labelledby="modalTitle" aria-modal="true">
    <div class="modal-header">
      <h2 id="modalTitle">${safeTitle}</h2>
      <button class="modal-close" data-action="closeModal" aria-label="Tutup modal">×</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
  </div>`;
  requestAnimationFrame(() => {
    modalEl.classList.add('active');
    const firstInput = modalEl.querySelector('input, select, textarea, button');
    if (firstInput) {
      firstInput.focus();
    }
  });
}

/**
 * Close modal dialog
 */
export function closeModal() {
  if (!modalEl) {
    return;
  }
  modalEl.classList.remove('active');
  setTimeout(() => {
    modalEl.innerHTML = '';
  }, 250);
}

// Feather-style toast icons per type (24×24 viewBox, stroke = theme token).
const TOAST_ICONS = {
  success: ['<polyline points="20 6 9 17 4 12"/>', 'var(--success)'],
  danger: [
    '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    'var(--danger)',
  ],
  warning: [
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'var(--warning)',
  ],
  info: [
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    'var(--info)',
  ],
};

/** SVG icon element for a toast type (null for unknown/default type). */
function toastIcon(type) {
  const def = TOAST_ICONS[type];
  if (!def) {
    return null;
  }
  const span = document.createElement('span');
  span.style.cssText = 'display:flex;align-items:center;flex-shrink:0';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${def[1]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${def[0]}</svg>`;
  return span;
}

/**
 * Show toast notification
 */
export function showToast(msg, type) {
  ensureModal();
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type || ''}`;
  t.setAttribute('role', 'alert');
  const icon = toastIcon(type);
  if (icon) {
    t.appendChild(icon);
  }
  const text = document.createElement('span');
  text.textContent = msg;
  t.appendChild(text);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/**
 * Show undo toast with callback
 */
export function showUndoToast(msg, onUndo, duration) {
  ensureModal();
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast danger';
  t.setAttribute('role', 'alert');
  t.style.cssText = 'display:flex;align-items:center;gap:12px;justify-content:space-between';

  const icon = toastIcon('danger');
  if (icon) {
    t.appendChild(icon);
  }

  const span = document.createElement('span');
  span.textContent = msg;
  span.style.flex = '1';

  const btn = document.createElement('button');
  btn.textContent = 'Undo';
  btn.style.cssText = [
    'background:rgba(255,255,255,0.25)',
    'border:1px solid rgba(255,255,255,0.5)',
    'color:#fff',
    'border-radius:5px',
    'padding:2px 10px',
    'font-size:.75rem',
    'font-weight:700',
    'cursor:pointer',
    'white-space:nowrap',
    'flex-shrink:0',
  ].join(';');

  t.appendChild(span);
  t.appendChild(btn);
  wrap.appendChild(t);

  const timer = setTimeout(() => t.remove(), duration || 4500);

  btn.addEventListener('click', () => {
    clearTimeout(timer);
    t.remove();
    onUndo();
  });
}

/**
 * Ask — the app's own confirmation, in place of the browser's confirm() and
 * prompt(). It opens above any open dialog (so a form stays open behind it)
 * and resolves to true / false, or for `input` to the text entered / null.
 *
 *   ask('Hapus pengeluaran?', 'Jurnal kas/bank ikut dihapus.', { ok: 'Hapus', danger: true })
 *   ask('Password baru', 'Minimal 6 karakter.', { input: { type: 'password', minLength: 6 } })
 *
 * Escape and Batal cancel; Enter confirms from the field. A destructive
 * question starts on Batal so a stray Enter does not delete.
 */
export function ask(title, message, opts) {
  const o = opts || {};
  return new Promise(resolve => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'ask-overlay';
    const field = o.input
      ? `<input class="form-input ask-input" type="${o.input.type === 'password' ? 'password' : 'text'}"` +
        ` autocomplete="${o.input.type === 'password' ? 'new-password' : 'off'}"` +
        ` aria-label="${escapeHtml(o.input.label || title)}" value="${escapeHtml(o.input.value || '')}">` +
        '<div class="ask-error" role="alert" hidden></div>'
      : '';
    wrap.innerHTML =
      `<div class="ask" role="alertdialog" aria-modal="true" aria-labelledby="ask-title" aria-describedby="ask-msg">` +
      `<div class="ask-title" id="ask-title">${escapeHtml(title)}</div>` +
      (message ? `<div class="ask-msg" id="ask-msg">${escapeHtml(message)}</div>` : '') +
      field +
      '<div class="ask-foot">' +
      `<button type="button" class="btn-ghost" data-ask="no">${escapeHtml(o.cancel || 'Batal')}</button>` +
      `<button type="button" class="${o.danger ? 'btn-danger' : 'btn'}" data-ask="yes">${escapeHtml(o.ok || 'Ya')}</button>` +
      '</div></div>';
    document.body.appendChild(wrap);
    const input = wrap.querySelector('.ask-input');
    const error = wrap.querySelector('.ask-error');

    function done(value) {
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
      resolve(value);
    }
    function yes() {
      if (!input) {
        done(true);
        return;
      }
      const v = input.value;
      const min = o.input.minLength || 0;
      if (v.trim().length < min) {
        error.textContent = `Minimal ${min} karakter.`;
        error.hidden = false;
        input.focus();
        return;
      }
      done(v);
    }
    function no() {
      done(input ? null : false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        no();
      } else if (e.key === 'Enter' && e.target === input) {
        e.preventDefault();
        yes();
      } else if (e.key === 'Tab') {
        // Keep focus inside the question.
        const items = Array.from(wrap.querySelectorAll('input, button'));
        const i = items.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
        e.preventDefault();
        items[next].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-ask]');
      if (b) {
        if (b.dataset.ask === 'yes') {
          yes();
        } else {
          no();
        }
      } else if (e.target === wrap) {
        no();
      }
    });
    (input || wrap.querySelector(`[data-ask="${o.danger ? 'no' : 'yes'}"]`)).focus();
  });
}

// Verbs that start a question and become its button; the destructive ones
// make the button red and start the focus on Batal.
const ASK_VERBS = {
  Hapus: true,
  Batalkan: true,
  Kosongkan: true,
  Bersihkan: true,
  Pulihkan: true,
  Impor: true,
  Keluar: false,
  Upload: false,
  Posting: false,
  Terapkan: false,
  Simpan: false,
  Lanjutkan: false,
};

/**
 * confirmAsk(text) — ask() for a question written as one text, as the
 * browser's confirm() took it: the first paragraph is the title, the rest the
 * message. The first word names the button when it is a known verb.
 */
export function confirmAsk(text, opts) {
  const s = String(text == null ? '' : text);
  const cut = s.indexOf('\n\n');
  const title = (cut >= 0 ? s.slice(0, cut) : s).trim();
  const message = cut >= 0 ? s.slice(cut + 2).trim() : '';
  const verb = title.split(/\s+/)[0].replace(/[^A-Za-z]/g, '');
  const known = Object.prototype.hasOwnProperty.call(ASK_VERBS, verb);
  return ask(title, message, {
    ok: known ? verb : 'Lanjutkan',
    danger: known ? ASK_VERBS[verb] : false,
    ...(opts || {}),
  });
}

/**
 * Confirm dialog (older call sites): the same question as ask(), with a
 * callback. It no longer replaces an open dialog.
 */
export function confirmDialog(title, msg, onConfirm) {
  ask(title, msg, { ok: 'Hapus', danger: true }).then(ok => {
    if (ok) {
      onConfirm();
    }
  });
}

// Make functions globally available
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.showUndoToast = showUndoToast;
window.confirmDialog = confirmDialog;
window.ask = ask;
window.confirmAsk = confirmAsk;
