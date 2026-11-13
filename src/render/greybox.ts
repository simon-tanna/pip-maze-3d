import { Group, InstancedMesh, Matrix4 } from 'three';
import type { BufferGeometry, Material, Object3D, Mesh } from 'three';
import { tileToWorld } from '@core/grid';

/**
 * A chamber-sized greybox (v2 maps are 40 × 15 tiles): border walls and a pillar on every
 * even (col, row), built as one InstancedMesh per placeholder piece, like the real chamber
 * will be. It stands in for the chamber until ticket 03, and is the light bench's stage.
 */
export const GREYBOX_COLS = 40;
export const GREYBOX_ROWS = 15;

export function isGreyboxWall(col: number, row: number): boolean {
  const border = col === 0 || row === 0 || col === GREYBOX_COLS - 1 || row === GREYBOX_ROWS - 1;
  return border || (col % 2 === 0 && row % 2 === 0);
}

function firstMesh(model: Object3D): Mesh<BufferGeometry, Material> {
  let found: Mesh<BufferGeometry, Material> | undefined;
  model.traverse((o) => {
    if (!found && (o as Mesh).isMesh) found = o as Mesh<BufferGeometry, Material>;
  });
  if (!found) throw new Error('placeholder model has no mesh');
  return found;
}

export function buildGreybox(wallModel: Object3D, floorModel: Object3D): Group {
  const wall = firstMesh(wallModel);
  const floor = firstMesh(floorModel);
  const tiles = GREYBOX_COLS * GREYBOX_ROWS;
  const walls = new InstancedMesh(wall.geometry, wall.material, tiles);
  const floors = new InstancedMesh(floor.geometry, floor.material, tiles);
  const m = new Matrix4();
  let w = 0;
  let f = 0;
  for (let row = 0; row < GREYBOX_ROWS; row++) {
    for (let col = 0; col < GREYBOX_COLS; col++) {
      const { x, z } = tileToWorld(col, row);
      m.makeTranslation(x, 0, z);
      if (isGreyboxWall(col, row)) walls.setMatrixAt(w++, m);
      else floors.setMatrixAt(f++, m);
    }
  }
  walls.count = w;
  floors.count = f;
  for (const mesh of [walls, floors]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
  }
  const group = new Group();
  group.name = 'greybox';
  group.add(walls, floors);
  return group;
}
