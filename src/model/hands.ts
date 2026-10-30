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

/** Volume de um disco de quinas redondas (perfil de torno de shapes.ts), pelo teorema de Pappus. */
function pillVol(R: number, T: number, c: number): number {
  // cada quina tira um quadradinho c×c e devolve um quarto de círculo; conta o giro de cada pedaço
  const corner = c * c * (R - c / 2) - ((Math.PI * c * c) / 4) * (R - c + (4 * c) / (3 * Math.PI));
  return Math.PI * R * R * T - 4 * Math.PI * corner;
}

/**
 * Volume em cm³ só pelas medidas (sem o jeito torto, que muda igual antes e depois).
 * Na gota é só proporcional, o que basta para comparar antes e depois.
 * Os arredondamentos seguem as mesmas contas de geometry/shapes.ts.
 */
export function shapeVolume(type: PieceType, p: Record<string, number>): number {
  switch (type) {
    case 'disco': {
      const R = Math.max(0.05, p.raio);
      const T = Math.max(0.02, p.espessura);
      return pillVol(R, T, Math.max(0.002, Math.min(R, T / 2) * 0.98 * p.borda));
    }
    case 'cilindro': {
      const R = Math.max(0.005, p.raio);
      const T = Math.max(0.01, p.altura);
      return pillVol(R, T, Math.max(0.001, Math.min(R, T / 2) * 0.99 * p.arredondado));
    }
    case 'caixa': {
      const w = Math.max(0.02, p.largura);
      const h = Math.max(0.02, p.altura);
      const d = Math.max(0.02, p.profundidade);
      const r = Math.max(0.003, (Math.min(w, h, d) / 2) * 0.99 * p.canto);
      const [a, b, e] = [w - 2 * r, h - 2 * r, d - 2 * r];
      return a * b * e + 2 * r * (a * b + a * e + b * e) + Math.PI * r * r * (a + b + e) + (4 / 3) * Math.PI * r ** 3;
    }
    case 'esfera':
      return (4 / 3) * Math.PI * p.raio ** 3 * p.achatar;
    case 'gota':
      return p.raio ** 3 * p.alongar;
    case 'cone':
      return (Math.PI * p.raio ** 2 * p.altura) / 3;
    case 'anel':
      return 2 * Math.PI * Math.PI * p.raio * p.tubo ** 2;
  }
}

/** Medidas novas depois de apertar (k < 1) ou puxar (k > 1). Para no limite sem perder massa. */
export function press(pc: Piece, k: number): Record<string, number> {
  const [lo, hi] = pressRange(pc);
  const kk = Math.min(hi, Math.max(lo, k));
  const rule = PRESS[pc.type];
  const p = { ...pc.p };
  for (const [key, e] of Object.entries(rule)) {
    if (key in p) p[key] = p[key] * Math.pow(kk, e);
  }
  // as quinas redondas não esticam por igual; acerta a largura até o volume bater de novo
  const v0 = shapeVolume(pc.type, pc.p);
  const wide = Object.keys(rule).filter(key => rule[key] < 0 && key in p);
  const at = (s: number) => {
    const q = { ...p };
    for (const key of wide) q[key] = p[key] * s;
    return q;
  };
  if (v0 > 0 && wide.length && Math.abs(shapeVolume(pc.type, p) / v0 - 1) > 1e-5) {
    let a = 0.7;
    let b = 1.4;
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (shapeVolume(pc.type, at(m)) < v0) a = m;
      else b = m;
    }
    Object.assign(p, at((a + b) / 2));
  }
  // a correção pode passar um tiquinho do limite; segura dentro da faixa da peça
  for (const prm of SPEC[pc.type].params) {
    if (!(prm.key in rule) || !(prm.key in p)) continue;
    const was = pc.p[prm.key];
    p[prm.key] = round(Math.min(Math.max(prm.max, was), Math.max(Math.min(prm.min, was), p[prm.key])), 5);
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
