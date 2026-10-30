import { create } from 'zustand';
import type { CutterShape } from './cutters';

/** As ferramentas da bancada. */
export type ClayTool =
  | 'dedo'
  | 'rolo'
  | 'boleador'
  | 'silicone'
  | 'espatula'
  | 'esteca'
  | 'cortador'
  | 'agua'
  | 'esponja'
  | 'lixa'
  | 'tinta'
  | 'verniz';

/** Espessura dos niveladores do rolo, em mm (0 = sem). */
export type Nivel = 0 | 3 | 5 | 8;
export type Size3 = 'P' | 'M' | 'G';

/** O que a tela de sovar mostra; a massa em si mora na cena. */
export interface ClayUi {
  tool: ClayTool;
  /** cor da tinta (hex) */
  color: string;
  /** tinta: pingar e sovar (tinge a massa) ou pincelar por cima */
  tintaModo: 'pingo' | 'pincel';
  nivel: Nivel;
  bol: Size3;
  esteca: 'fina' | 'grossa';
  cutter: CutterShape;
  cutterSize: Size3;
  verniz: 'brilho' | 'fosco';
  sound: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** peso da massa em gramas */
  grams: number;
  /** o que a ferramenta está fazendo agora, para o recadinho */
  doing: string;
  /** a bailarina está girando */
  spinning: boolean;
  /** dicas abertas */
  coach: boolean;
  set(patch: Partial<Omit<ClayUi, 'set'>>): void;
}

const seen = () => {
  try {
    return localStorage.getItem('atelie-massa-dicas') === '2';
  } catch {
    return true;
  }
};

const soundPref = () => {
  try {
    return localStorage.getItem('atelie-massa-som') !== '0';
  } catch {
    return true;
  }
};

export const useClay = create<ClayUi>()(set => ({
  tool: 'dedo',
  color: '#e0473c',
  tintaModo: 'pingo',
  nivel: 5,
  bol: 'M',
  esteca: 'fina',
  cutter: 'coracao',
  cutterSize: 'M',
  verniz: 'brilho',
  sound: soundPref(),
  canUndo: false,
  canRedo: false,
  grams: 0,
  doing: '',
  spinning: false,
  coach: !seen(),
  set: patch => set(patch),
}));
