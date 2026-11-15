import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraRig } from '@render/camera-rig';
import { look } from '@render/look';

const cam = look.camera;

function rig() {
  const camera = new PerspectiveCamera();
  return { camera, rig: createCameraRig(camera) };
}

describe('camera rig', () => {
  it('first frame snaps: behind (south of) and above a point 1 m ahead along facing', () => {
    const { camera, rig: r } = rig();
    r.update({ x: 10, z: 20 }, 'east', 0);
    expect(camera.position.x).toBeCloseTo(10 + cam.lead, 9);
    expect(camera.position.y).toBeCloseTo(cam.up, 9);
    expect(camera.position.z).toBeCloseTo(20 + cam.back, 9);
    expect(r.focus).toEqual({ x: 10 + cam.lead, z: 20 });
  });

  it('follows with exponential lag measured in render time', () => {
    const { camera, rig: r } = rig();
    r.update({ x: 0, z: 0 }, 'north', 0);
    r.update({ x: 2, z: 0 }, 'north', cam.lagSeconds * 1000); // one time constant
    expect(camera.position.x).toBeCloseTo(2 * (1 - Math.exp(-1)), 9);
    r.update({ x: 2, z: 0 }, 'north', cam.lagSeconds * 1000 + 600);
    expect(Math.abs(camera.position.x - 2)).toBeLessThan(0.02); // settled within 0.6 s
  });

  it('resetLag() makes the next update cut straight to the target', () => {
    const { camera, rig: r } = rig();
    r.update({ x: 0, z: 0 }, 'south', 0);
    r.resetLag();
    r.update({ x: 30, z: 4 }, 'south', 16);
    expect(camera.position.x).toBeCloseTo(30, 9);
    expect(camera.position.z).toBeCloseTo(4 + cam.lead + cam.back, 9);
  });

  it('a shake offsets the camera along screen x and y without turning it or moving the focus', () => {
    const { camera, rig: r } = rig();
    r.update({ x: 10, z: 20 }, 'south', 0);
    const still = camera.position.clone();
    const q = camera.quaternion.clone();
    r.update({ x: 10, z: 20 }, 'south', 16, { x: 0.1, y: -0.05 });
    expect(r.shake).toEqual({ x: 0.1, y: -0.05 });
    expect(camera.position.x).toBeCloseTo(still.x + 0.1, 9);
    expect(camera.position.distanceTo(still)).toBeCloseTo(Math.hypot(0.1, 0.05), 9);
    expect(camera.quaternion.angleTo(q)).toBeCloseTo(0, 6);
    r.update({ x: 10, z: 20 }, 'south', 32);
    expect(r.shake).toEqual({ x: 0, y: 0 });
    expect(camera.position.distanceTo(still)).toBeCloseTo(0, 9);
  });
});
