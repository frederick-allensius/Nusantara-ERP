// ═══════════════════════════════════════════════════════════════════════════════
// Plain tables on phones (ui/table-cards.js): tables in the page without list-
// card roles get .auto-cards and each cell its column title in data-label, so
// mobile.css can show every row as a small card instead of scrolling sideways.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

const page = (html: string) => {
  document.body.innerHTML = `<main id="main-content">${html}</main>`;
};

beforeAll(async () => {
  await import('../public/classic/ui/table-cards.js');
});

describe('table cards', () => {
  it('labels each cell of a plain table with its column, colspans included', async () => {
    page(`
      <table id="t"><thead><tr><th>ID</th><th colspan="2">Tanggal</th><th>Jumlah ↕</th><th></th></tr></thead>
      <tbody><tr><td>GR-1</td><td>10</td><td>Okt</td><td>Rp 5</td><td><button>Edit</button></td></tr>
      <tr><td colspan="5">Belum ada data.</td></tr></tbody>
      <tfoot><tr><td>TOTAL</td><td></td><td></td><td>Rp 5</td><td></td></tr></tfoot></table>`);
    await frame();
    const t = document.getElementById('t') as HTMLTableElement;
    expect(t.classList.contains('auto-cards')).toBe(true);
    const rows = t.querySelectorAll('tbody > tr');
    const labels = Array.from(rows[0].querySelectorAll('td')).map(c =>
      c.getAttribute('data-label')
    );
    expect(labels).toEqual(['ID', 'Tanggal', 'Tanggal', 'Jumlah', '']);
    expect(rows[1].querySelector('td')!.hasAttribute('data-label')).toBe(false);
    expect(t.querySelectorAll('tfoot td')[3].getAttribute('data-label')).toBe('Jumlah');
  });

  it('leaves list-card tables, narrow tables, headless tables and opted-out tables alone', async () => {
    page(`
      <table id="lc" class="list-cards"><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>
      <table id="two"><thead><tr><th>Akun</th><th>Jumlah</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
      <table id="nohead"><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>
      <table id="keep" data-keep-table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>`);
    await frame();
    for (const id of ['lc', 'two', 'nohead', 'keep']) {
      expect(document.getElementById(id)!.classList.contains('auto-cards'), id).toBe(false);
    }
  });

  it('is styled only on phones', () => {
    const css = readFileSync(resolve(__dirname, '../mobile.css'), 'utf8');
    const at = css.indexOf('PLAIN TABLES ON PHONES');
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at)).toMatch(/@media \(max-width: 560px\) \{\s*\.auto-cards,/);
  });
});
