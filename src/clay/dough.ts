import { area, icosphere, normals, volume, type Ball, type V3 } from './mesh';

/*
 * A massa. Guarda duas formas:
 *  - `rest`: a forma de verdade, que o dedo modela e que fica (massa é plástica);
 *  - `pos`: a forma que aparece, presa à `rest` por molinhas, para a massa tremer e assentar.
 * Toda mexida conserva o volume: o que afunda num lugar estufa em volta e, no fim, uma
 * pressãozinha uniforme acerta a conta, como massa de verdade.
 * A cor também: cada ponto guarda quanto pigmento tem (`ink`, em absorbância), e sovar só
 * passa pigmento de um ponto para outro. Pouca tinta concentrada tinge bastante massa, como guache.
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
    const base = color.map(inkOf);
    for (let i = 0; i < this.n; i++) this.ink.set(base, i * 3);
    this.paint();
    this.rn = new Float32Array(this.n * 3);
    this.pn = new Float32Array(this.n * 3);
    this.scratch = new Float32Array(this.n * 6);
    this.hits = new Int32Array(this.n);
    this.wts = new Float32Array(this.n);
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

  /** Atualiza a cor que aparece a partir do pigmento. */
  paint(): void {
    const ink = this.ink;
    const col = this.col;
    for (let i = 0; i < col.length; i++) col[i] = Math.exp(-ink[i]);
  }

  /** A mesa empurra de volta: nada fica abaixo de y = 0. */
  private flattenOnTable(): void {
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
    this.paint();
    this.vol0 = fresh.vol0;
    this.measure();
    this.settle(3);
    this.squash(0.55);
  }

  /** Cópia da forma e da cor, para desfazer. */
  shot(): { rest: Float32Array; ink: Float32Array } {
    return { rest: this.rest.slice(), ink: this.ink.slice() };
  }

  restore(s: { rest: Float32Array; ink: Float32Array }): void {
    this.rest.set(s.rest);
    this.ink.set(s.ink);
    this.paint();
    this.vol0 = normals(this.rest, this.idx, this.rn);
    this.measure();
  }
}
