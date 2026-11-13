// Writes tests/fixtures/generator-coins-route.json from pip-maze-v-2's own generator.
//
// v2's generator-baseline.json predates coins: it pins map, keys, traps and the exit only.
// This second fixture pins what the baseline can't, coin positions and the isFair route,
// for the same 72 (index, seed) pairs, so the TS port is proven against v2 field for field.
// v2 is read, never modified.
//
// Usage: node scripts/make-generator-fixtures.mjs [path/to/pip-maze-v-2]
//   (defaults to ../pip-maze-v-2, relative to the current directory)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const v2Root = resolve(process.argv[2] ?? '../pip-maze-v-2');
const { generateLevel, isFair } = await import(
  pathToFileURL(resolve(v2Root, 'src/game/lib/generator.js')).href
);

const baselineUrl = new URL('../tests/fixtures/generator-baseline.json', import.meta.url);
const baseline = JSON.parse(readFileSync(baselineUrl, 'utf8'));

const out = baseline.map(({ i, seed }) => {
  const level = generateLevel(i, seed);
  const fair = isFair(level);
  if (!fair.fair) throw new Error(`v2 level ${i} seed ${seed} is not fair: ${fair.reason}`);
  return { i, seed, coins: level.coins, route: fair.route };
});

const outUrl = new URL('../tests/fixtures/generator-coins-route.json', import.meta.url);
writeFileSync(outUrl, JSON.stringify(out));
console.log(`wrote ${out.length} entries from ${v2Root}`);
