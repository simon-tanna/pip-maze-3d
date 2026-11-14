import type { Object3D, SkinnedMesh } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { instantiateCharacter } from '@assets/models';
import { HERO_MODEL } from '@render/hero';
import { parseModel } from './support/glb';

let gltf: GLTF;
beforeAll(async () => {
  gltf = await parseModel(HERO_MODEL);
});

const skinnedIn = (root: Object3D) => {
  const found: SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) found.push(o as SkinnedMesh);
  });
  return found;
};
const contains = (root: Object3D, o: Object3D) => {
  let hit = false;
  root.traverse((x) => {
    if (x === o) hit = true;
  });
  return hit;
};

describe('a character instance', () => {
  it('binds each skinned mesh to its own bones, not the cached original’s', () => {
    const a = instantiateCharacter(gltf);
    const b = instantiateCharacter(gltf);
    for (const [instance, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const meshes = skinnedIn(instance.root);
      expect(meshes.length).toBeGreaterThan(0);
      for (const mesh of meshes) {
        for (const bone of mesh.skeleton.bones) {
          expect(contains(instance.root, bone)).toBe(true);
          expect(contains(other.root, bone)).toBe(false);
          expect(contains(gltf.scene, bone)).toBe(false);
        }
      }
    }
  });

  it('shares the parsed clips', () => {
    const { clips } = instantiateCharacter(gltf);
    expect(clips).toBe(gltf.animations);
  });
});
