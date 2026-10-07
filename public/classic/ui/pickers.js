// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Themed pickers  (ui/pickers.js)
//
// The browser's own pop-ups for <select>, <input type="date"> and
// <input type="month"> do not follow the theme. On screens with a mouse this
// opens a themed pop-up instead: an option list for selects, a calendar for
// dates, a month grid for months. The native control stays the field and the
// source of truth — the pop-up only sets its value and fires `input` and
// `change` — so every form keeps working as it was, including values set in
// code. Typing a date still works. Touch screens keep the phone's own pickers,
// which are larger and easier to tap.
//
// Opt out per control with data-native-picker.
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.NSAPickers.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const MONTHS = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  // Options from which the list gets a search field.
  const SEARCH_FROM = 9;

  let open = null; // { el, pop, kind, cleanup }

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  }

  function finePointer() {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function iso(y, m, d) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }
  function todayParts() {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
  }

  function enhanceable(el) {
    if (!el || el.disabled || el.readOnly || el.hasAttribute('data-native-picker')) {
      return null;
    }
    if (el.tagName === 'SELECT') {
      return el.multiple || el.size > 1 ? null : 'select';
    }
    if (el.tagName === 'INPUT' && (el.type === 'date' || el.type === 'month')) {
      return el.type;
    }
    return null;
  }

  // ── Pop-up shell ────────────────────────────────────────────────────────────
  function place(pop, el) {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (pop.classList.contains('pk-list')) {
      pop.style.minWidth = `${Math.max(r.width, 0)}px`;
    }
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = Math.min(r.left, vw - w - 8);
    left = Math.max(8, left);
    let top = r.bottom + 4;
    if (top + h > vh - 8 && r.top - h - 4 > 8) {
      top = r.top - h - 4;
    }
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  }

  function close(refocus) {
    if (!open) {
      return;
    }
    const cur = open;
    open = null;
    cur.cleanup();
    cur.pop.remove();
    cur.el.removeAttribute('aria-expanded');
    if (refocus && typeof cur.el.focus === 'function') {
      cur.el.focus();
    }
  }

  function commit(el, value) {
    if (el.value !== value) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function mount(el, kind, pop, onKey) {
    close(false);
    pop.classList.add('pk-pop');
    document.body.appendChild(pop);
    place(pop, el);
    el.setAttribute('aria-expanded', 'true');
    const onDown = e => {
      if (!pop.contains(e.target) && e.target !== el) {
        close(false);
      }
    };
    const onScroll = e => {
      if (!pop.contains(e.target)) {
        close(false);
      }
    };
    const onResize = () => close(false);
    const onKeyDoc = e => {
      if (e.key === 'Escape') {
        // Escape closes only the pop-up, not the dialog it is in.
        e.preventDefault();
        e.stopImmediatePropagation();
        close(true);
      } else if (e.key === 'Tab') {
        close(false);
      } else if (onKey) {
        onKey(e);
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDoc, true);
    open = {
      el,
      pop,
      kind,
      cleanup() {
        document.removeEventListener('mousedown', onDown, true);
        document.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', onKeyDoc, true);
      },
    };
  }

  // ── Select: option list ─────────────────────────────────────────────────────
  function openSelect(sel) {
    const items = [];
    Array.from(sel.children).forEach(node => {
      if (node.tagName === 'OPTGROUP') {
        Array.from(node.children).forEach(o =>
          items.push({ opt: o, group: node.label, disabled: o.disabled || node.disabled })
        );
      } else if (node.tagName === 'OPTION') {
        items.push({ opt: node, group: null, disabled: node.disabled });
      }
    });
    const options = items.filter(i => !i.opt.hidden);
    if (!options.length) {
      return;
    }
    const pop = document.createElement('div');
    pop.className = 'pk-list';
    const search = options.length >= SEARCH_FROM;
    pop.innerHTML =
      (search
        ? '<div class="pk-search"><input type="search" class="pk-search-input" placeholder="Cari…" aria-label="Cari pilihan" autocomplete="off"></div>'
        : '') + '<div class="pk-options" role="listbox" tabindex="-1"></div>';
    const box = pop.querySelector('.pk-options');
    if (sel.getAttribute('aria-label') || sel.id) {
      const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(sel.id) : sel.id;
      const lab = sel.id ? document.querySelector(`label[for="${id}"]`) : null;
      box.setAttribute(
        'aria-label',
        sel.getAttribute('aria-label') || (lab ? lab.textContent.trim() : '')
      );
    }
    let active = -1;
    let shown = [];

    function draw(q) {
      const needle = (q || '').trim().toLowerCase();
      shown = [];
      let html = '';
      let lastGroup = null;
      items.forEach(it => {
        if (it.opt.hidden) {
          return;
        }
        const text = it.opt.textContent.trim();
        if (needle && text.toLowerCase().indexOf(needle) < 0) {
          return;
        }
        if (it.group !== null && it.group !== lastGroup) {
          html += `<div class="pk-group" role="presentation">${esc(it.group)}</div>`;
        }
        lastGroup = it.group;
        const i = shown.length;
        shown.push(it);
        const selected = it.opt.selected;
        html +=
          `<div class="pk-opt${selected ? ' is-selected' : ''}${it.disabled ? ' is-disabled' : ''}" ` +
          `role="option" id="pk-opt-${i}" data-i="${i}" aria-selected="${selected}"` +
          `${it.disabled ? ' aria-disabled="true"' : ''}>` +
          `<span class="pk-opt-text">${esc(text || ' ')}</span>` +
          (selected
            ? '<svg class="pk-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'
            : '') +
          '</div>';
      });
      box.innerHTML = html || '<div class="pk-empty">Tidak ada pilihan yang cocok</div>';
      const sel0 = shown.findIndex(it => it.opt.selected);
      setActive(sel0 >= 0 && !needle ? sel0 : shown.findIndex(it => !it.disabled));
    }

    function setActive(i) {
      box.querySelectorAll('.pk-opt.is-active').forEach(n => n.classList.remove('is-active'));
      active = i;
      const node = i >= 0 ? box.querySelector(`[data-i="${i}"]`) : null;
      if (node) {
        node.classList.add('is-active');
        box.setAttribute('aria-activedescendant', node.id);
        if (typeof node.scrollIntoView === 'function') {
          node.scrollIntoView({ block: 'nearest' });
        }
      } else {
        box.removeAttribute('aria-activedescendant');
      }
    }

    function move(step) {
      if (!shown.length) {
        return;
      }
      let i = active;
      for (let n = 0; n < shown.length; n++) {
        i = (i + step + shown.length) % shown.length;
        if (!shown[i].disabled) {
          setActive(i);
          return;
        }
      }
    }

    function choose(i) {
      const it = shown[i];
      if (!it || it.disabled) {
        return;
      }
      commit(sel, it.opt.value);
      close(true);
    }

    box.addEventListener('mousedown', e => e.preventDefault());
    box.addEventListener('click', e => {
      const node = e.target.closest('.pk-opt');
      if (node) {
        choose(Number(node.dataset.i));
      }
    });
    box.addEventListener('mousemove', e => {
      const node = e.target.closest('.pk-opt');
      if (node && !node.classList.contains('is-disabled') && Number(node.dataset.i) !== active) {
        setActive(Number(node.dataset.i));
      }
    });

    let typed = '';
    let typedAt = 0;
    mount(sel, 'select', pop, e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(active);
      } else if (!search && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Type-ahead to the first option starting with the typed letters.
        const now = Date.now();
        typed = now - typedAt > 700 ? e.key : typed + e.key;
        typedAt = now;
        const hit = shown.findIndex(
          it =>
            !it.disabled &&
            it.opt.textContent.trim().toLowerCase().indexOf(typed.toLowerCase()) === 0
        );
        if (hit >= 0) {
          setActive(hit);
        }
      }
    });
    draw('');
    place(pop, sel);
    const input = pop.querySelector('.pk-search-input');
    if (input) {
      input.addEventListener('input', () => draw(input.value));
      input.focus();
    } else {
      box.focus();
    }
  }

  // ── Date: calendar ──────────────────────────────────────────────────────────
  function parseDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
  }
  function parseMonth(v) {
    const m = /^(\d{4})-(\d{2})/.exec(v || '');
    return m ? { y: Number(m[1]), m: Number(m[2]) - 1 } : null;
  }

  function openDate(inp) {
    const sel = parseDate(inp.value);
    const t = todayParts();
    const view = sel ? { y: sel.y, m: sel.m } : { y: t.y, m: t.m };
    let mode = 'days';
    let focusDay = sel ? sel.d : view.y === t.y && view.m === t.m ? t.d : 1;
    const min = inp.min || '';
    const max = inp.max || '';
    const allowed = v => (!min || v >= min) && (!max || v <= max);

    const pop = document.createElement('div');
    pop.className = 'pk-cal';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Pilih tanggal');

    function header(label, unit) {
      return (
        '<div class="pk-cal-head">' +
        `<button type="button" class="pk-nav" data-pk="prev" aria-label="${unit} sebelumnya">` +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>' +
        `<button type="button" class="pk-title" data-pk="mode">${label}</button>` +
        `<button type="button" class="pk-nav" data-pk="next" aria-label="${unit} berikutnya">` +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></button>' +
        '</div>'
      );
    }

    function draw() {
      const cur = parseDate(inp.value);
      if (mode === 'months') {
        pop.innerHTML =
          header(String(view.y), 'Tahun') +
          '<div class="pk-months">' +
          MONTHS_SHORT.map(
            (name, i) =>
              `<button type="button" class="pk-month${cur && cur.y === view.y && cur.m === i ? ' is-sel' : ''}${t.y === view.y && t.m === i ? ' is-today' : ''}" data-pk="month" data-m="${i}">${name}</button>`
          ).join('') +
          '</div>';
        return;
      }
      const first = new Date(view.y, view.m, 1);
      const lead = (first.getDay() + 6) % 7; // Monday first
      const inMonth = new Date(view.y, view.m + 1, 0).getDate();
      focusDay = Math.min(Math.max(1, focusDay), inMonth);
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const date = new Date(view.y, view.m, i - lead + 1);
        const y = date.getFullYear();
        const m = date.getMonth();
        const d = date.getDate();
        const v = iso(y, m, d);
        const out = m !== view.m;
        const isSel = cur && cur.y === y && cur.m === m && cur.d === d;
        const isToday = t.y === y && t.m === m && t.d === d;
        const ok = allowed(v);
        cells +=
          `<button type="button" class="pk-day${out ? ' is-out' : ''}${isSel ? ' is-sel' : ''}${isToday ? ' is-today' : ''}" ` +
          `data-pk="day" data-v="${v}"${ok ? '' : ' disabled'}${!out && d === focusDay ? '' : ' tabindex="-1"'}` +
          `${isSel ? ' aria-pressed="true"' : ''} aria-label="${d} ${MONTHS[m]} ${y}">${d}</button>`;
      }
      const tv = iso(t.y, t.m, t.d);
      pop.innerHTML =
        header(`${MONTHS[view.m]} ${view.y}`, 'Bulan') +
        `<div class="pk-week">${DAYS.map(n => `<span>${n}</span>`).join('')}</div>` +
        `<div class="pk-days">${cells}</div>` +
        '<div class="pk-foot">' +
        (inp.required
          ? '<span></span>'
          : '<button type="button" class="pk-link" data-pk="clear">Kosongkan</button>') +
        `<button type="button" class="pk-link" data-pk="today"${allowed(tv) ? '' : ' disabled'}>Hari ini</button>` +
        '</div>';
    }

    function focusCurrent() {
      const node = pop.querySelector('.pk-day:not(.is-out):not([tabindex="-1"])');
      if (node) {
        node.focus();
      }
    }

    function shift(months) {
      const d = new Date(view.y, view.m + months, 1);
      view.y = d.getFullYear();
      view.m = d.getMonth();
      draw();
    }

    pop.addEventListener('mousedown', e => {
      if (!e.target.closest('input')) {
        e.preventDefault();
      }
    });
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-pk]');
      if (!b || b.disabled) {
        return;
      }
      const k = b.dataset.pk;
      if (k === 'prev' || k === 'next') {
        if (mode === 'months') {
          view.y += k === 'prev' ? -1 : 1;
          draw();
        } else {
          shift(k === 'prev' ? -1 : 1);
        }
      } else if (k === 'mode') {
        mode = mode === 'days' ? 'months' : 'days';
        draw();
      } else if (k === 'month') {
        view.m = Number(b.dataset.m);
        mode = 'days';
        draw();
      } else if (k === 'day') {
        commit(inp, b.dataset.v);
        close(true);
      } else if (k === 'today') {
        commit(inp, iso(t.y, t.m, t.d));
        close(true);
      } else if (k === 'clear') {
        commit(inp, '');
        close(true);
      }
      place(pop, inp);
    });

    mount(inp, 'date', pop, e => {
      if (mode !== 'days' || !pop.contains(document.activeElement)) {
        return;
      }
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (steps[e.key] !== undefined) {
        e.preventDefault();
        const d = new Date(view.y, view.m, focusDay + steps[e.key]);
        view.y = d.getFullYear();
        view.m = d.getMonth();
        focusDay = d.getDate();
        draw();
        focusCurrent();
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        shift(e.key === 'PageUp' ? -1 : 1);
        focusCurrent();
      }
    });
    draw();
    place(pop, inp);
    // A date typed into the field while the calendar is open shows there too.
    const onType = () => {
      const d = parseDate(inp.value);
      if (d) {
        view.y = d.y;
        view.m = d.m;
        focusDay = d.d;
      }
      draw();
    };
    inp.addEventListener('input', onType);
    const done = open.cleanup;
    open.cleanup = () => {
      inp.removeEventListener('input', onType);
      done();
    };
  }

  // ── Month: month grid ───────────────────────────────────────────────────────
  function openMonth(inp) {
    const cur = parseMonth(inp.value);
    const t = todayParts();
    let year = cur ? cur.y : t.y;
    const min = (inp.min || '').slice(0, 7);
    const max = (inp.max || '').slice(0, 7);
    const pop = document.createElement('div');
    pop.className = 'pk-cal pk-cal-month';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Pilih bulan');

    function draw() {
      const now = parseMonth(inp.value);
      pop.innerHTML =
        '<div class="pk-cal-head">' +
        '<button type="button" class="pk-nav" data-pk="prev" aria-label="Tahun sebelumnya"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>' +
        `<span class="pk-title">${year}</span>` +
        '<button type="button" class="pk-nav" data-pk="next" aria-label="Tahun berikutnya"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></button>' +
        '</div><div class="pk-months">' +
        MONTHS_SHORT.map((name, i) => {
          const v = `${year}-${pad(i + 1)}`;
          const ok = (!min || v >= min) && (!max || v <= max);
          return `<button type="button" class="pk-month${now && now.y === year && now.m === i ? ' is-sel' : ''}${t.y === year && t.m === i ? ' is-today' : ''}" data-pk="pick" data-v="${v}"${ok ? '' : ' disabled'}>${name}</button>`;
        }).join('') +
        '</div>' +
        (inp.required
          ? ''
          : '<div class="pk-foot"><button type="button" class="pk-link" data-pk="clear">Kosongkan</button><span></span></div>');
    }

    pop.addEventListener('mousedown', e => e.preventDefault());
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-pk]');
      if (!b || b.disabled) {
        return;
      }
      if (b.dataset.pk === 'prev' || b.dataset.pk === 'next') {
        year += b.dataset.pk === 'prev' ? -1 : 1;
        draw();
      } else if (b.dataset.pk === 'pick') {
        commit(inp, b.dataset.v);
        close(true);
      } else if (b.dataset.pk === 'clear') {
        commit(inp, '');
        close(true);
      }
    });
    mount(inp, 'month', pop);
    draw();
    place(pop, inp);
  }

  function openFor(el) {
    const kind = enhanceable(el);
    if (kind === 'select') {
      openSelect(el);
    } else if (kind === 'date') {
      openDate(el);
    } else if (kind === 'month') {
      openMonth(el);
    }
  }

  // ── Wiring ──────────────────────────────────────────────────────────────────
  // Selects: the press that would open the browser list opens ours instead.
  document.addEventListener(
    'mousedown',
    e => {
      if (e.button !== 0 || !finePointer()) {
        return;
      }
      const el = e.target;
      if (enhanceable(el) !== 'select') {
        return;
      }
      e.preventDefault();
      if (open && open.el === el) {
        close(true);
        return;
      }
      el.focus();
      openSelect(el);
    },
    true
  );

  // Dates and months: a click in the field opens the calendar; typing still
  // edits the date in place.
  document.addEventListener(
    'click',
    e => {
      if (!finePointer()) {
        return;
      }
      const el = e.target;
      const kind = enhanceable(el);
      if (kind !== 'date' && kind !== 'month') {
        return;
      }
      e.preventDefault();
      if (open && open.el === el) {
        return;
      }
      openFor(el);
    },
    true
  );

  // Keys that would open the browser pop-up open ours.
  document.addEventListener(
    'keydown',
    e => {
      if (open || !finePointer()) {
        return;
      }
      const el = e.target;
      const kind = enhanceable(el);
      if (!kind) {
        return;
      }
      const opener =
        e.key === 'F4' ||
        (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) ||
        (kind === 'select' && (e.key === 'Enter' || e.key === ' '));
      if (opener) {
        e.preventDefault();
        openFor(el);
      }
    },
    true
  );

  window.NSAPickers = { open: openFor, close: () => close(false) };
})();
