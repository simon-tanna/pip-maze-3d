/**
 * Keyboard → grid input (v2 `grid-input`'s Phaser wiring, on plain DOM events).
 * `keydown` presses (auto-repeats ignored: holding is the input's job), `keyup`
 * releases, and `blur` clears so a key released outside the window can't stick.
 */
import { KEY_DIRS } from '@core/grid-input';
import type { GridInput } from '@core/grid-input';

interface KeyLike {
  code?: string;
  repeat?: boolean;
}

/**
 * The end card's restart (spec: State machine → ended): a persistent `keydown` listener
 * that acts only while the game is ended, ignores auto-repeats (a held arrow from the
 * last step never restarts), and consumes its key so it never reaches grid input.
 * Bind it **before** `bindKeyboard` on the same target. Returns the unbind function.
 */
export function bindRestart(
  target: EventTarget,
  game: { ended(): boolean; restart(): boolean },
): () => void {
  const onKeyDown = (event: Event) => {
    if (!game.ended() || (event as KeyLike).repeat) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    game.restart();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

/** Listen on `target` (the window in the game). Returns the unbind function. */
export function bindKeyboard(
  target: EventTarget,
  input: Pick<GridInput, 'press' | 'release' | 'clear'>,
): () => void {
  const onKeyDown = (event: Event) => {
    const { code = '', repeat = false } = event as KeyLike;
    const dir = KEY_DIRS[code];
    if (!dir) return;
    event.preventDefault(); // arrows would scroll the page
    if (!repeat) input.press(dir);
  };
  const onKeyUp = (event: Event) => {
    const dir = KEY_DIRS[(event as KeyLike).code ?? ''];
    if (dir) input.release(dir);
  };
  const onBlur = () => input.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
  };
}
