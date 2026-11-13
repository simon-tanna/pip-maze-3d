import { section } from './registry';

/**
 * Light bench (dev): drives every pool slot at peak over the greybox chamber so the
 * light budget can be measured with the frame-time readout.
 */
export const bench = section('bench', { poolsAtPeak: false });
