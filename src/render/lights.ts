import {
  BackSide,
  BufferAttribute,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PointLight,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Texture, WebGLRenderer } from 'three';
import type { MazeBounds } from '@core/grid';
import { KEY_SHADOW_MAP_SIZE, look } from './look';
import { color } from './palette';

/**
 * The fixed light rig (ADR 0001): 1 shadowed north-west key, 1 hemisphere fill, 1 torch
 * and `look.lights.poolSlots` flame-pool slots. Every light is created once, at boot, as
 * a direct child of the scene (never of a node that can be hidden) and stays visible.
 * Runtime code changes only intensity, colour and position; `rig-guard` checks that.
 */
export interface LightRig {
  key: DirectionalLight;
  hemi: HemisphereLight;
  torch: PointLight;
  /** Flame-pool slots. Always exist; intensity 0 when idle. The flame allocator owns them. */
  pools: readonly PointLight[];
  /** Aim the key light at the map's centre and size its shadow frustum to cover all of it. */
  fitShadowTo(bounds: MazeBounds): void;
  update(frame: LightRigFrame): void;
}

export interface LightRigFrame {
  /** Hero position; the torch sits just south of it. */
  hero?: Vector3;
  /** Light bench: every pool slot at peak. Turning it off drops the pools to 0. */
  poolsAtPeak?: boolean;
}

/** North-west in world space: north is -z, west is -x. */
const NORTH_WEST = new Vector3(-1, 0, -1).normalize();

export function createLightRig(scene: Scene): LightRig {
  const l = look.lights;

  const key = new DirectionalLight(color('KEY'), l.keyIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(KEY_SHADOW_MAP_SIZE, KEY_SHADOW_MAP_SIZE);
  scene.add(key, key.target);

  const hemi = new HemisphereLight(color('AMBIENT'), color('FLOOR_DARK'), l.hemiIntensity);
  scene.add(hemi);

  const torch = new PointLight(color('TORCH'), l.torchIntensity, l.torchDistance);
  scene.add(torch);

  const pools = Array.from({ length: l.poolSlots }, () => {
    const pool = new PointLight(color('FLAME'), 0, l.poolDistance);
    scene.add(pool);
    return pool;
  });

  let benchWasOn = false;
  const offset = new Vector3();
  const focus = new Vector3();
  let radius = 10;

  return {
    key,
    hemi,
    torch,
    pools,
    fitShadowTo(bounds) {
      focus.set(bounds.centre.x, 0, bounds.centre.z);
      radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 1;
      const cam = key.shadow.camera;
      cam.left = cam.bottom = -radius;
      cam.right = cam.top = radius;
      cam.updateProjectionMatrix();
    },
    update({ hero, poolsAtPeak = false }) {
      const elevation = (l.keyElevationDeg * Math.PI) / 180;
      offset
        .copy(NORTH_WEST)
        .multiplyScalar(Math.cos(elevation))
        .setY(Math.sin(elevation))
        .multiplyScalar(l.keyDistance);
      key.target.position.copy(focus);
      key.shadow.camera.near = Math.max(0.5, l.keyDistance - radius - 5);
      key.shadow.camera.far = l.keyDistance + radius + 5;
      key.shadow.camera.updateProjectionMatrix();
      key.position.copy(focus).add(offset);
      key.intensity = l.keyIntensity;
      key.shadow.bias = l.keyShadowBias;
      key.shadow.normalBias = l.keyShadowNormalBias;

      hemi.intensity = l.hemiIntensity;

      if (hero) torch.position.set(hero.x, l.torchHeight, hero.z + l.torchLeadSouth);
      torch.intensity = l.torchIntensity;
      torch.distance = l.torchDistance;

      for (const pool of pools) pool.distance = l.poolDistance;
      if (poolsAtPeak) {
        for (const pool of pools) pool.intensity = l.poolIntensity * l.poolPeakScale;
      } else if (benchWasOn) {
        for (const pool of pools) pool.intensity = 0;
      }
      benchWasOn = poolsAtPeak;
    },
  };
}

/**
 * The palette-gradient environment map: a PMREM'd dome, `LIGHT.AMBIENT` above to
 * `FLOOR_DARK` below, so metals read as metal. Generated once at boot, never toggled.
 */
export function createPaletteEnvironment(renderer: WebGLRenderer): Texture {
  const dome = new SphereGeometry(10, 32, 16);
  const top = color('AMBIENT');
  const bottom = color('FLOOR_DARK');
  const pos = dome.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  const c = top.clone();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) / 10 + 1) / 2; // 0 at the bottom pole, 1 at the top
    c.copy(bottom)
      .lerp(top, t)
      .toArray(colours, i * 3);
  }
  dome.setAttribute('color', new BufferAttribute(colours, 3));

  const envScene = new Scene();
  const material = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
  envScene.add(new Mesh(dome, material));

  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene).texture;
  pmrem.dispose();
  dome.dispose();
  material.dispose();
  return env;
}
