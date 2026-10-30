import { describe, expect, it } from 'vitest';
import type { XZ } from './dough';
import { resample, snapAngle, snapLine, snapPath, snapPoint } from './snap';

const C: XZ = [0.3, -0.2];

describe('ímã', () => {
  it('ponto perto do centro gruda no centro', () => {
    expect(snapPoint([0.6, 0.1], C)).toEqual({ p: [0.3, -0.2], kind: 'centro' });
  });

  it('ponto perto da grade gruda na grade', () => {
    const s = snapPoint([2.08, 1.43], C);
    expect(s.kind).toBe('grade');
    expect(s.p[0]).toBeCloseTo(2, 6);
    expect(s.p[1]).toBeCloseTo(1.5, 6);
  });

  it('ponto longe de tudo fica onde está', () => {
    expect(snapPoint([2.25, 1.25], C).kind).toBe('livre');
  });

  it('ângulo torto vira 45°, ângulo bem torto fica', () => {
    expect(snapAngle((40 * Math.PI) / 180)).toBeCloseTo(Math.PI / 4, 6);
    expect(snapAngle((22 * Math.PI) / 180)).toBeCloseTo((22 * Math.PI) / 180, 6);
  });

  it('corte quase pelo meio passa pelo centro, reto', () => {
    const l = snapLine([-2, 0.1], [2.4, -0.25], C);
    expect(l.kind).toBe('centro');
    expect(Math.abs(l.u[1])).toBeLessThan(1e-9);
    expect(l.o[1]).toBeCloseTo(C[1], 6);
  });

  it('risco quase reto vira reta', () => {
    const raw: XZ[] = [];
    for (let i = 0; i <= 20; i++) raw.push([i * 0.1, Math.sin(i) * 0.04]);
    const p = snapPath(raw, [5, 5]);
    expect(p.kind).toBe('reta');
    for (const [, z] of p.pts) expect(Math.abs(z)).toBeLessThan(0.05);
  });

  it('volta torta em torno do centro vira círculo certinho', () => {
    const raw: XZ[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 1.8;
      const r = 1 + 0.08 * Math.sin(i * 1.7);
      raw.push([C[0] + r * Math.cos(t), C[1] + r * Math.sin(t)]);
    }
    const p = snapPath(raw, C);
    expect(p.kind).toBe('circulo');
    expect(p.closed).toBe(true);
    for (const [x, z] of p.pts) expect(Math.hypot(x - C[0], z - C[1])).toBeCloseTo(1, 6);
  });

  it('rabisco livre fica suave e com os pontos espaçados por igual', () => {
    const raw: XZ[] = [];
    for (let i = 0; i <= 30; i++) raw.push([i * 0.05, (i % 2 ? 0.03 : -0.03) + (i * 0.05) ** 2 * 0.6]);
    const p = snapPath(raw, [5, 5], 0.06);
    expect(p.kind).toBe('livre');
    for (let i = 2; i < p.pts.length - 1; i++) {
      const d = Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
      expect(d).toBeLessThan(0.065);
    }
  });

  it('reamostrar mantém as pontas', () => {
    const r = resample(
      [
        [0, 0],
        [1, 0],
      ],
      0.3,
    );
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1]).toEqual([1, 0]);
  });
});
