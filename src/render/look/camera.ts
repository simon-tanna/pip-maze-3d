import { section } from './registry';

/** Fixed-yaw north chase camera (map ticket 01). Ticket 03 wires lag and lead. */
export const camera = section(
  'camera',
  {
    fov: 57,
    /** Metres south of the hero (toward +z). */
    back: 7,
    up: 15.7,
    lagSeconds: 0.12,
    lead: 1,
    near: 0.1,
    far: 200,
  },
  {
    fov: [30, 90, 0.5],
    back: [0, 20, 0.1],
    up: [2, 30, 0.1],
    lagSeconds: [0, 1, 0.01],
    lead: [0, 3, 0.05],
  },
);
