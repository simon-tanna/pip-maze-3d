/**
 * Dev-only blade contact-zone overlay (the hazards prototype's `G`, beside ticket 07's
 * lethal-tile overlay): each blade's contact segments at its current angle, straight from
 * `bladeSegments`, the function `bladeTouches` tests. Only ever loaded through an
 * `import.meta.env.DEV`-guarded dynamic import, so it never reaches the production bundle.
 *
 * Each segment is a thin bar in the blade's swing plane. The material is a plain
 * `MeshStandardMaterial`, so toggling the overlay never compiles a program.
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { bladeSegments } from '@core/blade';
import type { GridTile } from '@core/generator';
import { tileToWorld } from '@core/grid';
import { color } from './palette';

const ZONE = new MeshStandardMaterial({ color: color('BLOOD'), emissive: color('BLOOD') });
/** A unit bar along local x, centred on the origin. */
const BAR = new BoxGeometry(1, 0.03, 0.03);
const SEGMENTS = bladeSegments(0).length;

export interface BladeZone {
  readonly group: Group;
  show: boolean;
  build(blades: readonly { tile: GridTile }[]): void;
  update(blades: readonly { angle: number }[]): void;
  teardown(): void;
}

export function createBladeZone(): BladeZone {
  const group = new Group();
  group.name = 'bladeZone';
  let roots: Group[] = [];
  return {
    group,
    show: false,
    build(blades) {
      this.teardown();
      roots = blades.map((b, i) => {
        const root = new Group();
        root.name = `zone_${i}`;
        const { x, z } = tileToWorld(b.tile.col, b.tile.row);
        root.position.set(x, 0, z);
        root.rotation.y = -Math.PI / 2; // local x → world +z: the swing plane's u
        root.visible = false;
        for (let k = 0; k < SEGMENTS; k++) root.add(new Mesh(BAR, ZONE));
        return root;
      });
      group.add(...roots);
    },
    update(blades) {
      roots.forEach((root, i) => {
        root.visible = this.show;
        const angle = blades[i]?.angle;
        if (!this.show || angle === undefined) return;
        bladeSegments(angle).forEach(([[u0, y0], [u1, y1]], k) => {
          const bar = root.children[k];
          if (!bar) return;
          bar.position.set((u0 + u1) / 2, (y0 + y1) / 2, 0);
          bar.rotation.z = Math.atan2(y1 - y0, u1 - u0);
          bar.scale.x = Math.hypot(u1 - u0, y1 - y0) || 1e-6;
        });
      });
    },
    teardown() {
      group.clear();
      roots = [];
    },
  };
}
