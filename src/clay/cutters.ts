import type { XZ } from './dough';

/*
 * Contornos dos cortadores, em 2D: (u, v) com v para "cima" de quem olha a tela.
 * Todos cabem num círculo de raio 1; o tamanho escolhido multiplica.
 */

export type CutterShape = 'circulo' | 'coracao' | 'estrela' | 'folha' | 'flor' | 'mariposa';

export const CUTTERS: ReadonlyArray<readonly [CutterShape, string]> = [
  ['circulo', 'Círculo'],
  ['coracao', 'Coração'],
  ['estrela', 'Estrela'],
  ['folha', 'Folha'],
  ['flor', 'Flor'],
  ['mariposa', 'Mariposa'],
];

/** Diâmetro de cada tamanho, em cm. */
export const CUTTER_SIZES = { P: 2, M: 3, G: 4.2 } as const;
export type CutterSize = keyof typeof CUTTER_SIZES;

const N = 120;

function fit(pts: XZ[]): XZ[] {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [u, v] of pts) {
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  let r = 0;
  for (const [u, v] of pts) r = Math.max(r, Math.hypot(u - cu, v - cv));
  return pts.map(([u, v]) => [(u - cu) / r, (v - cv) / r]);
}

/** Contorno do cortador (sentido anti-horário), cabendo no círculo de raio 1. */
export function cutterOutline(shape: CutterShape): XZ[] {
  const pts: XZ[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    switch (shape) {
      case 'circulo':
        pts.push([Math.cos(t), Math.sin(t)]);
        break;
      case 'coracao': {
        // coração clássico, de ponta para baixo
        const u = 16 * Math.sin(t) ** 3;
        const v = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([u, v]);
        break;
      }
      case 'estrela': {
        // cinco pontas, um pouquinho arredondadas, com uma ponta para cima
        const k = (t * 5) / (Math.PI * 2);
        const f = Math.abs(((k % 1) + 1) % 1 - 0.5) * 2;
        const r = 0.46 + 0.54 * Math.pow(f, 1.6);
        const a = t + Math.PI / 2;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
        break;
      }
      case 'folha': {
        // folha de ponta fina dos dois lados, deitada em pé
        const u = 0.55 * Math.sin(t) * Math.pow(1 - Math.abs(Math.cos(t)), 0.45);
        pts.push([u, Math.cos(t)]);
        break;
      }
      case 'mariposa': {
        // quatro asas (as de cima maiores), cabeça em cima e cauda embaixo
        const a = t + Math.PI / 2;
        const s = Math.sin(a);
        const wing = Math.pow(Math.abs(Math.sin(2 * a)), 0.65);
        const r = (0.34 + 0.66 * wing) * (1 + 0.2 * s);
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
        break;
      }
      case 'flor': {
        const r = 0.62 + 0.38 * Math.pow(Math.abs(Math.cos(2.5 * t)), 0.7);
        const a = t + Math.PI / 2;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
        break;
      }
    }
  }
  const out = fit(pts);
  // garante sentido anti-horário
  let area = 0;
  for (let i = 0; i < out.length; i++) {
    const [a, b] = out[i];
    const [c, d] = out[(i + 1) % out.length];
    area += a * d - c * b;
  }
  return area < 0 ? out.reverse() : out;
}
