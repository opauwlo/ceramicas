import { create } from 'zustand';
import { mirrorPose, type MirrorAxis } from '../model/mirror';
import { cloneDoc, newPiece, SPEC } from '../model/spec';
import type { Doc, Piece, PieceType, Vec3 } from '../model/types';

export type Tab = 'pecas' | 'forma' | 'pintura' | 'cena' | 'arquivo';
export type PanelSize = 'min' | 'mid' | 'max';
/** O que o dedo faz ao tocar numa peça na mesa. */
export type Tool = 'mover' | 'amassar' | 'girar' | 'alisar' | 'pintar';

export interface Toast {
  id: number;
  msg: string;
}

export interface State {
  doc: Doc;
  /** último estado gravado no histórico */
  saved: Doc;
  past: Doc[];
  future: Doc[];
  selectedId: string | null;
  tab: Tab;
  panel: PanelSize;
  tool: Tool;
  /** cor do pincel da mão Pintar */
  brush: string;
  /** peça escolhida esperando um toque na mesa para grudar */
  placing: PieceType | null;
  snap: boolean;
  dragging: boolean;
  toast: Toast | null;
  photo: string | null;

  init(doc: Doc): void;
  setTab(tab: Tab): void;
  cyclePanel(): void;
  setTool(tool: Tool): void;
  setBrush(color: string): void;
  setPlacing(type: PieceType | null): void;
  setPanel(size: PanelSize): void;
  select(id: string | null): void;
  patchPiece(id: string, fn: (p: Piece) => void): void;
  movePiece(id: string, pos: Vec3): void;
  setScene(patch: Partial<Pick<Doc, 'bg' | 'light' | 'lightAngle'>>): void;
  setSnap(on: boolean): void;
  setDragging(on: boolean): void;
  /** grava no histórico se algo mudou desde o último registro */
  commit(): void;
  /** grava daqui a pouco; usado em campos de texto e de cor */
  commitSoon(): void;
  addPiece(type: PieceType, at?: Vec3, rot?: Vec3): string;
  duplicate(id: string): void;
  /** cria o par da peça do outro lado do espelho e devolve o id dele */
  mirror(id: string, axis: MirrorAxis, c: number): string | null;
  remove(id: string): void;
  toggleVisible(id: string): void;
  loadDoc(doc: Doc): void;
  undo(): boolean;
  redo(): boolean;
  notify(msg: string): void;
  setPhoto(url: string | null): void;
}

const HISTORY = 80;
const same = (a: Doc, b: Doc) => JSON.stringify(a) === JSON.stringify(b);
const keepSel = (doc: Doc, id: string | null) => (id && doc.pieces.some(p => p.id === id) ? id : null);
const emptyDoc = (): Doc => ({ v: 1, bg: 'caderno', light: 'mesa', lightAngle: 0, pieces: [] });

let soon: ReturnType<typeof setTimeout> | undefined;
let toastSeq = 0;

export const useStore = create<State>()((set, get) => ({
  doc: emptyDoc(),
  saved: emptyDoc(),
  past: [],
  future: [],
  selectedId: null,
  tab: 'pecas',
  panel: 'mid',
  tool: 'mover',
  brush: '#c9654a',
  placing: null,
  snap: true,
  dragging: false,
  toast: null,
  photo: null,

  init: doc => set({ doc: cloneDoc(doc), saved: cloneDoc(doc), past: [], future: [], selectedId: null }),

  setTab: tab => set({ tab }),

  cyclePanel: () => set(s => ({ panel: s.panel === 'mid' ? 'max' : s.panel === 'max' ? 'min' : 'mid' })),

  setTool: tool => set({ tool }),

  setBrush: brush => set({ brush }),

  setPlacing: placing => set({ placing }),

  setPanel: panel => set({ panel }),

  select: id => set(s => ({ selectedId: keepSel(s.doc, id) })),

  patchPiece: (id, fn) =>
    set(s => ({
      doc: {
        ...s.doc,
        pieces: s.doc.pieces.map(p => {
          if (p.id !== id) return p;
          const c = structuredClone(p);
          fn(c);
          return c;
        }),
      },
    })),

  movePiece: (id, pos) => set(s => ({ doc: { ...s.doc, pieces: s.doc.pieces.map(p => (p.id === id ? { ...p, pos } : p)) } })),

  setScene: patch => set(s => ({ doc: { ...s.doc, ...patch } })),

  setSnap: snap => set({ snap }),

  setDragging: dragging => set({ dragging }),

  commit: () => {
    if (soon) clearTimeout(soon);
    soon = undefined;
    const s = get();
    if (same(s.doc, s.saved)) return;
    set({ past: [...s.past.slice(-(HISTORY - 1)), s.saved], future: [], saved: cloneDoc(s.doc) });
  },

  commitSoon: () => {
    if (soon) clearTimeout(soon);
    soon = setTimeout(() => get().commit(), 500);
  },

  addPiece: (type, at, rot) => {
    const s = get();
    const n = s.doc.pieces.filter(p => p.type === type).length + 1;
    const pc = newPiece(type, { name: SPEC[type].label + (n > 1 ? ` ${n}` : ''), pos: at ?? [0, 0, 0], rot: rot ?? [0, 0, 0] });
    set({ doc: { ...s.doc, pieces: [...s.doc.pieces, pc] }, selectedId: pc.id });
    get().commit();
    return pc.id;
  },

  duplicate: id => {
    const s = get();
    const src = s.doc.pieces.find(p => p.id === id);
    if (!src) return;
    const pc = newPiece(src.type, { ...structuredClone(src), id: undefined, name: `${src.name} (cópia)`.slice(0, 40), pos: [src.pos[0] + 0.6, src.pos[1], src.pos[2]] });
    set({ doc: { ...s.doc, pieces: [...s.doc.pieces, pc] }, selectedId: pc.id });
    get().commit();
  },

  mirror: (id, axis, c) => {
    const s = get();
    const src = s.doc.pieces.find(p => p.id === id);
    if (!src) return null;
    const m = mirrorPose(src.pos, src.rot, axis, c);
    const pc = newPiece(src.type, { ...structuredClone(src), id: undefined, name: `${src.name} (par)`.slice(0, 40), pos: m.pos, rot: m.rot });
    set({ doc: { ...s.doc, pieces: [...s.doc.pieces, pc] }, selectedId: pc.id });
    get().commit();
    return pc.id;
  },

  remove: id => {
    const s = get();
    if (!s.doc.pieces.some(p => p.id === id)) return;
    set({ doc: { ...s.doc, pieces: s.doc.pieces.filter(p => p.id !== id) }, selectedId: s.selectedId === id ? null : s.selectedId });
    get().commit();
  },

  toggleVisible: id => {
    get().patchPiece(id, p => {
      p.visible = !p.visible;
    });
    get().commit();
  },

  loadDoc: doc => {
    get().commit();
    const s = get();
    const d = cloneDoc(doc);
    set({ doc: d, saved: cloneDoc(d), past: [...s.past.slice(-(HISTORY - 1)), s.saved], future: [], selectedId: null });
  },

  undo: () => {
    get().commit();
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return false;
    set({ past: s.past.slice(0, -1), future: [s.saved, ...s.future], doc: cloneDoc(prev), saved: cloneDoc(prev), selectedId: keepSel(prev, s.selectedId) });
    return true;
  },

  redo: () => {
    get().commit();
    const s = get();
    const next = s.future[0];
    if (!next) return false;
    set({ future: s.future.slice(1), past: [...s.past, s.saved], doc: cloneDoc(next), saved: cloneDoc(next), selectedId: keepSel(next, s.selectedId) });
    return true;
  },

  notify: msg => set({ toast: { id: ++toastSeq, msg } }),

  setPhoto: photo => set({ photo }),
}));

/** Medidas calculadas pela cena: volume em cm³ (já com escala) e tamanho da caixa em cm. */
export interface Metric {
  vol: number;
  size: Vec3;
}

export const useMetrics = create<{
  m: Record<string, Metric>;
  put(id: string, v: Metric): void;
  drop(id: string): void;
}>()(set => ({
  m: {},
  put: (id, v) =>
    set(s => {
      const cur = s.m[id];
      if (cur && Math.abs(cur.vol - v.vol) < 1e-6 && cur.size.every((x, i) => Math.abs(x - v.size[i]) < 1e-4)) return s;
      return { m: { ...s.m, [id]: v } };
    }),
  drop: id =>
    set(s => {
      if (!(id in s.m)) return s;
      const m = { ...s.m };
      delete m[id];
      return { m };
    }),
}));
