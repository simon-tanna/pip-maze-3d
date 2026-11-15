/**
 * The hero view: Pip (`characters/pip.glb`, ticket 10), a skinned character with the clips
 * `idle` and `walk`.
 *
 * - It draws the simulation's interpolated position and turns to each new facing by the
 *   shortest arc over `look.hero.turnMs` of render time. The turn is render-only: the
 *   simulation's facing changes instantly at step start.
 * - The mixer runs on simulation time: each frame advances it to the `timeMs` it is given
 *   (`sim.timeAt(alpha)`), so it pauses, replays and freezes with the simulation. It holds
 *   the death pose while `fallen` (kill → respawn at `DEATH_TIMING.gone`); on the respawn
 *   it cuts straight to idle, so the start tile never shows the death pose.
 * - `walk` plays while `moving`, one full cycle per two tiles (one footfall per tile). The
 *   simulation keeps `moving` true across chained steps, so the walk never blends to idle
 *   between them; starting and stopping crossfade over `look.hero.fadeMs`. The clips own
 *   the bob and squash: code adds no procedural squash.
 * - A soft `INK` blob shadow sits under the feet, and every Pip material carries a `CREAM`
 *   fresnel rim (emissive, below the bloom threshold).
 */
import {
  AnimationClip,
  AnimationMixer,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import type {
  AnimationAction,
  Material,
  WebGLProgramParametersWithUniforms,
  MeshStandardMaterial,
} from 'three';
import type { Character } from '@assets/models';
import type { Dir } from '@core/grid-input';
import type { WorldXZ } from '@core/grid';
import { STEP_MS } from '@core/step';
import type { Sim } from '@game/sim';
import { look } from './look';
import { color } from './palette';

/** Pip's GLB under public/models (built by blender/scripts/build_pip.py). */
export const HERO_MODEL = 'characters/pip';

/** One full walk cycle (two footfalls) spans two tiles. */
export const WALK_CYCLE_S = (2 * STEP_MS) / 1000;

/** Above the floor and its contact strip (0.01 m), so the blob never z-fights them. */
const BLOB_LIFT = 0.015;

/** `rotation.y` that points the hero's forward (+z) along `dir`. */
export function facingYaw(dir: Dir): number {
  switch (dir) {
    case 'south':
      return 0;
    case 'east':
      return Math.PI / 2;
    case 'north':
      return Math.PI;
    case 'west':
      return -Math.PI / 2;
  }
}

/** `b − a` wrapped to (−π, π]: the shortest signed turn. */
const shortest = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** What the view draws this frame, read from the simulation at `alpha`. */
export interface HeroFrame {
  position: WorldXZ;
  facing: Dir;
  /** Simulation time at this frame's `alpha` (`sim.timeAt(alpha)`), ms. */
  timeMs: number;
  /** A step is under way (stays true across chained steps). */
  moving: boolean;
  /** From a kill until the respawn (`DEATH_TIMING.gone`): the clips freeze. */
  fallen: boolean;
}

/** The hero frame at `alpha`, read from the simulation (`main.ts` draws exactly this). */
export function heroFrame(sim: Sim, alpha: number): HeroFrame {
  return {
    position: sim.heroPosition(alpha),
    facing: sim.heroFacing(), // held through the death window, like the position
    timeMs: sim.timeAt(alpha),
    moving: sim.heroMoving(),
    fallen: sim.heroFallen(),
  };
}

export type HeroClip = 'idle' | 'walk';

/** The animator's state, for tests and the dev `__game` handle. */
export interface HeroAnim {
  clip: HeroClip;
  idleWeight: number;
  walkWeight: number;
  /** Position in the walk cycle, 0–1 (0.5 is the second footfall). */
  walkPhase: number;
}

export interface HeroView {
  readonly object: Group;
  update(frame: HeroFrame): void;
  anim(): HeroAnim;
}

/** The fresnel rim's uniforms, shared by every Pip material and driven from `look`. */
export interface RimUniforms {
  rimColor: { value: ReturnType<typeof color> };
  rimStrength: { value: number };
  rimPower: { value: number };
}

/**
 * Add a view-space fresnel rim to a standard material's emissive. The uniforms object is
 * shared, so one write per frame drives every patched material.
 */
export function addRim(material: MeshStandardMaterial, rim: RimUniforms): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, rim);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          'float rimFresnel = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );',
          'totalEmissiveRadiance += rimColor * rimStrength * pow( rimFresnel, rimPower );',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => 'hero-rim';
}

/** A soft radial falloff (alpha in the green channel, which `alphaMap` reads). */
function blobTexture(size = 64): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c;
      const a = Math.round(255 * Math.max(0, 1 - r) ** 1.5);
      data.set([a, a, a, 255], (y * size + x) * 4);
    }
  }
  const tex = new DataTexture(data, size, size);
  tex.needsUpdate = true;
  return tex;
}

export function createHeroView(character: Character): HeroView {
  const object = new Group();
  object.name = 'hero';

  const pip = character.root;
  pip.name = 'pip';
  const rim: RimUniforms = {
    rimColor: { value: color('CREAM') },
    rimStrength: { value: look.hero.rimStrength },
    rimPower: { value: look.hero.rimPower },
  };
  const materials: MeshStandardMaterial[] = [];
  pip.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    // Clone: the parse is cached and shared; the rim patch belongs to this view.
    const own = (mesh.material as Material).clone() as MeshStandardMaterial;
    addRim(own, rim);
    mesh.material = own;
    materials.push(own);
  });

  const blob = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      color: color('INK'),
      alphaMap: blobTexture(),
      transparent: true,
      depthWrite: false,
      opacity: look.hero.blobOpacity,
    }),
  );
  blob.name = 'blob';
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = BLOB_LIFT;
  object.add(blob, pip);

  const mixer = new AnimationMixer(pip);
  const action = (name: HeroClip): AnimationAction => {
    const clip = AnimationClip.findByName(character.clips as AnimationClip[], name);
    if (!clip) throw new Error(`${HERO_MODEL}.glb has no "${name}" clip`);
    return mixer.clipAction(clip);
  };
  const idle = action('idle');
  const walk = action('walk');
  walk.setDuration(WALK_CYCLE_S);
  idle.play();
  let current: HeroClip = 'idle';
  const actions = { idle, walk };
  let lastMs: number | null = null;
  let wasFallen = false;

  const fadeTo = (next: HeroClip) => {
    const fade = look.hero.fadeMs / 1000;
    actions[current].fadeOut(fade);
    // reset() re-enables an action a previous fade-out disabled; it keeps walk's time scale.
    actions[next].reset().setEffectiveWeight(1).fadeIn(fade).play();
    current = next;
  };

  /** What the action contributes to the pose (a stopped or faded-out action gives 0). */
  const weight = (a: AnimationAction) => (a.isRunning() ? a.getEffectiveWeight() : 0);

  let target: Dir | null = null;
  let turn = { from: 0, delta: 0, startMs: 0 };

  return {
    object,
    update({ position, facing, timeMs, moving, fallen }) {
      const h = look.hero;
      for (const m of materials) m.roughness = h.roughness;
      rim.rimStrength.value = h.rimStrength;
      rim.rimPower.value = h.rimPower;
      blob.scale.setScalar(2 * h.blobRadius);
      blob.material.opacity = h.blobOpacity;

      object.position.set(position.x, 0, position.z);
      if (target === null) {
        turn = { from: facingYaw(facing), delta: 0, startMs: timeMs }; // first frame: no turn
      } else if (facing !== target) {
        const from = object.rotation.y; // mid-turn re-targets start from where it is
        turn = { from, delta: shortest(from, facingYaw(facing)), startMs: timeMs };
      }
      target = facing;
      const t = h.turnMs > 0 ? (timeMs - turn.startMs) / h.turnMs : 1;
      object.rotation.y = turn.from + turn.delta * Math.min(Math.max(t, 0), 1);

      // Clips: advance to this frame's simulation time, then switch (the fade starts now).
      const dt = lastMs === null || fallen ? 0 : Math.max(0, timeMs - lastMs) / 1000;
      lastMs = timeMs;
      if (wasFallen && !fallen) {
        // Respawned: drop the held death pose outright rather than fading out of it.
        mixer.stopAllAction();
        idle.reset().setEffectiveWeight(1).play();
        current = 'idle';
      }
      wasFallen = fallen;
      mixer.update(dt);
      if (!fallen) {
        const want: HeroClip = moving ? 'walk' : 'idle';
        if (want !== current) {
          fadeTo(want);
          mixer.update(0);
        }
      }
    },
    anim() {
      const phase = walk.time / walk.getClip().duration;
      return {
        clip: current,
        idleWeight: weight(idle),
        walkWeight: weight(walk),
        walkPhase: phase - Math.floor(phase),
      };
    },
  };
}
