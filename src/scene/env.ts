import * as THREE from 'three';
import type { BgKey, LightKey, Vec3 } from '../model/types';

export interface BgDef {
  bg: string;
  /** 'paper' desenha papel pautado; qualquer outro valor é a cor da mesa */
  ground: string;
  env: Array<[number, string]>;
  win: string;
}

export const BG: Record<BgKey, BgDef> = {
  caderno: { bg: '#e6dcc8', ground: 'paper', env: [[0, '#fffaf0'], [0.5, '#efe5d2'], [1, '#bfb299']], win: '#ffffff' },
  mesa: { bg: '#e7e7e2', ground: '#dcd9d1', env: [[0, '#ffffff'], [0.5, '#ecebe6'], [1, '#a9a69d']], win: '#ffffff' },
  agua: { bg: '#dde9f5', ground: '#cddcec', env: [[0, '#ffffff'], [0.42, '#e6f0fa'], [0.52, '#9fc0e3'], [1, '#1f4f8a']], win: '#ffffff' },
  noite: { bg: '#1b1d21', ground: '#2a2d32', env: [[0, '#8d96a8'], [0.5, '#2b2f38'], [1, '#0e0f12']], win: '#f4f6fb' },
};

export interface LightDef {
  key: string;
  ki: number;
  kp: Vec3;
  sky: string;
  gnd: string;
  hi: number;
  fi: number;
  exp: number;
}

export const LIGHTS: Record<LightKey, LightDef> = {
  mesa: { key: '#fff1dc', ki: 1.4, kp: [-3, 9, 4], sky: '#fff6e8', gnd: '#b9a98c', hi: 0.5, fi: 0.3, exp: 1.1 },
  estudio: { key: '#ffffff', ki: 1.25, kp: [-4, 8, 5], sky: '#ffffff', gnd: '#9aa3ad', hi: 0.6, fi: 0.45, exp: 1.05 },
  contraluz: { key: '#ffffff', ki: 1.55, kp: [-2, 6, -6], sky: '#ffffff', gnd: '#6f93bd', hi: 0.45, fi: 0.5, exp: 1.05 },
};

function noiseCanvas(size: number, base: string, amp: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const im = g.getImageData(0, 0, size, size);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(im, 0, 0);
  return c;
}

const envCache = new Map<BgKey, THREE.Texture>();

/** Céu de reflexo para o verniz: um degradê com duas "janelas" claras. */
export function envTexture(k: BgKey): THREE.Texture {
  const hit = envCache.get(k);
  if (hit) return hit;
  const b = BG[k];
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    for (const [at, col] of b.env) gr.addColorStop(at, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = b.win;
    g.fillRect(140, 30, 110, 50);
    g.fillRect(330, 40, 60, 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  envCache.set(k, t);
  return t;
}

const groundCache = new Map<BgKey, THREE.Texture>();

export function groundTexture(k: BgKey, aniso: number): THREE.Texture {
  const hit = groundCache.get(k);
  if (hit) return hit;
  const b = BG[k];
  let t: THREE.CanvasTexture;
  if (b.ground === 'paper') {
    const s = 512;
    const c = noiseCanvas(s, '#efe7d5', 8);
    const g = c.getContext('2d');
    if (g) {
      g.strokeStyle = '#b5bfcc';
      g.lineWidth = 2;
      for (let y = 16; y < s; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(s, y);
        g.stroke();
      }
    }
    t = new THREE.CanvasTexture(c);
    t.repeat.set(12.5, 12.5);
  } else {
    t = new THREE.CanvasTexture(noiseCanvas(256, b.ground, 9));
    t.repeat.set(40, 40);
  }
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  groundCache.set(k, t);
  return t;
}
