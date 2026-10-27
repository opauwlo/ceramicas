import * as THREE from 'three';
import type { Piece, Surface } from '../model/types';
import { uvSize } from './shapes';

export const needsPaint = (s: Surface | null): s is Surface => !!s && (s.sulcos || s.aneis.on || s.rotulo.on);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponível');
  return { c, g };
}

function addNoise(g: CanvasRenderingContext2D, size: number, amp: number, rand: () => number) {
  const im = g.getImageData(0, 0, size, size);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amp;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(im, 0, 0);
}

let clayTex: THREE.CanvasTexture | null = null;

/** Textura de relevo da argila, compartilhada por todas as peças lisas. */
export function clayNoise(): THREE.CanvasTexture {
  if (clayTex) return clayTex;
  const { c, g } = canvas(256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  addNoise(g, 256, 60, rng(7));
  clayTex = new THREE.CanvasTexture(c);
  clayTex.wrapS = clayTex.wrapT = THREE.RepeatWrapping;
  clayTex.repeat.set(4, 4);
  return clayTex;
}

const lum = (h: string) => {
  const c = new THREE.Color(h);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const mix = (h: string, t: string, amt: number) => '#' + new THREE.Color(h).lerp(new THREE.Color(t), amt).getHexString();

/** Pinta o topo do disco: sulcos, anéis à mão e rótulo. Devolve a cor e o relevo da tinta. */
export function paintDisc(pc: Piece): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const s = pc.s as Surface;
  const R = Math.max(0.05, pc.p.raio);
  const size = 1024;
  const px = size / uvSize(pc);
  const cx = size / 2;
  const rand = rng(pc.seed);
  const col = canvas(size);
  const bmp = canvas(size);
  const g = col.g;
  const gb = bmp.g;
  g.fillStyle = pc.color;
  g.fillRect(0, 0, size, size);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, size, size);

  if (s.sulcos) {
    const dark = lum(pc.color) < 0.12;
    g.strokeStyle = mix(pc.color, dark ? '#ffffff' : '#000000', dark ? 0.07 : 0.1);
    gb.strokeStyle = '#606060';
    g.lineWidth = gb.lineWidth = 1;
    const st = Math.max(2.2, 0.0135 * R * px);
    for (let r = 0.27 * R * px; r < 0.975 * R * px; r += st) {
      g.beginPath();
      g.arc(cx, cx, r, 0, Math.PI * 2);
      g.stroke();
      gb.beginPath();
      gb.arc(cx, cx, r, 0, Math.PI * 2);
      gb.stroke();
    }
  }

  if (s.aneis.on) {
    const A = s.aneis;
    const n = Math.max(1, Math.round(A.qtd));
    const r0 = A.inicio * R;
    const r1 = 0.93 * R;
    const w0 = Math.max(1, (A.esp / 10) * px);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const r = r0 + (r1 - r0) * t;
      const w = w0 * (1 - 0.35 * t);
      const draw = (a0: number, len: number) => {
        const pairs: Array<[CanvasRenderingContext2D, string]> = [
          [g, A.cor],
          [gb, '#c4c4c4'],
        ];
        for (const [ctx, cl] of pairs) {
          ctx.beginPath();
          const seg = Math.max(12, Math.ceil((len * r * px) / 6));
          for (let q = 0; q <= seg; q++) {
            const a = a0 + (len * q) / seg;
            const rr = (r + 0.008 * R * Math.sin(a * 7 + i)) * px;
            const x = cx + rr * Math.cos(a);
            const y = cx + rr * Math.sin(a);
            if (q) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = w;
          ctx.strokeStyle = cl;
          ctx.stroke();
        }
      };
      if (A.mao) {
        const k = 2 + Math.floor(rand() * 2);
        let a0 = rand() * Math.PI * 2;
        for (let j = 0; j < k; j++) {
          const len = ((0.55 + rand() * 0.35) * Math.PI * 2) / k;
          draw(a0, len);
          a0 += (Math.PI * 2) / k;
        }
      } else draw(0, Math.PI * 2);
    }
  }

  if (s.rotulo.on) {
    const L = s.rotulo;
    const lr = Math.max(0.02, L.tam * R) * px;
    g.fillStyle = L.cor;
    g.beginPath();
    g.arc(cx, cx, lr, 0, Math.PI * 2);
    g.fill();
    gb.fillStyle = '#8c8c8c';
    gb.beginPath();
    gb.arc(cx, cx, lr, 0, Math.PI * 2);
    gb.fill();
    const tx = L.texto.trim();
    if (tx) {
      let fs = lr * 1.1;
      g.font = `600 ${fs}px Figtree, system-ui, sans-serif`;
      const wd = g.measureText(tx).width;
      if (wd > lr * 1.6) {
        fs = (fs * lr * 1.6) / wd;
        g.font = `600 ${fs}px Figtree, system-ui, sans-serif`;
      }
      g.fillStyle = L.corTexto;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(tx, cx, cx + fs * 0.04);
    }
  }

  addNoise(gb, size, 8 + pc.clay * 30, rand);

  const map = new THREE.CanvasTexture(col.c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bmp.c);
  return { map, bump };
}
