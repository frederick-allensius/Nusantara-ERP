// ═══════════════════════════════════════════════════════════════════════════════
// The hosting CSP (script-src 'self') blocks inline event handlers: a button
// rendered with onclick="…" does nothing in production. All UI code wires
// events through data-action delegation or addEventListener instead.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function jsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      return jsFiles(p);
    }
    return p.endsWith('.js') ? [p] : [];
  });
}

describe('no inline event handlers in rendered markup', () => {
  it('public/classic and src use delegation, not on*="…" attributes', () => {
    const offenders: string[] = [];
    [join(ROOT, 'public', 'classic'), join(ROOT, 'src')].forEach(dir => {
      jsFiles(dir).forEach(file => {
        readFileSync(file, 'utf-8')
          .split('\n')
          .forEach((line, i) => {
            if (
              /\son(click|change|input|submit|mouseover|mouseout|keydown|keyup|load)=["'`]/i.test(
                line
              )
            ) {
              offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
            }
          });
      });
    });
    expect(offenders).toEqual([]);
  });
});
