// ═══════════════════════════════════════════════════════════════════════════════
// ask() / confirmAsk() (src/core/modal.js): the app's own confirmation in place
// of the browser's confirm() / prompt(). It opens above an open dialog without
// closing it, resolves to the answer, and a destructive question starts on Batal.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const w = () => window as any;
const box = () => document.querySelector('.ask') as HTMLElement | null;
const btn = (k: 'yes' | 'no') => document.querySelector(`[data-ask="${k}"]`) as HTMLButtonElement;
const key = (k: string, target: EventTarget = document.activeElement || document) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeAll(async () => {
  await import('../src/core/modal.js');
});

beforeEach(() => {
  document.querySelectorAll('.ask-overlay').forEach(n => n.remove());
});

describe('ask', () => {
  it('opens above an open dialog, keeps it, and resolves true on the button', async () => {
    w().openModal('Ubah SO', '<input id="f">', '');
    const p = w().ask('Hapus pengeluaran ini?', 'Jurnal ikut dihapus.', {
      ok: 'Hapus',
      danger: true,
    });
    expect(box()!.textContent).toContain('Hapus pengeluaran ini?');
    expect(box()!.textContent).toContain('Jurnal ikut dihapus.');
    expect(btn('yes').className).toBe('btn-danger');
    expect(document.activeElement).toBe(btn('no')); // destructive: starts on Batal
    btn('yes').click();
    await expect(p).resolves.toBe(true);
    expect(box()).toBeNull();
    expect(document.querySelector('#modalOverlay #f')).toBeTruthy(); // the form is still open
    w().closeModal();
  });

  it('resolves false on Batal, on Escape and on the backdrop; Escape stops there', async () => {
    let p = w().ask('Keluar dari sistem?', '', { ok: 'Keluar' });
    expect(document.activeElement).toBe(btn('yes'));
    btn('no').click();
    await expect(p).resolves.toBe(false);

    let pageSaw = false;
    const onPage = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pageSaw = true;
      }
    };
    document.addEventListener('keydown', onPage);
    p = w().ask('Lanjutkan?', '');
    key('Escape');
    await expect(p).resolves.toBe(false);
    expect(pageSaw).toBe(false);
    document.removeEventListener('keydown', onPage);

    p = w().ask('Lanjutkan?', '');
    (document.querySelector('.ask-overlay') as HTMLElement).click();
    await expect(p).resolves.toBe(false);
  });

  it('asks for text with a minimum length, Enter submits, cancel gives null', async () => {
    let p = w().ask('Password baru', 'Minimal 6 karakter.', {
      ok: 'Simpan',
      input: { type: 'password', minLength: 6 },
    });
    const input = document.querySelector('.ask-input') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(document.activeElement).toBe(input);
    input.value = 'abc';
    key('Enter', input);
    expect(box()).toBeTruthy();
    expect((document.querySelector('.ask-error') as HTMLElement).textContent).toBe(
      'Minimal 6 karakter.'
    );
    input.value = 'rahasia1';
    key('Enter', input);
    await expect(p).resolves.toBe('rahasia1');

    p = w().ask('Password baru', '', { input: { type: 'password' } });
    btn('no').click();
    await expect(p).resolves.toBeNull();
  });
});

describe('confirmAsk', () => {
  it('splits a confirm() text into title and message and names the button', async () => {
    let p = w().confirmAsk('Hapus transfer ini?\n\nJurnal transfer ikut dihapus.');
    expect(document.querySelector('.ask-title')!.textContent).toBe('Hapus transfer ini?');
    expect(document.querySelector('.ask-msg')!.textContent).toBe('Jurnal transfer ikut dihapus.');
    expect(btn('yes').textContent).toBe('Hapus');
    expect(btn('yes').className).toBe('btn-danger');
    btn('yes').click();
    await expect(p).resolves.toBe(true);

    p = w().confirmAsk('Upload semua data lokal ke Firebase Firestore?');
    expect(btn('yes').textContent).toBe('Upload');
    expect(btn('yes').className).toBe('btn');
    btn('no').click();
    await expect(p).resolves.toBe(false);

    p = w().confirmAsk('Peringatan: stok tidak cukup.\n\nLanjutkan konfirmasi?');
    expect(btn('yes').textContent).toBe('Lanjutkan');
    btn('no').click();
    await p;
  });

  it('leaves no browser confirm(), prompt() or alert() in the app code', () => {
    const files = [
      'public/classic/core/bank-extras.js',
      'public/classic/core/budget-gl-extras.js',
      'public/classic/core/erp-crud.js',
      'public/classic/core/erp-view.js',
      'public/classic/core/invoice-view.js',
      'public/classic/core/pickup-billing.js',
      'public/classic/core/settings-extras.js',
      'public/classic/core/trash.js',
      'public/classic/modules/settings.js',
      'src/core/auth.js',
      'src/core/db.js',
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/(^|[^.\w])(window\.)?(confirm|prompt|alert)\(/m);
    }
  });
});
