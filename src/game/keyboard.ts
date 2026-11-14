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
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/** Modifier and lock keys: pressing one alone is never a restart. */
const MODIFIER_CODE =
  /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$|^(CapsLock|NumLock|ScrollLock|Fn|FnLock)$/;
/** F1–F24 belong to the browser (F5 reload, F12 devtools). */
const FUNCTION_CODE = /^F\d{1,2}$/;

/** True for a keydown the end card may act on: not a modifier, F-key or browser shortcut. */
function isRestartKey(event: KeyLike): boolean {
  const code = event.code ?? '';
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return false;
  return !MODIFIER_CODE.test(code) && !FUNCTION_CODE.test(code);
}

/**
 * The end card's restart (spec: State machine → ended): a persistent `keydown` listener
 * that acts only while the game is ended, ignores auto-repeats (a held arrow from the
 * last step never restarts), and consumes its key so it never reaches grid input.
 * Modifier-only presses, F-keys and any key held with Meta/Ctrl/Alt (browser shortcuts
 * such as Cmd+R or Cmd+Tab) are left alone and not consumed.
 * Bind it **before** `bindKeyboard` on the same target. Returns the unbind function.
 */
export function bindRestart(
  target: EventTarget,
  game: { ended(): boolean; restart(): boolean },
): () => void {
  const onKeyDown = (event: Event) => {
    if (!game.ended() || !isRestartKey(event as KeyLike)) return;
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
