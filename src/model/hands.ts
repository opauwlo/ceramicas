import { round } from '../lib/format';
import { SPEC } from './spec';
import type { Piece, PieceType } from './types';

/*
 * Mexer na peça como se fosse com a mão. A massa não some nem aparece:
 * apertar achata e alarga, puxar estica e afina, e o volume fica igual.
 *
 * Cada medida muda com k elevado a um expoente. k < 1 é apertar, k > 1 é puxar.
 * Os expoentes de cada peça somam zero no volume (ex.: disco = raio² × espessura).
 */
export const PRESS: Record<PieceType, Record<string, number>> = {
  disco: { espessura: 1, raio: -0.5 },
  cilindro: { altura: 1, raio: -0.5 },
  cone: { altura: 1, raio: -0.5 },
  caixa: { altura: 1, largura: -0.5, profundidade: -0.5 },
  // esfera e gota: a altura é raio × fator, então o fator sobe 1,5 para a altura subir 1
  esfera: { achatar: 1.5, raio: -0.5 },
  gota: { alongar: 1.5, raio: -0.5 },
  // anel: rolar a cobrinha de massa. Fica mais fina e a volta fica maior (raio × tubo²)
  anel: { tubo: 0.5, raio: -1 },
};

/** Quanto dá para apertar ou puxar sem nenhuma medida sair do limite da peça. */
export function pressRange(pc: Piece): [number, number] {
  let lo = 0;
  let hi = Infinity;
  for (const prm of SPEC[pc.type].params) {
    const e = PRESS[pc.type][prm.key];
    const v = pc.p[prm.key];
    if (!e || !(v > 0)) continue;
    // min ≤ v·k^e ≤ max  →  k entre (min/v)^(1/e) e (max/v)^(1/e), invertidos se e < 0
    const a = Math.pow(Math.min(1, prm.min / v), 1 / e);
    const b = Math.pow(Math.max(1, prm.max / v), 1 / e);
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  return [lo, hi];
}

/** Medidas novas depois de apertar (k < 1) ou puxar (k > 1). Para no limite sem perder massa. */
export function press(pc: Piece, k: number): Record<string, number> {
  const [lo, hi] = pressRange(pc);
  const kk = Math.min(hi, Math.max(lo, k));
  const p = { ...pc.p };
  for (const [key, e] of Object.entries(PRESS[pc.type])) {
    if (key in p) p[key] = round(p[key] * Math.pow(kk, e), 5);
  }
  return p;
}

/** O k que de fato será usado, depois de respeitar os limites. */
export function clampPress(pc: Piece, k: number): number {
  const [lo, hi] = pressRange(pc);
  return Math.min(hi, Math.max(lo, k));
}

/**
 * Alisar com o dedo. `f` vai de 1 (nada) a 0 (lisinha): tira o jeito torto
 * e boa parte da textura da argila.
 */
export function smooth(pc: Piece, f: number): { p: Record<string, number>; clay: number } {
  const t = Math.min(1, Math.max(0, f));
  const p = { ...pc.p };
  if ('irregular' in p) p.irregular = round(p.irregular * t, 3);
  return { p, clay: round(pc.clay * Math.pow(t, 0.6), 3) };
}

/** Se ainda tem o que alisar. */
export const canSmooth = (pc: Piece) => (pc.p.irregular ?? 0) > 0.005 || pc.clay > 0.005;
