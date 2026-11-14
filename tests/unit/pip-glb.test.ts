import { Box3, Vector3 } from 'three';
import type { Bone, Material, Mesh, Object3D, SkinnedMesh } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { HERO_MODEL } from '@render/hero';
import palette from '@render/palette.json';
import { parseModel } from './support/glb';

/** The character contract (3d-slice ticket 06, m1 ticket 10) on the committed Pip GLB. */
let gltf: GLTF;
beforeAll(async () => {
  gltf = await parseModel(HERO_MODEL);
});

const all = <T extends Object3D>(root: Object3D, pick: (o: Object3D) => boolean) => {
  const found: T[] = [];
  root.traverse((o) => {
    if (pick(o)) found.push(o as T);
  });
  return found;
};

describe('Pip GLB', () => {
  it('has one skeleton of 12–16 snake_case bones with _L/_R sides', () => {
    const skinned = all<SkinnedMesh>(gltf.scene, (o) => (o as SkinnedMesh).isSkinnedMesh);
    expect(skinned.length).toBeGreaterThan(0);
    const skeletons = new Set(skinned.map((m) => m.skeleton.bones.map((b) => b.name).join()));
    expect(skeletons.size).toBe(1);
    const bones = all<Bone>(gltf.scene, (o) => (o as Bone).isBone).map((b) => b.name);
    expect(bones.length).toBeGreaterThanOrEqual(12);
    expect(bones.length).toBeLessThanOrEqual(16);
    for (const name of bones) expect(name).toMatch(/^[a-z]+(_[a-z]+)*(_[LR])?$/);
    expect(bones.filter((b) => b.endsWith('_L')).length).toBe(
      bones.filter((b) => b.endsWith('_R')).length,
    );
  });

  it('skins with at most 4 influences per vertex (three reads JOINTS_0 only)', () => {
    for (const m of all<SkinnedMesh>(gltf.scene, (o) => (o as SkinnedMesh).isSkinnedMesh)) {
      expect(m.geometry.getAttribute('skinIndex').itemSize).toBe(4);
    }
  });

  it('has exactly the clips idle and walk, each starting at t = 0', () => {
    expect(gltf.animations.map((c) => c.name).sort()).toEqual(['idle', 'walk']);
    for (const clip of gltf.animations) {
      const first = Math.min(...clip.tracks.map((t) => t.times[0] ?? Infinity));
      expect(first, clip.name).toBeCloseTo(0, 6);
    }
  });

  it('names every material slot after a HERO_* palette key', () => {
    const names = new Set<string>();
    for (const m of all<Mesh>(gltf.scene, (o) => (o as Mesh).isMesh)) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as Material[]) names.add(mat.name);
    }
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toMatch(/^HERO_/);
      expect(Object.keys(palette.P)).toContain(name);
    }
  });

  it('stands about 1.5 m tall on its origin, inside a 1.2 m footprint, facing +z', () => {
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene, true);
    const size = box.getSize(new Vector3());
    expect(size.y).toBeGreaterThan(1.4);
    expect(size.y).toBeLessThan(1.6);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(size.x).toBeLessThanOrEqual(1.2);
    expect(size.z).toBeLessThanOrEqual(1.2);
    expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(0.05);
    // The face is on the front: the scar sits on +z (south, toward the camera).
    const scar = all<Mesh>(gltf.scene, (o) => (o as Mesh).isMesh).find(
      (m) => (m.material as Material).name === 'HERO_SCAR',
    );
    expect(scar).toBeDefined();
    scar?.geometry.computeBoundingBox();
    expect(scar?.geometry.boundingBox?.min.z).toBeGreaterThan(0.1);
  });
});
