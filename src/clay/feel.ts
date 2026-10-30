/*
 * Sentir a massa sem tocar nela: vibração curtinha no celular e um som de massa
 * molhada feito na hora (ruído filtrado), que acompanha a força e a velocidade do dedo.
 */

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let bed: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
let soundOn = true;
let lastBuzz = 0;

function vibrate(ms: number) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(Math.round(ms));
  } catch {
    // sem vibração, tudo bem
  }
}

/** Ruído marrom: mais grave e "molhado" que o branco, bom para massa. */
function makeNoise(c: AudioContext): AudioBuffer {
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

/** O som só pode ligar depois de um toque; chame no começo de cada gesto. */
function wake(): AudioContext | null {
  if (!soundOn) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noise = makeNoise(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function ensureBed(c: AudioContext) {
  if (bed || !noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 300;
  filter.Q.value = 1.4;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
  bed = { src, filter, gain };
}

export type Flow = 'press' | 'rub' | 'pinch';

export const feel = {
  get sound() {
    return soundOn;
  },

  setSound(on: boolean) {
    soundOn = on;
    if (!on && bed && ctx) bed.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
  },

  /** Dedo encostou: um "ploft" de massa e um toque de vibração. */
  touch(force = 1) {
    vibrate(10 + 10 * force);
    const c = wake();
    if (!c || !noise) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.3;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * force, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t, Math.random());
    src.stop(t + 0.25);
  },

  /** Pingo de tinta: um "plic" curto e agudo. */
  plic() {
    vibrate(8);
    const c = wake();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.13);
  },

  /**
   * Enquanto o dedo mexe: `speed` de 0 a 1. Apertar é grave e encorpado, esfregar é um chiado
   * mais fino, beliscar estica o som para cima.
   */
  flow(speed: number, kind: Flow) {
    const s = Math.max(0, Math.min(1, speed));
    const now = performance.now();
    // vibração em pulsinhos, mais fortes quanto mais rápido
    const every = kind === 'rub' ? 40 : 60;
    if (s > 0.05 && now - lastBuzz > every) {
      lastBuzz = now;
      vibrate(kind === 'rub' ? 3 + 5 * s : 4 + 14 * s);
    }
    const c = wake();
    if (!c) return;
    ensureBed(c);
    if (!bed) return;
    const t = c.currentTime;
    const base = kind === 'rub' ? 900 : kind === 'pinch' ? 500 : 260;
    // tremidinha aleatória na frequência: dá o "nhec nhec" de massa grudenta
    const freq = base + s * (kind === 'rub' ? 1400 : 600) + (Math.random() - 0.5) * 120;
    bed.filter.frequency.setTargetAtTime(freq, t, 0.03);
    bed.filter.Q.value = kind === 'rub' ? 0.8 : 1.6;
    bed.gain.gain.setTargetAtTime((kind === 'rub' ? 0.18 : 0.32) * s, t, 0.04);
  },

  /** Dedo saiu: o som some devagarinho. */
  release() {
    if (bed && ctx) bed.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
  },

  tick(ms = 6) {
    vibrate(ms);
  },
};
