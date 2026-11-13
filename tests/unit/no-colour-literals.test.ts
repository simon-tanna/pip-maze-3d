import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every colour comes from src/render/palette.json (ADR 0001). This scans the authored
 * TS, CSS, HTML and Python for colour literals: `#rgb`/`#rrggbb`/`#rrggbbaa`, 24-bit
 * `0xrrggbb`, `rgb()`/`hsl()`, and bare float RGB triples in Python.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const roots = ['src', 'blender/scripts', 'index.html'];
const scanned = new Set(['.ts', '.css', '.html', '.py']);

const patterns: { name: string; re: RegExp; only?: string }[] = [
  { name: 'hex colour', re: /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z_])/i },
  { name: '0xrrggbb', re: /\b0x[0-9a-f]{6}\b/i },
  { name: 'rgb()/hsl()', re: /\b(?:rgba?|hsla?)\(\s*[\d.]/i },
  {
    name: 'float RGB triple',
    re: /\(\s*[01]?\.\d+\s*,\s*[01]?\.\d+\s*,\s*[01]?\.\d+\s*[,)]/,
    only: '.py',
  },
];

function files(path: string): string[] {
  const abs = join(root, path);
  if (scanned.has(extname(abs))) return [abs];
  return readdirSync(abs, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && scanned.has(extname(d.name)))
    .map((d) => join(d.parentPath, d.name));
}

describe('colour literals', () => {
  it('appear nowhere outside palette.json', () => {
    const hits: string[] = [];
    for (const file of roots.flatMap(files)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const { name, re, only } of patterns) {
            if (only && extname(file) !== only) continue;
            if (re.test(line))
              hits.push(`${relative(root, file)}:${i + 1} ${name}: ${line.trim()}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
