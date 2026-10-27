import { dataUrlToBlob, downloadBlob, slug, stamp } from '../lib/download';
import { wrapAngle } from '../lib/format';
import { bridge, exportSTL, worldBox } from '../scene/bridge';
import { useStore } from '../state/store';
import type { Doc } from '../model/types';

/* Ações usadas em mais de um lugar da interface. */

export function takePhoto() {
  const url = bridge.photo?.();
  const s = useStore.getState();
  if (!url || url.length < 100) {
    s.notify('Não consegui tirar a foto. Tente de novo.');
    return;
  }
  s.setPhoto(url);
}

export function downloadPhoto(url: string) {
  downloadBlob(dataUrlToBlob(url), `atelie-${stamp()}.png`);
}

export async function sharePhoto(url: string): Promise<boolean> {
  try {
    const file = new File([dataUrlToBlob(url)], `atelie-${stamp()}.png`, { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], title: 'Ateliê de Argila' });
    return true;
  } catch {
    return false;
  }
}

export function downloadSTL() {
  const blob = exportSTL();
  const s = useStore.getState();
  if (!blob) {
    s.notify('Não há peças visíveis para exportar.');
    return;
  }
  downloadBlob(blob, `atelie-${stamp()}.stl`);
  s.notify('STL baixado, em milímetros');
}

export function downloadDoc(doc: Doc, name = 'modelo') {
  downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${slug(name)}-${stamp()}.json`);
}

export function rotateSelected(deg: number) {
  const s = useStore.getState();
  const id = s.selectedId;
  if (!id) return;
  s.patchPiece(id, p => {
    p.rot[1] = wrapAngle(Math.round(p.rot[1] + deg));
  });
  s.commit();
}

/** Desce ou sobe a peça até a parte de baixo encostar na mesa. */
export function sitSelected() {
  const s = useStore.getState();
  const id = s.selectedId;
  if (!id) return;
  const b = worldBox(id);
  if (!b) return;
  s.patchPiece(id, p => {
    p.pos[1] = Math.round((p.pos[1] - b.min.y) * 1000) / 1000;
  });
  s.commit();
  s.notify('Assentada na mesa');
}

export function frameView(kind: 'diag' | 'cima' | 'frente' = 'diag') {
  bridge.frame?.(kind);
}

/** Reenquadra depois que a cena terminar de montar as peças novas. */
export function frameSoon() {
  setTimeout(() => bridge.frame?.('diag'), 60);
}
