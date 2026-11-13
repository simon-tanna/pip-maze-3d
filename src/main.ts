import {
  CapsuleGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Timer,
} from 'three';
import type { Light } from 'three';
import { loadModel } from '@assets/models';
import { mazeBounds, tileToWorld } from '@core/grid';
import { createFixedLoop } from '@game/loop';
import { createFrameStats } from '@render/frame-stats';
import { GREYBOX_COLS, GREYBOX_ROWS, buildGreybox } from '@render/greybox';
import { createLightRig, createPaletteEnvironment } from '@render/lights';
import { look } from '@render/look';
import { LIGHT, P, color } from '@render/palette';
import { createRenderer } from '@render/renderer';
import { createRigGuard } from '@render/rig-guard';
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
 * Scaffold boot: the fixed light rig and post chain over a chamber-sized greybox, with a
 * capsule standing in for the hero. Ticket 03 replaces the greybox with the real chamber.
 */
async function boot(): Promise<void> {
  const container = document.getElementById('game');
  if (!container) throw new Error('#game container missing from index.html');
  paletteToCss();

  const scene = new Scene();
  scene.background = color('INK');

  const cam = look.camera;
  const camera = new PerspectiveCamera(cam.fov, 1, cam.near, cam.far);
  const view = createRenderer(container, scene, camera);
  const { renderer } = view;

  scene.environment = createPaletteEnvironment(renderer);
  const rig = createLightRig(scene);

  const [wall, floor] = await Promise.all([
    loadModel('placeholders/wall'),
    loadModel('placeholders/floor'),
  ]);
  scene.add(buildGreybox(wall, floor));
  rig.fitShadowTo(mazeBounds(GREYBOX_COLS, GREYBOX_ROWS));

  const heroTile = tileToWorld(19, 7);
  const hero = new Mesh(
    new CapsuleGeometry(0.4, 0.7, 4, 12),
    new MeshStandardMaterial({ color: color('HERO_COAT'), roughness: 0.8 }),
  );
  hero.position.set(heroTile.x, 0.75, heroTile.z);
  hero.castShadow = true;
  scene.add(hero);

  // Light bench: the 4 pool slots sit on floor tiles around the hero, in view.
  rig.pools.forEach((pool, i) => {
    const [col, row] = (
      [
        [17, 7],
        [21, 7],
        [19, 5],
        [19, 9],
      ] as const
    )[i % 4] ?? [19, 7];
    const { x, z } = tileToWorld(col, row);
    pool.position.set(x, look.lights.poolHeight, z);
  });

  const placeCamera = () => {
    camera.fov = cam.fov;
    camera.position.set(hero.position.x, cam.up, hero.position.z + cam.back);
    camera.lookAt(hero.position.x, 0, hero.position.z - cam.lead);
    camera.updateProjectionMatrix();
  };

  const frame = () => {
    scene.environmentIntensity = look.lights.envIntensity;
    rig.update({ hero: hero.position, poolsAtPeak: look.bench.poolsAtPeak });
    placeCamera();
    view.render();
  };

  // Compile every program with the full, fixed rig before the first frame.
  frame();
  await renderer.compileAsync(scene, camera);

  let t = 0;
  const loop = createFixedLoop({
    update(dt) {
      t += dt;
      hero.rotation.y = t * 0.8;
    },
    render() {
      frame();
    },
  });

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
      },
    });
  }

  document.body.dataset['ready'] = 'true'; // e2e waits on this
}

boot().catch((err: unknown) => {
  console.error(err);
  document.body.dataset['ready'] = 'error';
});
