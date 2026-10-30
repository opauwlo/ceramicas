import { describe, expect, it } from 'vitest';
import { Dough } from './dough';
import { icosphere, volume } from './mesh';
import { packDough, unpackDough } from './storage';

/** Massa menor (nível 4) para os testes rodarem rápido. */
const small = () => new Dough(1.6, 4);

const top = (d: Dough): [number, number, number] => {
  let best = 0;
  for (let i = 1; i < d.n; i++) if (d.rest[i * 3 + 1] > d.rest[best * 3 + 1]) best = i;
  return [d.rest[best * 3], d.rest[best * 3 + 1], d.rest[best * 3 + 2]];
};

const minY = (d: Dough) => {
  let m = Infinity;
  for (let i = 1; i < d.rest.length; i += 3) m = Math.min(m, d.rest[i]);
  return m;
};

const pigment = (d: Dough) => {
  const s = [0, 0, 0];
  for (let i = 0; i < d.ink.length; i++) s[i % 3] += d.ink[i];
  return s;
};

describe('bola', () => {
  it('é fechada e vira para fora (volume positivo, perto da esfera)', () => {
    const b = icosphere(3, 1);
    const v = volume(b.pos, b.idx);
    expect(v).toBeGreaterThan(0);
    expect(Math.abs(v / ((4 / 3) * Math.PI) - 1)).toBeLessThan(0.02);
  });

  it('cada ponto tem 5 ou 6 vizinhos', () => {
    const b = icosphere(3, 1);
    for (let i = 0; i < b.off.length - 1; i++) {
      const k = b.off[i + 1] - b.off[i];
      expect(k === 5 || k === 6).toBe(true);
    }
  });
});

describe('a massa não some', () => {
  it('afundar com o dedo mantém o volume e afunda de verdade', () => {
    const d = small();
    const t = top(d);
    for (let s = 0; s < 20; s++) {
      d.dent(t, [0, 1, 0], 0.5, 0.03);
      d.settle();
    }
    d.settle(3);
    expect(Math.abs(d.volume() / d.vol0 - 1)).toBeLessThan(0.002);
    expect(top(d)[1]).toBeLessThan(t[1]);
  });

  it('beliscar puxa uma ponta para fora sem ganhar massa', () => {
    const d = small();
    const side: [number, number, number] = [0, 0, 0];
    let best = 0;
    for (let i = 1; i < d.n; i++) if (d.rest[i * 3] > d.rest[best * 3]) best = i;
    side[0] = d.rest[best * 3];
    side[1] = d.rest[best * 3 + 1];
    side[2] = d.rest[best * 3 + 2];
    const before = side[0];
    for (let s = 0; s < 15; s++) {
      d.pinch(side, [1, 0, 0], 0.5, 0.05);
      d.settle();
    }
    d.settle(3);
    let maxX = -Infinity;
    for (let i = 0; i < d.rest.length; i += 3) maxX = Math.max(maxX, d.rest[i]);
    expect(maxX).toBeGreaterThan(before + 0.3);
    expect(Math.abs(d.volume() / d.vol0 - 1)).toBeLessThan(0.002);
  });

  it('arrastar e alisar também conservam', () => {
    const d = small();
    const t = top(d);
    for (let s = 0; s < 20; s++) {
      d.smear([t[0] + s * 0.03, t[1], t[2]], 0.5, [0.03, 0, 0]);
      d.smooth([t[0] + s * 0.03, t[1], t[2]], 0.6, 0.5);
      d.settle();
    }
    d.settle(3);
    expect(Math.abs(d.volume() / d.vol0 - 1)).toBeLessThan(0.002);
  });

  it('a mesa segura a massa: nada passa de y = 0 e ela continua apoiada', () => {
    const d = small();
    const t = top(d);
    for (let s = 0; s < 40; s++) {
      d.dent(t, [0, 1, 0], 1.2, 0.08);
      d.settle();
    }
    expect(minY(d)).toBeGreaterThanOrEqual(0);
    expect(minY(d)).toBeLessThan(1e-3);
  });
});

describe('tinta', () => {
  it('sovar só passa pigmento de um ponto para outro', () => {
    const d = small();
    const t = top(d);
    d.drop(t, 0.4, [0.9, 0.1, 0.1]);
    const p0 = pigment(d);
    for (let s = 0; s < 30; s++) d.stir([t[0] + Math.sin(s) * 0.2, t[1], t[2]], 0.5, [0.04, 0, 0.02]);
    const p1 = pigment(d);
    for (let ch = 0; ch < 3; ch++) expect(Math.abs(p1[ch] - p0[ch]) / p0[ch]).toBeLessThan(1e-4);
  });

  it('o pingo tinge mais forte que a cor da paleta (tinta concentrada)', () => {
    const d = small();
    const t = top(d);
    d.drop(t, 0.4, [0.8, 0.2, 0.2]);
    d.paint();
    let reddest = 1;
    for (let i = 0; i < d.n; i++) reddest = Math.min(reddest, d.col[i * 3 + 1]);
    expect(reddest).toBeLessThan(0.2);
  });
});

describe('guardar', () => {
  it('volta igualzinha (dentro do arredondamento)', () => {
    const a = small();
    const t = top(a);
    a.dent(t, [0, 1, 0], 0.5, 0.3);
    a.drop(t, 0.4, [0.2, 0.4, 0.9]);
    a.settle(3);
    const raw = packDough(a);
    const b = small();
    expect(unpackDough(b, raw)).toBe(true);
    let dp = 0;
    let di = 0;
    for (let i = 0; i < a.rest.length; i++) {
      dp = Math.max(dp, Math.abs(a.rest[i] - b.rest[i]));
      di = Math.max(di, Math.abs(a.ink[i] - b.ink[i]));
    }
    expect(dp).toBeLessThan(1e-3);
    expect(di).toBeLessThan(0.02);
  });

  it('não aceita guardado de outra massa', () => {
    const raw = packDough(small());
    expect(unpackDough(new Dough(1.6, 3), raw)).toBe(false);
    expect(unpackDough(small(), '{"v":2}')).toBe(false);
    expect(unpackDough(small(), 'lixo')).toBe(false);
  });
});
