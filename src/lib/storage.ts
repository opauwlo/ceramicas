import { normalizeDoc } from '../model/spec';
import type { Doc } from '../model/types';

const KEY = 'atelie-argila:atual';
const KEY_SAVED = 'atelie-argila:modelos';

export interface SavedModel {
  nome: string;
  quando: string;
  doc: Doc;
}

export function loadCurrent(): Doc | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveCurrent(doc: Doc): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function listSaved(): SavedModel[] {
  try {
    const arr: unknown = JSON.parse(localStorage.getItem(KEY_SAVED) || '[]');
    if (!Array.isArray(arr)) return [];
    const out: SavedModel[] = [];
    for (const m of arr) {
      if (!m || typeof m !== 'object') continue;
      const rec = m as Record<string, unknown>;
      const doc = normalizeDoc(rec.doc);
      if (doc && typeof rec.nome === 'string') out.push({ nome: rec.nome, quando: String(rec.quando ?? ''), doc });
    }
    return out;
  } catch {
    return [];
  }
}

export function writeSaved(list: SavedModel[]): boolean {
  try {
    localStorage.setItem(KEY_SAVED, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
