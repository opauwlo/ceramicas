import { describe, expect, it } from 'vitest';
import { defSurface, newPiece, normalizeDoc, PIECE_TYPES, SPEC } from './spec';

describe('newPiece', () => {
  it('usa os padrões de cada tipo', () => {
    for (const t of PIECE_TYPES) {
      const p = newPiece(t);
      expect(p.type).toBe(t);
      expect(p.p).toEqual(SPEC[t].defaults);
      expect(p.s === null).toBe(t !== 'disco');
      expect(p.visible).toBe(true);
    }
  });

  it('mescla uma superfície parcial com os padrões', () => {
    const p = newPiece('disco', { s: { amp: 0.05, aneis: { on: true } } });
    expect(p.s?.amp).toBe(0.05);
    expect(p.s?.aneis.on).toBe(true);
    expect(p.s?.aneis.qtd).toBe(defSurface().aneis.qtd);
    expect(p.s?.rotulo).toEqual(defSurface().rotulo);
  });

  it('limita medidas fora da faixa', () => {
    const p = newPiece('esfera', { p: { raio: 999, achatar: -3 } });
    expect(p.p.raio).toBe(3);
    expect(p.p.achatar).toBe(0.3);
  });

  it('gera ids diferentes', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newPiece('disco').id));
    expect(ids.size).toBe(50);
  });
});

describe('normalizeDoc', () => {
  it('recusa o que não é modelo', () => {
    expect(normalizeDoc(null)).toBeNull();
    expect(normalizeDoc('oi')).toBeNull();
    expect(normalizeDoc({})).toBeNull();
    expect(normalizeDoc({ pieces: 'x' })).toBeNull();
  });

  it('conserta cores, acabamento e cena inválidos', () => {
    const d = normalizeDoc({ bg: 'praia', light: 'sol', lightAngle: 900, pieces: [{ type: 'esfera', color: 'vermelho', finish: 'ouro', pos: [1, 'a'] }] });
    expect(d).not.toBeNull();
    expect(d?.bg).toBe('caderno');
    expect(d?.light).toBe('mesa');
    expect(d?.lightAngle).toBe(180);
    const p = d?.pieces[0];
    expect(p?.color).toBe(SPEC.esfera.color);
    expect(p?.finish).toBe('verniz');
    expect(p?.pos).toEqual([1, 0, 0]);
  });

  it('descarta tipos desconhecidos e repete ids', () => {
    const d = normalizeDoc({ pieces: [{ type: 'pirâmide' }, { type: 'cone', id: 'a' }, { type: 'cone', id: 'a' }] });
    expect(d?.pieces).toHaveLength(2);
    expect(d?.pieces[0].id).not.toBe(d?.pieces[1].id);
  });

  it('aceita o código exportado pela primeira versão, sem ids', () => {
    const d = normalizeDoc({ v: 1, bg: 'agua', light: 'estudio', lightAngle: 0, pieces: [{ type: 'disco', name: 'Disco', p: { raio: 2.6 }, s: { sulcos: true } }] });
    expect(d?.pieces[0].p.raio).toBe(2.6);
    expect(d?.pieces[0].s?.sulcos).toBe(true);
    expect(typeof d?.pieces[0].id).toBe('string');
  });

  it('volta igual depois de ida e volta em JSON', () => {
    const d = normalizeDoc({ pieces: [{ type: 'disco' }, { type: 'gota' }] });
    expect(normalizeDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});
