/**
 * Full-screen cards on `INK` (spec: State machine; Scope and run → End of slice), above
 * the iris: "Loading…" while the GLBs load, the end-of-slice card, and a load error.
 * DOM only; colours are the palette's CSS variables.
 */
import './screens.css';

export interface Screens {
  loading(): void;
  /** "END OF SLICE", the session coin total, "PRESS ANY KEY". */
  ended(coins: number): void;
  error(message: string): void;
  hide(): void;
}

export function createScreens(root: HTMLElement): Screens {
  const card = document.createElement('div');
  card.className = 'screen';
  card.dataset['screen'] = 'none';
  root.append(card);

  const show = (kind: string, lines: [cls: string, text: string][]) => {
    card.dataset['screen'] = kind;
    card.replaceChildren(
      ...lines.map(([cls, text]) => {
        const e = document.createElement('div');
        e.className = cls;
        e.textContent = text;
        return e;
      }),
    );
  };

  return {
    loading: () => show('loading', [['screen-body', 'Loading…']]),
    ended: (coins) =>
      show('ended', [
        ['screen-title', 'END OF SLICE'],
        ['screen-coins', `COINS ${coins}`],
        ['screen-body screen-prompt', 'PRESS ANY KEY'],
      ]),
    error: (message) =>
      show('error', [
        ['screen-title', 'FAILED TO LOAD'],
        ['screen-body', message],
      ]),
    hide: () => show('none', []),
  };
}
