import { describe, expect, it } from 'vitest';
import { cutterOutline } from './cutters';
import { Dough, insidePoly, nearestOnPoly, type XZ } from './dough';
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

describe('ferramentas', () => {
  // placa aberta na malha de verdade (a de teste é grossa demais para buraquinhos de 2 mm)
  const rolled = (H = 0.5) => {
    const d = new Dough(1.6, 5);
    let h = d.extent().top;
    for (let k = 0; k < 40; k++) {
      h = Math.max(H, h - 0.12);
      d.roll(k % 4 < 2 ? [0, 1] : [1, 0], h);
      d.settle();
    }
    d.settle(3);
    return d;
  };

  it('rolo com nivelador abre uma placa reta da espessura certa, sem perder massa', () => {
    const d = rolled(0.5);
    const e = d.extent();
    expect(e.top).toBeCloseTo(0.5, 1);
    expect(e.radius).toBeGreaterThan(2.5);
    expect(Math.abs(d.volume() / d.vol0 - 1)).toBeLessThan(0.002);
    expect(d.vol0).toBeCloseTo(new Dough(1.6, 5).vol0, 3);
  });

  it('espátula corta reto: nada passa da linha e o que saiu vira sobra', () => {
    const d = rolled();
    const before = d.vol0;
    const removed = d.cutPlane([0.8, 0], [1, 0]);
    expect(removed).toBeGreaterThan(0);
    expect(d.vol0).toBeCloseTo(before - removed, 4);
    for (let i = 0; i < d.n; i++) expect(d.rest[i * 3]).toBeLessThanOrEqual(0.8 + 1e-4);
  });

  it('espátula fora da massa não corta nada', () => {
    const d = small();
    expect(d.cutPlane([10, 0], [1, 0])).toBe(0);
  });

  it('cortador deixa a massa no formato, tudo dentro do contorno', () => {
    const d = rolled();
    const poly: XZ[] = cutterOutline('coracao').map(([u, v]) => [u * 1.5, -v * 1.5]);
    const removed = d.cutShape(poly, [0, 0]);
    expect(removed).toBeGreaterThan(0);
    for (let i = 0; i < d.n; i += 7) {
      const x = d.rest[i * 3];
      const z = d.rest[i * 3 + 2];
      if (insidePoly(poly, x, z)) continue;
      const [nx, nz] = nearestOnPoly(poly, x, z);
      expect(Math.hypot(nx - x, nz - z)).toBeLessThan(0.01);
    }
  });

  it('estrela sai estrela: as reentrâncias abrem e o volume bate com a área × espessura', () => {
    const d = rolled();
    const e = d.extent();
    const poly: XZ[] = cutterOutline('estrela').map(([u, v]) => [e.cx + u * 1.6, e.cz - v * 1.6]);
    d.cutShape(poly, [e.cx, e.cz]);
    d.settle(2);
    let A = 0;
    for (let i = 0; i < poly.length; i++) {
      const [a, b] = poly[i];
      const [c, dd] = poly[(i + 1) % poly.length];
      A += a * dd - c * b;
    }
    A = Math.abs(A) / 2;
    // placa de 5 mm com a borda arredondada: um pouco menos que área × espessura
    expect(d.vol0 / (A * 0.5)).toBeGreaterThan(0.8);
    expect(d.vol0 / (A * 0.5)).toBeLessThan(1.05);
  });

  it('os contornos dos cortadores cabem no círculo de raio 1', () => {
    for (const s of ['circulo', 'coracao', 'estrela', 'folha', 'flor'] as const) {
      const o = cutterOutline(s);
      let r = 0;
      for (const [u, v] of o) r = Math.max(r, Math.hypot(u, v));
      expect(r).toBeCloseTo(1, 3);
    }
  });

  it('lixa só tira massa, e tira o verniz junto', () => {
    const d = small();
    const t = top(d);
    d.varnish.fill(1);
    const before = d.vol0;
    for (let k = 0; k < 10; k++) d.sand(t, 0.6, 0.9);
    expect(d.vol0).toBeLessThan(before);
    let vmin = 1;
    for (let i = 0; i < d.n; i++) vmin = Math.min(vmin, d.varnish[i]);
    expect(vmin).toBeLessThan(0.2);
  });

  it('esteca e boleador afundam até a medida e não continuam afundando no mesmo lugar', () => {
    const d = rolled();
    const e = d.extent();
    const a: [number, number, number] = [e.cx - 0.5, e.top, e.cz];
    const b: [number, number, number] = [e.cx + 0.5, e.top, e.cz];
    for (let k = 0; k < 6; k++) {
      d.crease(a, b, [0, 1, 0], 0.12, 0.1);
      d.settle();
    }
    let low = Infinity;
    for (let i = 0; i < d.n; i++) if (Math.abs(d.rest[i * 3 + 2] - e.cz) < 0.06 && Math.abs(d.rest[i * 3] - e.cx) < 0.4 && d.rest[i * 3 + 1] > 0.2) low = Math.min(low, d.rest[i * 3 + 1]);
    expect(e.top - low).toBeGreaterThan(0.05);
    expect(e.top - low).toBeLessThan(0.16);
    const c: [number, number, number] = [e.cx, e.top, e.cz + 0.8];
    for (let k = 0; k < 6; k++) {
      d.ball(c, c, [0, 1, 0], 0.22, 0.15);
      d.settle();
    }
    let low2 = Infinity;
    // malha de teste é mais grossa: procura o ponto mais fundo perto do centro do buraquinho
    for (let i = 0; i < d.n; i++) if (Math.hypot(d.rest[i * 3] - c[0], d.rest[i * 3 + 2] - c[2]) < 0.25 && d.rest[i * 3 + 1] > 0.2) low2 = Math.min(low2, d.rest[i * 3 + 1]);
    expect(e.top - low2).toBeGreaterThan(0.06);
    expect(e.top - low2).toBeLessThan(0.22);
    expect(Math.abs(d.volume() / d.vol0 - 1)).toBeLessThan(0.003);
  });

  it('pincel de tinta pinta por cima e verniz dá brilho', () => {
    const d = small();
    const t = top(d);
    d.paintSeg(t, t, 0.3, [0.1, 0.3, 0.9]);
    d.paintSeg(t, t, 0.3, [0.1, 0.3, 0.9]);
    d.varnishSeg(t, t, 0.3, true);
    d.paint();
    let blue = 0;
    let shiny = 0;
    for (let i = 0; i < d.n; i++) {
      if (d.col[i * 3 + 2] > 0.6 && d.col[i * 3] < 0.4) blue++;
      if (d.gloss[i] > 0.4) shiny++;
    }
    expect(blue).toBeGreaterThan(0);
    expect(shiny).toBeGreaterThan(0);
  });

  it('a água escurece e brilha um pouco e depois seca', () => {
    const d = small();
    const t = top(d);
    d.wetSeg(t, t, 0.5, 1);
    d.paint();
    let wet = 0;
    for (let i = 0; i < d.n; i++) wet = Math.max(wet, d.gloss[i]);
    expect(wet).toBeGreaterThan(0.3);
    let still = true;
    for (let k = 0; k < 400 && still; k++) still = d.dry(0.1);
    expect(still).toBe(false);
  });

  it('guarda e devolve o verniz', () => {
    const a = small();
    const t = top(a);
    a.varnishSeg(t, t, 0.5, true);
    a.varnishSeg(t, t, 0.5, true);
    const b = small();
    expect(unpackDough(b, packDough(a))).toBe(true);
    let d = 0;
    for (let i = 0; i < a.n; i++) d = Math.max(d, Math.abs(a.varnish[i] - b.varnish[i]));
    expect(d).toBeLessThan(0.01);
  });
});
