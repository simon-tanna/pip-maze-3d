/**
 * Every feel value in the game, split into per-domain sections (spec Render → Foundation).
 * A domain lives in `look/<domain>.ts` and calls `section()` from `./registry`, which
 * registers it with the dev panel. To add a domain: create its file and add one line to
 * `look` below. Don't hard-code feel values anywhere else.
 */
import { bench } from './bench';
import { camera } from './camera';
import { chamber } from './chamber';
import { hero } from './hero';
import { lights } from './lights';
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
  hero,
  bench,
};

/** Every registered section, in registration order (the dev panel's source). */
export function lookSections() {
  return lookRegistry.sections();
}
