/**
 * Which level a run starts on, and with what seed (spec: Scope and run → Seeds).
 *
 * `?seed=S&level=i` pins a run: level i is generated with S as its own seed, so any v2
 * (index, seed) pair reproduces as-is, and S is the run's base seed for later levels.
 * Without params, the caller draws a base seed (`crypto.getRandomValues` in the browser).
 * Invalid input warns and falls back to an unpinned level 0. Never `Math.random`.
 */
import { levelSeed } from './generator';

/** Levels the slice plays (`LEVEL_CONFIGS[0..1]`). */
export const SLICE_LEVELS = 2;

export interface RunStart {
  /** The run's base seed. */
  base: number;
  /** Level the run starts on. */
  level: number;
  /** That level's seed. */
  seed: number;
  /** True when `?seed=` pinned the run. */
  pinned: boolean;
  /** Why URL input was ignored, if it was. */
  warnings: string[];
}

interface Params {
  get(name: string): string | null;
}

const UINT32_MAX = 0xffffffff;

function parseSeed(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n <= UINT32_MAX ? n : null;
}

function parseLevel(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n < SLICE_LEVELS ? n : null;
}

export function resolveRun(params: Params, drawSeed: () => number): RunStart {
  const rawSeed = params.get('seed');
  const rawLevel = params.get('level');
  const seed = rawSeed === null ? null : parseSeed(rawSeed);
  const level = rawLevel === null ? 0 : parseLevel(rawLevel);

  const warnings: string[] = [];
  if (rawSeed !== null && seed === null) {
    warnings.push(`seed=${JSON.stringify(rawSeed)} is not a decimal uint32; using a random seed`);
  } else if (level === null) {
    warnings.push(`level=${JSON.stringify(rawLevel)} must be 0–${SLICE_LEVELS - 1}; using level 0`);
  }

  if (warnings.length === 0 && seed !== null && level !== null) {
    return { base: seed, level, seed, pinned: true, warnings };
  }
  const base = drawSeed() >>> 0;
  const start = warnings.length === 0 && level !== null ? level : 0;
  return { base, level: start, seed: levelSeed(base, start), pinned: false, warnings };
}

/** Seed of level `i` in this run: the pinned level keeps S, every other uses `levelSeed`. */
export function seedForLevel(run: RunStart, i: number): number {
  return run.pinned && i === run.level ? run.seed : levelSeed(run.base, i);
}
