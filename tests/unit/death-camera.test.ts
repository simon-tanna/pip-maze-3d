import { PerspectiveCamera } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { instantiateCharacter } from '@assets/models';
import { tileToWorld } from '@core/grid';
import { createSession, createSim, DEATH_TIMING, TICK_MS } from '@game/sim';
import { createGameState } from '@game/state';
import { createCameraRig } from '@render/camera-rig';
import { createHeroView, facingYaw, heroFrame, HERO_MODEL } from '@render/hero';
import { look } from '@render/look';
import { parseModel } from './support/glb';

let pipGltf: GLTF;
beforeAll(async () => {
  pipGltf = await parseModel(HERO_MODEL);
});

// Start (1,1); a flame at (2,1) goes live at 1500 ms (phase 1000).
const MAP = [
  [1, 1, 1, 1, 1],
  [1, 2, 0, 0, 1],
  [1, 1, 1, 1, 1],
];
const FLAME = { col: 2, row: 1 };

/** The sim driving the hero view and camera rig exactly as `main.ts`'s frame does. */
function setup() {
  const machine = createGameState();
  const sim = createSim({
    map: MAP,
    machine,
    pickups: { coins: [], key: { col: 3, row: 1 }, key2: null },
    session: createSession(),
    flames: [{ tile: FLAME, phase: 1000 }],
  });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  const rig = createCameraRig(new PerspectiveCamera());
  const hero = createHeroView(instantiateCharacter(pipGltf));
  sim.on('respawned', () => rig.resetLag());
  const frame = () => {
    const f = heroFrame(sim, 0);
    hero.update(f);
    rig.update(f.position, f.facing, f.timeMs);
  };
  const tick = () => {
    sim.update();
    frame();
  };
  return { sim, rig, hero, tick, frame };
}

describe('death view: the camera holds on the death spot', () => {
  it('holds the camera target and the hero heading from the kill until gone, then cuts', () => {
    const g = setup();
    g.frame();
    g.sim.input.press('east');
    g.sim.input.release('east');
    while (g.sim.snapshot().moving) g.tick();
    while (!g.sim.snapshot().dying) g.tick(); // stands on the flame until it goes live
    const spot = tileToWorld(FLAME.col, FLAME.row);
    expect(g.sim.snapshot().facing).toBe('south'); // the sim's facing resets at t = 0
    expect(g.sim.heroPosition(0)).toEqual(spot);

    const held = { ...g.rig.focus };
    const killedAt = g.sim.timeAt(0);
    const ticks = Math.floor(DEATH_TIMING.gone / TICK_MS) - 1;
    for (let i = 0; i < ticks; i++) {
      g.tick();
      expect(g.sim.timeAt(0) - killedAt).toBeLessThan(DEATH_TIMING.gone);
      expect(g.rig.focus.x).toBeCloseTo(held.x, 4);
      expect(g.rig.focus.z).toBeCloseTo(held.z, 4);
      expect(g.hero.object.rotation.y).toBeCloseTo(facingYaw('east'), 9);
    }

    while (!g.sim.snapshot().grace) g.tick(); // respawn at gone
    const start = tileToWorld(1, 1);
    expect(g.rig.focus.x).toBeCloseTo(start.x, 9);
    expect(g.rig.focus.z).toBeCloseTo(start.z + look.camera.lead, 9); // cut, facing south
    expect(g.sim.heroFacing()).toBe('south');
  });
});
