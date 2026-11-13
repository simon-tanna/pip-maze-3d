/**
 * The hero view: a capsule stand-in (ticket 10 swaps in Pip) with a nose so facing reads.
 * It draws the simulation's interpolated position and turns to each new facing by the
 * shortest arc over `look.hero.turnMs` of render time. The turn is render-only: the
 * simulation's facing changes instantly at step start.
 */
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Dir } from '@core/grid-input';
import type { WorldXZ } from '@core/grid';
import { look } from './look';
import { color } from './palette';

/** Body capsule: radius 0.4, total height 1.5 (ADR 0002's contact capsule). */
const RADIUS = 0.4;
const HEIGHT = 1.5;

/** `rotation.y` that points the hero's forward (+z) along `dir`. */
export function facingYaw(dir: Dir): number {
  switch (dir) {
    case 'south':
      return 0;
    case 'east':
      return Math.PI / 2;
    case 'north':
      return Math.PI;
    case 'west':
      return -Math.PI / 2;
  }
}

/** `b − a` wrapped to (−π, π]: the shortest signed turn. */
const shortest = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export interface HeroView {
  readonly object: Group;
  update(position: WorldXZ, facing: Dir, timeMs: number): void;
}

export function createHeroView(): HeroView {
  const object = new Group();
  object.name = 'hero';
  const body = new Mesh(
    new CapsuleGeometry(RADIUS, HEIGHT - 2 * RADIUS, 4, 12),
    new MeshStandardMaterial({ color: color('HERO_COAT'), roughness: 0.8 }),
  );
  body.position.y = HEIGHT / 2;
  const nose = new Mesh(
    new BoxGeometry(0.22, 0.16, 0.3),
    new MeshStandardMaterial({ color: color('HERO_COAT_DARK'), roughness: 0.8 }),
  );
  nose.position.set(0, HEIGHT * 0.72, RADIUS);
  for (const m of [body, nose]) m.castShadow = true;
  object.add(body, nose);

  let target: Dir | null = null;
  let turn = { from: 0, delta: 0, startMs: 0 };

  return {
    object,
    update(position, facing, timeMs) {
      object.position.set(position.x, 0, position.z);
      if (target === null) {
        turn = { from: facingYaw(facing), delta: 0, startMs: timeMs }; // first frame: no turn
      } else if (facing !== target) {
        const from = object.rotation.y; // mid-turn re-targets start from where it is
        turn = { from, delta: shortest(from, facingYaw(facing)), startMs: timeMs };
      }
      target = facing;
      const t = look.hero.turnMs > 0 ? (timeMs - turn.startMs) / look.hero.turnMs : 1;
      object.rotation.y = turn.from + turn.delta * Math.min(Math.max(t, 0), 1);
    },
  };
}
