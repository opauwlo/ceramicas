import * as THREE from 'three';
import { defSurface } from '../model/spec';
import type { Piece, Surface } from '../model/types';

/*
 * Todas as geometrias nascem com a base em y = 0 e centradas em x/z.
 * Assim "assentar na mesa" e empilhar peças viram contas simples.
 * Unidade: 1 = 1 cm.
 */

export function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type WaveParams = Pick<Surface, 'amp' | 'qtd' | 'inicio' | 'cratera'>;

/** Altura do relevo do disco num raio r. Rt é o raio da parte plana do topo, Rf o raio total. */
export function waveH(r: number, Rt: number, Rf: number, s: WaveParams): number {
  let h = 0;
  const n = Math.round(s.qtd);
  if (s.amp > 0 && n > 0) {
    const r0 = s.inicio * Rt;
    const span = Math.max(0.05, Rt - r0);
    const wl = span / n;
    if (r > r0) {
      h +=
        s.amp *
        Math.exp((-0.9 * (r - r0)) / span) *
        Math.sin(((2 * Math.PI) / wl) * (r - r0)) *
        smoothstep(r0, r0 + wl * 0.5, r) *
        (1 - smoothstep(Rt - wl * 0.6, Rt, r));
    }
  }
  if (s.cratera > 0) {
    const w = 0.12 * Rf + 0.1;
    h -= s.cratera * Math.exp(-(r * r) / (w * w));
  }
  return h;
}

export function discParts(p: Record<string, number>) {
  const R = Math.max(0.05, p.raio);
  const T = Math.max(0.02, p.espessura);
  const c = Math.max(0.002, Math.min(R, T / 2) * 0.98 * p.borda);
  return { R, T, c, Rt: R - c };
}

/** Tamanho do quadrado de textura que cobre o disco (com folga para o contorno irregular). */
export const uvSize = (pc: Piece) => 2 * Math.max(0.05, pc.p.raio) * 1.08;

/** Altura do topo de um disco a uma distância r do centro. */
export function discTopAt(pc: Piece, r: number): number {
  const d = discParts(pc.p);
  return d.T + waveH(r, d.Rt, d.R, pc.s ?? defSurface());
}

function pillProfile(R: number, T: number, c: number, topFn: ((r: number) => number) | null, N: number): THREE.Vector2[] {
  const p = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    p.push(new THREE.Vector2(R - c + c * Math.cos(a), c + c * Math.sin(a)));
  }
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    p.push(new THREE.Vector2(R - c + c * Math.cos(a), T - c + c * Math.sin(a)));
  }
  const Rt = R - c;
  for (let i = 1; i <= N; i++) {
    const r = Math.max(0, Rt * (1 - i / N));
    p.push(new THREE.Vector2(r, T + (topFn ? topFn(r) : 0)));
  }
  return p;
}

/** Junta as normais da costura do torno para não aparecer uma linha. */
function fixSeamLathe(g: THREE.BufferGeometry, P: number, segs: number) {
  const n = g.attributes.normal as THREE.BufferAttribute;
  const base = segs * P;
  for (let j = 0; j < P; j++) {
    const a = j;
    const b = base + j;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  n.needsUpdate = true;
}

function fixSeamSphere(g: THREE.BufferGeometry, ws: number, hs: number) {
  const n = g.attributes.normal as THREE.BufferAttribute;
  const W = ws + 1;
  for (let iy = 0; iy <= hs; iy++) {
    const a = iy * W;
    const b = iy * W + ws;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  for (let ix = 0; ix <= ws; ix++) {
    n.setXYZ(ix, 0, 1, 0);
    n.setXYZ(hs * W + ix, 0, -1, 0);
  }
  n.needsUpdate = true;
}

/**
 * Peça de torno a partir de um perfil. `wob` deforma o contorno para parecer feito à mão;
 * `uvS` troca o UV por uma projeção de cima, usada pela pintura do disco.
 */
function lathe(prof: THREE.Vector2[], segs: number, wob: number, seed: number, uvS: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(prof, segs);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let z = pos.getZ(i);
    if (wob > 0) {
      const th = Math.atan2(z, x);
      const f = 1 + wob * (Math.sin(3 * th + seed) + 0.6 * Math.sin(5 * th + seed * 2) + 0.3 * Math.sin(9 * th + seed * 3));
      x *= f;
      z *= f;
      pos.setXYZ(i, x, pos.getY(i), z);
    }
    if (uvS) uv.setXY(i, x / uvS + 0.5, 0.5 - z / uvS);
  }
  g.computeVertexNormals();
  fixSeamLathe(g, prof.length, segs);
  return g;
}

const seedOf = (pc: Piece) => (pc.seed % 1000) / 100;

export function buildGeometry(pc: Piece): THREE.BufferGeometry {
  const p = pc.p;
  switch (pc.type) {
    case 'disco': {
      const s = pc.s ?? defSurface();
      const d = discParts(p);
      const wv = (s.amp > 0 && s.qtd > 0) || s.cratera > 0;
      const N = wv ? Math.min(240, Math.max(40, Math.ceil(d.Rt * 70))) : 1;
      const prof = pillProfile(d.R, d.T, d.c, wv ? r => waveH(r, d.Rt, d.R, s) : null, N);
      return lathe(prof, wv ? 180 : 128, p.irregular * 0.03, seedOf(pc), uvSize(pc));
    }
    case 'cilindro': {
      const R = Math.max(0.005, p.raio);
      const T = Math.max(0.01, p.altura);
      const c = Math.max(0.001, Math.min(R, T / 2) * 0.99 * p.arredondado);
      return lathe(pillProfile(R, T, c, null, 1), 64, p.irregular * 0.03, seedOf(pc), 0);
    }
    case 'esfera': {
      const R = Math.max(0.01, p.raio);
      const a = p.achatar;
      const ws = 64;
      const hs = 40;
      const g = new THREE.SphereGeometry(R, ws, hs);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const w = p.irregular * 0.05;
      const sd = seedOf(pc);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        let f = 1;
        if (w > 0) {
          const th = Math.atan2(z, x);
          const ph = Math.acos(Math.max(-1, Math.min(1, y / R)));
          f = 1 + w * Math.sin(ph) * (Math.sin(3 * th + sd) * Math.cos(2 * ph + sd * 0.5) + 0.5 * Math.sin(5 * th + 2 * sd));
        }
        pos.setXYZ(i, x * f, y * f * a, z * f);
      }
      g.computeVertexNormals();
      fixSeamSphere(g, ws, hs);
      g.translate(0, R * a, 0);
      return g;
    }
    case 'gota': {
      const R = Math.max(0.02, p.raio);
      const m = p.ponta * 2.4;
      const e = p.alongar;
      const N = 64;
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= N; i++) {
        const f = (i / N) * Math.PI;
        prof.push(new THREE.Vector2(Math.max(0, R * Math.sin(f) * Math.pow(Math.max(0, Math.cos(f / 2)), m)), R * (1 - Math.cos(f)) * e));
      }
      return lathe(prof, 64, 0, 0, 0);
    }
    case 'caixa': {
      const w = Math.max(0.02, p.largura);
      const h = Math.max(0.02, p.altura);
      const d = Math.max(0.02, p.profundidade);
      const r = Math.max(0.003, (Math.min(w, h, d) / 2) * 0.99 * p.canto);
      const sg = 18;
      const g = new THREE.BoxGeometry(w, h, d, sg, sg, sg);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      const hw = w / 2 - r;
      const hh = h / 2 - r;
      const hd = d / 2 - r;
      const v = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
        v.sub(c);
        const l = v.length();
        if (l < 1e-9) v.fromBufferAttribute(nor, i);
        else v.divideScalar(l);
        nor.setXYZ(i, v.x, v.y, v.z);
        pos.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
      }
      g.translate(0, h / 2, 0);
      return g;
    }
    case 'anel': {
      const tube = Math.max(0.005, p.tubo);
      const g = new THREE.TorusGeometry(Math.max(0.02, p.raio), tube, 24, 160, THREE.MathUtils.degToRad(Math.max(1, Math.min(360, p.arco))));
      g.rotateX(Math.PI / 2);
      g.translate(0, tube, 0);
      return g;
    }
    case 'cone': {
      const R = Math.max(0.003, p.raio);
      const H = Math.max(0.01, p.altura);
      // o ponto repetido separa as normais da base e da lateral, deixando a quina viva
      return lathe([new THREE.Vector2(0, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, 0), new THREE.Vector2(0, H)], 64, 0, 0, 0);
    }
  }
}

/** Chave que muda só quando a forma muda; evita refazer a geometria ao trocar cor ou posição. */
export function geometryKey(pc: Piece): string {
  const s = pc.s;
  return JSON.stringify([pc.type, pc.p, pc.seed, s ? [s.amp, s.qtd, s.inicio, s.cratera] : 0]);
}

/** Volume de uma malha fechada, pelo teorema da divergência. */
export function volumeOf(geo: THREE.BufferGeometry): number {
  const p = geo.attributes.position as THREE.BufferAttribute;
  const ix = geo.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  const tri = (i: number, j: number, k: number) => {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, j);
    c.fromBufferAttribute(p, k);
    v += a.dot(b.cross(c));
  };
  if (ix) for (let t = 0; t < ix.count; t += 3) tri(ix.getX(t), ix.getX(t + 1), ix.getX(t + 2));
  else for (let t = 0; t < p.count; t += 3) tri(t, t + 1, t + 2);
  return Math.abs(v) / 6;
}

/** Volume da peça em cm³, sem a escala. O anel aberto não é fechado, então usa a fórmula. */
export function pieceVolume(pc: Piece, geo: THREE.BufferGeometry): number {
  if (pc.type === 'anel') {
    const arc = Math.max(1, Math.min(360, pc.p.arco)) / 360;
    return 2 * Math.PI * Math.PI * pc.p.raio * pc.p.tubo * pc.p.tubo * arc;
  }
  return volumeOf(geo);
}
