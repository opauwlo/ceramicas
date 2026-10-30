/*
 * Malha da massa: uma bola feita de triângulos quase iguais (icosfera),
 * com a lista de vizinhos de cada ponto para alisar e misturar cor.
 * Tudo em arrays simples, sem three.js, para dar para testar e rodar rápido.
 */

export type V3 = [number, number, number];

export interface Ball {
  /** x, y, z de cada ponto */
  pos: Float32Array;
  /** três pontos por triângulo, girando para fora */
  idx: Uint32Array;
  /** vizinhos do ponto i: nbr[off[i]] até nbr[off[i + 1] - 1] */
  off: Int32Array;
  nbr: Int32Array;
}

/** Bola de raio `r` com `level` divisões (5 dá uns 10 mil pontos). */
export function icosphere(level: number, r: number): Ball {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: number[] = [];
  const add = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z);
    verts.push(x / l, y / l, z / l);
    return verts.length / 3 - 1;
  };
  for (const [x, y, z] of [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ]) add(x, y, z);
  let faces: number[] = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  for (let l = 0; l < level; l++) {
    const mid = new Map<number, number>();
    const m = (a: number, b: number) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      let k = mid.get(key);
      if (k === undefined) {
        k = add(verts[a * 3] + verts[b * 3], verts[a * 3 + 1] + verts[b * 3 + 1], verts[a * 3 + 2] + verts[b * 3 + 2]);
        mid.set(key, k);
      }
      return k;
    };
    const next: number[] = [];
    for (let f = 0; f < faces.length; f += 3) {
      const [a, b, c] = [faces[f], faces[f + 1], faces[f + 2]];
      const ab = m(a, b);
      const bc = m(b, c);
      const ca = m(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
  }
  const pos = new Float32Array(verts.length);
  for (let i = 0; i < verts.length; i++) pos[i] = verts[i] * r;
  const idx = new Uint32Array(faces);
  const { off, nbr } = neighbors(pos.length / 3, idx);
  return { pos, idx, off, nbr };
}

/** Lista de vizinhos de cada ponto, compacta. */
export function neighbors(n: number, idx: Uint32Array): { off: Int32Array; nbr: Int32Array } {
  const sets: Array<Set<number>> = Array.from({ length: n }, () => new Set());
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f];
    const b = idx[f + 1];
    const c = idx[f + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  const off = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + sets[i].size;
  const nbr = new Int32Array(off[n]);
  for (let i = 0; i < n; i++) {
    let k = off[i];
    for (const j of sets[i]) nbr[k++] = j;
  }
  return { off, nbr };
}

/** Volume fechado, pelo teorema da divergência. */
export function volume(pos: Float32Array, idx: Uint32Array): number {
  let v = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3;
    const b = idx[f + 1] * 3;
    const c = idx[f + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    v += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** Área total da superfície. */
export function area(pos: Float32Array, idx: Uint32Array): number {
  let s = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3;
    const b = idx[f + 1] * 3;
    const c = idx[f + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return s / 2;
}

/** Normais suaves (média das faces, pesadas pela área) em `out`. Devolve o volume, de brinde. */
export function normals(pos: Float32Array, idx: Uint32Array, out: Float32Array): number {
  out.fill(0);
  let vol = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3;
    const b = idx[f + 1] * 3;
    const c = idx[f + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    // volume do tetraedro (origem, a, b, c) = a · (u × v) / 6
    vol += pos[a] * nx + pos[a + 1] * ny + pos[a + 2] * nz;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l;
    out[i + 1] /= l;
    out[i + 2] /= l;
  }
  return vol / 6;
}
