import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LinearFilter, LinearMipmapLinearFilter, ShaderLib } from 'three';
import type {
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { gltfKit, instantiateCharacter } from '@assets/models';
import { BLADE_MODEL } from '@render/blade-kit';
import { createBladesView } from '@render/blades';
import { createFlamesView, FLAME_MODEL } from '@render/flames';
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
      fallen: false,
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

  it('hero: the blob falls off smoothly, with the exponent from look', () => {
    const hero = createHeroView(instantiateCharacter(pipGltf));
    const frame = {
      position: { x: 0, z: 0 },
      facing: 'south' as const,
      timeMs: 0,
      moving: false,
      fallen: false,
    };
    const alphaMap = () =>
      ((named(hero.object, 'blob') as Mesh).material as MeshBasicMaterial).alphaMap as DataTexture;
    /** Alpha (green) halfway from the centre to the edge, along the middle row, 0–1. */
    const halfway = () => {
      const { data, width } = alphaMap().image as { data: Uint8Array; width: number };
      const row = Math.floor(width / 2);
      const c = (width - 1) / 2;
      const x = Math.round(c + c / 2);
      const r = Math.hypot(x - c, row - c) / c;
      return { alpha: (data[(row * width + x) * 4 + 1] ?? 0) / 255, r };
    };

    look.hero.blobFalloff = 2;
    hero.update(frame);
    const tex = alphaMap();
    expect(tex.magFilter).toBe(LinearFilter);
    expect(tex.minFilter).toBe(LinearMipmapLinearFilter);
    expect(tex.generateMipmaps).toBe(true);
    let { alpha, r } = halfway();
    expect(alpha).toBeCloseTo((1 - r) ** 2, 2);

    look.hero.blobFalloff = 1;
    hero.update(frame);
    ({ alpha, r } = halfway());
    expect(alpha).toBeCloseTo(1 - r, 2);
  });

  it('blades: steel and stone roughness scales, steel reflections', async () => {
    const gltf = await parseModel(BLADE_MODEL, { skipTextures: true });
    const view = createBladesView(gltfKit(gltf, BLADE_MODEL));
    view.build([{ tile: { col: 1, row: 1 } }]);
    look.blade.stoneRoughness = 0.42;
    look.blade.steelRoughness = 0.7;
    look.blade.steelEnvIntensity = 1.5;
    view.update([{ tile: { col: 1, row: 1 }, angle: 0 }]);
    expect(mat(named(view.group, 'lintel_0')).roughness).toBe(0.42);
    expect(mat(named(view.group, 'head')).roughness).toBe(0.7);
    expect(mat(named(view.group, 'haft')).envMapIntensity).toBe(1.5);
  });

  it('flames: bed roughness, column gain and glow size follow look', async () => {
    const view = createFlamesView(gltfKit(await parseModel(FLAME_MODEL), FLAME_MODEL));
    view.build([{ tile: { col: 1, row: 1 } }]);
    look.flame.bedRoughness = 0.11;
    look.flame.gain = 3.3;
    look.flame.glowSize = 2.5;
    view.update([{ tile: { col: 1, row: 1 }, state: 'on', intoMs: 500 }], { timeMs: 0 });
    const flame = named(view.group, 'flame_0');
    if (!flame) throw new Error('no flame_0');
    expect(mat(named(flame, 'bed')).roughness).toBe(0.11);
    const column = (named(flame, 'column') as Mesh).material as ShaderMaterial;
    expect(column.uniforms['uGain']?.value).toBe(3.3);
    expect(named(flame, 'glow')?.scale.x).toBe(2.5);
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
