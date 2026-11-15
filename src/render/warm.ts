/**
 * A one-time warm for a view's per-level parts. A view builds one prototype of every part
 * it can place (same geometry, same material programs) at view creation, so the boot
 * `compileAsync` sees every program whatever the first level holds (`compile` walks
 * hidden objects too). The prototype is collapsed to zero scale and never culled, so its
 * first frame uploads every geometry while the iris is shut; once each mesh has drawn, the
 * prototype hides itself for good. The level's real parts are frustum-culled as usual.
 */
import type { Mesh, Object3D } from 'three';

export function warmOnce(root: Object3D): void {
  root.scale.setScalar(0);
  const pending = new Set<Mesh>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    pending.add(mesh);
    mesh.onAfterRender = () => {
      pending.delete(mesh);
      if (pending.size === 0) root.visible = false;
    };
  });
}
