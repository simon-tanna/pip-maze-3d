/**
 * Fixed-yaw north chase camera (map ticket 01, variant A). The camera never rotates:
 * it sits `back` m south of and `up` m above a focus point, and looks at it. The focus
 * follows the hero's interpolated position pushed `lead` m along its facing, smoothed by
 * an exponential lag (`1 − exp(−dt / lag)`). `dt` is render-time difference in simulation
 * ms (the caller passes `sim.timeAt(alpha)`), so pause/advance stay deterministic and the
 * view freezes with the simulation. An optional `shake` (screen-space m) translates the
 * camera along its own x and y axes after aiming, so it never turns or drags the focus.
 */
import type { PerspectiveCamera } from 'three';
import { DIR_DELTA } from '@core/grid-input';
import type { Dir } from '@core/grid-input';
import type { WorldXZ } from '@core/grid';
import { look } from './look';

export interface CameraRig {
  /**
   * Follow `hero` facing `facing`, at render time `timeMs`, offset by `shake` (camera-space
   * m, default none). The first update snaps.
   */
  update(hero: WorldXZ, facing: Dir, timeMs: number, shake?: ScreenOffset): void;
  /** The next update cuts to its target with no lag (level build, respawn). */
  resetLag(): void;
  /** The smoothed point the camera looks at. */
  readonly focus: WorldXZ;
  /** The shake applied on the last update (e2e reads it: zero under reduced motion). */
  readonly shake: Readonly<ScreenOffset>;
}

/** An offset along the camera's own x (right) and y (up), m. */
export interface ScreenOffset {
  x: number;
  y: number;
}

const NO_SHAKE: ScreenOffset = { x: 0, y: 0 };

export function createCameraRig(camera: PerspectiveCamera): CameraRig {
  const focus = { x: 0, z: 0 };
  const shook = { x: 0, y: 0 };
  let lastMs: number | null = null;
  return {
    focus,
    shake: shook,
    resetLag() {
      lastMs = null;
    },
    update(hero, facing, timeMs, shake = NO_SHAKE) {
      const cam = look.camera;
      const { dCol, dRow } = DIR_DELTA[facing];
      const tx = hero.x + dCol * cam.lead;
      const tz = hero.z + dRow * cam.lead;
      const dt = lastMs === null ? Infinity : Math.max(0, timeMs - lastMs) / 1000;
      const k = cam.lagSeconds > 0 ? 1 - Math.exp(-dt / cam.lagSeconds) : 1;
      focus.x += (tx - focus.x) * k;
      focus.z += (tz - focus.z) * k;
      lastMs = timeMs;

      if (camera.fov !== cam.fov) {
        camera.fov = cam.fov;
        camera.updateProjectionMatrix();
      }
      camera.position.set(focus.x, cam.up, focus.z + cam.back);
      camera.lookAt(focus.x, 0, focus.z);
      shook.x = shake.x;
      shook.y = shake.y;
      if (shake.x !== 0 || shake.y !== 0) {
        camera.translateX(shake.x);
        camera.translateY(shake.y);
      }
    },
  };
}
