import {
  DataTexture,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MultiplyBlending,
  Quaternion,
  RGBAFormat,
  Vector3,
} from 'three';
import { PLAN_CAPACITY } from '@core/chamber-plan';
import type { ChamberPiece, Placement } from '@core/chamber-plan';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import type { Gltf } from '@assets/models';
import { CHAMBER_KIT_VARIANTS } from './chamber-kit';
import { look } from './look';
import { color } from './palette';

/**
 * The chamber view (map ticket 05): turns a `planChamber` placement list into instance
 * matrices, one InstancedMesh per (piece, variant), each allocated at the piece's
 * `PLAN_CAPACITY`, so every level reuses the same meshes and only counts change.
 * Padding caps get their own meshes so they stay out of the shadow map.
 */
export interface ChamberView {
  readonly group: Group;
  /** Lay out a plan. Reuses every mesh; recomputes each bounding sphere. */
  build(plan: readonly Placement[]): void;
  /** Sync look values (contact strength and falloff). Call once per frame. */
  update(): void;
}

const Y = new Vector3(0, 1, 0);
const q = new Quaternion();
const pos = new Vector3();
const edge = new Vector3();
const scale = new Vector3();

/** World matrix for one placement, in the kit's local-frame contract (`chamber-kit.ts`). */
export function placementMatrix(p: Placement, out: Matrix4): Matrix4 {
  const { x, z } = tileToWorld(p.col, p.row);
  q.setFromAxisAngle(Y, p.rotation);
  pos.set(x, 0, z);
  scale.set(1, 1, 1);
  if (p.piece === 'contact') {
    // The strip's wall edge (local z = 0) sits on the tile edge that local +z points at.
    pos.add(edge.set(0, 0, TILE_SIZE / 2).applyQuaternion(q));
    scale.z = p.depth ?? 1;
  }
  return out.compose(pos, q, scale);
}

const RAMP_SIZE = 32;

/** Alpha ramp along the strip's uv.y: 1 at the wall edge, 0 at the far edge. */
function writeRamp(tex: DataTexture, falloff: number): void {
  const data = tex.image.data as Uint8Array;
  for (let i = 0; i < RAMP_SIZE; i++) {
    const a = Math.round(Math.pow(1 - i / (RAMP_SIZE - 1), falloff) * 255);
    data.set([a, a, a, 255], i * 4);
  }
  tex.needsUpdate = true;
}

/**
 * The contact strip's material: multiply-blended INK, so it darkens whatever floor it
 * lies on. With premultiplied alpha, MultiplyBlending gives dst × mix(1, INK, alpha).
 */
function createContactMaterial(): { material: MeshBasicMaterial; update(): void } {
  const ramp = new DataTexture(new Uint8Array(RAMP_SIZE * 4), 1, RAMP_SIZE, RGBAFormat);
  const material = new MeshBasicMaterial({
    color: color('INK'),
    alphaMap: ramp,
    transparent: true,
    premultipliedAlpha: true,
    blending: MultiplyBlending,
    depthWrite: false,
  });
  let falloff = Number.NaN;
  const update = () => {
    const c = look.chamber;
    material.opacity = c.contactStrength;
    if (c.contactFalloff !== falloff) {
      falloff = c.contactFalloff;
      writeRamp(ramp, falloff);
    }
  };
  update();
  return { material, update };
}

const keyOf = (piece: ChamberPiece, variant: number, padding: boolean) =>
  `${piece}_${variant}${padding ? '_pad' : ''}`;

export function createChamberView(kit: Gltf): ChamberView {
  const group = new Group();
  group.name = 'chamber';
  const contact = createContactMaterial();
  const meshes = new Map<string, InstancedMesh>();

  const add = (piece: ChamberPiece, variant: number, node: string, padding = false) => {
    const { geometry, material } = kit.getNode(node);
    const mesh = new InstancedMesh(
      geometry,
      piece === 'contact' ? contact.material : material,
      PLAN_CAPACITY[piece],
    );
    mesh.name = keyOf(piece, variant, padding);
    mesh.userData = { piece, variant, padding };
    mesh.count = 0;
    mesh.castShadow = (piece === 'cap' || piece === 'face') && !padding;
    mesh.receiveShadow = piece !== 'contact';
    if (piece === 'contact') mesh.renderOrder = 1; // after the floor it darkens
    meshes.set(mesh.name, mesh);
    group.add(mesh);
  };

  for (const piece of Object.keys(CHAMBER_KIT_VARIANTS) as ChamberPiece[]) {
    CHAMBER_KIT_VARIANTS[piece].forEach((node, v) => add(piece, v, node));
  }
  CHAMBER_KIT_VARIANTS.cap.forEach((node, v) => add('cap', v, node, true));

  const m = new Matrix4();
  return {
    group,
    build(plan) {
      for (const mesh of meshes.values()) mesh.count = 0;
      for (const p of plan) {
        const mesh = meshes.get(keyOf(p.piece, p.variant, p.padding === true));
        if (!mesh) throw new Error(`no kit mesh for ${p.piece} variant ${p.variant}`);
        if (mesh.count >= mesh.instanceMatrix.count) {
          throw new Error(
            `${mesh.name}: plan exceeds its capacity of ${mesh.instanceMatrix.count}`,
          );
        }
        mesh.setMatrixAt(mesh.count++, placementMatrix(p, m));
      }
      for (const mesh of meshes.values()) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    },
    update: contact.update,
  };
}
