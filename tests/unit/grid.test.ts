import { describe, expect, it } from 'vitest';
import { mazeBounds, TILE_SIZE, tileKey, tileToWorld, worldToTile } from '@core/grid';

const COLS = 40; // v2 chamber size
const ROWS = 15;

describe('tileToWorld', () => {
  it('places tile (0,0) at the centre of the first tile from a top-left origin', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: TILE_SIZE / 2, z: TILE_SIZE / 2 });
  });

  it('moves one TILE_SIZE per column along +x only', () => {
    const a = tileToWorld(4, 6);
    const b = tileToWorld(5, 6);
    expect(b.x - a.x).toBe(TILE_SIZE);
    expect(b.z).toBe(a.z);
  });

  it('maps increasing rows along +z only', () => {
    const a = tileToWorld(4, 6);
    const b = tileToWorld(4, 7);
    expect(b.z - a.z).toBe(TILE_SIZE);
    expect(b.x).toBe(a.x);
  });
});

describe('worldToTile', () => {
  it('round-trips every tile of a 40×15 chamber', () => {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { x, z } = tileToWorld(col, row);
        expect(worldToTile(x, z)).toEqual({ col, row });
      }
    }
  });

  it('keeps points just inside a tile in that tile', () => {
    const eps = 1e-6;
    expect(worldToTile(TILE_SIZE - eps, TILE_SIZE - eps)).toEqual({ col: 0, row: 0 });
  });

  it('gives a shared edge to the higher tile', () => {
    expect(worldToTile(TILE_SIZE, TILE_SIZE)).toEqual({ col: 1, row: 1 });
  });

  it('does not clamp: negative coordinates map to negative tiles', () => {
    expect(worldToTile(-0.1, -0.1)).toEqual({ col: -1, row: -1 });
  });
});

describe('tileKey', () => {
  it("uses v2's generator key format", () => {
    expect(tileKey(3, 7)).toBe('3,7');
  });
});

describe('mazeBounds', () => {
  it('spans the whole map from the origin', () => {
    expect(mazeBounds(COLS, ROWS)).toEqual({
      minX: 0,
      minZ: 0,
      maxX: COLS * TILE_SIZE,
      maxZ: ROWS * TILE_SIZE,
      centre: { x: (COLS * TILE_SIZE) / 2, z: (ROWS * TILE_SIZE) / 2 },
    });
  });

  it('contains every tile centre strictly inside', () => {
    const b = mazeBounds(COLS, ROWS);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { x, z } = tileToWorld(col, row);
        expect(x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ).toBe(true);
      }
    }
  });
});
