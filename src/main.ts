import { PerspectiveCamera, Scene, Timer, Vector3 } from 'three';
import type { Camera, Light } from 'three';
import type { WorldXZ } from '@core/grid';
import { loadGltf } from '@assets/models';
import { planChamber } from '@core/chamber-plan';
import { generateLevel } from '@core/generator';
import { mazeBounds, tileToWorld } from '@core/grid';
import { resolveRun } from '@core/run-seed';
import type { RunStart } from '@core/run-seed';
import { bindKeyboard, bindRestart } from '@game/keyboard';
import { createFixedLoop } from '@game/loop';
import { createSession, createSim } from '@game/sim';
import { createDirector, createGameState } from '@game/state';
import type { GameState } from '@game/state';
import { createCameraRig } from '@render/camera-rig';
import { createChamberView } from '@render/chamber';
import { CHAMBER_KIT } from '@render/chamber-kit';
import { createFrameStats } from '@render/frame-stats';
import { createHeroView } from '@render/hero';
import { createLevelViews } from '@render/level-views';
import { createLightRig, createPaletteEnvironment } from '@render/lights';
import { createPickupsView } from '@render/pickups';
import { look } from '@render/look';
import { LIGHT, P, color } from '@render/palette';
import { createRenderer } from '@render/renderer';
import { createRigGuard } from '@render/rig-guard';
import { createHud } from '@ui/hud';
import { createIris } from '@ui/iris';
import type { Iris } from '@ui/iris';
import { createScreens } from '@ui/screens';
import type { Screens } from '@ui/screens';
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
 * World → CSS pixels for the HUD and the iris (`src/ui` never imports three.js). Points
 * sit at `look.pickups.floatHeight`. Null when the point is outside the view volume.
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

/** The console line e2e and humans read a run's seeds from. */
function logRun(run: RunStart): void {
  console.info(
    `[run] base seed ${run.base}${run.pinned ? ' (pinned)' : ''}; level ${run.level}, seed ${run.seed}`,
  );
}

interface Shell {
  container: HTMLElement;
  machine: GameState;
  hudLayer: HTMLElement;
  iris: Iris;
  screens: Screens;
  scene: Scene;
  camera: PerspectiveCamera;
  project: ReturnType<typeof createProjector>;
  /** When a HUD or iris animation starts: the simulation tick time (set once the sim exists). */
  clock: { now(): number };
  showError(err: unknown): void;
}

/**
 * What exists before anything loads: the machine, the scene and camera, and `#hud`'s
 * layers (bottom to top: the HUD, the iris, the full-screen cards), with "Loading…" up.
 */
function createShell(): Shell {
  const container = document.getElementById('game');
  if (!container) throw new Error('#game container missing from index.html');
  const hudRoot = document.getElementById('hud');
  if (!hudRoot) throw new Error('#hud missing from index.html');
  paletteToCss();

  const hudLayer = document.createElement('div');
  const overlay = document.createElement('div');
  hudRoot.replaceChildren(hudLayer, overlay);

  const scene = new Scene();
  scene.background = color('INK');
  const cam = look.camera;
  const camera = new PerspectiveCamera(cam.fov, 1, cam.near, cam.far);
  const project = createProjector(camera, container);
  const clock = { now: () => 0 };
  const iris = createIris({ root: overlay, now: () => clock.now(), project });
  const screens = createScreens(overlay);
  screens.loading();

  return {
    container,
    machine: createGameState(),
    hudLayer,
    iris,
    screens,
    scene,
    camera,
    project,
    clock,
    showError(err) {
      console.error(err);
      screens.error(err instanceof Error ? err.message : String(err));
      document.body.dataset['ready'] = 'error';
    },
  };
}

/**
 * Boot. `#hud` shows "Loading…" on INK while the GLBs load; then the director
 * (`@game/state`) runs the machine on the fixed loop: `building` (behind the shut iris) →
 * `entering` (the iris opens on the hero) → `playing` → `leaving` (the chest opens, the
 * iris closes on it) → the next level, or the end card after the last slice level.
 */
async function boot(shell: Shell): Promise<void> {
  const { container, machine, hudLayer, iris, screens, scene, camera, project, clock } = shell;
  const view = createRenderer(container, scene, camera);
  const { renderer } = view;
  scene.environment = createPaletteEnvironment(renderer);
  const rig = createLightRig(scene);

  const run = resolveRun(new URLSearchParams(location.search), drawSeed);
  for (const warning of run.warnings) console.warn(`[run] ${warning}`);
  logRun(run);
  const kit = await loadGltf(CHAMBER_KIT);
  screens.hide(); // the iris stays shut until the first chamber is built

  const first = generateLevel(run.level, run.seed);
  const session = createSession();
  const sim = createSim({ map: first.map, machine, pickups: first, session });
  clock.now = () => sim.timeAt(0);
  const chamber = createChamberView(kit);
  scene.add(chamber.group);
  const pickups = createPickupsView();
  scene.add(pickups.group);
  const hero = createHeroView();
  scene.add(hero.object);
  const cameraRig = createCameraRig(camera);

  const hud = createHud({
    root: hudLayer,
    now: () => clock.now(),
    project,
    keys: () => sim.snapshot().keys,
    timing: look.hud,
    reducedMotion: () => reducedMotion.matches,
    coins: session.coins,
  });
  sim.on('coin', (e) => hud.coin(e));
  sim.on('key', (e) => hud.key(e));
  sim.on('keyLost', () => hud.keyLost());
  sim.on('chestLocked', () => hud.toast('Find the key first!'));
  sim.on('chestOpened', () => pickups.openChest());

  // Per-level views, torn down and rebuilt behind INK on every `building`.
  const levels = createLevelViews();
  levels.add({
    build({ level, seed }) {
      chamber.build(planChamber(level, seed)); // instance counts only
      const cols = level.map[0]?.length ?? 0;
      rig.fitShadowTo(mazeBounds(cols, level.map.length)); // the map, not the padding
    },
  });
  levels.add({ build: ({ level }) => pickups.build(level), teardown: pickups.teardown });
  levels.add({
    build: ({ index }) => hud.level({ index, requiredKeys: sim.snapshot().requiredKeys }),
  });
  levels.add({
    // Light bench: the 4 pool slots sit around the start tile, in view. They move; the
    // rig itself never changes.
    build() {
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
    },
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
    iris.update(timeMs);
    rig.update({ hero: hero.object.position, poolsAtPeak: look.bench.poolsAtPeak });
    view.render();
  };

  let compiled: Promise<void> = Promise.resolve();
  const director = createDirector({
    machine,
    sim,
    view: {
      build: (b) => levels.build(b),
      // Every program, with the full, fixed rig and every view in the scene, once.
      precompile() {
        frame(0);
        compiled = renderer.compileAsync(scene, camera).then(() => undefined);
        return compiled;
      },
    },
    transition: iris,
    cameraRig,
    run,
    drawSeed,
    reducedMotion: () => reducedMotion.matches,
    onRun: logRun,
    onError: shell.showError,
  });

  machine.onChange((to) => {
    if (to === 'ended') screens.ended(session.coins);
    else if (to === 'building') screens.hide();
    else if (to === 'playing' && document.body.dataset['ready'] === undefined) {
      document.body.dataset['ready'] = 'true'; // e2e waits on this
    }
  });

  const loop = createFixedLoop({ update: () => director.update(), render: frame });
  // The restart listener goes first, so the key that restarts never reaches grid input.
  bindRestart(window, { ended: () => machine.state === 'ended', restart: director.restart });
  bindKeyboard(window, sim.input);

  const guard = createRigGuard(
    { lights: () => countLiveLights(scene), programs: () => renderer.info.programs?.length ?? 0 },
    (v) => console.error('[rig-guard] light rig changed after boot', v),
  );
  const stats = import.meta.env.DEV ? createFrameStats() : null;

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
        machine,
        get run() {
          return director.run;
        },
        get level() {
          return director.level;
        },
        chamber,
        pickups: pickups.group,
        hero: hero.object,
        cameraRig,
        sim: createDevSim(sim, loop, director),
      },
    });
  }

  director.start();
  // No frames while the first compile runs: a frame would compile the same programs
  // synchronously. The director reports a rejection itself.
  await compiled.catch(() => undefined);
  if (machine.state === 'failed') return;

  const timer = new Timer();
  let armed = false;
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = timer.getDelta();
    loop.advance(dt);
    if (import.meta.env.DEV) {
      stats?.record(dt * 1000);
      // Arm on the first composed frame after the precompile (post-pass and shadow
      // programs compile on it), then check every frame.
      if (armed) guard.check();
      else if (machine.state !== 'loading' && machine.state !== 'building') {
        guard.arm();
        armed = true;
      }
    }
  });
}

try {
  const s = createShell();
  boot(s).catch((err: unknown) => {
    if (s.machine.state !== 'failed') s.machine.go('failed');
    s.showError(err);
  });
} catch (err) {
  console.error(err);
  document.body.dataset['ready'] = 'error';
}
