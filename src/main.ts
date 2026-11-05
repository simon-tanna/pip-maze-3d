import {
  CapsuleGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Timer,
} from 'three';
import { loadModel } from '@assets/models';
import { createFixedLoop } from '@game/loop';
import { createRenderer } from '@render/renderer';
import './style.css';

/**
 * Scaffold boot: proves the toolchain (Vite + TS + three.js + render loop) works.
 * Replace the placeholder scene with the real game bootstrap when porting starts.
 */
function boot(): void {
  const container = document.getElementById('game');
  if (!container) throw new Error('#game container missing from index.html');

  const scene = new Scene();
  scene.background = new Color(0x0e0a0c); // v2 "ink" background

  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 6, 8); // third-person: behind and above the hero
  camera.lookAt(0, 1, 0);

  const renderer = createRenderer(container, camera);

  scene.add(new HemisphereLight(0xffe8c0, 0x2a1810, 0.6));
  const sun = new DirectionalLight(0xffd8a0, 2);
  sun.position.set(-6, 10, -4); // v2 convention: light from the top-left
  sun.castShadow = true;
  scene.add(sun);

  const floor = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor, new GridHelper(20, 10, 0x3a2a1c, 0x3a2a1c));

  const hero = new Mesh(
    new CapsuleGeometry(0.4, 1, 4, 12),
    new MeshStandardMaterial({ color: 0xe0b060 }),
  );
  hero.position.y = 0.9;
  hero.castShadow = true;
  scene.add(hero);

  // Blender pipeline check: built by `pnpm assets:placeholders`.
  void loadModel('placeholders/wall').then((wall) => {
    wall.position.set(-3, 0, 0);
    scene.add(wall);
  });

  let t = 0;
  const loop = createFixedLoop({
    update(dt) {
      t += dt;
      hero.rotation.y = t * 0.8;
    },
    render() {
      renderer.render(scene, camera);
    },
  });

  const timer = new Timer();
  renderer.setAnimationLoop((now) => {
    timer.update(now);
    loop.advance(timer.getDelta());
  });

  document.body.dataset['ready'] = 'true'; // e2e smoke test waits on this

  if (import.meta.env.DEV) {
    Object.assign(window, { __game: { scene, camera, renderer } });
  }
}

boot();
