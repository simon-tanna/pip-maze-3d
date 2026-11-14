import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ShaderLib } from 'three';
import type { Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { instantiateCharacter } from '@assets/models';
import { createBladesView } from '@render/blades';
import { createFlamesView } from '@render/flames';
import { createHeroView, HERO_MODEL } from '@render/hero';
import { look } from '@render/look';
import { color } from '@render/palette';
import { createPickupsView } from '@render/pickups';
import { parseModel } from './support/glb';

/** Material feel numbers live in `look` (and so in the dev panel): views follow them live. */

const mat = (o: Object3D | undefined) => {
  if (!o) throw new Error('missing object');
  return (o as Mesh).material as MeshStandardMaterial;
};
const named = (root: Object3D, name: string) => root.getObjectByName(name);

let pipGltf: GLTF;
beforeAll(async () => {
  pipGltf = await parseModel(HERO_MODEL);
});

const saved = structuredClone({
  hero: look.hero,
  blade: look.blade,
  flame: look.flame,
  pickups: look.pickups,
});
afterEach(() => {
  Object.assign(look.hero, saved.hero);
  Object.assign(look.blade, saved.blade);
  Object.assign(look.flame, saved.flame);
  Object.assign(look.pickups, saved.pickups);
});

describe('view materials follow look', () => {
  it('hero: Pip roughness, the CREAM rim and the INK blob follow look', () => {
    const hero = createHeroView(instantiateCharacter(pipGltf));
    look.hero.roughness = 0.33;
    look.hero.rimStrength = 0.9;
    look.hero.rimPower = 4.5;
    look.hero.blobRadius = 0.6;
    look.hero.blobOpacity = 0.4;
    hero.update({
      position: { x: 0, z: 0 },
      facing: 'south',
      timeMs: 0,
      moving: false,
      dying: false,
    });

    const pip = named(hero.object, 'pip');
    const meshes: Mesh[] = [];
    pip?.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      const material = m.material as MeshStandardMaterial;
      expect(material.roughness).toBe(0.33);
      // The rim patch compiles into the standard shader, with live uniforms.
      const shader = {
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader,
      };
      material.onBeforeCompile(shader as never, null as never);
      expect(shader.fragmentShader).toContain('rimFresnel');
      expect(shader.fragmentShader).toContain('uniform vec3 rimColor');
      expect(shader.uniforms['rimColor']?.value).toEqual(color('CREAM'));
      expect(shader.uniforms['rimStrength']?.value).toBe(0.9);
      expect(shader.uniforms['rimPower']?.value).toBe(4.5);
    }

    const blob = named(hero.object, 'blob') as Mesh;
    const blobMat = blob.material as MeshBasicMaterial;
    expect(blobMat.color).toEqual(color('INK'));
    expect(blobMat.opacity).toBe(0.4);
    expect(blob.scale.x).toBeCloseTo(1.2, 9);
    expect(blob.castShadow).toBe(false);
  });

  it('blades: lintel stone roughness and steel metalness', () => {
    const view = createBladesView();
    view.build([{ tile: { col: 1, row: 1 } }]);
    look.blade.stoneRoughness = 0.42;
    look.blade.steelMetalness = 0.7;
    view.update([{ tile: { col: 1, row: 1 }, angle: 0 }]);
    expect(mat(named(view.group, 'lintel')).roughness).toBe(0.42);
    expect(mat(named(view.group, 'head')).metalness).toBe(0.7);
  });

  it('flames: off and lit roughness', () => {
    const view = createFlamesView();
    const flames = [
      { tile: { col: 1, row: 1 } },
      { tile: { col: 2, row: 1 } },
      { tile: { col: 3, row: 1 } },
    ];
    view.build(flames);
    look.flame.offRoughness = 0.11;
    look.flame.litRoughness = 0.22;
    view.update([
      { tile: { col: 1, row: 1 }, state: 'off' },
      { tile: { col: 2, row: 1 }, state: 'telegraph' },
      { tile: { col: 3, row: 1 }, state: 'on' },
    ]);
    expect(mat(named(view.group, 'flame_0')).roughness).toBe(0.11);
    expect(mat(named(view.group, 'flame_1')).roughness).toBe(0.22);
    expect(mat(named(view.group, 'flame_2')).roughness).toBe(0.22);
  });

  it('pickups: gold metalness and roughness', () => {
    const view = createPickupsView();
    view.build({
      coins: [{ col: 1, row: 1 }],
      key: { col: 2, row: 1 },
      key2: null,
      exitCol: 3,
      exitRow: 1,
    });
    look.pickups.goldMetalness = 0.25;
    look.pickups.goldRoughness = 0.15;
    look.pickups.chestRoughness = 0.65;
    view.update({ coinVisible: () => true, keyVisible: () => true });
    expect(mat(named(view.group, 'coin_0'))).toMatchObject({ metalness: 0.25, roughness: 0.15 });
    expect(mat(named(view.group, 'chest'))).toMatchObject({ metalness: 0.25, roughness: 0.65 });
  });
});
