import type { XZ } from './dough';

/*
 * Ímã: o dedo não é preciso, então cada ferramenta sugere o lugar "certo" mais perto
 * e mostra a sugestão antes de agir. Tudo nas medidas da massa (cm), na mesa (x, z).
 *  - ponto: gruda no centro da massa, senão na grade de 0,5 cm da base de corte;
 *  - linha reta: ângulo de 45 em 45 graus e passando pelo centro ou de 0,5 em 0,5 cm;
 *  - risco à mão: vira reta se quase reto, círculo em volta do centro se quase redondo,
 *    senão só fica mais suave.
 */

export const GRID = 0.5;
/** Até onde o centro da massa puxa (cm). */
export const CENTER_PULL = 0.6;
/** Até onde a grade puxa (cm). */
export const GRID_PULL = 0.2;

export type SnapKind = 'centro' | 'grade' | 'livre';

const hyp = (x: number, z: number) => Math.hypot(x, z);

export function snapPoint(p: XZ, center: XZ): { p: XZ; kind: SnapKind } {
  if (hyp(p[0] - center[0], p[1] - center[1]) < CENTER_PULL) return { p: [center[0], center[1]], kind: 'centro' };
  const gx = Math.round(p[0] / GRID) * GRID;
  const gz = Math.round(p[1] / GRID) * GRID;
  if (hyp(p[0] - gx, p[1] - gz) < GRID_PULL) return { p: [gx, gz], kind: 'grade' };
  return { p: [p[0], p[1]], kind: 'livre' };
}

/** Ângulo puxado para o múltiplo de 45° mais perto, se estiver a menos de `tol` radianos. */
export function snapAngle(a: number, tol = (12 * Math.PI) / 180): number {
  const step = Math.PI / 4;
  const s = Math.round(a / step) * step;
  return Math.abs(s - a) < tol ? s : a;
}

export interface SnapLine {
  /** um ponto da linha */
  o: XZ;
  /** direção (unitária) */
  u: XZ;
  kind: 'centro' | 'grade' | 'livre';
}

/** Linha de corte da espátula: endireita o ângulo e acerta a posição. */
export function snapLine(a: XZ, b: XZ, center: XZ): SnapLine {
  const ang = snapAngle(Math.atan2(b[1] - a[1], b[0] - a[0]));
  const u: XZ = [Math.cos(ang), Math.sin(ang)];
  const nrm: XZ = [-u[1], u[0]];
  const m: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // distância do centro da massa até a linha, com sinal
  const d = (m[0] - center[0]) * nrm[0] + (m[1] - center[1]) * nrm[1];
  let target = d;
  let kind: SnapLine['kind'] = 'livre';
  if (Math.abs(d) < 0.4) {
    target = 0;
    kind = 'centro';
  } else {
    const g = Math.round(d / GRID) * GRID;
    if (Math.abs(g - d) < 0.15) {
      target = g;
      kind = 'grade';
    }
  }
  const o: XZ = [center[0] + nrm[0] * target, center[1] + nrm[1] * target];
  return { o, u, kind };
}

/** Pontos a cada `step` cm ao longo do caminho. */
export function resample(pts: XZ[], step: number, closed = false): XZ[] {
  if (pts.length < 2) return pts.map(p => [p[0], p[1]] as XZ);
  const src = closed ? [...pts, pts[0]] : pts;
  const out: XZ[] = [[src[0][0], src[0][1]]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const [ax, az] = src[i - 1];
    const [bx, bz] = src[i];
    const L = hyp(bx - ax, bz - az);
    if (L < 1e-9) continue;
    let t = step - carry;
    while (t <= L) {
      out.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]);
      t += step;
    }
    carry = L - (t - step);
  }
  const last = src[src.length - 1];
  const tail = out[out.length - 1];
  if (!closed && hyp(last[0] - tail[0], last[1] - tail[1]) > step * 0.3) out.push([last[0], last[1]]);
  return out;
}

const length = (pts: XZ[]) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};

export interface SnapPath {
  kind: 'reta' | 'circulo' | 'livre';
  pts: XZ[];
  closed: boolean;
}

/** Risco à mão (esteca, sulco do boleador): vira a forma limpa mais perto. */
export function snapPath(raw: XZ[], center: XZ, step = 0.06): SnapPath {
  if (raw.length < 2) return { kind: 'livre', pts: raw.map(p => [p[0], p[1]] as XZ), closed: false };
  const L = length(raw);
  const a = raw[0];
  const b = raw[raw.length - 1];
  const chord = hyp(b[0] - a[0], b[1] - a[1]);

  // quase reto?
  if (chord > 0.2) {
    const ux = (b[0] - a[0]) / chord;
    const uz = (b[1] - a[1]) / chord;
    let dev = 0;
    for (const p of raw) dev = Math.max(dev, Math.abs((p[0] - a[0]) * -uz + (p[1] - a[1]) * ux));
    if (dev < Math.max(0.15, 0.12 * chord) && L < chord * 1.25) {
      const ang = snapAngle(Math.atan2(uz, ux), (10 * Math.PI) / 180);
      const m: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const h = chord / 2;
      const s: XZ = [m[0] - Math.cos(ang) * h, m[1] - Math.sin(ang) * h];
      const e: XZ = [m[0] + Math.cos(ang) * h, m[1] + Math.sin(ang) * h];
      return { kind: 'reta', pts: resample([s, e], step), closed: false };
    }
  }

  // quase uma volta em torno do centro da massa?
  const rs = raw.map(p => hyp(p[0] - center[0], p[1] - center[1]));
  const mean = rs.reduce((x, y) => x + y, 0) / rs.length;
  if (mean > 0.25) {
    const sd = Math.sqrt(rs.reduce((x, r) => x + (r - mean) ** 2, 0) / rs.length);
    let sweep = 0;
    for (let i = 1; i < raw.length; i++) {
      const a0 = Math.atan2(raw[i - 1][1] - center[1], raw[i - 1][0] - center[0]);
      const a1 = Math.atan2(raw[i][1] - center[1], raw[i][0] - center[0]);
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      sweep += d;
    }
    if (sd / mean < 0.16 && Math.abs(sweep) > (250 * Math.PI) / 180) {
      const r = Math.max(0.25, Math.round(mean / 0.25) * 0.25);
      const n = Math.max(24, Math.round((2 * Math.PI * r) / step));
      const pts: XZ[] = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        pts.push([center[0] + r * Math.cos(t), center[1] + r * Math.sin(t)]);
      }
      return { kind: 'circulo', pts, closed: true };
    }
  }

  // livre: tira a tremedeira do dedo
  const sm: XZ[] = raw.map((_, i) => {
    let x = 0;
    let z = 0;
    let k = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(raw.length - 1, i + 3); j++) {
      x += raw[j][0];
      z += raw[j][1];
      k++;
    }
    return [x / k, z / k];
  });
  sm[0] = [a[0], a[1]];
  sm[sm.length - 1] = [b[0], b[1]];
  return { kind: 'livre', pts: resample(sm, step), closed: false };
}
