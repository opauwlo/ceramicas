import type { BgKey, Doc, Finish, LightKey, Piece, PieceType, Surface, Vec3 } from './types';

export type Unit = 'cm' | 'mm' | 'cmmm' | '%' | '°' | '×' | '';

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: Unit;
}

export interface TypeSpec {
  label: string;
  color: string;
  params: ParamSpec[];
  defaults: Record<string, number>;
}

const P = (key: string, label: string, min: number, max: number, step: number, unit: Unit): ParamSpec => ({ key, label, min, max, step, unit });
const HANDMADE = P('irregular', 'Jeito feito à mão', 0, 1, 0.01, '%');

export const SPEC: Record<PieceType, TypeSpec> = {
  disco: {
    label: 'Disco',
    color: '#efe3cf',
    params: [P('raio', 'Raio', 0.2, 5, 0.05, 'cm'), P('espessura', 'Espessura', 0.05, 2, 0.01, 'cm'), P('borda', 'Borda arredondada', 0, 1, 0.01, '%'), HANDMADE],
    defaults: { raio: 2, espessura: 0.3, borda: 0.6, irregular: 0.3 },
  },
  cilindro: {
    label: 'Cilindro',
    color: '#f4f1ea',
    params: [P('raio', 'Raio', 0.01, 3, 0.01, 'cm'), P('altura', 'Altura', 0.05, 8, 0.01, 'cm'), P('arredondado', 'Pontas arredondadas', 0, 1, 0.01, '%'), HANDMADE],
    defaults: { raio: 0.3, altura: 1.5, arredondado: 0.6, irregular: 0 },
  },
  esfera: {
    label: 'Bolinha',
    color: '#e8a68c',
    params: [P('raio', 'Raio', 0.05, 3, 0.01, 'cm'), P('achatar', 'Altura', 0.3, 2, 0.01, '×'), HANDMADE],
    defaults: { raio: 0.6, achatar: 1, irregular: 0.2 },
  },
  gota: {
    label: 'Gota',
    color: '#cfe3f1',
    params: [P('raio', 'Raio', 0.05, 2, 0.01, 'cm'), P('ponta', 'Ponta', 0, 1, 0.01, '%'), P('alongar', 'Alongar', 0.6, 2, 0.01, '×')],
    defaults: { raio: 0.4, ponta: 0.6, alongar: 1.1 },
  },
  caixa: {
    label: 'Bloco',
    color: '#9cc3b5',
    params: [P('largura', 'Largura', 0.05, 8, 0.01, 'cm'), P('altura', 'Altura', 0.05, 8, 0.01, 'cm'), P('profundidade', 'Profundidade', 0.05, 8, 0.01, 'cm'), P('canto', 'Canto arredondado', 0, 1, 0.01, '%')],
    defaults: { largura: 1.6, altura: 0.6, profundidade: 1, canto: 0.4 },
  },
  anel: {
    label: 'Anel',
    color: '#e2b64f',
    params: [P('raio', 'Raio', 0.1, 5, 0.01, 'cm'), P('tubo', 'Espessura', 0.02, 1.5, 0.01, 'cm'), P('arco', 'Volta', 10, 360, 1, '°')],
    defaults: { raio: 1, tubo: 0.15, arco: 360 },
  },
  cone: {
    label: 'Cone',
    color: '#f4f1ea',
    params: [P('raio', 'Raio da base', 0.01, 3, 0.01, 'cm'), P('altura', 'Altura', 0.02, 6, 0.01, 'cm')],
    defaults: { raio: 0.4, altura: 1 },
  },
};

export const PIECE_TYPES = Object.keys(SPEC) as PieceType[];

export const FINISHES: ReadonlyArray<readonly [Finish, string]> = [
  ['fosco', 'Fosco'],
  ['acetinado', 'Acetinado'],
  ['verniz', 'Verniz brilhante'],
  ['metal', 'Metal'],
  ['vidro', 'Vidro ou água'],
];

export const SWATCHES: ReadonlyArray<readonly [string, string]> = [
  ['#151417', 'Preto'],
  ['#f4f1ea', 'Branco'],
  ['#efe3cf', 'Creme'],
  ['#e8a68c', 'Pêssego'],
  ['#c9654a', 'Telha'],
  ['#e2b64f', 'Mostarda'],
  ['#9cc3b5', 'Sálvia'],
  ['#cfe3f1', 'Azul água'],
  ['#2c66ad', 'Cobalto'],
  ['#f2b8c6', 'Rosa'],
  ['#8b9096', 'Cinza'],
  ['#d8dade', 'Prata'],
];

export const BG_LABELS: Record<BgKey, string> = { caderno: 'Caderno', mesa: 'Mesa clara', agua: 'Água', noite: 'Noite' };
export const LIGHT_LABELS: Record<LightKey, string> = { mesa: 'Luz de mesa', estudio: 'Estúdio', contraluz: 'Contraluz' };

/** Densidade média de massa de modelar que seca ao ar, em g/cm³. Só serve para estimar o peso. */
export const DENSITY = 1.8;

/** Acabamentos que não são argila e ficam fora da conta de massa. */
export const NOT_CLAY: ReadonlyArray<Finish> = ['metal', 'vidro'];

export const HEX = /^#[0-9a-fA-F]{6}$/;

export function defSurface(): Surface {
  return {
    amp: 0,
    qtd: 8,
    inicio: 0.3,
    cratera: 0,
    sulcos: false,
    aneis: { on: false, cor: '#f2ece0', qtd: 6, esp: 0.5, inicio: 0.33, mao: true },
    rotulo: { on: false, cor: '#f4f1ea', tam: 0.25, texto: '', corTexto: '#1c211f' },
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

type Plain = Record<string, unknown>;
const isObj = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);

function deepMerge(a: Plain, b: unknown): void {
  if (!isObj(b)) return;
  for (const k of Object.keys(b)) {
    const v = b[k];
    const cur = a[k];
    if (isObj(v) && isObj(cur)) deepMerge(cur, v);
    else a[k] = Array.isArray(v) ? v.slice() : v;
  }
}

const num = (v: unknown, d: number): number => {
  const n = Number(v);
  // "+ 0" troca -0 por 0, que o JSON não preserva
  return Number.isFinite(n) ? n + 0 : d;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const vec = (v: unknown): Vec3 => {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0], 0), num(a[1], 0), num(a[2], 0)];
};
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);

function fixSurface(raw: unknown): Surface {
  const base = defSurface();
  const s = base as unknown as Plain;
  deepMerge(s, raw);
  const d = defSurface();
  return {
    amp: clamp(num(base.amp, d.amp), 0, 0.3),
    qtd: Math.round(clamp(num(base.qtd, d.qtd), 1, 24)),
    inicio: clamp(num(base.inicio, d.inicio), 0, 0.95),
    cratera: clamp(num(base.cratera, d.cratera), 0, 0.5),
    sulcos: base.sulcos === true,
    aneis: {
      on: base.aneis?.on === true,
      cor: hex(base.aneis?.cor, d.aneis.cor),
      qtd: Math.round(clamp(num(base.aneis?.qtd, d.aneis.qtd), 1, 20)),
      esp: clamp(num(base.aneis?.esp, d.aneis.esp), 0.05, 3),
      inicio: clamp(num(base.aneis?.inicio, d.aneis.inicio), 0, 0.95),
      mao: base.aneis?.mao !== false,
    },
    rotulo: {
      on: base.rotulo?.on === true,
      cor: hex(base.rotulo?.cor, d.rotulo.cor),
      tam: clamp(num(base.rotulo?.tam, d.rotulo.tam), 0.02, 0.9),
      texto: String(base.rotulo?.texto ?? '').slice(0, 12),
      corTexto: hex(base.rotulo?.corTexto, d.rotulo.corTexto),
    },
  };
}

/** Cria uma peça nova. `over` pode ser parcial, vir de um modelo pronto ou de um arquivo importado. */
export function newPiece(type: PieceType, over?: unknown): Piece {
  const sp = SPEC[type];
  const base: Piece = {
    id: uid(),
    type,
    name: sp.label,
    visible: true,
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    scale: 1,
    color: sp.color,
    finish: 'verniz',
    clay: 0.3,
    seed: Math.floor(Math.random() * 1e9),
    p: { ...sp.defaults },
    s: type === 'disco' ? defSurface() : null,
  };
  const raw = base as unknown as Plain;
  deepMerge(raw, over);

  const p: Record<string, number> = {};
  for (const prm of sp.params) {
    const d = sp.defaults[prm.key];
    p[prm.key] = clamp(num(raw.p && (raw.p as Plain)[prm.key], d), Math.min(prm.min, d), Math.max(prm.max, d));
  }
  const finish = typeof raw.finish === 'string' && FINISHES.some(f => f[0] === raw.finish) ? (raw.finish as Finish) : 'verniz';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    type,
    name: String(raw.name ?? sp.label).slice(0, 40) || sp.label,
    visible: raw.visible !== false,
    pos: vec(raw.pos),
    rot: vec(raw.rot),
    scale: clamp(num(raw.scale, 1), 0.05, 10),
    color: hex(raw.color, sp.color),
    finish,
    clay: clamp(num(raw.clay, 0.3), 0, 1),
    seed: Math.abs(Math.floor(num(raw.seed, Math.random() * 1e9))),
    p,
    s: type === 'disco' ? fixSurface(raw.s) : null,
  };
}

const BG_KEYS = Object.keys(BG_LABELS) as BgKey[];
const LIGHT_KEYS = Object.keys(LIGHT_LABELS) as LightKey[];

/** Confere e conserta um modelo vindo de fora (arquivo, código colado, armazenamento). Devolve null se não der para usar. */
export function normalizeDoc(raw: unknown): Doc | null {
  if (!isObj(raw) || !Array.isArray(raw.pieces)) return null;
  const seen = new Set<string>();
  const pieces: Piece[] = [];
  for (const d of raw.pieces) {
    if (!isObj(d) || typeof d.type !== 'string' || !(d.type in SPEC)) continue;
    const pc = newPiece(d.type as PieceType, d);
    if (seen.has(pc.id)) pc.id = uid();
    seen.add(pc.id);
    pieces.push(pc);
  }
  return {
    v: 1,
    bg: BG_KEYS.includes(raw.bg as BgKey) ? (raw.bg as BgKey) : 'caderno',
    light: LIGHT_KEYS.includes(raw.light as LightKey) ? (raw.light as LightKey) : 'mesa',
    lightAngle: clamp(num(raw.lightAngle, 0), -180, 180),
    pieces,
  };
}

export const cloneDoc = (d: Doc): Doc => structuredClone(d);

export const isClay = (pc: Piece) => !NOT_CLAY.includes(pc.finish);
