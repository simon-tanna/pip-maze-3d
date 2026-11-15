/**
 * Gold pickups (ticket 14, spec Render → Pickups): the `pickups.glb` key, coin, chest and
 * chest lid, drawn from what the simulation says stands in the level (`update`).
 *
 * - Keys and coins float `look.pickups.floatHeight` up, bob `bobAmplitude` over `bobMs`
 *   (sine yoyo) and turn: keys once every `keyTurnMs`, coins every `coinTurnMs` from a
 *   phase drawn from the level seed (a render-local `mulberry32`, never `Math.random`).
 * - The chest's emissive pulses over `chestPulseMs` (yoyo). `openChest(at)` plays the
 *   moment: squash → stretch → settle, the lid swinging open, an emissive burst and a
 *   camera shake (`shake(t)`, which the camera rig adds).
 * - `keyAppeared(index, at)` (reveal and `keyLost` respawn) grows the key from
 *   `keyAppearFrom` over `keyAppearMs` (Back-out).
 * - Under reduced motion: no bob, no turn and no shake (`motion()` and `shake()` report it).
 *   That is all the spec's Reduced motion list (exhaustive) asks of pickups: the chest's
 *   squash, lid swing and burst, and the key fade-in, still play.
 *
 * Everything runs on the simulation time it is given, so pause and advance replay it.
 * Glow is GOLD_LIGHT emissive + bloom and an additive floor decal under each pickup: no
 * lights. Geometry and materials are shared across levels (GLB nodes, module decals).
 */
import {
  AdditiveBlending,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import type { MeshStandardMaterial } from 'three';
import type { Gltf } from '@assets/models';
import type { GridTile } from '@core/generator';
import { mulberry32 } from '@core/generator';
import { tileToWorld } from '@core/grid';
import { look } from './look';
import { color } from './palette';

/** The pickups GLB under public/models (built by blender/scripts/build_pickups.py). */
export const PICKUPS_MODEL = 'pickups';
/** Its nodes, the contract with build_pickups.py (tests/unit/pickups-glb.test.ts). */
export const PICKUP_NODES = ['key', 'coin', 'chest', 'chest_lid'] as const;
/** Modelled sizes, m (mirrored in build_pickups.py). */
export const KEY_LENGTH = 0.6;
export const COIN_DIAMETER = 0.4;
export const CHEST_WIDTH = 1.2;
export const CHEST_HEIGHT = 0.6;
/** The lid's hinge in the chest's frame: the body's back (north) top edge. */
export const LID_HINGE = { y: CHEST_HEIGHT, z: -0.4 } as const;

/** Above the floor, its contact strip (0.01 m) and the hero's blob (0.015 m). */
const GLOW_LIFT = 0.02;
/** Salt for the coin-phase RNG, so it never repeats the generator's own stream. */
const COIN_PHASE_SALT = 0x5eed_c011;

export interface PickupsLayout {
  coins: readonly GridTile[];
  key: GridTile;
  key2: GridTile | null;
  exitCol: number;
  exitRow: number;
}

export interface PickupsState {
  coinVisible(index: number): boolean;
  keyVisible(index: number): boolean;
}

/** What the bob and turn are doing now (0 under reduced motion), for e2e and the panel. */
export interface PickupMotion {
  /** Bob travel, m. */
  bobAmplitude: number;
  /** Key turns per second. */
  turnRate: number;
}

export interface PickupsView {
  readonly group: Group;
  /** Build a level's pickups, replacing the last level's. `seed` seeds the coin phases. */
  build(layout: PickupsLayout, seed: number): void;
  /** Draw `state` at simulation time `timeMs`. */
  update(state: PickupsState, timeMs: number): void;
  /** `chestOpened` at simulation time `atMs`: the opening moment starts. */
  openChest(atMs: number): void;
  /** Key `index` appeared at `atMs` (revealed, or back after `keyLost`): it fades in. */
  keyAppeared(index: number, atMs: number): void;
  /** The chest-open camera shake at `timeMs`, m (screen x, y). Zero under reduced motion. */
  shake(timeMs: number): { x: number; y: number };
  motion(): PickupMotion;
  /** Drop this level's pickups. Geometry and materials are shared, so nothing is disposed. */
  teardown(): void;
}

export interface PickupsOptions {
  reducedMotion(): boolean;
}

/** Sine yoyo: 0 → 1 over `legMs`, back to 0 over the next `legMs`. */
const yoyo = (t: number, legMs: number) => (1 - Math.cos((Math.PI * t) / legMs)) / 2;
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const easeInOutSine = (u: number) => (1 - Math.cos(Math.PI * u)) / 2;
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeOutBack = (u: number) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (u - 1) ** 3 + c1 * (u - 1) ** 2;
};

/** Chest scale `[horizontal, vertical]` at `dt` ms into the opening. */
function squash(dt: number): [number, number] {
  const p = look.pickups;
  const legs: [ms: number, to: [number, number]][] = [
    [p.squashMs, [p.squashWide, p.squashLow]],
    [p.stretchMs, [p.stretchNarrow, p.stretchTall]],
    [p.settleMs, [1, 1]],
  ];
  let from: [number, number] = [1, 1];
  let t = dt;
  for (const [ms, to] of legs) {
    if (t < ms) {
      const e = easeInOutSine(clamp01(t / ms));
      return [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
    }
    t -= ms;
    from = to;
  }
  return [1, 1];
}

/** A white radial falloff `(1 − r)^falloff` in RGB, mipmapped (the additive decal's map). */
function glowTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  const texture = new DataTexture(data, size, size);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  const c = (size - 1) / 2;
  let painted: number | null = null;
  const paint = (falloff: number) => {
    if (falloff === painted) return;
    painted = falloff;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = Math.round(255 * Math.max(0, 1 - Math.hypot(x - c, y - c) / c) ** falloff);
        data.set([a, a, a, 255], (y * size + x) * 4);
      }
    }
    texture.needsUpdate = true;
  };
  paint(look.pickups.glowFalloff);
  return { texture, paint };
}

const glowMap = glowTexture();
const glowMaterial = (opacity: number) =>
  new MeshBasicMaterial({
    color: color('GOLD_LIGHT'),
    map: glowMap.texture,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
const GLOW = glowMaterial(look.pickups.glowOpacity);
const CHEST_GLOW = glowMaterial(look.pickups.chestGlowOpacity);
const DECAL = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export function createPickupsView(kit: Gltf, opts: PickupsOptions): PickupsView {
  const group = new Group();
  group.name = 'pickups';
  const node = (name: (typeof PICKUP_NODES)[number]) => kit.getNode(name);
  const key = node('key');
  const coin = node('coin');
  const chestNode = node('chest');
  const lidNode = node('chest_lid');
  const gold = key.material as MeshStandardMaterial;
  const chestGold = chestNode.material as MeshStandardMaterial;
  // Emissive intensity is absolute: the GLB's GOLD_LIGHT × strength becomes GOLD_LIGHT.
  gold.emissive = color('GOLD_LIGHT');
  chestGold.emissive = color('GOLD_LIGHT');

  interface Floater {
    mesh: Mesh;
    glow: Mesh;
    /** Fraction of a turn at t = 0 (coins only). */
    phase: number;
    /** When it last appeared (keys), simulation ms; null: it stands from the build. */
    appearedAt: number | null;
  }
  let coins: Floater[] = [];
  let keys: Floater[] = [];
  let chest: Mesh | null = null;
  let chestGlow: Mesh | null = null;
  let lid: Mesh | null = null;
  let openedAt: number | null = null;

  const still = () => opts.reducedMotion();
  const glowAt = (tile: GridTile, material: MeshBasicMaterial, name: string) => {
    const g = new Mesh(DECAL, material);
    const { x, z } = tileToWorld(tile.col, tile.row);
    g.position.set(x, GLOW_LIFT, z);
    g.name = `${name}_glow`;
    g.renderOrder = 1;
    return g;
  };
  const floater = (n: typeof key, tile: GridTile, name: string, phase: number): Floater => {
    const mesh = new Mesh(n.geometry, n.material);
    const { x, z } = tileToWorld(tile.col, tile.row);
    mesh.position.set(x, look.pickups.floatHeight, z);
    mesh.name = name;
    mesh.castShadow = true;
    return { mesh, glow: glowAt(tile, GLOW, name), phase, appearedAt: null };
  };

  const self: PickupsView = {
    group,
    build(layout, seed) {
      self.teardown();
      const rng = mulberry32((seed ^ COIN_PHASE_SALT) >>> 0);
      coins = layout.coins.map((tile, i) => floater(coin, tile, `coin_${i}`, rng()));
      keys = [layout.key, ...(layout.key2 ? [layout.key2] : [])].map((tile, i) =>
        floater(key, tile, `key_${i}`, 0),
      );
      const exit = { col: layout.exitCol, row: layout.exitRow };
      chest = new Mesh(chestNode.geometry, chestNode.material);
      const { x, z } = tileToWorld(exit.col, exit.row);
      chest.position.set(x, 0, z);
      chest.name = 'chest';
      chest.castShadow = true;
      chest.receiveShadow = true;
      lid = new Mesh(lidNode.geometry, lidNode.material);
      lid.name = 'chest_lid';
      lid.position.set(0, LID_HINGE.y, LID_HINGE.z);
      lid.castShadow = true;
      chest.add(lid);
      chestGlow = glowAt(exit, CHEST_GLOW, 'chest');
      for (const f of [...coins, ...keys]) group.add(f.mesh, f.glow);
      group.add(chest, chestGlow);
    },
    openChest(atMs) {
      openedAt = atMs;
    },
    keyAppeared(index, atMs) {
      const k = keys[index];
      if (k) k.appearedAt = atMs;
    },
    shake(timeMs) {
      const p = look.pickups;
      if (still() || openedAt === null) return { x: 0, y: 0 };
      const dt = timeMs - openedAt;
      if (dt < 0 || dt >= p.shakeMs) return { x: 0, y: 0 };
      const u = dt / p.shakeMs;
      const a = p.shakeAmplitude * (1 - u);
      return { x: a * Math.sin(u * Math.PI * 8), y: a * Math.cos(u * Math.PI * 6) };
    },
    motion() {
      const p = look.pickups;
      if (still()) return { bobAmplitude: 0, turnRate: 0 };
      return { bobAmplitude: p.bobAmplitude, turnRate: p.keyTurnMs > 0 ? 1000 / p.keyTurnMs : 0 };
    },
    teardown() {
      group.clear();
      coins = [];
      keys = [];
      chest = chestGlow = lid = null;
      openedAt = null;
    },
    update(state, timeMs) {
      const p = look.pickups;
      const { bobAmplitude } = self.motion();
      const moving = !still();
      gold.metalness = chestGold.metalness = p.goldMetalness;
      gold.roughness = p.goldRoughness;
      chestGold.roughness = p.chestRoughness;
      gold.emissiveIntensity = p.goldEmissive;
      GLOW.opacity = p.glowOpacity;
      glowMap.paint(p.glowFalloff);

      const tilt = (-p.tiltDeg * Math.PI) / 180;
      const y = p.floatHeight + bobAmplitude * yoyo(timeMs, p.bobMs);
      const turn = (ms: number, phase: number) =>
        moving && ms > 0 ? 2 * Math.PI * (timeMs / ms + phase) : 0;
      coins.forEach((c, i) => {
        c.mesh.visible = c.glow.visible = state.coinVisible(i);
        c.mesh.position.y = y;
        c.mesh.rotation.set(tilt, turn(p.coinTurnMs, c.phase), 0); // XYZ: spin, then lean
        c.mesh.scale.setScalar(p.coinSize / COIN_DIAMETER);
        c.glow.scale.setScalar(p.glowSize * (p.coinSize / COIN_DIAMETER));
      });
      keys.forEach((k, i) => {
        k.mesh.visible = k.glow.visible = state.keyVisible(i);
        k.mesh.position.y = y;
        k.mesh.rotation.set(tilt, turn(p.keyTurnMs, 0), 0);
        const u = k.appearedAt === null ? 1 : clamp01((timeMs - k.appearedAt) / p.keyAppearMs);
        const grow = u >= 1 ? 1 : p.keyAppearFrom + (1 - p.keyAppearFrom) * easeOutBack(u);
        const size = p.keySize / KEY_LENGTH;
        k.mesh.scale.setScalar(size * grow);
        k.glow.scale.setScalar(p.glowSize * size * grow);
      });

      if (!chest || !lid || !chestGlow) return;
      const dt = openedAt === null ? -1 : timeMs - openedAt;
      const size = p.chestSize / CHEST_WIDTH;
      const [wide, tall] = dt >= 0 ? squash(dt) : [1, 1];
      chest.scale.set(size * wide, size * tall, size * wide);
      lid.rotation.x =
        dt >= 0 ? (-p.lidOpenDeg * Math.PI * easeOutCubic(clamp01(dt / p.lidOpenMs))) / 180 : 0;
      const burst = dt >= 0 && dt < p.burstMs ? 1 - dt / p.burstMs : 0;
      chestGold.emissiveIntensity =
        p.chestEmissive + p.chestPulse * yoyo(timeMs, p.chestPulseMs) + p.burstEmissive * burst;
      CHEST_GLOW.opacity = p.chestGlowOpacity * (1 + 1.5 * burst);
      chestGlow.scale.setScalar(p.chestGlowSize * size);
    },
  };
  return self;
}
