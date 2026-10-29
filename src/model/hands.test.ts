import { describe, expect, it } from 'vitest';
import { buildGeometry, pieceVolume } from '../geometry/shapes';
import { canSmooth, press, pressRange, shapeVolume, smooth } from './hands';
import { newPiece, PIECE_TYPES, SPEC } from './spec';
import type { Piece } from './types';

const vol = (pc: Piece) => {
  const g = buildGeometry(pc);
  const v = pieceVolume(pc, g);
  g.dispose();
  return v;
};

const withP = (pc: Piece, p: Record<string, number>): Piece => ({ ...pc, p });

describe('amassar e esticar', () => {
  for (const t of PIECE_TYPES) {
    it(`${SPEC[t].label}: o volume não muda`, () => {
      const pc = newPiece(t, { p: { irregular: 0 } });
      const v0 = vol(pc);
      for (const k of [0.6, 0.85, 1.25, 1.6]) {
        const v1 = vol(withP(pc, press(pc, k)));
        expect(Math.abs(v1 - v0) / v0).toBeLessThan(0.02);
      }
    });
  }

  it('apertar achata e alarga o disco', () => {
    const pc = newPiece('disco');
    const p = press(pc, 0.5);
    expect(p.espessura).toBeLessThan(pc.p.espessura);
    expect(p.raio).toBeGreaterThan(pc.p.raio);
  });

  it('puxar estica e afina o cilindro', () => {
    const pc = newPiece('cilindro');
    const p = press(pc, 2);
    expect(p.altura).toBeCloseTo(pc.p.altura * 2, 4);
    expect(p.raio).toBeLessThan(pc.p.raio);
  });

  it('a conta de volume pelas medidas bate com a malha', () => {
    for (const t of PIECE_TYPES) {
      const pc = newPiece(t, { p: { irregular: 0 } });
      const ratio = (pq: Piece) => vol(pq) / shapeVolume(t, pq.p);
      // a malha é feita de facetas, então compara a razão antes e depois de amassar
      expect(Math.abs(ratio(withP(pc, press(pc, 0.8))) / ratio(pc) - 1)).toBeLessThan(0.02);
    }
  });

  it('para no limite sem deixar nenhuma medida sair da faixa', () => {
    for (const t of PIECE_TYPES) {
      const pc = newPiece(t);
      for (const k of [0.001, 1000]) {
        const p = press(pc, k);
        for (const prm of SPEC[t].params) {
          expect(p[prm.key]).toBeGreaterThanOrEqual(prm.min - 1e-6);
          expect(p[prm.key]).toBeLessThanOrEqual(prm.max + 1e-6);
        }
      }
    }
  });

  it('a faixa sempre inclui deixar como está', () => {
    for (const t of PIECE_TYPES) {
      const [lo, hi] = pressRange(newPiece(t));
      expect(lo).toBeLessThanOrEqual(1);
      expect(hi).toBeGreaterThanOrEqual(1);
    }
  });

  it('não mexe no que não é medida de forma', () => {
    const pc = newPiece('disco', { p: { borda: 0.7, irregular: 0.4 } });
    const p = press(pc, 0.7);
    expect(p.borda).toBe(0.7);
    expect(p.irregular).toBe(0.4);
  });
});

describe('alisar', () => {
  it('tira o jeito torto e a textura aos poucos', () => {
    const pc = newPiece('disco', { clay: 0.5, p: { irregular: 0.6 } });
    const a = smooth(pc, 0.5);
    expect(a.p.irregular).toBeCloseTo(0.3, 3);
    expect(a.clay).toBeLessThan(0.5);
    expect(a.clay).toBeGreaterThan(0.25);
    const b = smooth(pc, 0);
    expect(b.p.irregular).toBe(0);
    expect(b.clay).toBe(0);
  });

  it('peça sem jeito torto alisa só a textura', () => {
    const pc = newPiece('caixa', { clay: 0.4 });
    const a = smooth(pc, 0.5);
    expect('irregular' in a.p).toBe(false);
    expect(a.clay).toBeLessThan(0.4);
  });

  it('sabe quando já está lisinha', () => {
    expect(canSmooth(newPiece('gota', { clay: 0 }))).toBe(false);
    expect(canSmooth(newPiece('esfera', { clay: 0, p: { irregular: 0.2 } }))).toBe(true);
  });
});
