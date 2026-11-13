import { describe, expect, it } from 'vitest';
import { createHeroView, facingYaw } from '@render/hero';
import { look } from '@render/look';

const T = look.hero.turnMs;
/** Angle a minus b, wrapped to (−π, π]. */
const diff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe('hero view', () => {
  it('sits on the given position, its forward (+z) pointing along facing', () => {
    const hero = createHeroView();
    hero.update({ x: 3, z: 5 }, 'east', 0);
    expect(hero.object.position.x).toBe(3);
    expect(hero.object.position.z).toBe(5);
    expect(diff(hero.object.rotation.y, facingYaw('east'))).toBeCloseTo(0, 9);
  });

  it('turns to a new facing over 60 ms of render time', () => {
    const hero = createHeroView();
    hero.update({ x: 0, z: 0 }, 'south', 0);
    hero.update({ x: 0, z: 0 }, 'east', 100);
    expect(diff(hero.object.rotation.y, facingYaw('south'))).toBeCloseTo(0, 9);
    hero.update({ x: 0, z: 0 }, 'east', 100 + T / 2);
    expect(diff(hero.object.rotation.y, facingYaw('south'))).toBeCloseTo(Math.PI / 4, 9);
    hero.update({ x: 0, z: 0 }, 'east', 100 + T);
    expect(diff(hero.object.rotation.y, facingYaw('east'))).toBeCloseTo(0, 9);
  });

  it('takes the shortest arc (north → west turns a quarter, not three)', () => {
    const hero = createHeroView();
    hero.update({ x: 0, z: 0 }, 'north', 0);
    hero.update({ x: 0, z: 0 }, 'west', 10);
    hero.update({ x: 0, z: 0 }, 'west', 10 + T / 2);
    expect(Math.abs(diff(hero.object.rotation.y, facingYaw('north')))).toBeCloseTo(Math.PI / 4, 9);
    expect(Math.abs(diff(hero.object.rotation.y, facingYaw('west')))).toBeCloseTo(Math.PI / 4, 9);
  });
});
