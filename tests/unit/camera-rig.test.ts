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
});
