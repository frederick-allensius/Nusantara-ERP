// ═══════════════════════════════════════════════════════════════════════════════
// A sidebar entry that shows its view's own page (no menu route) re-renders the
// view, so a page another entry drew into the same view (Ekspor Coretax inside
// the 'tax' view) doesn't reappear when Pajak & PPN is clicked.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const w = window as any;
const NAV_SRC = readFileSync(resolve(__dirname, '../public/classic/ui/nav.js'), 'utf-8');

beforeAll(() => {
  w.__ERP_USER = { role: 'admin', active: true };
  w.NSAMenu = { handle: vi.fn(() => false) };
  document.body.innerHTML =
    '<aside id="sidebar"><nav id="nav"></nav></aside><div id="page-context"></div>';
  // eslint-disable-next-line no-eval -- the real classic script, in global scope
  (0, eval)(NAV_SRC);
  if (!document.querySelector('#nav .nav-item')) {
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }
  // nav.js defines both; watch the calls the menu makes.
  w.navigate = vi.fn();
  w.invalidateView = vi.fn();
});

describe('opening a default page from the menu', () => {
  it('invalidates the view before navigating to it', () => {
    w.NSANav.open('Pajak & PPN');
    expect(w.invalidateView).toHaveBeenCalledWith('tax');
    expect(w.navigate).toHaveBeenCalledWith('tax');
    expect(w.invalidateView.mock.invocationCallOrder[0]).toBeLessThan(
      w.navigate.mock.invocationCallOrder[0]
    );
  });

  it('leaves routed entries to their route', () => {
    w.invalidateView.mockClear();
    w.navigate.mockClear();
    w.NSAMenu.handle.mockImplementationOnce(() => true);
    w.NSANav.open('Ekspor Coretax');
    expect(w.invalidateView).not.toHaveBeenCalled();
    expect(w.navigate).not.toHaveBeenCalled();
  });
});
