import { create } from 'zustand';

/** O que a tela de sovar mostra; a massa em si mora na cena. */
export interface ClayUi {
  /** pingo de tinta escolhido (hex) ou null para sovar */
  drop: string | null;
  sound: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** peso da massa em gramas */
  grams: number;
  /** o que o dedo está fazendo agora, para o recadinho */
  doing: '' | 'apertando' | 'levando a massa' | 'alisando' | 'beliscando' | 'esticando';
  /** dicas de gestos abertas */
  coach: boolean;
  set(patch: Partial<Omit<ClayUi, 'set'>>): void;
}

const seen = () => {
  try {
    return localStorage.getItem('atelie-massa-dicas') === '1';
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
  drop: null,
  sound: soundPref(),
  canUndo: false,
  canRedo: false,
  grams: 0,
  doing: '',
  coach: !seen(),
  set: patch => set(patch),
}));
