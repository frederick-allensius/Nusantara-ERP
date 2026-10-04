// ═══════════════════════════════════════════════════════════════════════════════
// Page header (src/core/helpers.js secHdr): the title and the primary button;
// a subtitle only when the caller opts in.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { secHdr } from '../src/core/helpers.js';

function render(html: string) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.firstElementChild as HTMLElement;
}

describe('secHdr', () => {
  it('leaves the subtitle out by default', () => {
    const hdr = render(
      secHdr('Pesanan Penjualan', 'Sales order dari pelanggan', 'Buat SO', 'addSO')
    );
    expect(hdr.classList.contains('sec-hdr')).toBe(true);
    expect(hdr.querySelector('h1')!.textContent).toBe('Pesanan Penjualan');
    expect(hdr.querySelector('p')).toBeNull();
    expect(hdr.textContent).not.toContain('Sales order dari pelanggan');
    const btn = hdr.querySelector('button.btn') as HTMLElement;
    expect(btn.dataset.action).toBe('addSO');
    expect(btn.textContent!.trim()).toBe('Buat SO');
  });

  it('shows the subtitle when the caller asks for it', () => {
    const hdr = render(
      secHdr(
        'Uang Muka Penjualan',
        'Dipotong dari piutang <pelanggan>',
        'Terima DP',
        'addSalesDP',
        {
          showSub: true,
        }
      )
    );
    expect(hdr.querySelector('p')!.textContent).toBe('Dipotong dari piutang <pelanggan>');
    expect(hdr.querySelector('p')!.innerHTML).toContain('&lt;pelanggan&gt;');
  });

  it('opting in without a subtitle adds nothing; no button without a label', () => {
    const hdr = render(secHdr('Entri Harian', '', '', '', { showSub: true }));
    expect(hdr.querySelector('p')).toBeNull();
    expect(hdr.querySelector('button')).toBeNull();
  });
});

describe('secHdr button icon', () => {
  it('shows "+" only on create buttons', async () => {
    const { secHdr } = await import('../src/core/helpers.js');
    const div = document.createElement('div');
    div.innerHTML = secHdr('Pesanan Penjualan', '', 'Buat SO', 'addSO');
    expect(div.querySelector('button svg')).toBeTruthy();
    div.innerHTML = secHdr('Laporan Keuangan', '', 'Cetak', 'printFin');
    expect(div.querySelector('button svg')).toBeNull();
    expect(div.querySelector('button')!.textContent!.trim()).toBe('Cetak');
  });
});
