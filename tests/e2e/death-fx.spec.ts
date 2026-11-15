/**
 * Ticket 15: death, respawn and FX feel. A mid-step blade death holds the camera on the
 * death spot and cuts to the start tile at `gone`; the light count and the rig guard hold
 * through the grace flicker; each reduced-motion rule (no shake, no damage flash, a 1-tick
 * hit-stop, a steady rim) is checked against its observable, next to the normal-motion
 * value; and the particles of a pinned seed render the same pixels on every load.
 *
 * As in blades-kill.spec.ts, a recorder in the page logs the sim's events tick-exact.
 */
import type { Page } from '@playwright/test';
import { expect, LEVEL_0, routeMoves, test } from './fixtures/game';
import type { DevGameWindow, GameDriver, Move } from './fixtures/game';

const TICK = 1000 / 60;
const GONE_MS = 270; // DEATH_TIMING.gone
const GRACE_MS = 1000; // DEATH_TIMING.graceMs
const SPIN_MS = 1600; // HAZARD_TIMING.bladeSpin
const TELEGRAPH_MS = 500; // HAZARD_TIMING.telegraph
const FLAME_CYCLE = 4500;
const SHAKE_MS = 120; // look.fx.deathShakeMs
const LEAD = 1; // look.camera.lead

const BLADE = { col: 24, row: 1 };
const TO_BESIDE_BLADE: Move[] = [...(LEVEL_0.legs[2]?.moves.slice(0, 7) ?? []), ['east', 2]];
/** Level 0's flame by the key, and the route from the key to the tile west of it. */
const FLAME = { col: 19, row: 7 };
const KEY_TO_BESIDE_FLAME: Move[] = [
  ['south', 2],
  ['east', 2],
  ['south', 2],
  ['east', 1],
];

interface HeroFx {
  flash: number;
  knockback: number;
  scale: { x: number; y: number };
  visible: boolean;
  rim: number;
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    scene: {
      traverseVisible(fn: (o: { isLight?: boolean }) => void): void;
      children: { isLight?: boolean; visible: boolean }[];
    };
    renderer: { info: { programs: unknown[] | null }; domElement: HTMLCanvasElement };
    guard: { violations: unknown[] };
    hero: { position: { x: number; z: number } };
    heroView: { fx(): HeroFx };
    cameraRig: {
      focus: { x: number; z: number };
      shake: { x: number; y: number };
      resetLag(): void;
    };
    fx: { group: object; drawn(): { normal: number; additive: number } };
    look: { hero: { graceRim: number; rimStrength: number } };
  };
  __e2e?: { type: string; simMs: number }[];
}

test.use({ viewport: { width: 640, height: 400 } });

async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Win;
    const log: { type: string; simMs: number }[] = [];
    w.__e2e = log;
    const sim = w.__game.sim;
    for (const type of ['died', 'respawned', 'key'] as const) {
      sim.on(type, () => log.push({ type, simMs: sim.snapshot().simMs }));
    }
  });
}
const recorded = (page: Page) => page.evaluate(() => (window as unknown as Win).__e2e ?? []);
const event = async (page: Page, type: string) =>
  (await recorded(page)).find((e) => e.type === type);

/** Run exactly one tick (one render). */
const tick = (game: GameDriver) => game.advance(TICK - 0.01);

/** Everything a frame shows of the death sequence, read after its render. */
const frame = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    let lights = 0;
    g.scene.traverseVisible((o) => void (o.isLight && lights++));
    const flash = document.querySelector<HTMLElement>('[data-fx="damage-flash"]');
    return {
      simMs: g.sim.snapshot().simMs,
      focus: { ...g.cameraRig.focus },
      shake: { ...g.cameraRig.shake },
      hero: { x: g.hero.position.x, z: g.hero.position.z },
      fx: g.heroView.fx(),
      flash: flash ? Number(getComputedStyle(flash).opacity) : NaN,
      lights,
      programs: g.renderer.info.programs?.length ?? 0,
      violations: g.guard.violations.length,
    };
  });
type Frame = Awaited<ReturnType<typeof frame>>;

/** Tick and read every frame from now until `ms` after `fromMs`. */
async function frames(game: GameDriver, fromMs: number, ms: number) {
  const seen: Frame[] = [await frame(game.page)];
  while ((seen.at(-1)?.simMs ?? Infinity) < fromMs + ms) {
    await tick(game);
    seen.push(await frame(game.page));
  }
  return seen;
}

/**
 * Walk to the key and on to the tile west of level 0's flame, wait for its next go-live,
 * and step onto it. Returns the kill time.
 */
async function dieOnTheFlame(game: GameDriver) {
  const { page } = game;
  await game.walk(routeMoves(LEVEL_0, 'key'));
  const beside = await game.walk(KEY_TO_BESIDE_FLAME);
  const flame = (await page.evaluate(() => (window as unknown as Win).__game.sim.flames())).find(
    (f) => f.tile.col === FLAME.col && f.tile.row === FLAME.row,
  );
  if (!flame) throw new Error('no flame at the fixture tile');
  const t = beside.levelMs;
  const cycles = Math.max(0, Math.ceil((t - flame.phase - TELEGRAPH_MS) / FLAME_CYCLE));
  await game.advance(flame.phase + TELEGRAPH_MS + cycles * FLAME_CYCLE - t + 50);
  await game.tap('east');
  for (let i = 0; i < 30 && !(await event(page, 'died')); i++) await tick(game);
  const died = await event(page, 'died');
  if (!died) throw new Error('no died event');
  return died.simMs;
}

test('a mid-step blade death holds the camera on the death spot, then cuts at 270 ms', async ({
  game,
}) => {
  const { page } = game;
  await game.boot(LEVEL_0);
  await game.hazardsOff(true);
  await game.walk(routeMoves(LEVEL_0, 'key'), { frames: 'last' });
  const s = await game.walk(TO_BESIDE_BLADE, { frames: 'last' });
  expect(s.tile).toEqual({ col: BLADE.col - 1, row: BLADE.row });
  await game.hazardsOff(false);
  await record(page);
  const blade = (await page.evaluate(() => (window as unknown as Win).__game.sim.blades())).find(
    (b) => b.tile.col === BLADE.col && b.tile.row === BLADE.row,
  );
  if (!blade) throw new Error('no blade at the fixture tile');
  // Head straight down as the step would land: contact ~93 ms into the step, mid-step.
  const into = (s.levelMs + 200 + blade.phase) % SPIN_MS;
  await game.advance(200 + ((SPIN_MS - into) % SPIN_MS) - 120);
  await game.tap('east');
  for (let i = 0; i < 20 && !(await event(page, 'died')); i++) await tick(game);
  const died = await event(page, 'died');
  if (!died) throw new Error('no died event');

  const seen = await frames(game, died.simMs, GONE_MS + 2 * TICK);
  const [first] = seen;
  if (!first) throw new Error('no frames');
  // The death spot: where the hero was drawn on the kill tick (mid-step, short of the blade).
  const spot = first.hero;
  expect(spot.x).toBeGreaterThan((BLADE.col - 1) * 2 + 1);
  expect(spot.x).toBeLessThan(BLADE.col * 2 + 1);
  const respawn = await event(page, 'respawned');
  if (!respawn) throw new Error('no respawned event');
  expect(respawn.simMs - died.simMs).toBeGreaterThanOrEqual(GONE_MS);
  expect(respawn.simMs - died.simMs).toBeLessThan(GONE_MS + TICK);

  // Until gone, the camera's focus closes on the death spot (plus the lead it died with,
  // east) and never heads for the start tile.
  const target = { x: spot.x + LEAD, z: spot.z };
  const held = seen.filter((f) => f.simMs < respawn.simMs);
  const gap = held.map((f) => Math.hypot(f.focus.x - target.x, f.focus.z - target.z));
  for (let i = 1; i < gap.length; i++) expect(gap[i]).toBeLessThanOrEqual((gap[i - 1] ?? 0) + 1e-9);
  // At gone it cuts, lag reset, to the start tile (facing south: the lead is +z).
  const cut = seen.find((f) => f.simMs === respawn.simMs);
  const start = { x: LEVEL_0.start.col * 2 + 1, z: LEVEL_0.start.row * 2 + 1 };
  expect(cut?.focus.x).toBeCloseTo(start.x, 6);
  expect(cut?.focus.z).toBeCloseTo(start.z + LEAD, 6);
  // The view lines up with the sim: collapsed before the respawn, popping from it.
  expect(held.at(-1)?.fx.scale.x ?? 1).toBeLessThan(0.2);
  expect(cut?.fx.scale.x).toBeLessThan(0.7);
});

test('normal motion: shake, flash, a 4-tick hit-stop, and a grace flicker the light guard survives', async ({
  game,
}) => {
  test.slow(); // the key leg, a death, and every frame of grace
  const { page } = game;
  await game.boot(LEVEL_0);
  await record(page);
  const before = await frame(page);
  const killed = await dieOnTheFlame(game);
  expect((await game.snapshot()).skippedTicks).toBe(4); // the key's hit-stop

  const death = await frames(game, killed, SHAKE_MS);
  expect(Math.max(...death.map((f) => Math.hypot(f.shake.x, f.shake.y)))).toBeGreaterThan(0);
  expect(death[0]?.flash).toBeCloseTo(0.22, 2);
  expect(death[0]?.fx.flash).toBeGreaterThan(0); // the rig's CREAM hit flash
  await game.advance(GONE_MS - SHAKE_MS);
  const respawn = await event(page, 'respawned');
  if (!respawn) throw new Error('no respawned event');
  expect((await frame(page)).shake).toEqual({ x: 0, y: 0 });

  // Grace: the meshes toggle every 80 ms; the lights and programs never change.
  const grace = await frames(game, respawn.simMs, GRACE_MS - TICK);
  const visible = grace.map((f) => f.fx.visible);
  expect(visible).toContain(false);
  expect(visible).toContain(true);
  for (const f of grace) {
    expect({ lights: f.lights, programs: f.programs, violations: f.violations }).toEqual({
      lights: before.lights,
      programs: before.programs,
      violations: 0,
    });
  }
  await game.advance(2 * TICK);
  expect((await frame(page)).fx.visible).toBe(true);
  expect(grace.at(-1)?.flash).toBe(0); // the flash ran out at 300 ms
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('no shake, no damage flash, a 1-tick hit-stop, and a steady boosted rim', async ({
    game,
  }) => {
    test.slow();
    const { page } = game;
    await game.boot(LEVEL_0);
    await record(page);
    const before = await frame(page);
    const killed = await dieOnTheFlame(game);
    expect((await game.snapshot()).skippedTicks).toBe(1);

    for (const f of await frames(game, killed, SHAKE_MS + TICK)) {
      expect(f.shake).toEqual({ x: 0, y: 0 });
      expect(f.flash).toBe(0);
    }
    await game.advance(GONE_MS - SHAKE_MS);
    const respawn = await event(page, 'respawned');
    if (!respawn) throw new Error('no respawned event');
    const look = await page.evaluate(() => (window as unknown as Win).__game.look.hero);
    expect(look.graceRim).toBeGreaterThan(look.rimStrength);
    for (const f of await frames(game, respawn.simMs, GRACE_MS - 3 * TICK)) {
      expect(f.fx.visible).toBe(true);
      expect(f.fx.rim).toBeCloseTo(look.graceRim, 6);
      expect(f.lights).toBe(before.lights);
      expect(f.violations).toBe(0);
    }
    await game.advance(4 * TICK);
    expect((await frame(page)).fx.rim).toBeCloseTo(look.rimStrength, 6);
  });
});

test('particles replay pixel for pixel on a pinned seed', async ({ game }) => {
  test.slow(); // two boots
  const { page } = game;
  /**
   * Boot, walk onto the coin, and capture the canvas 60 ms into its sparkles and dust. The
   * sim runs unpaused for a boot-dependent while before `boot` pauses it, so the rest of the
   * scene (flame and idle phases, the camera lag's settle) differs per load: the capture
   * draws the particles alone, through the full post chain, with every other object hidden
   * (the lights stay, so no program changes) and the camera cut onto its target.
   */
  const capture = async () => {
    await game.boot(LEVEL_0);
    await game.walk(routeMoves(LEVEL_0, 'coin'));
    return page.evaluate(() => {
      const g = (window as unknown as Win).__game;
      g.sim.advance(60);
      const others = g.scene.children.filter((o) => o !== g.fx.group && !o.isLight && o.visible);
      for (const o of others) o.visible = false;
      g.cameraRig.resetLag(); // the lag's settle on the start tile also depends on the boot
      g.sim.advance(0); // no ticks: one render
      // Read back in the same task as the render, before the buffer is presented.
      const png = g.renderer.domElement.toDataURL('image/png');
      for (const o of others) o.visible = true;
      return { drawn: g.fx.drawn(), png };
    });
  };
  const a = await capture();
  expect(a.drawn.additive).toBeGreaterThan(0);
  expect(a.drawn.normal).toBeGreaterThan(0);
  const b = await capture();
  expect(b.drawn).toEqual(a.drawn);
  expect(b.png === a.png).toBe(true);
});
