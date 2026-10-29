import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { Vec3 } from '../model/types';
import { useStore } from '../state/store';
import { anim } from './anim';

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

/**
 * Roda `fn` com as peças animadas de volta ao lugar de verdade, para que medidas,
 * empilhar, enquadrar e exportar não vejam o quique. O próximo quadro reaplica a animação.
 */
export function atRest<T>(fn: () => T): T {
  const ids = anim.ids();
  if (ids.length) {
    const pieces = useStore.getState().doc.pieces;
    for (const id of ids) {
      const m = meshes.get(id);
      const p = pieces.find(x => x.id === id);
      if (!m || !p) continue;
      m.position.set(p.pos[0], p.pos[1], p.pos[2]);
      m.scale.setScalar(p.scale);
      m.updateMatrixWorld(true);
    }
  }
  return fn();
}

export function worldBox(id: string): THREE.Box3 | null {
  const m = meshes.get(id);
  if (!m || !m.visible) return null;
  return atRest(() => {
    m.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m, true);
    return b.isEmpty() ? null : b;
  });
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
  atRest(() =>
    meshes.forEach(m => {
      if (!m.visible) return;
      m.updateMatrixWorld(true);
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      root.add(new THREE.Mesh(g));
    }),
  );
  if (!root.children.length) return null;
  root.scale.setScalar(10);
  root.updateMatrixWorld(true);
  const data = new STLExporter().parse(root, { binary: true });
  root.children.forEach(c => (c as THREE.Mesh).geometry.dispose());
  return new Blob([data as BlobPart], { type: 'model/stl' });
}
