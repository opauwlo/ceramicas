import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { Vec3 } from '../model/types';

/*
 * Ponte entre a cena 3D e a interface. A cena registra aqui as malhas e algumas funções;
 * a interface chama sem precisar estar dentro do Canvas.
 */

export const meshes = new Map<string, THREE.Mesh>();

export type FrameKind = 'diag' | 'cima' | 'frente';

export const bridge: {
  frame?: (kind: FrameKind) => void;
  photo?: () => string | null;
  helper?: THREE.Object3D;
} = {};

export function worldBox(id: string): THREE.Box3 | null {
  const m = meshes.get(id);
  if (!m || !m.visible) return null;
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m, true);
  return b.isEmpty() ? null : b;
}

/** Ponto em cima do centro da peça, para a próxima peça nascer apoiada nela. */
export function topOf(id: string | null): Vec3 | undefined {
  if (!id) return undefined;
  const b = worldBox(id);
  if (!b) return undefined;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [r((b.min.x + b.max.x) / 2), r(b.max.y), r((b.min.z + b.max.z) / 2)];
}

/** STL em milímetros, com as peças visíveis. Serve para impressão 3D ou para conferir medidas. */
export function exportSTL(): Blob | null {
  const root = new THREE.Group();
  meshes.forEach(m => {
    if (!m.visible) return;
    m.updateMatrixWorld(true);
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    root.add(new THREE.Mesh(g));
  });
  if (!root.children.length) return null;
  root.scale.setScalar(10);
  root.updateMatrixWorld(true);
  const data = new STLExporter().parse(root, { binary: true });
  root.children.forEach(c => (c as THREE.Mesh).geometry.dispose());
  return new Blob([data as BlobPart], { type: 'model/stl' });
}
