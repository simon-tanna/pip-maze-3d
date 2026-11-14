/**
 * The per-level teardown list (spec: State machine → building). Every per-level view
 * (chamber, pickups, and tickets 07/08's hazards) registers here; `build` tears all of
 * them down, then builds each for the new level, behind full INK.
 *
 * Teardown rule: dispose only per-level geometry and Object3Ds. Materials are
 * module-scoped and shared, so no shader program is ever freed and recompiled, and no
 * light is added, removed or toggled.
 */
import type { LevelBuild } from '@game/state';

export interface LevelView {
  build(build: LevelBuild): void;
  teardown?(): void;
}

export interface LevelViews {
  add(view: LevelView): void;
  build(build: LevelBuild): void;
}

export function createLevelViews(): LevelViews {
  const views: LevelView[] = [];
  return {
    add: (view) => void views.push(view),
    build(b) {
      for (const v of views) v.teardown?.();
      for (const v of views) v.build(b);
    },
  };
}
