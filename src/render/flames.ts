/**
 * Flames read as light, not geometry (ticket 12, map ticket 07 preset D). Per flame tile:
 *
 * - The bpy grate and nozzle (`hazards/flame.glb`, nodes `FLAME_NODES`). The `bed` heats
 *   `EMBER_DARK` → `FIRE_HOT` through the telegraph and cools after (`flameVisual.heat`).
 * - A shader column: an open cone (top r 0.16 m, base r 0.6 m) `look.flame.height` tall,
 *   additive, a seamless scrolling fbm through `EMBER` → `FIRE` → `FIRE_HOT` → `FIRE_CORE`
 *   at HDR gain `look.flame.gain`. Its size and strength are `flameVisual`'s.
 * - An additive radial glow decal on the floor: `EMBER` → `FIRE_HOT` with the telegraph
 *   heat, `FIRE` with flicker while live, fading as the grate cools.
 * - Embers rising from the grate through the telegraph (one shared emitter, a render-local
 *   seeded RNG, stepped on the hazard clock, so they freeze when it stops).
 * - The rig's pool slots, through the allocator (`flame-pools.ts`), when given `pools`.
 *
 * Everything is driven by what the simulation reports each frame (`update(sim.flames())`:
 * state and `intoMs` on the core flame clock), so the look never leads or lags the rule.
 *
 * `truth` adds the dev-only ground-truth overlay (the hazards prototype's `G`): a `BLOOD`
 * slab on every tile that is lethal right now, shown while `showTruth` is set.
 *
 * Nothing is ever hidden or shown except the truth slabs: a quiet column or dark glow
 * collapses to zero scale instead (drawn, but no fragments), so the boot `compileAsync`
 * sees every program and none compiles in play.
 * Per-flame materials (bed, column, glow) come from pools that only grow and are never
 * disposed; copies share their program. No lights are created here.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector2,
} from 'three';
import type { Material, PointLight, Color } from 'three';
import type { Gltf } from '@assets/models';
import type { GridTile } from '@core/generator';
import { mulberry32 } from '@core/generator';
import type { FlameState } from '@core/hazards';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import type { WorldXZ } from '@core/grid';
import { createFlamePools } from './flame-pools';
import { flameVisual } from './flame-visual';
import type { FlameVisual } from './flame-visual';
import { look } from './look';
import { color } from './palette';

/** The grate and nozzle model (`blender/scripts/build_flame.py`). */
export const FLAME_MODEL = 'hazards/flame';
/** Its node contract, in a tile's local frame (`tests/unit/flame-model.test.ts`). */
export const FLAME_NODES = ['bed', 'grate', 'nozzle'] as const;

/** The column's cone (map ticket 07): unit height, scaled to `look.flame.height`. */
const COLUMN = new CylinderGeometry(0.16, 0.6, 1, 32, 12, true).translate(0, 0.5, 0);
/** The glow decal: a unit quad on the floor, scaled to `look.flame.glowSize`. */
const GLOW = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
const TRUTH_SLAB = new BoxGeometry(TILE_SIZE * 0.96, 0.04, TILE_SIZE * 0.96).translate(0, 0.02, 0);
const TRUTH = new MeshStandardMaterial({ color: color('BLOOD'), emissive: color('BLOOD') });

const FIRE_RAMP = () => ({
  uEmber: { value: color('EMBER') },
  uFire: { value: color('FIRE') },
  uHot: { value: color('FIRE_HOT') },
  uCore: { value: color('FIRE_CORE') },
});

const COLUMN_VERTEX = /* glsl */ `
  uniform float uTime; varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.xz *= 1.0 + 0.14 * sin(uTime * 9.0 + p.y * 7.0);
    p.x += 0.08 * sin(uTime * 5.0 + p.y * 3.0) * p.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const COLUMN_FRAGMENT = /* glsl */ `
  uniform float uTime; uniform float uScroll; uniform float uAlpha; uniform float uGain;
  uniform vec3 uEmber; uniform vec3 uFire; uniform vec3 uHot; uniform vec3 uCore;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    if (uAlpha <= 0.0) discard;
    float y = vUv.y;
    // Sampled on a circle, so the noise is seamless round the circumference.
    float ang = vUv.x * 6.2831853;
    float s = uTime * uScroll;
    float n = 0.5 * (fbm(vec2(cos(ang) * 1.6 + 7.0, y * 3.0 - s)) + fbm(vec2(sin(ang) * 1.6, y * 3.0 - s + 3.0)));
    float i = ((1.0 - y) * 1.3 - 0.1 + (n - 0.5)) * uAlpha;
    if (i < 0.15) discard;
    vec3 c = i > 0.85 ? uCore
           : i > 0.6 ? mix(uHot, uCore, (i - 0.6) / 0.25)
           : i > 0.35 ? mix(uFire, uHot, (i - 0.35) / 0.25)
           : mix(uEmber, uFire, (i - 0.15) / 0.2);
    gl_FragColor = vec4(c * uGain * smoothstep(0.15, 0.32, i), 1.0);
  }`;

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
  void main() {
    float a = pow(max(1.0 - length(vUv * 2.0 - 1.0), 0.0), 2.2) * uIntensity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * a, 1.0);
  }`;

const EMBER_VERTEX = /* glsl */ `
  attribute float aLife; uniform float uSize; uniform float uScale;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aLife >= 1.0 ? 0.0 : uSize * uScale * (1.0 - 0.6 * aLife) / -mv.z;
  }`;

const EMBER_FRAGMENT = /* glsl */ `
  uniform vec3 uHot; uniform vec3 uFire; uniform vec3 uEmber; uniform vec3 uEmberDark;
  uniform float uGain; varying float vLife;
  void main() {
    if (vLife >= 1.0) discard;
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(1.0 - r, 0.0), 1.5) * (1.0 - vLife);
    if (a < 0.01) discard;
    vec3 c = vLife < 0.33 ? mix(uHot, uFire, vLife / 0.33)
           : vLife < 0.66 ? mix(uFire, uEmber, (vLife - 0.33) / 0.33)
           : mix(uEmber, uEmberDark, (vLife - 0.66) / 0.34);
    gl_FragColor = vec4(c * a * uGain, 1.0);
  }`;

/** Set a ShaderMaterial uniform's value (every uniform here is declared up front). */
const set = (m: ShaderMaterial, name: string, value: unknown) => {
  const u = m.uniforms[name];
  if (u) u.value = value;
};
const tint = (m: ShaderMaterial, name: string) => m.uniforms[name]?.value as Color;

const EMBER_DARK = color('EMBER_DARK');
const EMBER = color('EMBER');
const FIRE = color('FIRE');
const FIRE_HOT = color('FIRE_HOT');

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending } as const;

const newColumnMaterial = () =>
  new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uAlpha: { value: 0 },
      uGain: { value: 0 },
      ...FIRE_RAMP(),
    },
    vertexShader: COLUMN_VERTEX,
    fragmentShader: COLUMN_FRAGMENT,
    side: DoubleSide,
    ...additive,
  });

const newGlowMaterial = () =>
  new ShaderMaterial({
    uniforms: { uColor: { value: color('EMBER') }, uIntensity: { value: 0 } },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    ...additive,
  });

/** Grow-only pools: flame `i` always draws with material `i`, on every level. */
const pool = <M extends Material>(make: () => M) => {
  const list: M[] = [];
  return (i: number): M => (list[i] ??= make());
};
const columnMaterial = pool(newColumnMaterial);
const glowMaterial = pool(newGlowMaterial);

/** The shared ember emitter's capacity (~36/s × ≤ 0.9 s per telegraphing flame). */
const EMBER_CAPACITY = 256;
/** Embers spawn over the grate's bars, inside this radius, m. */
const EMBER_RADIUS = 0.5;
/** Sideways jitter, m/s. */
const EMBER_SPREAD = 0.35;
/** Render-local RNG seed for embers (not level-visible state, but replayable). */
const EMBER_SEED = 0x0f1a;
/** Below this the glow shader discards every fragment. */
const GLOW_FLOOR = 0.002;
/** Longest frame step the view simulates, ms (a paused sim's `advance` jumps further). */
const MAX_FRAME_MS = 100;

export interface FlameLayout {
  tile: GridTile;
}

export interface FlameStateNow extends FlameLayout {
  state: FlameState;
  /** Ms into `state` on the core flame clock (`flameClock`). */
  intoMs: number;
}

export interface FlameFrame {
  /** Sim time, ms (`sim.timeAt(alpha)`): drives the column shader and the flicker. */
  timeMs: number;
  /**
   * The level's hazard clock, ms (`sim.levelAt(alpha)`): embers and the pool fades step on
   * its deltas, so they freeze with it (it stops when `leaving` begins).
   */
  levelMs: number;
  /** The hero, for the pool allocator's "nearest" pick. */
  hero?: WorldXZ;
}

export interface FlamesView {
  readonly group: Group;
  /** The dev overlay is on (no-op without the `truth` option). */
  showTruth: boolean;
  /** Build a level's flames, replacing the last level's. */
  build(flames: readonly FlameLayout[]): void;
  /** Draw each flame's current state (same order as `build`). */
  update(flames: readonly FlameStateNow[], frame: FlameFrame): void;
  /** Each flame's visual as last drawn (for tests and the dev handle). */
  visuals(): readonly FlameVisual[];
  /** Live embers (for tests and the dev handle). */
  embers(): number;
  /** Drop this level's flames; pool slots drop to 0. Shared resources are kept. */
  teardown(): void;
}

export interface FlamesViewOptions {
  truth?: boolean;
  /** The rig's flame-pool slots, for the allocator. Without them, no light is driven. */
  pools?: readonly PointLight[];
}

interface FlameParts {
  root: Group;
  bed: MeshStandardMaterial;
  column: Mesh<BufferGeometry, ShaderMaterial>;
  glow: Mesh<BufferGeometry, ShaderMaterial>;
  world: WorldXZ;
}

export function createFlamesView(kit: Gltf, opts: FlamesViewOptions = {}): FlamesView {
  const { truth = false, pools } = opts;
  const group = new Group();
  group.name = 'flames';
  const bedNode = kit.getNode('bed');
  const grate = kit.getNode('grate');
  const nozzle = kit.getNode('nozzle');
  const bedMaterial = pool(() => (bedNode.material as MeshStandardMaterial).clone());
  const allocator = pools ? createFlamePools(pools) : null;

  // Embers: one Points over every flame, world-space, never culled or hidden.
  const emberPos = new Float32Array(EMBER_CAPACITY * 3);
  const emberVel = new Float32Array(EMBER_CAPACITY * 3);
  const emberLife = new Float32Array(EMBER_CAPACITY).fill(1); // ≥ 1 = dead
  const emberSpan = new Float32Array(EMBER_CAPACITY).fill(1);
  const emberGeometry = new BufferGeometry();
  emberGeometry.setAttribute('position', new BufferAttribute(emberPos, 3));
  emberGeometry.setAttribute('aLife', new BufferAttribute(emberLife, 1));
  const emberMaterial = new ShaderMaterial({
    uniforms: {
      uSize: { value: 0 },
      uScale: { value: 600 },
      uGain: { value: 0 },
      uHot: { value: color('FIRE_HOT') },
      uFire: { value: color('FIRE') },
      uEmber: { value: color('EMBER') },
      uEmberDark: { value: color('EMBER_DARK') },
    },
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    ...additive,
  });
  const emberPoints = new Points(emberGeometry, emberMaterial);
  emberPoints.name = 'embers';
  emberPoints.frustumCulled = false;
  emberPoints.renderOrder = 2;
  const drawSize = new Vector2();
  // Point sizes are in pixels: scale them by the drawing buffer and the camera's focal length.
  emberPoints.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(drawSize);
    set(emberMaterial, 'uScale', (drawSize.y / 2) * (camera.projectionMatrix.elements[5] ?? 1));
  };
  const rng = mulberry32(EMBER_SEED);
  let emberNext = 0;
  let emberDebt: number[] = [];

  let parts: FlameParts[] = [];
  let slabs: Mesh[] = [];
  let shown: FlameVisual[] = [];
  let lastMs: number | null = null;

  const spawnEmber = (at: WorldXZ) => {
    const f = look.flame;
    const i = emberNext;
    emberNext = (emberNext + 1) % EMBER_CAPACITY;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * EMBER_RADIUS;
    emberPos[i * 3] = at.x + Math.cos(a) * r;
    emberPos[i * 3 + 1] = 0.05;
    emberPos[i * 3 + 2] = at.z + Math.sin(a) * r;
    emberVel[i * 3] = (rng() - 0.5) * EMBER_SPREAD - Math.cos(a) * r * 0.8;
    emberVel[i * 3 + 1] = f.emberRiseMin + rng() * (f.emberRiseMax - f.emberRiseMin);
    emberVel[i * 3 + 2] = (rng() - 0.5) * EMBER_SPREAD - Math.sin(a) * r * 0.8;
    emberSpan[i] = f.emberLifeMin + rng() * (f.emberLifeMax - f.emberLifeMin);
    emberLife[i] = 0;
  };

  const stepEmbers = (flames: readonly FlameStateNow[], dtMs: number) => {
    const rate = look.flame.embersPerSecond / 1000;
    flames.forEach((f, k) => {
      const world = parts[k]?.world;
      if (!world) return;
      if (f.state !== 'telegraph') {
        emberDebt[k] = 0;
        return;
      }
      let debt = (emberDebt[k] ?? 0) + rate * dtMs;
      for (; debt >= 1; debt -= 1) spawnEmber(world);
      emberDebt[k] = debt;
    });
    const dt = dtMs / 1000;
    for (let i = 0; i < EMBER_CAPACITY; i++) {
      const life = emberLife[i] ?? 1;
      if (life >= 1) continue;
      emberLife[i] = Math.min(1, life + dtMs / (emberSpan[i] ?? 1));
      for (let c = 0; c < 3; c++) {
        const j = i * 3 + c;
        emberPos[j] = (emberPos[j] ?? 0) + (emberVel[j] ?? 0) * dt;
      }
    }
    emberGeometry.getAttribute('position').needsUpdate = true;
    emberGeometry.getAttribute('aLife').needsUpdate = true;
  };

  const killEmbers = () => {
    emberLife.fill(1);
    emberDebt = [];
    emberGeometry.getAttribute('aLife').needsUpdate = true;
  };

  group.add(emberPoints);

  return {
    group,
    showTruth: false,
    build(flames) {
      this.teardown();
      parts = flames.map((f, i) => {
        const world = tileToWorld(f.tile.col, f.tile.row);
        const root = new Group();
        root.name = `flame_${i}`;
        root.position.set(world.x, 0, world.z);
        const bed = bedMaterial(i);
        const bedMesh = new Mesh(bedNode.geometry, bed);
        bedMesh.name = 'bed';
        bedMesh.receiveShadow = true;
        const grateMesh = new Mesh(grate.geometry, grate.material);
        grateMesh.name = 'grate';
        grateMesh.castShadow = grateMesh.receiveShadow = true;
        const nozzleMesh = new Mesh(nozzle.geometry, nozzle.material);
        nozzleMesh.name = 'nozzle';
        nozzleMesh.receiveShadow = true;
        const column = new Mesh(COLUMN, columnMaterial(i));
        column.name = 'column';
        column.renderOrder = 2;
        const glow = new Mesh(GLOW, glowMaterial(i));
        glow.name = 'glow';
        glow.renderOrder = 1;
        // Never culled: every flame draws from the level's first frame (quiet parts at zero
        // scale cost nothing), so its render-target program variants and geometry uploads
        // happen while the iris is shut, not when the flame first comes into view.
        for (const m of [bedMesh, grateMesh, nozzleMesh, glow, column]) m.frustumCulled = false;
        root.add(bedMesh, grateMesh, nozzleMesh, glow, column);
        return { root, bed, column, glow, world };
      });
      slabs = truth
        ? flames.map((f, i) => {
            const m = new Mesh(TRUTH_SLAB, TRUTH);
            const { x, z } = tileToWorld(f.tile.col, f.tile.row);
            m.position.set(x, 0, z);
            m.name = `truth_${i}`;
            m.visible = false;
            return m;
          })
        : [];
      shown = flames.map(() => flameVisual('off', Infinity));
      lastMs = null;
      group.add(...parts.map((p) => p.root), ...slabs);
    },
    update(flames, frame) {
      const f = look.flame;
      const dtMs =
        lastMs === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, frame.levelMs - lastMs));
      lastMs = frame.levelMs;
      const t = frame.timeMs / 1000;
      const flick = 1 + f.flicker * (Math.sin(t * 61) + 0.5 * Math.sin(t * 23));

      shown = flames.map((now, i) => {
        const v = flameVisual(now.state, now.intoMs);
        const p = parts[i];
        if (!p) return v;
        const on = now.state === 'on';

        p.bed.roughness = f.bedRoughness;
        p.bed.emissive.copy(EMBER_DARK).lerp(FIRE_HOT, v.heat);
        p.bed.emissiveIntensity = v.heat * (on ? f.bedLive * flick : f.bedTelegraph);

        // A quiet column collapses to a point: still drawn (so compiled), but no fragments.
        const width = v.alpha > 0 ? 0.6 + 0.4 * v.size : 0;
        p.column.scale.set(width, v.alpha > 0 ? f.height * v.size : 0, width);
        const column = p.column.material;
        set(column, 'uTime', t);
        set(column, 'uScroll', f.scroll);
        set(column, 'uAlpha', v.alpha);
        set(column, 'uGain', f.gain);

        const glow = p.glow.material;
        if (on) tint(glow, 'uColor').copy(FIRE);
        else tint(glow, 'uColor').copy(EMBER).lerp(FIRE_HOT, v.heat);
        const intensity = on
          ? f.glowLive * flick
          : v.heat * (now.state === 'telegraph' ? f.glowTelegraph : f.glowCool);
        set(glow, 'uIntensity', intensity);
        // A dark decal collapses to a point, like a quiet column.
        const size = intensity > GLOW_FLOOR ? f.glowSize : 0;
        p.glow.scale.set(size, 1, size);
        return v;
      });

      stepEmbers(flames, dtMs);
      set(emberMaterial, 'uSize', f.emberSize);
      set(emberMaterial, 'uGain', f.emberGain);

      allocator?.update(
        flames.map((now, i) => ({
          ...(parts[i]?.world ?? { x: 0, z: 0 }),
          state: now.state,
          heat: shown[i]?.heat ?? 0,
          flicker: flick,
        })),
        frame.hero ?? { x: 0, z: 0 },
        dtMs,
      );

      slabs.forEach((m, i) => (m.visible = this.showTruth && flames[i]?.state === 'on'));
    },
    visuals: () => shown,
    embers: () => emberLife.reduce((n, life) => (life < 1 ? n + 1 : n), 0),
    teardown() {
      for (const p of parts) group.remove(p.root);
      for (const s of slabs) group.remove(s);
      parts = [];
      slabs = [];
      shown = [];
      killEmbers();
      allocator?.reset();
    },
  };
}
