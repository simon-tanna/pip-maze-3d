import { Scene, Vector3 } from 'three';
import type { Light } from 'three';
import { describe, expect, it } from 'vitest';
import { look } from '@render/look';
import { createLightRig } from '@render/lights';
import { color } from '@render/palette';

const lightsIn = (scene: Scene) => {
  const out: Light[] = [];
  scene.traverse((o) => {
    if ((o as Light).isLight) out.push(o as Light);
  });
  return out;
};

describe('light rig', () => {
  it('adds exactly key + hemisphere + torch + 4 pool slots, all direct children of the scene', () => {
    const scene = new Scene();
    const rig = createLightRig(scene);
    const all = lightsIn(scene);
    expect(all).toHaveLength(7);
    for (const l of all) expect(l.parent).toBe(scene);
    expect(rig.pools).toHaveLength(look.lights.poolSlots);
    expect(all.filter((l) => l.castShadow)).toEqual([rig.key]);
  });

  it('starts every pool slot visible at intensity 0, in the flame colour', () => {
    const rig = createLightRig(new Scene());
    for (const pool of rig.pools) {
      expect(pool.visible).toBe(true);
      expect(pool.intensity).toBe(0);
      expect(pool.color.equals(color('FLAME'))).toBe(true);
    }
  });

  it('puts the key light north-west of its target at the look elevation', () => {
    const rig = createLightRig(new Scene());
    rig.fitShadowTo({ minX: 2, minZ: 4, maxX: 6, maxZ: 8, centre: { x: 4, z: 6 } });
    rig.update({});
    const dir = rig.key.position.clone().sub(rig.key.target.position).normalize();
    expect(dir.x).toBeLessThan(0); // west = -x
    expect(dir.z).toBeLessThan(0); // north = -z
    expect(dir.x).toBeCloseTo(dir.z, 6);
    const elevation = (Math.asin(dir.y) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(look.lights.keyElevationDeg, 6);
    expect(rig.key.target.position.toArray()).toEqual([4, 0, 6]);
  });

  it('fits the key shadow frustum around a map and aims at its centre', () => {
    const rig = createLightRig(new Scene());
    rig.fitShadowTo({ minX: 0, minZ: 0, maxX: 80, maxZ: 30, centre: { x: 40, z: 15 } });
    rig.update({});
    const cam = rig.key.shadow.camera;
    const radius = Math.hypot(40, 15);
    expect(cam.right).toBeGreaterThanOrEqual(radius);
    expect(cam.top).toBeGreaterThanOrEqual(radius);
    expect(cam.left).toBe(-cam.right);
    expect(rig.key.target.position.toArray()).toEqual([40, 0, 15]);
    const toTarget = rig.key.position.distanceTo(rig.key.target.position);
    expect(cam.near).toBeLessThan(toTarget - radius);
    expect(cam.far).toBeGreaterThan(toTarget + radius);
  });

  it('keeps the torch just south of the hero and drives pools to peak on the bench', () => {
    const rig = createLightRig(new Scene());
    rig.update({ hero: new Vector3(2, 0, 3), poolsAtPeak: true });
    expect(rig.torch.position.x).toBe(2);
    expect(rig.torch.position.z).toBeCloseTo(3 + look.lights.torchLeadSouth);
    expect(rig.torch.position.y).toBe(look.lights.torchHeight);
    for (const pool of rig.pools) {
      expect(pool.intensity).toBe(look.lights.poolIntensity * look.lights.poolPeakScale);
    }
    rig.update({ poolsAtPeak: false });
    for (const pool of rig.pools) expect(pool.intensity).toBe(0);
  });
});
