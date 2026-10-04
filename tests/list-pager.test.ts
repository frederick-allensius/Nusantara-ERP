// ═══════════════════════════════════════════════════════════════════════════════
// list-pager.js (window.NSAPager): one page of a long list and its pager bar.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll } from 'vitest';

const w = () => window as any;

beforeAll(async () => {
  await import('../public/classic/core/list-pager.js');
});

describe('NSAPager', () => {
  it('slices a page and clamps the page number', () => {
    const arr = Array.from({ length: 53 }, (_, i) => i + 1);
    expect(w().NSAPager.page(arr, 1, 25).rows).toHaveLength(25);
    const last = w().NSAPager.page(arr, 9, 25);
    expect(last).toMatchObject({ page: 3, pages: 3, total: 53 });
    expect(last.rows).toEqual([51, 52, 53]);
  });

  it('renders the bar with the caller action, nothing for one page', () => {
    expect(w().NSAPager.html({ total: 10, page: 1, size: 25, action: 'x' })).toBe('');
    const div = document.createElement('div');
    div.innerHTML = w().NSAPager.html({
      total: 53,
      page: 2,
      size: 25,
      action: 'glPage',
      type: 'J',
    });
    expect(div.textContent).toContain('26–50 dari 53');
    const btns = div.querySelectorAll('button');
    expect(btns[0].dataset).toMatchObject({ action: 'glPage', val: '1', type: 'J' });
    expect(btns[1].dataset.val).toBe('3');
    expect(btns[0].disabled).toBe(false);
  });
});
