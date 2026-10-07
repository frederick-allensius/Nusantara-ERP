// ═══════════════════════════════════════════════════════════════════════════════
// Themed pickers (ui/pickers.js): with a mouse, selects open a themed option
// list, date fields a calendar and month fields a month grid. The native control
// keeps the value: choosing sets it and fires `input` and `change`. Touch
// screens, disabled controls and data-native-picker keep the browser's own.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const w = () => window as any;
let fine = true;

beforeAll(async () => {
  w().matchMedia = (q: string) => ({ matches: q.includes('fine') ? fine : !fine, media: q });
  await import('../public/classic/ui/pickers.js');
});

beforeEach(() => {
  fine = true;
  w().NSAPickers.close();
  document.body.innerHTML = '';
});

const pop = () => document.querySelector('.pk-pop') as HTMLElement | null;
const press = (el: Element) =>
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
const click = (el: Element) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
const key = (k: string, target: EventTarget = document) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

function select(html: string) {
  document.body.innerHTML = `<select id="s">${html}</select>`;
  const s = document.getElementById('s') as HTMLSelectElement;
  const log: string[] = [];
  s.addEventListener('input', () => log.push('input'));
  s.addEventListener('change', () => log.push('change:' + s.value));
  return { s, log };
}

describe('select', () => {
  it('opens a themed list instead of the browser one and sets the value', () => {
    const { s, log } = select(
      '<option value="a">Draft</option><option value="b" selected>Dikonfirmasi</option><option value="c" disabled>Lunas</option>'
    );
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    s.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const opts = Array.from(pop()!.querySelectorAll('.pk-opt'));
    expect(opts.map(o => o.textContent)).toEqual(['Draft', 'Dikonfirmasi', 'Lunas']);
    expect(opts[1].classList.contains('is-selected')).toBe(true);
    expect(opts[2].getAttribute('aria-disabled')).toBe('true');

    click(opts[2]); // disabled: nothing happens
    expect(s.value).toBe('b');
    click(opts[0]);
    expect(s.value).toBe('a');
    expect(log).toEqual(['input', 'change:a']);
    expect(pop()).toBeNull();
  });

  it('shows optgroup labels, searches long lists, and keys move and choose', () => {
    const many = Array.from(
      { length: 10 },
      (_, i) => `<option value="${i}">Barang ${i}</option>`
    ).join('');
    const { s } = select(
      `<optgroup label="Batu">${many}</optgroup><option value="x">Pasir Urug</option>`
    );
    press(s);
    expect(pop()!.querySelector('.pk-group')!.textContent).toBe('Batu');
    const search = pop()!.querySelector('.pk-search-input') as HTMLInputElement;
    expect(search).toBeTruthy();
    search.value = 'pasir';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(Array.from(pop()!.querySelectorAll('.pk-opt')).map(o => o.textContent)).toEqual([
      'Pasir Urug',
    ]);
    expect(pop()!.querySelector('.pk-group')).toBeNull();
    key('Enter');
    expect(s.value).toBe('x');

    press(s);
    key('ArrowUp');
    key('Enter');
    expect(s.value).toBe('9');
  });

  it('closes on Escape without changing the value and does not let Escape reach the page', () => {
    const { s, log } = select('<option value="a">A</option><option value="b">B</option>');
    let pageSaw = false;
    const onPage = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pageSaw = true;
      }
    };
    document.addEventListener('keydown', onPage);
    press(s);
    key('ArrowDown', document.activeElement || s);
    key('Escape', document.activeElement || s);
    expect(pop()).toBeNull();
    expect(log).toEqual([]);
    expect(pageSaw).toBe(false);
    document.removeEventListener('keydown', onPage);
  });

  it('keeps the browser list on touch screens, for disabled selects and on opt-out', () => {
    const { s } = select('<option>A</option><option>B</option>');
    fine = false;
    press(s);
    expect(pop()).toBeNull();
    fine = true;
    s.disabled = true;
    press(s);
    expect(pop()).toBeNull();
    s.disabled = false;
    s.setAttribute('data-native-picker', '');
    press(s);
    expect(pop()).toBeNull();
  });
});

describe('date', () => {
  function dateInput(attrs: string) {
    document.body.innerHTML = `<input type="date" id="d" ${attrs}>`;
    const d = document.getElementById('d') as HTMLInputElement;
    const log: string[] = [];
    d.addEventListener('change', () => log.push(d.value));
    return { d, log };
  }

  it('opens a Monday-first calendar on the chosen month and picks a day within min/max', () => {
    const { d, log } = dateInput('value="2026-10-07" min="2026-10-05" max="2026-10-31"');
    click(d);
    const cal = pop()!;
    expect(cal.querySelector('.pk-title')!.textContent).toBe('Oktober 2026');
    expect(Array.from(cal.querySelectorAll('.pk-week span')).map(s => s.textContent)).toEqual([
      'Sen',
      'Sel',
      'Rab',
      'Kam',
      'Jum',
      'Sab',
      'Min',
    ]);
    // 1 Okt 2026 is a Thursday: three days of September lead the grid.
    const days = Array.from(cal.querySelectorAll('.pk-day')) as HTMLButtonElement[];
    expect(days[3].dataset.v).toBe('2026-10-01');
    expect(cal.querySelector('.pk-day.is-sel')!.textContent).toBe('7');
    const day = (v: string) => cal.querySelector(`.pk-day[data-v="${v}"]`) as HTMLButtonElement;
    expect(day('2026-10-04').disabled).toBe(true);
    click(day('2026-10-04'));
    expect(d.value).toBe('2026-10-07');
    click(day('2026-10-15'));
    expect(d.value).toBe('2026-10-15');
    expect(log).toEqual(['2026-10-15']);
    expect(pop()).toBeNull();
  });

  it('moves between months, switches to a month grid, and clears an optional date', () => {
    const { d } = dateInput('value="2026-01-15"');
    click(d);
    click(pop()!.querySelector('[data-pk="prev"]')!);
    expect(pop()!.querySelector('.pk-title')!.textContent).toBe('Desember 2025');
    click(pop()!.querySelector('[data-pk="mode"]')!);
    expect(pop()!.querySelectorAll('.pk-month')).toHaveLength(12);
    click(pop()!.querySelectorAll('.pk-month')[2]);
    expect(pop()!.querySelector('.pk-title')!.textContent).toBe('Maret 2025');
    click(pop()!.querySelector('[data-pk="clear"]')!);
    expect(d.value).toBe('');
  });

  it('has no Kosongkan for a required date', () => {
    const { d } = dateInput('required value="2026-10-07"');
    click(d);
    expect(pop()!.querySelector('[data-pk="clear"]')).toBeNull();
    expect(pop()!.querySelector('[data-pk="today"]')).toBeTruthy();
  });
});

describe('month', () => {
  it('picks a month of the shown year', () => {
    document.body.innerHTML = '<input type="month" id="m" value="2026-10">';
    const m = document.getElementById('m') as HTMLInputElement;
    let changed = '';
    m.addEventListener('change', () => (changed = m.value));
    click(m);
    expect(pop()!.querySelector('.pk-title')!.textContent).toBe('2026');
    expect(pop()!.querySelector('.pk-month.is-sel')!.textContent).toBe('Okt');
    click(pop()!.querySelector('[data-pk="prev"]')!);
    click(Array.from(pop()!.querySelectorAll('.pk-month'))[8]);
    expect(m.value).toBe('2025-09');
    expect(changed).toBe('2025-09');
  });
});
