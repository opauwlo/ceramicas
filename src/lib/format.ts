import type { Unit } from '../model/spec';

export const nf = (v: number, d: number) =>
  Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmt(v: number, u: Unit): string {
  switch (u) {
    case 'cm':
      return `${nf(v, 2)} cm`;
    case 'mm':
      return `${nf(v, 2)} mm`;
    case 'cmmm':
      return `${nf(v * 10, 1)} mm`;
    case '%':
      return `${Math.round(v * 100)}%`;
    case '°':
      return `${Math.round(v)}°`;
    case '×':
      return `${nf(v, 2)}×`;
    default:
      return String(Math.round(v));
  }
}

/** Largura × profundidade × altura, em cm. */
export const dims = (s: readonly [number, number, number]) => `${nf(s[0], 1)} × ${nf(s[2], 1)} × ${nf(s[1], 1)} cm`;

export const grams = (g: number) => (g < 1 ? 'menos de 1 g' : `≈ ${Math.round(g)} g`);

export const wrapAngle = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export const round = (v: number, d = 4) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};
