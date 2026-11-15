/**
 * Particles and the death shake (ticket 15, spec Render → FX).
 *
 * - Pooled, instanced, camera-facing quads: two meshes over fixed-size pools, one
 *   alpha-blended (dust, puff) and one additive (sparkle). A burst past a pool's capacity
 *   recycles its oldest particles. The meshes, their materials and the pools live for the
 *   whole run; a level's `teardown` only empties the pools, so no program ever compiles
 *   after boot and no light is involved.
 * - Simulated in render on simulation time: each particle is closed-form in its age
 *   (launch velocity, gravity, linear fade and scale), so pause, advance and the hit-stop
 *   freeze it, and a frame is a function of the time it is drawn at.
 * - Every random draw comes from a render-local `mulberry32` seeded by the level seed
 *   (`build`), never `Math.random`: a pinned seed replays the same particles.
 * - Bursts on the sim's events (`listen`), counts from v2's `createWorldFx` callers: dust
 *   ×3 on landing and ×6 on respawn, a puff ×10 at `gone` where the hero collapsed, and
 *   `GOLD_LIGHT` sparkles: key ×16, coin ×8, chest ×28, key fade-in ×10.
 * - `shake(t)`: the death's positional camera shake, none under reduced motion.
 */
import {
  AdditiveBlending,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import type { Blending } from 'three';
import { mulberry32 } from '@core/generator';
import type { Rng } from '@core/generator';
import type { WorldXZ } from '@core/grid';
import { DEATH_TIMING } from '@game/sim';
import type { Sim } from '@game/sim';
import { knockback } from './hero';
import { look } from './look';
import { color } from './palette';

export type FxKind = 'dust' | 'puff' | 'sparkle';

/** Particles per pool: well above the largest overlap of bursts in play. */
export const FX_CAPACITY = { normal: 64, additive: 96 } as const;

/** Salt for the FX RNG, so it never repeats the generator's or the coin phases' stream. */
const FX_SALT = 0xf0_0d_f1_e5;

/** One live particle as drawn, for tests and the dev `__game` handle. */
export interface FxParticle {
  kind: FxKind;
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
}

interface Slot {
  kind: FxKind;
  startMs: number;
  lifeMs: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  size: number;
  /** Scale at birth and death (× size). */
  from: number;
  to: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
}

export interface Fx {
  readonly group: Group;
  /** Start a level: reseed the RNG from the level seed and empty the pools. */
  build(seed: number): void;
  teardown(): void;
  /** Burst on the sim's events (`main.ts` calls it once; listeners outlive levels). */
  listen(sim: Sim): void;
  /** A key fading in (reveal, or back after `keyLost`) at `atMs`: sparkles. */
  keyAppeared(at: WorldXZ, atMs: number): void;
  /** Draw every pool at simulation time `timeMs`. */
  update(timeMs: number): void;
  /** The live particles drawn on the last update. */
  particles(): FxParticle[];
  /** Instances drawn per mesh on the last update. */
  drawn(): { normal: number; additive: number };
  /** The death camera shake at `timeMs`, m (screen x, y). Zero under reduced motion. */
  shake(timeMs: number): { x: number; y: number };
}

export interface FxOptions {
  reducedMotion(): boolean;
}

const vertexShader = /* glsl */ `
attribute vec3 fxOffset;
attribute float fxSize;
attribute vec4 fxColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = fxColor;
  vec4 mv = modelViewMatrix * vec4( fxOffset, 1.0 );
  mv.xy += position.xy * fxSize; // camera-facing: the quad spans view-space x and y
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length( p );
  #ifdef FX_STAR
    // A bright core and a four-point glint.
    float a = pow( max( 0.0, 1.0 - r ), 3.0 ) + max( 0.0, 1.0 - abs( p.x * p.y ) * 24.0 - r * 0.9 );
    a = clamp( a, 0.0, 1.0 ) * vColor.a;
    gl_FragColor = vec4( vColor.rgb, a ); // AdditiveBlending multiplies by a (SrcAlpha)
  #else
    float a = ( 1.0 - smoothstep( 0.35, 1.0, r ) ) * vColor.a;
    gl_FragColor = vec4( vColor.rgb, a );
  #endif
}
`;

/** One pool: a fixed ring of slots and the instanced quad mesh that draws its live ones. */
function createPool(name: string, capacity: number, blending: Blending, star: boolean) {
  const geometry = new InstancedBufferGeometry();
  const quad = new PlaneGeometry(1, 1);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  const offset = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const size = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  const tint = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  for (const a of [offset, size, tint]) a.setUsage(DynamicDrawUsage);
  geometry.setAttribute('fxOffset', offset);
  geometry.setAttribute('fxSize', size);
  geometry.setAttribute('fxColor', tint);
  geometry.instanceCount = 0;
  const material = new ShaderMaterial({
    name,
    vertexShader,
    fragmentShader,
    defines: star ? { FX_STAR: '' } : {},
    transparent: true,
    depthWrite: false,
    blending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false; // particles fly anywhere; the pool is tiny
  mesh.renderOrder = 10; // after the floor glows
  const slots: (Slot | null)[] = Array.from({ length: capacity }, () => null);
  let next = 0;
  return {
    mesh,
    capacity,
    slots,
    take(): number {
      const i = next;
      next = (next + 1) % capacity;
      return i;
    },
    clear() {
      slots.fill(null);
      next = 0;
      geometry.instanceCount = 0;
    },
    write(i: number, p: Readonly<FxParticle>, s: Slot, gain: number) {
      offset.setXYZ(i, p.x, p.y, p.z);
      size.setX(i, p.size);
      tint.setXYZW(i, s.r * gain, s.g * gain, s.b * gain, p.alpha);
    },
    commit(count: number) {
      geometry.instanceCount = count;
      offset.needsUpdate = true;
      size.needsUpdate = true;
      tint.needsUpdate = true;
    },
  };
}

export function createFx(opts: FxOptions): Fx {
  const group = new Group();
  group.name = 'fx';
  const normal = createPool('fx_normal', FX_CAPACITY.normal, NormalBlending, false);
  const additive = createPool('fx_additive', FX_CAPACITY.additive, AdditiveBlending, true);
  group.add(normal.mesh, additive.mesh);
  const dustColours = [color('SAND'), color('STONE_LIGHT')];
  const gold = color('GOLD_LIGHT');

  let rng: Rng = mulberry32(FX_SALT);
  /** The death time is the sim's (`heroDiedAt`); null until `listen`. */
  let diedAt: () => number | null = () => null;
  /** The time the last update drew at (null: nothing drawn since a clear). */
  let drawnAtMs: number | null = null;
  /** One scratch particle, rewritten per slot as the pools are drawn. */
  const scratch: FxParticle = { kind: 'dust', x: 0, y: 0, z: 0, size: 0, alpha: 0 };

  const range = (min: number, max: number) => min + (max - min) * rng();

  /** `count` particles of `kind` from (x, y, z), born at `atMs`. */
  const burst = (kind: FxKind, count: number, x: number, y: number, z: number, atMs: number) => {
    const f = look.fx;
    const pool = kind === 'sparkle' ? additive : normal;
    for (let n = 0; n < count; n++) {
      const az = rng() * Math.PI * 2;
      const el =
        ((kind === 'dust'
          ? range(f.dustElevationMin, f.dustElevationMax)
          : kind === 'puff'
            ? range(f.puffElevationMin, f.puffElevationMax)
            : range(f.sparkleElevationMin, f.sparkleElevationMax)) *
          Math.PI) /
        180;
      const speed =
        kind === 'dust'
          ? range(f.dustSpeedMin, f.dustSpeedMax)
          : kind === 'puff'
            ? range(f.puffSpeedMin, f.puffSpeedMax)
            : range(f.sparkleSpeedMin, f.sparkleSpeedMax);
      const tint =
        kind === 'sparkle' ? gold : (dustColours[rng() < f.dustSandShare ? 0 : 1] ?? gold);
      const slot: Slot = {
        kind,
        startMs: atMs,
        lifeMs: kind === 'dust' ? f.dustLifeMs : kind === 'puff' ? f.puffLifeMs : f.sparkleLifeMs,
        x,
        y,
        z,
        vx: speed * Math.cos(el) * Math.cos(az),
        vy: speed * Math.sin(el),
        vz: speed * Math.cos(el) * Math.sin(az),
        gravity: kind === 'sparkle' ? f.sparkleGravity : 0,
        size: kind === 'dust' ? f.dustSize : kind === 'puff' ? f.puffSize : f.sparkleSize,
        from:
          kind === 'dust'
            ? f.dustScaleFrom
            : kind === 'puff'
              ? f.puffScaleFrom
              : f.sparkleScaleFrom,
        to: kind === 'dust' ? f.dustScaleTo : kind === 'puff' ? f.puffScaleTo : f.sparkleScaleTo,
        alpha: kind === 'dust' ? f.dustAlpha : kind === 'puff' ? f.puffAlpha : 1,
        r: tint.r,
        g: tint.g,
        b: tint.b,
      };
      pool.slots[pool.take()] = slot;
    }
  };

  /** Slot `s` as drawn at `timeMs`, into `out`; false when it is not alive then. */
  const particleAt = (s: Slot, timeMs: number, out: FxParticle): boolean => {
    const age = timeMs - s.startMs;
    if (age < 0 || age >= s.lifeMs) return false;
    const t = age / 1000;
    const u = age / s.lifeMs;
    out.kind = s.kind;
    out.x = s.x + s.vx * t;
    out.y = Math.max(look.fx.floorY, s.y + s.vy * t - 0.5 * s.gravity * t * t);
    out.z = s.z + s.vz * t;
    out.size = s.size * (s.from + (s.to - s.from) * u);
    out.alpha = s.alpha * (1 - u);
    return true;
  };

  const drawPool = (pool: ReturnType<typeof createPool>, timeMs: number, gain: number) => {
    let count = 0;
    for (const s of pool.slots) {
      if (s && particleAt(s, timeMs, scratch)) pool.write(count++, scratch, s, gain);
    }
    pool.commit(count);
  };

  const clear = () => {
    normal.clear();
    additive.clear();
    drawnAtMs = null;
  };

  const self: Fx = {
    group,
    build(seed) {
      rng = mulberry32((seed ^ FX_SALT) >>> 0);
      clear();
    },
    teardown: clear,
    listen(sim) {
      diedAt = () => sim.heroDiedAt();
      const now = () => sim.timeAt(0);
      const f = () => look.fx;
      sim.on('landed', (e) => burst('dust', f().dustLand, e.world.x, f().dustY, e.world.z, now()));
      sim.on('respawned', (e) =>
        burst('dust', f().dustRespawn, e.world.x, f().dustY, e.world.z, now()),
      );
      sim.on('died', () => {
        // Where the hero collapses (the death spot, knocked back), once it is gone.
        const spot = sim.heroPosition(0);
        const push = knockback(sim.heroFacing(), look.hero.knockbackM);
        const at = (sim.heroDiedAt() ?? now()) + DEATH_TIMING.gone;
        burst('puff', f().puffDeath, spot.x + push.x, f().puffHeight, spot.z + push.z, at);
      });
      const lift = () => look.pickups.floatHeight;
      sim.on('coin', (e) => burst('sparkle', f().sparkleCoin, e.world.x, lift(), e.world.z, now()));
      sim.on('key', (e) => burst('sparkle', f().sparkleKey, e.world.x, lift(), e.world.z, now()));
      sim.on('chestOpened', (e) =>
        burst('sparkle', f().sparkleChest, e.world.x, f().chestHeight, e.world.z, now()),
      );
      sim.on('keyRevealed', (e) => self.keyAppeared(e.world, now()));
      sim.on('keyLost', (e) => self.keyAppeared(e.world, now()));
    },
    keyAppeared(at, atMs) {
      burst('sparkle', look.fx.sparkleKeyAppear, at.x, look.pickups.floatHeight, at.z, atMs);
    },
    update(timeMs) {
      drawnAtMs = timeMs;
      drawPool(normal, timeMs, 1);
      drawPool(additive, timeMs, look.fx.sparkleIntensity);
    },
    particles() {
      // Built on demand (tests, `__game`): the per-frame update allocates nothing.
      const out: FxParticle[] = [];
      if (drawnAtMs === null) return out;
      for (const pool of [normal, additive]) {
        for (const s of pool.slots) {
          if (s && particleAt(s, drawnAtMs, scratch)) out.push({ ...scratch });
        }
      }
      return out;
    },
    drawn: () => ({
      normal: normal.mesh.geometry.instanceCount,
      additive: additive.mesh.geometry.instanceCount,
    }),
    shake(timeMs) {
      const f = look.fx;
      const diedAtMs = diedAt();
      if (opts.reducedMotion() || diedAtMs === null) return { x: 0, y: 0 };
      const dt = timeMs - diedAtMs;
      if (dt < 0 || dt >= f.deathShakeMs) return { x: 0, y: 0 };
      const u = dt / f.deathShakeMs;
      const a = f.deathShakeAmplitude * (1 - u);
      const turn = u * Math.PI * 2;
      return {
        x: a * Math.sin(turn * f.deathShakeCyclesX),
        y: a * Math.cos(turn * f.deathShakeCyclesY),
      };
    },
  };
  return self;
}
