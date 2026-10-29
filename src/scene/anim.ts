/*
 * Animações de brincadeira. Só mexem no desenho da peça, nunca no modelo salvo.
 * Tudo conserva volume: quando a peça achata (sy < 1), ela alarga na mesma conta.
 * Tempos em milissegundos, alturas em cm.
 */

export type AnimKind = 'drop' | 'boop' | 'lift';

export interface Anim {
  kind: AnimKind;
  t0: number;
  /** altura de onde cai, no 'drop' */
  h: number;
  /** força do quique, 1 = normal */
  amp: number;
  /** fica escondida até a hora de cair (entrada em sequência) */
  hide: boolean;
}

/** Deslocamento para cima e escala vertical. A escala lateral é 1/√sy. */
export interface Pose {
  dy: number;
  sy: number;
  hidden: boolean;
}

/** Quanto a peça sobe quando é pega para mover. */
export const LIFT = 0.18;

const clampS = (s: number) => Math.min(1.6, Math.max(0.5, s));

/** Pose da animação no instante `now`. Devolve null quando acabou. */
export function poseOf(a: Anim, now: number): Pose | null {
  const t = now - a.t0;
  switch (a.kind) {
    case 'lift': {
      const u = Math.min(1, Math.max(0, t / 120));
      const e = 1 - (1 - u) * (1 - u);
      // segurada no ar, a massa estica um tiquinho com o peso
      return { dy: LIFT * e, sy: 1 + 0.05 * e, hidden: false };
    }
    case 'drop': {
      const tf = Math.max(90, 260 * Math.sqrt(a.h / 1.2));
      if (t < 0) return { dy: a.h, sy: 1, hidden: a.hide };
      if (t < tf) {
        const u = t / tf;
        return { dy: a.h * (1 - u * u), sy: clampS(1 + 0.1 * u * a.amp), hidden: false };
      }
      const s = (t - tf) / 1000;
      if (s > 0.75) return null;
      // bateu na mesa: amassa e volta balançando
      return { dy: 0, sy: clampS(1 - 0.24 * a.amp * Math.exp(-s / 0.13) * Math.cos((2 * Math.PI * s) / 0.24)), hidden: false };
    }
    case 'boop': {
      if (t < 0) return { dy: 0, sy: 1, hidden: false };
      const s = t / 1000;
      if (s > 0.6) return null;
      return { dy: 0, sy: clampS(1 + 0.1 * a.amp * Math.exp(-s / 0.14) * Math.sin((2 * Math.PI * s) / 0.2)), hidden: false };
    }
  }
}

const live = new Map<string, Anim>();
let kick: (() => void) | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Respeita quem pediu menos movimento no aparelho. */
export function motionOK(): boolean {
  try {
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return true;
  }
}

type PlayOpts = Partial<Pick<Anim, 'h' | 'amp' | 'hide'>> & { delay?: number };

function play(id: string, kind: AnimKind, opts: PlayOpts = {}): void {
  if (!motionOK()) return;
  live.set(id, { kind, t0: now() + (opts.delay ?? 0), h: opts.h ?? 1.2, amp: opts.amp ?? 1, hide: opts.hide ?? false });
  kick?.();
}

/** Peças novas caem na mesa. Várias de uma vez caem em sequência, na ordem recebida. */
function dropIn(ids: string[]): void {
  if (!ids.length) return;
  if (ids.length === 1) {
    play(ids[0], 'drop', { h: 1.2 });
    return;
  }
  const gap = Math.min(45, 700 / ids.length);
  ids.forEach((id, i) => play(id, 'drop', { h: 1.6, delay: i * gap, hide: true }));
}

/** Pose atual da peça, ou null se ela está parada. Limpa o que acabou. */
function pose(id: string, at: number = now()): Pose | null {
  const a = live.get(id);
  if (!a) return null;
  const p = poseOf(a, at);
  if (!p) live.delete(id);
  return p;
}

export const anim = {
  /** A cena registra aqui como pedir um quadro novo. */
  onKick(fn: (() => void) | null): void {
    kick = fn;
  },
  play,
  dropIn,
  pose,
  stop(id: string): void {
    live.delete(id);
  },
  /** Peças que estão no meio de uma animação. */
  ids(): string[] {
    return [...live.keys()];
  },
  /** Qual animação a peça está fazendo agora. */
  kind(id: string): AnimKind | null {
    return live.get(id)?.kind ?? null;
  },
};
