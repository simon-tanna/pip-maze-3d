import { describe, expect, it } from 'vitest';
import type { LevelBuild } from '@game/state';
import { createLevelViews } from '@render/level-views';

const build = (index: number) => ({ index, seed: index, level: {} }) as unknown as LevelBuild;

describe('level views', () => {
  it('tears every registered view down, then builds each, in registration order', () => {
    const log: string[] = [];
    const views = createLevelViews();
    for (const name of ['chamber', 'pickups']) {
      views.add({
        teardown: () => log.push(`teardown ${name}`),
        build: (b) => log.push(`build ${name} ${b.index}`),
      });
    }
    views.build(build(0));
    views.build(build(1));
    expect(log).toEqual([
      'teardown chamber',
      'teardown pickups',
      'build chamber 0',
      'build pickups 0',
      'teardown chamber',
      'teardown pickups',
      'build chamber 1',
      'build pickups 1',
    ]);
  });

  it('a view without teardown just builds', () => {
    const views = createLevelViews();
    let built = 0;
    views.add({ build: () => built++ });
    views.build(build(0));
    expect(built).toBe(1);
  });
});
