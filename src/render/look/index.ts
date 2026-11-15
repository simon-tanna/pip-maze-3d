/**
 * Every feel value in the game, split into per-domain sections (spec Render → Foundation).
 * A domain lives in `look/<domain>.ts` and calls `section()` from `./registry`, which
 * registers it with the dev panel. To add a domain: create its file and add one line to
 * `look` below. Don't hard-code feel values anywhere else.
 */
import { bench } from './bench';
import { blade } from './blade';
import { camera } from './camera';
import { chamber } from './chamber';
import { decor } from './decor';
import { flame } from './flame';
import { hero } from './hero';
import { hud } from './hud';
import { lights } from './lights';
import { pickups } from './pickups';
import { post } from './post';
import { lookRegistry } from './registry';
import { renderer } from './renderer';

export { KEY_SHADOW_MAP_SIZE } from './lights';
export type { LookRange, LookSection, LookValues } from './registry';

export const look = {
  renderer,
  post,
  lights,
  camera,
  chamber,
  decor,
  hero,
  flame,
  blade,
  pickups,
  hud,
  bench,
};

/** Every registered section, in registration order (the dev panel's source). */
export function lookSections() {
  return lookRegistry.sections();
}
