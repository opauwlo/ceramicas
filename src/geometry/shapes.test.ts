import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defSurface, newPiece, PIECE_TYPES } from '../model/spec';
import { buildGeometry, discTopAt, geometryKey, pieceVolume, volumeOf, waveH } from './shapes';

describe('geometrias', () => {
  it('toda peça nasce com a base na mesa e volume positivo', () => {
    for (const t of PIECE_TYPES) {
      const pc = newPiece(t, { p: { irregular: 0 } });
      const g = buildGeometry(pc);
      g.computeBoundingBox();
      const box = g.boundingBox as THREE.Box3;
      expect(box.min.y, t).toBeGreaterThan(-1e-3);
      expect(box.min.y, t).toBeLessThan(1e-3);
      const v = pieceVolume(pc, g);
      expect(Number.isFinite(v), t).toBe(true);
      expect(v, t).toBeGreaterThan(0);
      expect(g.attributes.normal.count).toBe(g.attributes.position.count);
    }
  });

  it('cilindro de pontas retas tem volume πr²h', () => {
    const pc = newPiece('cilindro', { p: { raio: 1, altura: 2, arredondado: 0, irregular: 0 } });
    expect(volumeOf(buildGeometry(pc))).toBeCloseTo(Math.PI * 2, 1);
  });

  it('bolinha tem volume de esfera', () => {
    const pc = newPiece('esfera', { p: { raio: 1, achatar: 1, irregular: 0 } });
    expect(volumeOf(buildGeometry(pc))).toBeCloseTo((4 / 3) * Math.PI, 1);
  });

  it('bloco de canto vivo tem volume largura × altura × profundidade', () => {
    const pc = newPiece('caixa', { p: { largura: 2, altura: 1, profundidade: 3, canto: 0 } });
    expect(volumeOf(buildGeometry(pc))).toBeCloseTo(6, 1);
  });

  it('anel aberto usa a fórmula do toro', () => {
    const pc = newPiece('anel', { p: { raio: 1, tubo: 0.2, arco: 180 } });
    expect(pieceVolume(pc, buildGeometry(pc))).toBeCloseTo(Math.PI * Math.PI * 0.04, 4);
  });

  it('disco com ondas fica mais alto que a espessura em algum ponto', () => {
    const pc = newPiece('disco', { p: { raio: 3, espessura: 0.2, borda: 1, irregular: 0 }, s: { amp: 0.06, qtd: 8, inicio: 0.3 } });
    const g = buildGeometry(pc);
    g.computeBoundingBox();
    expect((g.boundingBox as THREE.Box3).max.y).toBeGreaterThan(0.2);
  });

  it('a chave de geometria ignora cor e posição', () => {
    const a = newPiece('disco');
    const b = { ...a, color: '#000000', pos: [1, 2, 3] as [number, number, number] };
    expect(geometryKey(a)).toBe(geometryKey(b));
    expect(geometryKey({ ...a, p: { ...a.p, raio: 1 } })).not.toBe(geometryKey(a));
  });
});

describe('ondas do disco', () => {
  const s = { ...defSurface(), amp: 0.05, qtd: 6, inicio: 0.3 };

  it('não tem relevo antes do início nem na borda', () => {
    expect(waveH(0.5, 2.8, 3, s)).toBe(0);
    expect(Math.abs(waveH(2.8, 2.8, 3, s))).toBeLessThan(1e-9);
  });

  it('afunda o centro quando há cratera', () => {
    expect(waveH(0, 2.8, 3, { ...s, cratera: 0.1 })).toBeCloseTo(-0.1, 6);
  });

  it('discTopAt soma espessura e relevo', () => {
    const pc = newPiece('disco', { p: { raio: 3, espessura: 0.2, borda: 1 }, s: { amp: 0 } });
    expect(discTopAt(pc, 1.5)).toBeCloseTo(0.2, 6);
  });
});
