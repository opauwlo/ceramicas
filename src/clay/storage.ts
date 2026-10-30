import { INK_MAX, type Dough } from './dough';

/*
 * Guarda a massa no aparelho. Posições em inteiros de 1/2000 cm e pigmento em 0–255,
 * em base64: uns 120 KB, bem menos que o limite do navegador.
 */

const KEY = 'atelie-massa-v2';
const Q = 2000;
/** pigmento: 0 a INK_MAX em 0 a 255 */
const QI = 255 / INK_MAX;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function packDough(d: Dough): string {
  const p = new Int16Array(d.rest.length);
  for (let i = 0; i < p.length; i++) p[i] = Math.max(-32767, Math.min(32767, Math.round(d.rest[i] * Q)));
  const c = new Uint8Array(d.ink.length);
  for (let i = 0; i < c.length; i++) c[i] = Math.max(0, Math.min(255, Math.round(d.ink[i] * QI)));
  return JSON.stringify({ v: 2, n: d.n, level: d.level, radius: d.radius, p: toB64(new Uint8Array(p.buffer)), c: toB64(c) });
}

/** Põe na massa o que foi guardado. Devolve false se o guardado não serve para esta massa. */
export function unpackDough(d: Dough, raw: string): boolean {
  try {
    const o = JSON.parse(raw) as { v?: number; n?: number; p?: string; c?: string };
    if (o.v !== 2 || o.n !== d.n || typeof o.p !== 'string' || typeof o.c !== 'string') return false;
    const pb = fromB64(o.p);
    const cb = fromB64(o.c);
    if (pb.length !== d.n * 6 || cb.length !== d.n * 3) return false;
    const p = new Int16Array(pb.buffer, pb.byteOffset, d.n * 3);
    const rest = new Float32Array(d.n * 3);
    const ink = new Float32Array(d.n * 3);
    for (let i = 0; i < rest.length; i++) {
      rest[i] = p[i] / Q;
      if (!Number.isFinite(rest[i])) return false;
      ink[i] = cb[i] / QI;
    }
    d.restore({ rest, ink });
    d.snap();
    return true;
  } catch {
    return false;
  }
}

export function saveDough(d: Dough): void {
  try {
    localStorage.setItem(KEY, packDough(d));
  } catch {
    // sem espaço ou sem acesso: a massa só não fica guardada
  }
}

export function loadDough(d: Dough): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? unpackDough(d, raw) : false;
  } catch {
    return false;
  }
}
