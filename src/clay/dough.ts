import { area, icosphere, normals, volume, type Ball, type V3 } from './mesh';

/*
 * A massa. Guarda duas formas:
 *  - `rest`: a forma de verdade, que o dedo modela e que fica (massa é plástica);
 *  - `pos`: a forma que aparece, presa à `rest` por molinhas, para a massa tremer e assentar.
 * Toda mexida conserva o volume: o que afunda num lugar estufa em volta e, no fim, uma
 * pressãozinha uniforme acerta a conta, como massa de verdade.
 * A cor também: cada ponto guarda quanto pigmento tem (`ink`, em absorbância), e sovar só
 * passa pigmento de um ponto para outro. Pouca tinta concentrada tinge bastante massa, como guache.
 * Ferramentas que tiram massa (espátula, cortador, lixa) baixam o `vol0`: o que saiu vira sobra.
 * Medidas em cm. A mesa é o plano y = 0 e a massa não atravessa ela.
 */

export type RGB = [number, number, number];

/** Quanto mais forte que a cor da paleta um pingo chega na massa (tinta concentrada). */
const DROP_STRENGTH = 2.6;
/** Absorbância máxima guardada (dá preto quase total). */
export const INK_MAX = 8;

/** Absorbância de uma cor (0–1 por canal): quanto pigmento ela representa. */
export const inkOf = (v: number) => Math.min(INK_MAX, -Math.log(Math.max(0.0004, Math.min(1, v))));

/** Massa de porcelana fria crua, branquinha puxada para o creme. */
export const BASE_COLOR: RGB = [0.95, 0.93, 0.89];

/** Molinha que puxa o desenho para a forma: frequência (rad/s) e amortecimento. */
const OMEGA = 17;
const ZETA = 0.55;

const smooth1 = (t: number) => {
  const u = 1 - t * t;
  return u * u;
};

/** Ponto 2D (x, z) da mesa. */
export type XZ = [number, number];

/** Instantâneo para desfazer e guardar. */
export interface DoughShot {
  rest: Float32Array;
  ink: Float32Array;
  varnish: Float32Array;
}

/** Ponto mais perto de um polígono fechado (contorno do cortador). */
export function nearestOnPoly(poly: XZ[], x: number, z: number): XZ {
  let bx = poly[0][0];
  let bz = poly[0][1];
  let bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [cx, cz] = poly[(i + 1) % poly.length];
    const ex = cx - ax;
    const ez = cz - az;
    const l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const px = ax + ex * t;
    const pz = az + ez * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) {
      bd = d;
      bx = px;
      bz = pz;
    }
  }
  return [bx, bz];
}

/** Se o ponto está dentro do polígono (regra par-ímpar). */
export function insidePoly(poly: XZ[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class Dough {
  readonly n: number;
  readonly radius: number;
  readonly level: number;
  readonly idx: Uint32Array;
  readonly off: Int32Array;
  readonly nbr: Int32Array;
  rest: Float32Array;
  pos: Float32Array;
  vel: Float32Array;
  /** cor que aparece (0–1, linear), tirada do pigmento */
  col: Float32Array;
  /** pigmento de cada ponto, em absorbância por canal */
  ink: Float32Array;
  /** verniz de cada ponto, de 0 (cru) a 1 (envernizado) */
  varnish: Float32Array;
  /** água na superfície (pincel molhado, esponja): escurece e brilha, e seca sozinha */
  wet: Float32Array;
  /** brilho que a luz usa: o maior entre verniz e molhado */
  gloss: Float32Array;
  /** normais da forma de verdade, para os pincéis */
  rn: Float32Array;
  /** normais do desenho, para a luz */
  pn: Float32Array;
  /** volume que a massa tem que ter, em cm³ */
  vol0: number;
  private scratch: Float32Array;
  /** área por ponto, guardada; muda pouco e é refeita a cada gesto */
  private cell = 0;
  private hits: Int32Array;
  private wts: Float32Array;
  private relaxBuf: Float32Array;

  constructor(radius = 1.6, level = 5, color: RGB = BASE_COLOR) {
    const ball: Ball = icosphere(level, radius);
    this.radius = radius;
    this.level = level;
    this.n = ball.pos.length / 3;
    this.idx = ball.idx;
    this.off = ball.off;
    this.nbr = ball.nbr;
    this.rest = ball.pos;
    // massa largada na mesa: um pouco achatada, apoiada em y = 0
    for (let i = 0; i < this.n; i++) {
      this.rest[i * 3] *= 1.08;
      this.rest[i * 3 + 1] = this.rest[i * 3 + 1] * 0.86 + radius * 0.86;
      this.rest[i * 3 + 2] *= 1.08;
    }
    this.pos = this.rest.slice();
    this.vel = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    this.ink = new Float32Array(this.n * 3);
    this.varnish = new Float32Array(this.n);
    this.wet = new Float32Array(this.n);
    this.gloss = new Float32Array(this.n);
    const base = color.map(inkOf);
    for (let i = 0; i < this.n; i++) this.ink.set(base, i * 3);
    this.paint();
    this.rn = new Float32Array(this.n * 3);
    this.pn = new Float32Array(this.n * 3);
    this.scratch = new Float32Array(this.n * 6);
    this.hits = new Int32Array(this.n);
    this.wts = new Float32Array(this.n);
    this.relaxBuf = new Float32Array(this.n * 4);
    this.flattenOnTable();
    this.vol0 = volume(this.rest, this.idx);
    normals(this.rest, this.idx, this.rn);
    normals(this.pos, this.idx, this.pn);
  }

  /** Volume da forma de verdade agora. */
  volume(): number {
    return volume(this.rest, this.idx);
  }

  /** Área média por ponto, para converter volume em espessura. Refaz no começo de cada gesto. */
  measure(): void {
    this.cell = area(this.rest, this.idx) / this.n;
  }

  /** Pontos da forma de verdade a menos de `r` de `c`, com o peso suave de cada um. Devolve quantos. */
  private gather(c: V3, r: number, shape: (t: number) => number = smooth1): number {
    const p = this.rest;
    const r2 = r * r;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const dx = p[i * 3] - c[0];
      const dy = p[i * 3 + 1] - c[1];
      const dz = p[i * 3 + 2] - c[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      this.hits[k] = i;
      this.wts[k] = shape(Math.sqrt(d2) / r);
      k++;
    }
    return k;
  }

  /** Pontos a menos de `r` do segmento a–b (a ferramenta passou por ali), com peso pela distância. */
  private gatherSeg(a: V3, b: V3, r: number, shape: (t: number) => number = smooth1): number {
    const p = this.rest;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const ez = b[2] - a[2];
    const l2 = ex * ex + ey * ey + ez * ez;
    const r2 = r * r;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const px = p[i * 3] - a[0];
      const py = p[i * 3 + 1] - a[1];
      const pz = p[i * 3 + 2] - a[2];
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / l2)) : 0;
      const dx = px - ex * t;
      const dy = py - ey * t;
      const dz = pz - ez * t;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      this.hits[k] = i;
      this.wts[k] = shape(Math.sqrt(d2) / r);
      k++;
    }
    return k;
  }

  /**
   * Altura média da superfície em volta (anel de r0 a r1 do segmento), medida ao longo de `n`
   * a partir de `c`. Serve de "nível da massa" para as ferramentas não afundarem sem parar.
   */
  levelAt(a: V3, b: V3, n: V3, r0: number, r1: number): number {
    const k = this.gatherSeg(a, b, r1, t => (t * r1 >= r0 ? 1 : 0));
    const p = this.rest;
    let s = 0;
    let m = 0;
    for (let j = 0; j < k; j++) {
      if (!this.wts[j]) continue;
      const i = this.hits[j] * 3;
      // só a mesma face da massa: numa placa fina, o lado de baixo também fica perto
      if (this.rn[i] * n[0] + this.rn[i + 1] * n[1] + this.rn[i + 2] * n[2] < 0.5) continue;
      s += (p[i] - b[0]) * n[0] + (p[i + 1] - b[1]) * n[1] + (p[i + 2] - b[2]) * n[2];
      m++;
    }
    return m ? s / m : 0;
  }

  /** Põe `vol` cm³ de massa num anel de r0 a r1 em volta do segmento a–b (a borda que sobe). */
  bulge(a: V3, b: V3, r0: number, r1: number, vol: number): void {
    if (vol <= 0) return;
    if (!this.cell) this.measure();
    const span = Math.max(1e-4, r1 - r0);
    const k = this.gatherSeg(a, b, r1, t => {
      const d = t * r1;
      return d < r0 ? 0 : Math.sin((Math.PI * (d - r0)) / span);
    });
    let s = 0;
    for (let j = 0; j < k; j++) s += this.wts[j];
    if (s <= 0) return;
    const h = vol / (s * this.cell);
    const p = this.rest;
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const d = h * this.wts[j];
      p[i] += this.rn[i] * d;
      p[i + 1] += this.rn[i + 1] * d;
      p[i + 2] += this.rn[i + 2] * d;
    }
  }

  /**
   * Esteca: risca um vinco em V ao longo de a–b, com profundidade `depth` abaixo do nível da massa.
   * Não afunda mais se passar de novo no mesmo lugar com a mesma força. Devolve a massa empurrada.
   */
  crease(a: V3, b: V3, n: V3, r: number, depth: number): number {
    if (!this.cell) this.measure();
    const lv = this.levelAt(a, b, n, 2 * r, 3 * r);
    const k = this.gatherSeg(a, b, r, t => 1 - t);
    const p = this.rest;
    let moved = 0;
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const h = (p[i] - b[0]) * n[0] + (p[i + 1] - b[1]) * n[1] + (p[i + 2] - b[2]) * n[2] - lv;
      const target = -depth * this.wts[j] ** 1.3;
      if (h <= target) continue;
      const d = h - target;
      p[i] -= n[0] * d;
      p[i + 1] -= n[1] * d;
      p[i + 2] -= n[2] * d;
      moved += d;
    }
    const vol = moved * this.cell;
    // metade sobe nas beiradas do risco, o resto se espalha
    this.bulge(a, b, r, 1.9 * r, vol * 0.5);
    return vol;
  }

  /**
   * Boleador: a bolinha de raio `B` afundada `depth` na massa, passando de a até b.
   * Tudo que estiver dentro da bolinha vai para a borda dela: buraquinho redondo ou sulco liso.
   */
  ball(a: V3, b: V3, n: V3, B: number, depth: number): number {
    if (!this.cell) this.measure();
    const lv = this.levelAt(a, b, n, 1.6 * B, 2.4 * B);
    const off = lv + B - depth;
    const ca: V3 = [a[0] + n[0] * off, a[1] + n[1] * off, a[2] + n[2] * off];
    const cb: V3 = [b[0] + n[0] * off, b[1] + n[1] * off, b[2] + n[2] * off];
    const k = this.gatherSeg(ca, cb, B, () => 1);
    const p = this.rest;
    const ex = cb[0] - ca[0];
    const ey = cb[1] - ca[1];
    const ez = cb[2] - ca[2];
    const l2 = ex * ex + ey * ey + ez * ez;
    let moved = 0;
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const px = p[i] - ca[0];
      const py = p[i + 1] - ca[1];
      const pz = p[i + 2] - ca[2];
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / l2)) : 0;
      let dx = px - ex * t;
      let dy = py - ey * t;
      let dz = pz - ez * t;
      let d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) {
        dx = -n[0];
        dy = -n[1];
        dz = -n[2];
        d = 1e-6;
      }
      const push = B - d;
      if (push <= 0) continue;
      p[i] += (dx / d) * push;
      p[i + 1] += (dy / d) * push;
      p[i + 2] += (dz / d) * push;
      moved += push;
    }
    const vol = moved * this.cell * 0.5;
    const rc = Math.sqrt(Math.max(0, B * B - (B - depth) ** 2));
    this.bulge(a, b, rc, rc + 1.4 * B, vol * 0.6);
    return vol;
  }

  /**
   * Rolo: passa por cima da massa na direção `dir` (x, z, unitário) e deixa ela com altura `H`.
   * Achata em y e espicha na direção do rolo na mesma conta (o volume fica igual), assenta o topo
   * e a base retos e acerta o volume abrindo a massa para os lados.
   */
  roll(dir: XZ, H: number): boolean {
    const p = this.rest;
    let top = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < this.n; i++) {
      top = Math.max(top, p[i * 3 + 1]);
      cx += p[i * 3];
      cz += p[i * 3 + 2];
    }
    cx /= this.n;
    cz /= this.n;
    if (H >= top - 1e-4) return false;
    const s = H / top;
    const [ux, uz] = dir;
    // a massa espicha mais para onde o rolo vai, mas também abre um pouco para os lados
    const ga = Math.pow(s, -0.6) - 1;
    const gp = Math.pow(s, -0.4) - 1;
    for (let i = 0; i < this.n; i++) {
      const x = p[i * 3] - cx;
      const z = p[i * 3 + 2] - cz;
      const along = x * ux + z * uz;
      const perp = -x * uz + z * ux;
      p[i * 3] += ux * along * ga - uz * perp * gp;
      p[i * 3 + 2] += uz * along * ga + ux * perp * gp;
      p[i * 3 + 1] *= s;
    }
    normals(p, this.idx, this.rn);
    // o rolo deixa o topo reto e a mesa deixa a base reta
    const f = Math.min(0.6, (1 - s) * 6);
    for (let i = 0; i < this.n; i++) {
      const ny = this.rn[i * 3 + 1];
      if (ny > 0.35) p[i * 3 + 1] += (H - p[i * 3 + 1]) * f * ((ny - 0.35) / 0.65);
      else if (ny < -0.35) p[i * 3 + 1] -= p[i * 3 + 1] * f * ((-ny - 0.35) / 0.65);
    }
    // o que sobrou ou faltou vai para os lados, abrindo a massa por igual
    const v = volume(p, this.idx);
    const g = Math.sqrt(this.vol0 / v);
    for (let i = 0; i < this.n; i++) {
      p[i * 3] = cx + (p[i * 3] - cx) * g;
      p[i * 3 + 2] = cz + (p[i * 3 + 2] - cz) * g;
    }
    this.flattenOnTable();
    normals(p, this.idx, this.rn);
    return true;
  }

  /**
   * Arruma a malha por dentro: espalha os pontos por igual sobre a superfície, sem mudar a forma.
   * Quando um ponto anda, ele pega a cor e o verniz que estavam no lugar novo (lendo dos vizinhos
   * na direção em que andou), então a pintura fica onde estava. Usado enquanto o rolo estica a massa.
   */
  relax(t = 0.5): void {
    const p = this.rest;
    const rn = this.rn;
    const d = this.scratch;
    const dc = this.relaxBuf;
    for (let i = 0; i < this.n; i++) {
      let x = 0, y = 0, z = 0;
      const a = this.off[i];
      const b = this.off[i + 1];
      for (let q = a; q < b; q++) {
        const v = this.nbr[q] * 3;
        x += p[v]; y += p[v + 1]; z += p[v + 2];
      }
      const m = b - a;
      const i3 = i * 3;
      let dx = x / m - p[i3];
      let dy = y / m - p[i3 + 1];
      let dz = z / m - p[i3 + 2];
      const dn = dx * rn[i3] + dy * rn[i3 + 1] + dz * rn[i3 + 2];
      dx = (dx - rn[i3] * dn) * t;
      dy = (dy - rn[i3 + 1] * dn) * t;
      dz = (dz - rn[i3 + 2] * dn) * t;
      d[i3] = dx;
      d[i3 + 1] = dy;
      d[i3 + 2] = dz;
      // cor no lugar novo: interpola com os vizinhos que ficam para o lado em que o ponto anda
      let ws = 0, cr = 0, cg = 0, cb = 0, cv = 0;
      for (let q = a; q < b; q++) {
        const j = this.nbr[q];
        const j3 = j * 3;
        const ex = p[j3] - p[i3];
        const ey = p[j3 + 1] - p[i3 + 1];
        const ez = p[j3 + 2] - p[i3 + 2];
        const pr = dx * ex + dy * ey + dz * ez;
        if (pr <= 0) continue;
        const f = Math.min(1, pr / (ex * ex + ey * ey + ez * ez || 1));
        ws += pr;
        cr += pr * f * (this.ink[j3] - this.ink[i3]);
        cg += pr * f * (this.ink[j3 + 1] - this.ink[i3 + 1]);
        cb += pr * f * (this.ink[j3 + 2] - this.ink[i3 + 2]);
        cv += pr * f * (this.varnish[j] - this.varnish[i]);
      }
      const i4 = i * 4;
      if (ws > 0) {
        dc[i4] = cr / ws;
        dc[i4 + 1] = cg / ws;
        dc[i4 + 2] = cb / ws;
        dc[i4 + 3] = cv / ws;
      } else dc[i4] = dc[i4 + 1] = dc[i4 + 2] = dc[i4 + 3] = 0;
    }
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      p[i3] += d[i3];
      p[i3 + 1] += d[i3 + 1];
      p[i3 + 2] += d[i3 + 2];
      this.ink[i3] += dc[i4];
      this.ink[i3 + 1] += dc[i4 + 1];
      this.ink[i3 + 2] += dc[i4 + 2];
      this.varnish[i] += dc[i4 + 3];
    }
    this.flattenOnTable();
  }

  /**
   * Espátula: corta reto, em pé, pelo plano que passa em `o` com normal `nx, nz` (deitada na mesa).
   * Fica o lado maior; o outro vira sobra. Devolve o volume tirado.
   */
  cutPlane(o: XZ, nrm: XZ): number {
    const p = this.rest;
    const sideOf = (i: number) => (p[i * 3] - o[0]) * nrm[0] + (p[i * 3 + 2] - o[1]) * nrm[1];
    const tryKeep = (sign: number) => {
      const q = p.slice();
      for (let i = 0; i < this.n; i++) {
        const d = sideOf(i) * sign;
        if (d >= 0) continue;
        q[i * 3] -= nrm[0] * d * sign;
        q[i * 3 + 2] -= nrm[1] * d * sign;
      }
      return { q, v: volume(q, this.idx) };
    };
    const a = tryKeep(1);
    const b = tryKeep(-1);
    const keep = a.v >= b.v ? a : b;
    const removed = this.vol0 - keep.v;
    if (removed < this.vol0 * 0.002) return 0;
    p.set(keep.q);
    this.vol0 = keep.v;
    this.measure();
    normals(p, this.idx, this.rn);
    return removed;
  }

  /**
   * Cortador: tudo que está fora do contorno `poly` (pontos x, z na mesa, em volta de `center`) sai.
   * A massa de fora é empurrada para o contorno em linha reta até o centro do cortador, então cada
   * pedaço de fora vira a parede em pé daquele ponto do contorno, inclusive nas reentrâncias
   * (entre as pontas da estrela). Os contornos são todos "estrelados" em volta do centro.
   * Devolve o volume tirado.
   */
  cutShape(poly: XZ[], center: XZ): number {
    const [cx, cz] = center;
    // raio do contorno em cada direção, em 720 fatias
    const BINS = 720;
    const rad = new Float32Array(BINS);
    for (let k = 0; k < BINS; k++) {
      const a = (k / BINS) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let best = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i];
        const [bx, bz] = poly[(i + 1) % poly.length];
        // raio a partir do centro × segmento do contorno
        const ex = bx - ax;
        const ez = bz - az;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-12) continue;
        const ox = ax - cx;
        const oz = az - cz;
        const t = (ox * ez - oz * ex) / den;
        const u = (ox * dz - oz * dx) / den;
        if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
      }
      rad[k] = Number.isFinite(best) ? best : 0;
    }
    const p = this.rest;
    let changed = false;
    for (let i = 0; i < this.n; i++) {
      const x = p[i * 3] - cx;
      const z = p[i * 3 + 2] - cz;
      const r = Math.hypot(x, z);
      if (r < 1e-6) continue;
      let a = Math.atan2(z, x);
      if (a < 0) a += Math.PI * 2;
      const f = (a / (Math.PI * 2)) * BINS;
      const k0 = Math.floor(f) % BINS;
      const k1 = (k0 + 1) % BINS;
      const w = f - Math.floor(f);
      const rb = rad[k0] * (1 - w) + rad[k1] * w;
      if (r <= rb) continue;
      p[i * 3] = cx + (x / r) * rb;
      p[i * 3 + 2] = cz + (z / r) * rb;
      changed = true;
    }
    if (!changed) return 0;
    const v = volume(p, this.idx);
    const removed = this.vol0 - v;
    this.vol0 = v;
    this.measure();
    normals(p, this.idx, this.rn);
    return Math.max(0, removed);
  }

  /**
   * Lixa: só tira dos altinhos (nunca empurra para fora), então a massa vai perdendo um pouquinho
   * de pó e o verniz sai junto. Devolve o volume tirado.
   */
  sand(c: V3, r: number, s: number): number {
    if (!this.cell) this.measure();
    const p = this.rest;
    const k = this.gather(c, r);
    const tmp = this.scratch;
    for (let j = 0; j < k; j++) {
      const i = this.hits[j];
      let x = 0, y = 0, z = 0;
      for (let q = this.off[i]; q < this.off[i + 1]; q++) {
        const v = this.nbr[q] * 3;
        x += p[v]; y += p[v + 1]; z += p[v + 2];
      }
      const m = this.off[i + 1] - this.off[i];
      const i3 = i * 3;
      // quanto a média dos vizinhos fica para dentro (negativo) ao longo da normal
      tmp[j] = (x / m - p[i3]) * this.rn[i3] + (y / m - p[i3 + 1]) * this.rn[i3 + 1] + (z / m - p[i3 + 2]) * this.rn[i3 + 2];
    }
    let moved = 0;
    for (let j = 0; j < k; j++) {
      const d = tmp[j];
      const i = this.hits[j];
      this.varnish[i] *= 1 - 0.35 * this.wts[j];
      if (d >= 0) continue;
      const i3 = i * 3;
      const m = d * this.wts[j] * s;
      p[i3] += this.rn[i3] * m;
      p[i3 + 1] += this.rn[i3 + 1] * m;
      p[i3 + 2] += this.rn[i3 + 2] * m;
      moved -= m;
    }
    const vol = moved * this.cell;
    this.vol0 = Math.max(0.01, this.vol0 - vol);
    return vol;
  }

  /** Pincel de tinta: pinta por cima, ao longo de a–b, sem misturar com a massa. */
  paintSeg(a: V3, b: V3, r: number, color: RGB, strength = 0.55): void {
    const target = color.map(inkOf);
    const k = this.gatherSeg(a, b, r, t => Math.min(1, smooth1(t) * 1.8));
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const w = this.wts[j] * strength;
      for (let ch = 0; ch < 3; ch++) this.ink[i + ch] += (target[ch] - this.ink[i + ch]) * w;
    }
  }

  /** Pincel de verniz: `on` passa verniz (brilho), senão tira (fosco). */
  varnishSeg(a: V3, b: V3, r: number, on: boolean, strength = 0.5): void {
    const k = this.gatherSeg(a, b, r, t => Math.min(1, smooth1(t) * 1.6));
    const to = on ? 1 : 0;
    for (let j = 0; j < k; j++) {
      const i = this.hits[j];
      this.varnish[i] += (to - this.varnish[i]) * this.wts[j] * strength;
    }
  }

  /** Molha a superfície por onde passou (pincel d'água, esponja). */
  wetSeg(a: V3, b: V3, r: number, amount = 0.5): void {
    const k = this.gatherSeg(a, b, r);
    for (let j = 0; j < k; j++) {
      const i = this.hits[j];
      this.wet[i] = Math.min(1, this.wet[i] + this.wts[j] * amount);
    }
  }

  /** A água seca aos poucos. Devolve se ainda tem parte molhada. */
  dry(dt: number): boolean {
    const f = Math.exp(-dt / 5);
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.wet[i] < 0.004) {
        this.wet[i] = 0;
        continue;
      }
      this.wet[i] *= f;
      any = true;
    }
    return any;
  }

  /** Altura do topo e raio da massa na mesa, para enquadrar a câmera e pôr o rolo. */
  extent(): { top: number; radius: number; cx: number; cz: number } {
    const p = this.rest;
    let top = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < this.n; i++) {
      top = Math.max(top, p[i * 3 + 1]);
      cx += p[i * 3];
      cz += p[i * 3 + 2];
    }
    cx /= this.n;
    cz /= this.n;
    let r = 0;
    for (let i = 0; i < this.n; i++) r = Math.max(r, Math.hypot(p[i * 3] - cx, p[i * 3 + 2] - cz));
    return { top, radius: r, cx, cz };
  }

  /**
   * Afunda a massa com a ponta do dedo: o centro desce `depth` na direção contrária a `n`
   * e o que saiu dali estufa num anel em volta (`rim` é quanto do volume vai para a borda).
   */
  dent(c: V3, n: V3, r: number, depth: number, rim = 0.65): void {
    if (depth <= 0) return;
    const p = this.rest;
    const k = this.gather(c, r);
    let w = 0;
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const d = depth * this.wts[j];
      p[i] -= n[0] * d;
      p[i + 1] -= n[1] * d;
      p[i + 2] -= n[2] * d;
      w += this.wts[j];
    }
    if (rim <= 0 || w === 0) return;
    // anel de r até 2r: a massa empurrada sobe em volta do dedo
    const lost = depth * w;
    const R = 2 * r;
    const k2 = this.gather(c, R, t => {
      if (t * R < r) return 0;
      return Math.sin((Math.PI * (t * R - r)) / r);
    });
    let s = 0;
    for (let j = 0; j < k2; j++) s += this.wts[j];
    if (s <= 0) return;
    const h = (rim * lost) / s;
    for (let j = 0; j < k2; j++) {
      const i = this.hits[j] * 3;
      const d = h * this.wts[j];
      p[i] += this.rn[i] * d;
      p[i + 1] += this.rn[i + 1] * d;
      p[i + 2] += this.rn[i + 2] * d;
    }
  }

  /** Arrasta a massa junto com o dedo: os pontos perto andam um pouco do `move` (rente à superfície). */
  smear(c: V3, r: number, move: V3): void {
    const p = this.rest;
    // a massa resiste: anda menos que o dedo e nunca dá um salto grande de uma vez
    const ml = Math.hypot(move[0], move[1], move[2]);
    const f = (ml > 0.3 * r ? (0.3 * r) / ml : 1) * 0.4;
    const k = this.gather(c, r);
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const w = this.wts[j] * f;
      p[i] += move[0] * w;
      p[i + 1] += move[1] * w;
      p[i + 2] += move[2] * w;
    }
  }

  /**
   * Sova a cor: cada ponto troca cor com o vizinho que fica "rio abaixo" do dedo.
   * A troca é de igual para igual, então a tinta não some nem aparece: só vai virando
   * rastro e, com mais sova, mármore e depois uma cor só.
   */
  stir(c: V3, r: number, move: V3): void {
    const ml = Math.hypot(move[0], move[1], move[2]);
    if (ml < 1e-5) return;
    const ux = move[0] / ml, uy = move[1] / ml, uz = move[2] / ml;
    const p = this.rest;
    const ink = this.ink;
    if (!this.cell) this.measure();
    const edge = Math.sqrt(this.cell * 2.3);
    const a = Math.min(1, ml / edge) * 0.5;
    const k = this.gather(c, r);
    for (let j = 0; j < k; j++) {
      const i = this.hits[j];
      let best = -1;
      let bd = 0;
      for (let q = this.off[i]; q < this.off[i + 1]; q++) {
        const v = this.nbr[q];
        const d = (p[v * 3] - p[i * 3]) * ux + (p[v * 3 + 1] - p[i * 3 + 1]) * uy + (p[v * 3 + 2] - p[i * 3 + 2]) * uz;
        if (d > bd) {
          bd = d;
          best = v;
        }
      }
      if (best < 0) continue;
      const t = a * this.wts[j];
      for (let ch = 0; ch < 3; ch++) {
        const x = i * 3 + ch;
        const y = best * 3 + ch;
        const d = (ink[x] - ink[y]) * t;
        ink[x] -= d;
        ink[y] += d;
      }
    }
  }

  /**
   * Belisca: puxa a massa para fora numa ponta, juntando a massa em volta (orelha, antena, bico).
   */
  pinch(c: V3, n: V3, r: number, amount: number): void {
    if (amount <= 0) return;
    const p = this.rest;
    const k = this.gather(c, r, t => smooth1(t) ** 1.5);
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const w = this.wts[j];
      // sobe para fora e aperta em direção ao centro do beliscão
      p[i] += n[0] * amount * w + (c[0] - p[i]) * 0.12 * w * Math.min(1, amount * 4);
      p[i + 1] += n[1] * amount * w + (c[1] - p[i + 1]) * 0.12 * w * Math.min(1, amount * 4);
      p[i + 2] += n[2] * amount * w + (c[2] - p[i + 2]) * 0.12 * w * Math.min(1, amount * 4);
    }
  }

  /** Alisa (esfregar): cada ponto vai para a média dos vizinhos; a cor também se mistura um pouco. */
  smooth(c: V3, r: number, s: number, colorMix = 0.25): void {
    const p = this.rest;
    const k = this.gather(c, r);
    const tmp = this.scratch;
    for (let j = 0; j < k; j++) {
      const i = this.hits[j];
      let x = 0, y = 0, z = 0, cr = 0, cg = 0, cb = 0;
      const a = this.off[i];
      const b = this.off[i + 1];
      for (let q = a; q < b; q++) {
        const v = this.nbr[q] * 3;
        x += p[v]; y += p[v + 1]; z += p[v + 2];
        cr += this.ink[v]; cg += this.ink[v + 1]; cb += this.ink[v + 2];
      }
      const m = b - a;
      tmp[j * 6] = x / m; tmp[j * 6 + 1] = y / m; tmp[j * 6 + 2] = z / m;
      tmp[j * 6 + 3] = cr / m; tmp[j * 6 + 4] = cg / m; tmp[j * 6 + 5] = cb / m;
    }
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const w = this.wts[j] * s;
      p[i] += (tmp[j * 6] - p[i]) * w;
      p[i + 1] += (tmp[j * 6 + 1] - p[i + 1]) * w;
      p[i + 2] += (tmp[j * 6 + 2] - p[i + 2]) * w;
      const cw = w * colorMix;
      this.ink[i] += (tmp[j * 6 + 3] - this.ink[i]) * cw;
      this.ink[i + 1] += (tmp[j * 6 + 4] - this.ink[i + 1]) * cw;
      this.ink[i + 2] += (tmp[j * 6 + 5] - this.ink[i + 2]) * cw;
    }
  }

  /** O dedo encostou com força: a massa em volta treme na hora, antes de assentar. */
  poke(c: V3, n: V3, r: number, strength: number): void {
    const p = this.pos;
    const R = 2.2 * r;
    const R2 = R * R;
    for (let i = 0; i < this.n; i++) {
      const dx = p[i * 3] - c[0];
      const dy = p[i * 3 + 1] - c[1];
      const dz = p[i * 3 + 2] - c[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R2) continue;
      const w = smooth1(Math.sqrt(d2) / R) * strength;
      this.vel[i * 3] -= n[0] * w;
      this.vel[i * 3 + 1] -= n[1] * w;
      this.vel[i * 3 + 2] -= n[2] * w;
    }
  }

  /** Pingo de tinta: uma mancha redonda de cor onde caiu. */
  drop(c: V3, r: number, color: RGB): void {
    // tinta de verdade é concentrada: o pingo traz mais pigmento que a cor que ele mostra
    const a = color.map(v => Math.min(INK_MAX, inkOf(v) * DROP_STRENGTH));
    const k = this.gather(c, r, t => Math.min(1, smooth1(t) * 2));
    for (let j = 0; j < k; j++) {
      const i = this.hits[j] * 3;
      const w = this.wts[j];
      for (let ch = 0; ch < 3; ch++) this.ink[i + ch] += (a[ch] - this.ink[i + ch]) * w;
    }
  }

  /** Atualiza a cor e o brilho que aparecem: pigmento, água (escurece) e verniz. */
  paint(): void {
    const ink = this.ink;
    const col = this.col;
    for (let i = 0; i < this.n; i++) {
      const w = this.wet[i];
      const dark = 1 - 0.16 * w;
      col[i * 3] = Math.exp(-ink[i * 3]) * dark;
      col[i * 3 + 1] = Math.exp(-ink[i * 3 + 1]) * dark;
      col[i * 3 + 2] = Math.exp(-ink[i * 3 + 2]) * dark;
      this.gloss[i] = Math.max(this.varnish[i], 0.7 * w);
    }
  }

  /** A mesa empurra de volta: nada fica abaixo de y = 0. */
  flattenOnTable(): void {
    const p = this.rest;
    for (let i = 1; i < p.length; i += 3) if (p[i] < 0) p[i] = 0;
  }

  /**
   * Depois de mexer: acerta o volume com uma pressãozinha igual em toda a superfície,
   * deixa a massa apoiada na mesa e recalcula as normais.
   */
  settle(passes = 1): void {
    const p = this.rest;
    if (!this.cell) this.measure();
    for (let it = 0; it < passes; it++) {
      // uma passada só já chega perto; como roda a cada quadro, a conta fecha em seguida
      const v = normals(p, this.idx, this.rn);
      if (Math.abs(this.vol0 - v) / this.vol0 < 1e-4) break;
      const h = (this.vol0 - v) / (this.cell * this.n);
      for (let i = 0; i < p.length; i += 3) {
        p[i] += this.rn[i] * h;
        p[i + 1] += this.rn[i + 1] * h;
        p[i + 2] += this.rn[i + 2] * h;
      }
      this.flattenOnTable();
    }
    // apoiada: se subiu, desce até encostar
    let minY = Infinity;
    for (let i = 1; i < p.length; i += 3) minY = Math.min(minY, p[i]);
    if (minY > 1e-4) for (let i = 1; i < p.length; i += 3) p[i] -= minY;
    normals(p, this.idx, this.rn);
  }

  /** Dá um susto na massa: desenho achatado que volta balançando (cair na mesa, por exemplo). */
  squash(sy: number): void {
    const sx = 1 / Math.sqrt(sy);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = this.rest[i * 3] * sx;
      this.pos[i * 3 + 1] = this.rest[i * 3 + 1] * sy;
      this.pos[i * 3 + 2] = this.rest[i * 3 + 2] * sx;
    }
    this.vel.fill(0);
  }

  /** Um passo da molinha. Devolve se ainda está se mexendo. */
  step(dt: number): boolean {
    const h = Math.min(dt, 1 / 30);
    const k = OMEGA * OMEGA;
    const c = 2 * ZETA * OMEGA;
    let moving = false;
    const p = this.pos;
    const r = this.rest;
    const v = this.vel;
    for (let i = 0; i < p.length; i++) {
      const d = r[i] - p[i];
      v[i] += (k * d - c * v[i]) * h;
      p[i] += v[i] * h;
      if (!moving && (Math.abs(d) > 2e-4 || Math.abs(v[i]) > 2e-3)) moving = true;
    }
    if (!moving) p.set(r);
    normals(p, this.idx, this.pn);
    return moving;
  }

  /** Tudo igual ao desenho, sem molinha (para foto e para carregar). */
  snap(): void {
    this.pos.set(this.rest);
    this.vel.fill(0);
    normals(this.pos, this.idx, this.pn);
  }

  /** Massa nova, de outra cor. */
  reset(color: RGB = BASE_COLOR): void {
    const fresh = new Dough(this.radius, this.level, color);
    this.rest.set(fresh.rest);
    this.ink.set(fresh.ink);
    this.varnish.fill(0);
    this.wet.fill(0);
    this.paint();
    this.vol0 = fresh.vol0;
    this.measure();
    this.settle(3);
    this.squash(0.55);
  }

  /** Cópia da forma, da cor e do verniz, para desfazer. */
  shot(): DoughShot {
    return { rest: this.rest.slice(), ink: this.ink.slice(), varnish: this.varnish.slice() };
  }

  restore(s: DoughShot): void {
    this.rest.set(s.rest);
    this.ink.set(s.ink);
    this.varnish.set(s.varnish);
    this.paint();
    this.vol0 = normals(this.rest, this.idx, this.rn);
    this.measure();
  }
}
