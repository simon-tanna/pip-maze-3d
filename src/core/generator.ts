/**
 * Procedural level generator, ported from v2's `src/game/lib/generator.js`.
 *
 * Seed-identical to v2: for the same (levelIndex, seed) it returns the same map,
 * keys, traps, coins and exit, and `isFair` walks the same route. Proven against
 * `tests/fixtures/generator-baseline.json` (v2's own) and
 * `tests/fixtures/generator-coins-route.json` (written from v2 by
 * `scripts/make-generator-fixtures.mjs`). Every random draw goes through
 * `mulberry32`, in v2's order; never `Math.random`. Changing the order or count
 * of draws changes every level, so treat this file as a byte-for-byte port.
 *
 * Map tile values: 0 floor, 1 wall, 2 start, 3 chest. `map[row][col]`.
 */
import { tileKey } from './grid';

export type Rng = () => number;

/** A tile as `[col, row]`, the shape of v2's paths and routes. */
export type Tile = [col: number, row: number];

export interface GridTile {
  col: number;
  row: number;
}

export type TileMap = number[][];

export type StaticTrapType = 'flame' | 'blade' | 'spike';
export type TrapType = StaticTrapType | 'mummy';

export interface StaticTrap {
  type: StaticTrapType;
  col: number;
  row: number;
}

export interface MummyTrap {
  type: 'mummy';
  /** Spawn column, inside `patrolCols`. */
  col: number;
  row: number;
  /** Inclusive patrol span on `row`. */
  patrolCols: [number, number];
}

export type Trap = StaticTrap | MummyTrap;

export interface Level {
  map: TileMap;
  key: GridTile;
  /** Second key, on levels with index ≥ 3; otherwise null. */
  key2: GridTile | null;
  traps: Trap[];
  coins: GridTile[];
  exitCol: number;
  exitRow: number;
}

export interface LevelConfig {
  loopFactor: number;
  /** Flames, blades and spikes (60% on the critical route). */
  trapCount: number;
  /** Mummy patrols, placed in addition to trapCount. */
  mummies: number;
  /** Open 3×3 / 5×3 chambers merged into the maze. */
  rooms: number;
  trapTypes: readonly TrapType[];
  patrolRange: readonly [number, number];
  /** Preferred critical-route length in tiles (rejection sampling). */
  targetCrit: number;
  /** Preferred hazards per 10 critical-route tiles. */
  targetDensity: number;
}

export type Fairness = { fair: true; route: Tile[] } | { fair: false; reason: string };

export interface LevelMetrics {
  critLen: number;
  deadEndRatio: number;
  junctionRatio: number;
  roomTiles: number;
  hazardsOnCrit: number;
  hazardDensity: number;
  minRestGap: number;
  mummies: number;
}

export function mulberry32(seed: number): Rng {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Fisher-Yates in place, driven by rng. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = t;
  }
  return arr;
}

/**
 * Seed of level `i` in a run whose base seed is `base`: level 0 uses `base`
 * itself, so any v2 (0, seed) pair reproduces as-is; level i > 0 takes the i-th
 * uint32 drawn from `mulberry32(base ^ 0x9e3779b9)`.
 */
export function levelSeed(base: number, i: number): number {
  if (i === 0) return base;
  const rng = mulberry32(base ^ 0x9e3779b9);
  let s = 0;
  for (let n = 0; n < i; n++) s = (rng() * 4294967296) >>> 0;
  return s;
}

// Difficulty config for each of the 9 levels (index 0–8). Index ≥ 3 adds a
// second key, so level 4 eases off slightly to absorb the longer route.
export const LEVEL_CONFIGS: readonly LevelConfig[] = [
  {
    loopFactor: 0.3,
    trapCount: 10,
    mummies: 0,
    rooms: 2,
    trapTypes: ['flame', 'blade'],
    patrolRange: [3, 4],
    targetCrit: 50,
    targetDensity: 1.3,
  },
  {
    loopFactor: 0.26,
    trapCount: 13,
    mummies: 0,
    rooms: 2,
    trapTypes: ['flame', 'blade'],
    patrolRange: [3, 4],
    targetCrit: 54,
    targetDensity: 1.38,
  },
  {
    loopFactor: 0.22,
    trapCount: 15,
    mummies: 0,
    rooms: 3,
    trapTypes: ['flame', 'blade', 'spike'],
    patrolRange: [3, 4],
    targetCrit: 59,
    targetDensity: 1.45,
  },
  {
    loopFactor: 0.2,
    trapCount: 16,
    mummies: 0,
    rooms: 3,
    trapTypes: ['flame', 'blade', 'spike'],
    patrolRange: [3, 4],
    targetCrit: 63,
    targetDensity: 1.53,
  },
  {
    loopFactor: 0.17,
    trapCount: 17,
    mummies: 1,
    rooms: 3,
    trapTypes: ['flame', 'blade', 'spike', 'mummy'],
    patrolRange: [3, 4],
    targetCrit: 68,
    targetDensity: 1.6,
  },
  {
    loopFactor: 0.15,
    trapCount: 19,
    mummies: 2,
    rooms: 3,
    trapTypes: ['flame', 'blade', 'spike', 'mummy'],
    patrolRange: [3, 4],
    targetCrit: 72,
    targetDensity: 1.68,
  },
  {
    loopFactor: 0.13,
    trapCount: 21,
    mummies: 3,
    rooms: 4,
    trapTypes: ['flame', 'blade', 'spike', 'mummy'],
    patrolRange: [3, 4],
    targetCrit: 76,
    targetDensity: 1.75,
  },
  {
    loopFactor: 0.11,
    trapCount: 23,
    mummies: 4,
    rooms: 4,
    trapTypes: ['flame', 'blade', 'spike', 'mummy'],
    patrolRange: [4, 5],
    targetCrit: 81,
    targetDensity: 1.83,
  },
  {
    loopFactor: 0.1,
    trapCount: 25,
    mummies: 5,
    rooms: 4,
    trapTypes: ['flame', 'blade', 'spike', 'mummy'],
    patrolRange: [5, 6],
    targetCrit: 85,
    targetDensity: 1.9,
  },
];

/** No trap or patrol within this BFS distance of the start tile. */
export const SPAWN_SAFE_RADIUS = 2;
/** Minimum hazard-free tiles between two different hazards on the critical route. */
export const REST_GAP = 2;
/** Coins per chamber (inclusive), drawn from their own salted RNG so adding them never shifts the maze/trap stream. */
export const COIN_MIN = 2;
export const COIN_MAX = 5;
export const COIN_SALT = 0x9e3779b9;
/** Preferred minimum route-index gap between two coins. */
export const COIN_SPACING = 3;

/** v2's map size: every generated level is `MAP_COLS × MAP_ROWS` tiles. */
export const MAP_COLS = 40;
export const MAP_ROWS = 15;
const START: GridTile = { col: 1, row: 1 };

const DIRS: readonly Tile[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** Tile value at (col, row), or undefined off the map. */
const cell = (map: TileMap, col: number, row: number): number | undefined => map[row]?.[col];

function setCell(map: TileMap, col: number, row: number, value: number): void {
  const r = map[row];
  if (r) r[col] = value;
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range`);
  return v;
}

const keyOf = ([c, r]: Tile): string => tileKey(c, r);
const parseKey = (k: string): Tile => {
  const [c, r] = k.split(',').map(Number);
  return [c ?? 0, r ?? 0];
};

/**
 * BFS from (startCol, startRow) to (endCol, endRow), or null. Flat typed arrays
 * and a head index; neighbour order N, S, W, E (this order fixes the path).
 */
export function bfsPath(
  map: TileMap,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  blocked: ReadonlySet<string> | null = null,
): Tile[] | null {
  const rows = map.length;
  const cols = at(map, 0).length;
  const parent = new Int32Array(rows * cols).fill(-2);
  const queue = new Int32Array(rows * cols);
  const start = startRow * cols + startCol;
  const goal = endRow * cols + endCol;
  let head = 0;
  let tail = 0;
  parent[start] = -1;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++] as number;
    if (cur === goal) {
      const path: Tile[] = [];
      for (let i = cur; i !== -1; i = parent[i] as number) path.push([i % cols, (i / cols) | 0]);
      return path.reverse();
    }
    const col = cur % cols;
    const row = (cur / cols) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const next = nr * cols + nc;
      if (parent[next] !== -2) continue;
      if (cell(map, nc, nr) === 1) continue;
      if (blocked && next !== goal && blocked.has(tileKey(nc, nr))) continue;
      parent[next] = cur;
      queue[tail++] = next;
    }
  }
  return null;
}

/** Floor tiles within `radius` BFS steps of `from`, as `tileKey` strings. */
export function tilesWithin(map: TileMap, from: GridTile, radius: number): Set<string> {
  const seen = new Set([tileKey(from.col, from.row)]);
  let frontier: Tile[] = [[from.col, from.row]];
  for (let d = 0; d < radius; d++) {
    const next: Tile[] = [];
    for (const [c, r] of frontier) {
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        const k = tileKey(nc, nr);
        const v = cell(map, nc, nr);
        if (seen.has(k) || v === undefined || v === 1) continue;
        seen.add(k);
        next.push([nc, nr]);
      }
    }
    frontier = next;
  }
  return seen;
}

/** A true east-west corridor: walls above and below, floor to one side. */
function isHorizontalCorridor(map: TileMap, col: number, row: number): boolean {
  const walled = cell(map, col, row - 1) === 1 && cell(map, col, row + 1) === 1;
  const left = col > 0 && cell(map, col - 1, row) !== 1;
  const right = col < at(map, 0).length - 1 && cell(map, col + 1, row) !== 1;
  return walled && (left || right);
}

function reachableFloors(map: TileMap, blocked: ReadonlySet<string>): Tile[] {
  const rows = map.length;
  const cols = at(map, 0).length;
  const visited = new Set(['1,1']);
  const queue: Tile[] = [[1, 1]];
  const floors: Tile[] = [];
  for (let head = 0; head < queue.length; head++) {
    const [col, row] = at(queue, head);
    if (!blocked.has(tileKey(col, row))) floors.push([col, row]);
    for (const [dc, dr] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      const k = tileKey(nc, nr);
      if (visited.has(k)) continue;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (cell(map, nc, nr) === 1) continue;
      visited.add(k);
      queue.push([nc, nr]);
    }
  }
  return floors;
}

function floorNeighbourCount(map: TileMap, r: number, c: number): number {
  let count = 0;
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < map.length && nc >= 0 && nc < at(map, 0).length && cell(map, nc, nr) !== 1)
      count++;
  }
  return count;
}

interface Run {
  row: number;
  start: number;
  end: number;
}

/** Maximal horizontal floor runs of at least minLen tiles: mummy patrol candidates. */
function horizontalRuns(map: TileMap, minLen: number): Run[] {
  const runs: Run[] = [];
  const cols = at(map, 0).length;
  for (let r = 1; r < map.length - 1; r++) {
    let start = -1;
    for (let c = 1; c < cols; c++) {
      const open = c < cols - 1 && cell(map, c, r) !== 1;
      if (open && start < 0) start = c;
      if (!open && start >= 0) {
        if (c - start >= minLen) runs.push({ row: r, start, end: c - 1 });
        start = -1;
      }
    }
  }
  return runs;
}

function patrolTiles(traps: readonly Trap[]): Set<string> {
  const tiles = new Set<string>();
  for (const t of traps) {
    if (t.type !== 'mummy') continue;
    for (let c = t.patrolCols[0]; c <= t.patrolCols[1]; c++) tiles.add(tileKey(c, t.row));
  }
  return tiles;
}

function hazardTiles(traps: readonly Trap[]): Set<string> {
  return new Set(traps.filter((t) => t.type !== 'mummy').map((t) => tileKey(t.col, t.row)));
}

type LevelStops = Pick<Level, 'key' | 'key2' | 'exitCol' | 'exitRow'>;

function levelStops(level: LevelStops): GridTile[] {
  return [
    START,
    level.key,
    ...(level.key2 ? [level.key2] : []),
    { col: level.exitCol, row: level.exitRow },
  ];
}

/**
 * Ordered start → key (→ key2) → exit walk that avoids `blocked`, or null when
 * a leg is cut off. Dead-end detours appear twice (in and back out).
 */
export function safeRoute(
  map: TileMap,
  stops: readonly GridTile[],
  blocked: ReadonlySet<string> | null = null,
): Tile[] | null {
  const route: Tile[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = at(stops, i);
    const b = at(stops, i + 1);
    const leg = bfsPath(map, a.col, a.row, b.col, b.row, blocked);
    if (!leg) return null;
    route.push(...(i === 0 ? leg : leg.slice(1)));
  }
  return route;
}

/**
 * Fewest hazard-free tiles between two different hazards along the route
 * (Infinity with fewer than two). Re-crossing the same trap doesn't count.
 */
function minRestGap(route: readonly Tile[], hazards: ReadonlySet<string>): number {
  let min = Infinity;
  let last = -1;
  route.forEach((t, i) => {
    const k = keyOf(t);
    if (!hazards.has(k)) return;
    if (last >= 0 && keyOf(at(route, last)) !== k) min = Math.min(min, i - last - 1);
    last = i;
  });
  return min;
}

/**
 * Fairness rules every shipped level must pass:
 *  - a start → key (→ key2) → chest route exists around every mummy patrol
 *    (flames, spikes and blades are timed, so they count as passable)
 *  - nothing dangerous within SPAWN_SAFE_RADIUS of the start
 *  - keys, coins and the chest never sit under a hazard
 *  - at least REST_GAP safe tiles between hazards on that route
 */
export function isFair(
  level: Pick<Level, 'map' | 'traps' | 'key' | 'key2' | 'exitCol' | 'exitRow'> & {
    coins?: readonly GridTile[];
  },
): Fairness {
  const { map, traps } = level;
  const stops = levelStops(level);
  const patrol = patrolTiles(traps);
  const hazards = hazardTiles(traps);
  for (const k of tilesWithin(map, START, SPAWN_SAFE_RADIUS)) {
    if (patrol.has(k) || hazards.has(k)) return { fair: false, reason: 'hazard in the spawn zone' };
  }
  for (const s of stops.slice(1)) {
    const k = tileKey(s.col, s.row);
    if (patrol.has(k) || hazards.has(k))
      return { fair: false, reason: 'key or chest under a hazard' };
  }
  for (const c of level.coins ?? []) {
    const k = tileKey(c.col, c.row);
    if (patrol.has(k) || hazards.has(k)) return { fair: false, reason: 'coin under a hazard' };
  }
  const route = safeRoute(map, stops, patrol);
  if (!route) return { fair: false, reason: 'route cut off by a mummy patrol' };
  const gap = minRestGap(route, hazards);
  if (gap < REST_GAP) return { fair: false, reason: `only ${gap} rest tile(s) between hazards` };
  return { fair: true, route };
}

/** Quality metrics used for rejection sampling (and v2's dev audit). */
export function measureLevel(level: Omit<Level, 'coins'>): LevelMetrics {
  const { map, traps } = level;
  const rows = map.length;
  const cols = at(map, 0).length;
  const hazards = hazardTiles(traps);
  const route = safeRoute(map, levelStops(level), patrolTiles(traps)) ?? [];
  const routeSet = new Set(route.map(keyOf));
  const open = (r: number, c: number) => cell(map, c, r) !== 1;
  let floors = 0;
  let deadEnds = 0;
  let junctions = 0;
  const roomTiles = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!open(r, c)) continue;
      floors++;
      const n = floorNeighbourCount(map, r, c);
      if (n === 1) deadEnds++;
      if (n >= 3) junctions++;
      if (r + 1 < rows && c + 1 < cols && open(r, c + 1) && open(r + 1, c) && open(r + 1, c + 1)) {
        for (const t of [
          [c, r],
          [c + 1, r],
          [c, r + 1],
          [c + 1, r + 1],
        ] as Tile[])
          roomTiles.add(keyOf(t));
      }
    }
  }
  const hazardsOnCrit = [...routeSet].filter((k) => hazards.has(k)).length;
  return {
    critLen: routeSet.size,
    deadEndRatio: deadEnds / floors,
    junctionRatio: junctions / floors,
    roomTiles: roomTiles.size,
    hazardsOnCrit,
    hazardDensity: routeSet.size ? (hazardsOnCrit * 10) / routeSet.size : 0,
    minRestGap: minRestGap(route, hazards),
    mummies: traps.filter((t) => t.type === 'mummy').length,
  };
}

/** Lower is better: distance from the level's targets; a missing mummy outweighs any length or density miss. */
function scoreLevel(m: LevelMetrics, config: LevelConfig): number {
  const crit = (m.critLen - config.targetCrit) / config.targetCrit;
  const density = (m.hazardDensity - config.targetDensity) / config.targetDensity;
  const short = config.mummies - m.mummies;
  return crit * crit + density * density + 4 * short * short;
}

interface Room {
  cx: number;
  cr: number;
  w: number;
  h: number;
}

function generateOnce(levelIndex: number, seed: number, config: LevelConfig): Level | null {
  const rng = mulberry32(seed);

  const map: TileMap = Array.from({ length: MAP_ROWS }, () => Array<number>(MAP_COLS).fill(1));
  setCell(map, 1, 1, 2);

  const CELL_COLS = 19;
  const CELL_ROWS = 7;
  const visited = Array.from({ length: CELL_ROWS }, () => Array<boolean>(CELL_COLS).fill(false));

  function carveDFS(cx: number, cr: number): void {
    const vr = visited[cr];
    if (vr) vr[cx] = true;
    const col = 1 + 2 * cx;
    const row = 1 + 2 * cr;
    setCell(map, col, row, col === 1 && row === 1 ? 2 : 0);

    const dirs = shuffle<Tile>(rng, [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]);
    for (const [dcx, dcr] of dirs) {
      const nx = cx + dcx;
      const nr = cr + dcr;
      if (nx < 0 || nx >= CELL_COLS || nr < 0 || nr >= CELL_ROWS) continue;
      if (visited[nr]?.[nx]) continue;
      setCell(map, col + dcx, row + dcr, 0);
      carveDFS(nx, nr);
    }
  }

  carveDFS(0, 0);

  // Rooms: open up 2×2 or 3×2 blocks of cells (3×3 / 5×3 tiles) after the
  // carve, so connectivity is already guaranteed. A one-cell gap keeps rooms
  // apart and the spawn stays a corridor.
  const rooms: Room[] = [];
  for (let tries = 0; rooms.length < config.rooms && tries < 40; tries++) {
    const w = rng() < 0.5 ? 2 : 3;
    const h = 2;
    const cx = randInt(rng, 0, CELL_COLS - w);
    const cr = randInt(rng, 0, CELL_ROWS - h);
    if (cx < 2 && cr < 2) continue;
    if (rooms.some((o) => cx <= o.cx + o.w && o.cx <= cx + w && cr <= o.cr + o.h && o.cr <= cr + h))
      continue;
    rooms.push({ cx, cr, w, h });
    for (let r = 1 + 2 * cr; r <= 1 + 2 * (cr + h - 1); r++) {
      for (let c = 1 + 2 * cx; c <= 1 + 2 * (cx + w - 1); c++) setCell(map, c, r, 0);
    }
  }

  const exitCandidates: Tile[] = [];
  for (let r = 1; r <= 13; r++) {
    for (let c = 35; c <= 37; c++) {
      if (cell(map, c, r) === 0) exitCandidates.push([c, r]);
    }
  }
  shuffle(rng, exitCandidates);
  const exit = exitCandidates.find(([c, r]) => bfsPath(map, 1, 1, c, r) !== null);
  if (!exit) return null;
  const [exitCol, exitRow] = exit;
  setCell(map, exitCol, exitRow, 3);

  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (cell(map, c, r) !== 1) continue;
      if ((r % 2 === 0) === (c % 2 === 0)) continue;
      const isHoriz = r % 2 === 1;
      const n1r = r + (isHoriz ? 0 : -1);
      const n1c = c + (isHoriz ? -1 : 0);
      const n2r = r + (isHoriz ? 0 : 1);
      const n2c = c + (isHoriz ? 1 : 0);
      if (n1r < 0 || n2r >= MAP_ROWS || n1c < 0 || n2c >= MAP_COLS) continue;
      if (cell(map, n1c, n1r) !== 1 && cell(map, n2c, n2r) !== 1) {
        const isDead =
          floorNeighbourCount(map, n1r, n1c) === 1 || floorNeighbourCount(map, n2r, n2c) === 1;
        if (isDead) {
          rng();
          continue;
        }
        if (rng() < config.loopFactor) setCell(map, c, r, 0);
      }
    }
  }

  const path = bfsPath(map, 1, 1, exitCol, exitRow);
  if (!path) return null;

  const [keyCol, keyRow] = at(path, Math.floor(path.length * 0.4));
  const key: GridTile = { col: keyCol, row: keyRow };

  let key2: GridTile | null = null;
  if (levelIndex >= 3) {
    const [key2Col, key2Row] = at(path, Math.floor(path.length * 0.7));
    key2 = { col: key2Col, row: key2Row };
  }

  const stops = [START, key, ...(key2 ? [key2] : []), { col: exitCol, row: exitRow }];
  const traps: Trap[] = [];
  // Tiles no trap may use: the spawn zone, keys and the chest.
  const occupied = new Set([
    ...tilesWithin(map, START, SPAWN_SAFE_RADIUS),
    ...stops.map((s) => tileKey(s.col, s.row)),
  ]);

  // Mummies first: they need open runs, and each patrol must leave a way round.
  const patrol = new Set<string>();
  const patrolMargin = new Set<string>();
  const [minPatrol, maxPatrol] = config.patrolRange;
  const runs = shuffle(rng, horizontalRuns(map, 3));
  for (const run of runs) {
    if (traps.length >= config.mummies) break;
    const span = Math.min(run.end - run.start + 1, randInt(rng, minPatrol, maxPatrol));
    const patrolStart = randInt(rng, run.start, run.end - span + 1);
    const patrolEnd = patrolStart + span - 1;
    const tiles: string[] = [];
    for (let c = patrolStart; c <= patrolEnd; c++) tiles.push(tileKey(c, run.row));
    if (tiles.some((k) => occupied.has(k) || patrolMargin.has(k))) continue;
    if (!safeRoute(map, stops, new Set([...patrol, ...tiles]))) continue;
    traps.push({
      type: 'mummy',
      col: randInt(rng, patrolStart, patrolEnd),
      row: run.row,
      patrolCols: [patrolStart, patrolEnd],
    });
    for (const k of tiles) {
      patrol.add(k);
      occupied.add(k);
    }
    for (let r = run.row - 1; r <= run.row + 1; r++) {
      for (let c = patrolStart - 1; c <= patrolEnd + 1; c++) patrolMargin.add(tileKey(c, r));
    }
  }

  // Static traps go along the route the player will actually walk.
  const route = safeRoute(map, stops, patrol);
  if (!route) return null;
  const routeSet = new Set(route.map(keyOf));
  const visits = new Map<string, number[]>();
  route.forEach((t, i) => {
    const k = keyOf(t);
    const v = visits.get(k);
    if (v) v.push(i);
    else visits.set(k, [i]);
  });
  const visitsOf = (k: string): number[] => visits.get(k) ?? [];

  const nonMummyTypes = config.trapTypes.filter((t): t is StaticTrapType => t !== 'mummy');
  const pickType = (c: number, r: number): StaticTrapType => {
    const type = at(nonMummyTypes, Math.floor(rng() * nonMummyTypes.length));
    return type === 'blade' && !isHorizontalCorridor(map, c, r) ? 'flame' : type;
  };
  const hazards = new Set<string>();
  const addTrap = ([c, r]: Tile): void => {
    const k = tileKey(c, r);
    traps.push({ type: pickType(c, r), col: c, row: r });
    occupied.add(k);
    hazards.add(k);
  };
  // Every visit to tile k keeps REST_GAP clear tiles to the next hazard.
  const hasRest = (k: string): boolean =>
    visitsOf(k).every((i) => {
      for (let g = -REST_GAP; g <= REST_GAP; g++) {
        const j = i + g;
        if (g === 0 || j < 0 || j >= route.length) continue;
        const nk = keyOf(at(route, j));
        if (nk !== k && hazards.has(nk)) return false;
      }
      return true;
    });

  const regularCount = config.trapCount;
  const onPathCount = Math.round(regularCount * 0.6);
  const offPathCount = regularCount - onPathCount;

  const onPath = shuffle(
    rng,
    [...visits.keys()].filter((k) => !occupied.has(k)),
  );
  let placed = 0;
  for (const k of onPath) {
    if (placed >= onPathCount) break;
    if (!hasRest(k)) continue;
    addTrap(parseKey(k));
    placed++;
  }

  const offPath = shuffle(
    rng,
    reachableFloors(map, new Set([...occupied, ...routeSet])).filter(
      ([c, r]) => cell(map, c, r) === 0,
    ),
  );
  offPath.slice(0, offPathCount).forEach(addTrap);

  const placedTypes = new Set(traps.filter((t) => t.type !== 'mummy').map((t) => t.type));
  for (const requiredType of nonMummyTypes) {
    if (placedTypes.has(requiredType)) continue;
    const spots = reachableFloors(map, new Set([...occupied, ...routeSet])).filter(
      ([c, r]) =>
        cell(map, c, r) === 0 && (requiredType !== 'blade' || isHorizontalCorridor(map, c, r)),
    );
    if (spots.length === 0) continue;
    const [c, r] = at(spots, Math.floor(rng() * spots.length));
    traps.push({ type: requiredType, col: c, row: r });
    occupied.add(tileKey(c, r));
    placedTypes.add(requiredType);
  }

  // Coins sit on free route tiles, spread out first, then topped up.
  const coinRng = mulberry32((seed ^ COIN_SALT) >>> 0);
  const firstVisit = (k: string): number => at(visitsOf(k), 0);
  const coinSpots = shuffle(
    coinRng,
    [...visits.keys()].filter((k) => {
      const [c, r] = parseKey(k);
      return cell(map, c, r) === 0 && !occupied.has(k);
    }),
  );
  if (coinSpots.length < COIN_MIN) return null;
  const coinCount = randInt(coinRng, COIN_MIN, COIN_MAX);
  const picked: string[] = [];
  for (const k of coinSpots) {
    if (picked.length >= coinCount) break;
    if (picked.every((p) => Math.abs(firstVisit(p) - firstVisit(k)) >= COIN_SPACING))
      picked.push(k);
  }
  for (const k of coinSpots) {
    if (picked.length >= coinCount) break;
    if (!picked.includes(k)) picked.push(k);
  }
  const coins = picked.map((k): GridTile => {
    const [col, row] = parseKey(k);
    return { col, row };
  });

  return { map, key, key2, traps, coins, exitCol, exitRow };
}

const CANDIDATES = 6;
const MAX_ATTEMPTS = 30;

/**
 * Level `levelIndex` (0–8) for `seed`. Rejection sampling: builds several fair
 * candidates from consecutive seeds and keeps the one closest to the level's
 * targets. Pure and deterministic per (levelIndex, seed).
 */
export function generateLevel(levelIndex: number, seed: number): Level {
  const config = at(LEVEL_CONFIGS, levelIndex);
  let best: Level | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (best && attempt >= CANDIDATES) break;
    const level = generateOnce(levelIndex, seed + attempt, config);
    if (!level || !isFair(level).fair) continue;
    const score = scoreLevel(measureLevel(level), config);
    if (score < bestScore) {
      best = level;
      bestScore = score;
    }
  }
  if (best) return best;

  const widerConfig = { ...config, loopFactor: Math.min(config.loopFactor * 2, 0.5) };
  const fallback =
    generateOnce(levelIndex, seed + MAX_ATTEMPTS, widerConfig) ??
    generateOnce(0, seed, at(LEVEL_CONFIGS, 0));
  // v2 would return null here; no seed has ever reached it.
  if (!fallback) throw new Error(`generateLevel(${levelIndex}, ${seed}): no level could be built`);
  return fallback;
}

/** Lightweight multiplicative hash RNG for per-tile variation (hazard phases, decor). */
export function tileRng(seed: number, col: number, row: number): Rng {
  let h = (seed ^ (col * 2654435761) ^ (row * 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return h / 0x100000000;
  };
}

/**
 * Tiles on the start → key (→ key2) → exit route, as `tileKey` strings. Keeps
 * decor and other clutter off the path the player must read.
 */
export function criticalPath(
  map: TileMap,
  start: GridTile,
  key: GridTile,
  key2: GridTile | null,
  exit: GridTile,
): Set<string> {
  const stops = [start, key, ...(key2 ? [key2] : []), exit];
  const tiles = new Set<string>();
  for (let i = 0; i < stops.length - 1; i++) {
    const a = at(stops, i);
    const b = at(stops, i + 1);
    const leg = bfsPath(map, a.col, a.row, b.col, b.row);
    if (leg) for (const t of leg) tiles.add(keyOf(t));
  }
  return tiles;
}
