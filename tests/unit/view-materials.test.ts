import { afterEach, describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import type { BufferAttribute, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { BODY_CAPSULE } from '@core/blade';
import { createBladesView } from '@render/blades';
import { createFlamesView } from '@render/flames';
import { createHeroView } from '@render/hero';
import { look } from '@render/look';
import { createPickupsView } from '@render/pickups';

/** Material feel numbers live in `look` (and so in the dev panel): views follow them live. */

const mat = (o: Object3D | undefined) => {
  if (!o) throw new Error('missing object');
  return (o as Mesh).material as MeshStandardMaterial;
};
const named = (root: Object3D, name: string) => root.getObjectByName(name);

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
  it('hero: body and nose roughness', () => {
    const hero = createHeroView();
    look.hero.roughness = 0.33;
    hero.update({ x: 0, z: 0 }, 'south', 0);
    for (const part of hero.object.children) expect(mat(part).roughness).toBe(0.33);
  });

  it('hero: the drawn capsule is the contact capsule', () => {
    const hero = createHeroView();
    hero.update({ x: 0, z: 0 }, 'south', 0);
    const body = hero.object.children[0] as Mesh;
    const box = new Box3().setFromBufferAttribute(
      body.geometry.getAttribute('position') as BufferAttribute,
    );
    expect(box.max.x).toBeCloseTo(BODY_CAPSULE.radius, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(BODY_CAPSULE.height, 6);
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
