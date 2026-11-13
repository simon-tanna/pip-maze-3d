import GUI from 'lil-gui';
import type { FrameStats } from './frame-stats';
import { lookSections } from './look';
import { css } from './palette';

/**
 * Dev-only tuning tools. Only ever loaded through `import.meta.env.DEV`-guarded dynamic
 * import, so neither lil-gui nor the readout reaches the production bundle.
 *
 * - A lil-gui panel with one folder per registered look section.
 * - A frame-time readout (mean / p95 of the current window) with buttons to log and
 *   reset the summary. The logged summary is what the light bench records.
 */
export function mountDevTools(stats: FrameStats): { gui: GUI } {
  const gui = new GUI({ title: 'look' });
  gui.domElement.style.top = '72px'; // below the HUD's key slots
  for (const { name, values, ranges } of lookSections()) {
    const folder = gui.addFolder(name);
    for (const key of Object.keys(values)) {
      const range = (ranges as Record<string, readonly [number, number, number] | undefined>)[key];
      if (typeof values[key] === 'number' && !range) {
        folder.add(values, key).disable(); // fixed at boot (e.g. pool slot count)
      } else if (range) {
        folder.add(values, key, range[0], range[1], range[2]);
      } else {
        folder.add(values, key);
      }
    }
    folder.close();
  }

  const frames = gui.addFolder('frame time');
  const actions = {
    logSummary: () => console.info('[frame-time]', JSON.stringify(stats.summary())),
    reset: () => stats.reset(),
  };
  frames.add(actions, 'logSummary').name('log summary');
  frames.add(actions, 'reset').name('reset window');

  const readout = document.createElement('div');
  readout.dataset['devReadout'] = '';
  Object.assign(readout.style, {
    position: 'fixed',
    left: '8px',
    bottom: '8px',
    padding: '4px 8px',
    font: '12px monospace',
    color: css('CREAM'),
    background: css('SHADOW'),
    opacity: '0.85',
    pointerEvents: 'none',
    zIndex: '10',
  });
  document.body.appendChild(readout);
  setInterval(() => {
    const s = stats.summary();
    readout.textContent = `${s.meanMs.toFixed(1)} ms mean · p95 ${s.p95Ms.toFixed(1)} · worst ${s.worstMs.toFixed(1)} · >33ms ${s.over33} · n ${s.frames}`;
  }, 250);

  return { gui };
}
