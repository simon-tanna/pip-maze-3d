import { PerspectiveCamera, Scene, Timer, Vector3 } from 'three';
import type { Camera, Light } from 'three';
import type { WorldXZ } from '@core/grid';
import { loadGltf } from '@assets/models';
import { planChamber } from '@core/chamber-plan';
import { generateLevel } from '@core/generator';
import { mazeBounds, tileToWorld } from '@core/grid';
import { resolveRun } from '@core/run-seed';
import { bindKeyboard } from '@game/keyboard';
import { createFixedLoop } from '@game/loop';
import { createSession, createSim } from '@game/sim';
import { createGameState } from '@game/state';
import { createCameraRig } from '@render/camera-rig';
import { createChamberView } from '@render/chamber';
import { CHAMBER_KIT } from '@render/chamber-kit';
import { createFrameStats } from '@render/frame-stats';
import { createHeroView } from '@render/hero';
import { createLightRig, createPaletteEnvironment } from '@render/lights';
import { createPickupsView } from '@render/pickups';
import { look } from '@render/look';
import { LIGHT, P, color } from '@render/palette';
import { createRenderer } from '@render/renderer';
import { createRigGuard } from '@render/rig-guard';
import { createHud } from '@ui/hud';
import './style.css';

/** Expose every palette colour to CSS as `--kebab-name` (e.g. `--ink`, `--gold-light`). */
function paletteToCss(): void {
  for (const [name, hex] of Object.entries({ ...LIGHT, ...P })) {
    document.documentElement.style.setProperty(`--${name.toLowerCase().replaceAll('_', '-')}`, hex);
  }
}

/** Lights the renderer will collect this frame: visible all the way up the tree. */
function countLiveLights(scene: Scene): number {
  let n = 0;
  scene.traverseVisible((o) => {
    if ((o as Light).isLight) n++;
  });
  return n;
}

/**
 * World → CSS pixels for the HUD (`src/ui` never imports three.js). Pickups float at
 * `look.pickups.floatHeight`. Null when the point is outside the view volume.
 */
function createProjector(camera: Camera, canvas: HTMLElement) {
  const v = new Vector3();
  return (world: WorldXZ) => {
    v.set(world.x, look.pickups.floatHeight, world.z).project(camera);
    if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || Math.abs(v.z) > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  };
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** A fresh uint32 base seed. Never `Math.random`: level seeds must stay replayable. */
function drawSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Boot: the state machine walks `loading → building → entering → playing` (instant
 * transitions until ticket 06). The run's first level is built as a chamber on the
 * placeholder kit, under the fixed light rig and post chain, and a capsule hero walks it
 * on the grid with the arrows or WASD while the chase camera follows.
 */
async function boot(): Promise<void> {
  const container = document.getElementById('game');
  if (!container) throw new Error('#game container missing from index.html');
  paletteToCss();
  const machine = createGameState();

  const scene = new Scene();
  scene.background = color('INK');

  const cam = look.camera;
  const camera = new PerspectiveCamera(cam.fov, 1, cam.near, cam.far);
  const view = createRenderer(container, scene, camera);
  const { renderer } = view;

  scene.environment = createPaletteEnvironment(renderer);
  const rig = createLightRig(scene);

  const run = resolveRun(new URLSearchParams(location.search), drawSeed);
  for (const warning of run.warnings) console.warn(`[run] ${warning}`);
  console.info(
    `[run] base seed ${run.base}${run.pinned ? ' (pinned)' : ''}; level ${run.level}, seed ${run.seed}`,
  );
  const kit = await loadGltf(CHAMBER_KIT);

  machine.go('building');
  const level = generateLevel(run.level, run.seed);
  const chamber = createChamberView(kit);
  chamber.build(planChamber(level, run.seed));
  scene.add(chamber.group);
  const cols = level.map[0]?.length ?? 0;
  rig.fitShadowTo(mazeBounds(cols, level.map.length)); // the map, not the padding

  const session = createSession();
  const sim = createSim({ map: level.map, machine, pickups: level, session });
  const pickups = createPickupsView();
  pickups.build(level);
  scene.add(pickups.group);

  const hudRoot = document.getElementById('hud');
  if (!hudRoot) throw new Error('#hud missing from index.html');
  const hud = createHud({
    root: hudRoot,
    now: () => sim.snapshot().simMs,
    project: createProjector(camera, renderer.domElement),
    keys: () => sim.snapshot().keys,
    timing: look.hud,
    reducedMotion: () => reducedMotion.matches,
    coins: session.coins,
  });
  hud.level({ index: run.level, requiredKeys: sim.snapshot().requiredKeys });
  sim.on('coin', (e) => hud.coin(e));
  sim.on('key', (e) => hud.key(e));
  sim.on('keyLost', () => hud.keyLost());
  sim.on('chestLocked', () => hud.toast('Find the key first!'));
  const hero = createHeroView();
  scene.add(hero.object);
  const cameraRig = createCameraRig(camera);
  cameraRig.resetLag();

  // Light bench: the 4 pool slots sit around the start tile, in view.
  const start = sim.snapshot().tile;
  rig.pools.forEach((pool, i) => {
    const [dc, dr] = (
      [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ] as const
    )[i % 4] ?? [0, 0];
    const { x, z } = tileToWorld(start.col + dc, start.row + dr);
    pool.position.set(x, look.lights.poolHeight, z);
  });

  const frame = (alpha: number) => {
    const timeMs = sim.timeAt(alpha);
    const at = sim.heroPosition(alpha);
    const { facing } = sim.snapshot();
    hero.update(at, facing, timeMs);
    cameraRig.update(at, facing, timeMs);
    scene.environmentIntensity = look.lights.envIntensity;
    chamber.update();
    pickups.update(sim);
    hud.update(timeMs);
    rig.update({ hero: hero.object.position, poolsAtPeak: look.bench.poolsAtPeak });
    view.render();
  };

  // Compile every program with the full, fixed rig before the first frame.
  frame(0);
  await renderer.compileAsync(scene, camera);

  const loop = createFixedLoop({ update: () => sim.update(), render: frame });
  bindKeyboard(window, sim.input);
  machine.go('entering'); // the hazard clock starts
  machine.go('playing'); // input unlocks

  const guard = createRigGuard(
    { lights: () => countLiveLights(scene), programs: () => renderer.info.programs?.length ?? 0 },
    (v) => console.error('[rig-guard] light rig changed after boot', v),
  );
  const stats = import.meta.env.DEV ? createFrameStats() : null;

  const timer = new Timer();
  let armed = false;
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = timer.getDelta();
    loop.advance(dt);
    if (import.meta.env.DEV) {
      stats?.record(dt * 1000);
      // Post-pass and shadow programs compile on the first composed frame; arm after it.
      if (armed) guard.check();
      else {
        guard.arm();
        armed = true;
      }
    }
  });

  if (import.meta.env.DEV && stats) {
    const { mountDevTools } = await import('@render/dev-panel');
    const { createDevSim } = await import('@game/dev-sim');
    mountDevTools(stats);
    Object.assign(window, {
      __game: {
        scene,
        camera,
        renderer,
        composer: view.composer,
        bloom: view.bloom,
        look,
        rig,
        guard,
        stats,
        run,
        level,
        chamber,
        pickups: pickups.group,
        hero: hero.object,
        cameraRig,
        sim: createDevSim(sim, loop),
      },
    });
  }

  document.body.dataset['ready'] = 'true'; // e2e waits on this
}

boot().catch((err: unknown) => {
  console.error(err);
  document.body.dataset['ready'] = 'error';
});
