import type { ReactNode } from 'react';
import type { PieceType } from '../model/types';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  undo: () => (
    <Svg>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Svg>
  ),
  redo: () => (
    <Svg>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Svg>
  ),
  camera: () => (
    <Svg>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  ),
  eye: () => (
    <Svg>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  eyeOff: () => (
    <Svg>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <path d="M4 4l16 16" />
    </Svg>
  ),
  copy: () => (
    <Svg>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </Svg>
  ),
  trash: () => (
    <Svg>
      <path d="M4 7h16" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M9.5 7V4h5v3" />
    </Svg>
  ),
  rotate: () => (
    <Svg>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </Svg>
  ),
  down: () => (
    <Svg>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </Svg>
  ),
  sound: () => (
    <Svg>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </Svg>
  ),
  mute: () => (
    <Svg>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </Svg>
  ),
  help: () => (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </Svg>
  ),
  /** Bolota nova de massa. */
  blob: () => (
    <Svg>
      <path d="M12 4.5c4.4 0 7.5 3 7.5 7.4 0 4-3.2 7.1-7.5 7.1S4.5 15.9 4.5 11.9C4.5 7.5 7.6 4.5 12 4.5z" />
      <path d="M12 9v6M9 12h6" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  chevron: () => (
    <Svg>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  ),
  /** Bolinha de argila sorridente, a marca do ateliê. */
  mark: () => (
    <Svg>
      <path d="M12 3.5c4.8 0 8.5 3.6 8.5 8.6 0 4.6-3.6 7.9-8.5 7.9s-8.5-3.3-8.5-7.9c0-5 3.7-8.6 8.5-8.6z" fill="currentColor" fillOpacity={0.16} />
      <Face x={12} y={12.2} w={2.6} blush />
    </Svg>
  ),
  move: () => (
    <Svg>
      <path d="M12 3v18M3 12h18" />
      <path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </Svg>
  ),
  /** Mão apertando a massa: seta descendo sobre uma bolota achatada. */
  press: () => (
    <Svg>
      <path d="M12 2.5v7.5" />
      <path d="m8.8 7 3.2 3.2L15.2 7" />
      <path d="M3.5 17.5c0-2.2 3.8-3.6 8.5-3.6s8.5 1.4 8.5 3.6-3.8 3-8.5 3-8.5-.8-8.5-3z" />
    </Svg>
  ),
  /** Torno: o prato e a seta dando a volta. */
  spin: () => (
    <Svg>
      <ellipse cx="12" cy="16.5" rx="8.5" ry="3.2" />
      <path d="M4.2 11.2C5.6 8.6 8.5 7 12 7s6.4 1.6 7.8 4.2" />
      <path d="m17.2 10.6 2.7.8.6-2.8" />
    </Svg>
  ),
  /** Superfície lisinha com brilho. */
  smooth: () => (
    <Svg>
      <path d="M3 18.5h18" />
      <path d="M8 4.5v5M5.5 7h5" />
      <path d="M16.5 9v3.4M14.8 10.7h3.4" />
    </Svg>
  ),
  /** Pincel com a ponta molhada. */
  brush: () => (
    <Svg>
      <path d="M18.6 3.4a2 2 0 0 1 2.9 2.9l-8.9 8.9-2.9-2.9z" />
      <path d="M9.3 13.1c-2.6-.2-4.4 1.4-4.6 3.8-.1 1.4-.8 2.3-2 2.8 1.2.6 2.6.8 3.9.7 3-.2 4.9-2.1 4.8-4.4" fill="currentColor" fillOpacity={0.25} />
    </Svg>
  ),
  /** Duas metades iguais, uma de cada lado do espelho. */
  mirror: () => (
    <Svg>
      <path d="M12 3v18" strokeDasharray="2.2 2.6" />
      <path d="M9 6.5 3.5 17.5H9z" />
      <path d="M15 6.5l5.5 11H15z" />
    </Svg>
  ),
  stretch: () => (
    <Svg>
      <path d="M12 21V11" />
      <path d="m8.8 14 3.2-3.2 3.2 3.2" />
      <path d="M8 3.5h8" />
      <path d="M12 3.5v3" />
    </Svg>
  ),
};

/** Carinha: dois olhos, um sorriso e, se couber, bochechas coradas. */
export function Face({ x, y, w = 2.3, blush = false }: { x: number; y: number; w?: number; blush?: boolean }) {
  return (
    <g className="face">
      <circle cx={x - w} cy={y} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={x + w} cy={y} r={0.9} fill="currentColor" stroke="none" />
      <path d={`M${x - 1.2} ${y + 1.5}q1.2 1.1 2.4 0`} strokeWidth={1.4} />
      {blush && (
        <>
          <ellipse cx={x - w - 1.3} cy={y + 1.7} rx={1} ry={0.6} fill="var(--blush)" stroke="none" />
          <ellipse cx={x + w + 1.3} cy={y + 1.7} rx={1} ry={0.6} fill="var(--blush)" stroke="none" />
        </>
      )}
    </g>
  );
}

/** Ícone de cada peça. Com `fill` vira uma bolota colorida; com `face`, ganha carinha. */
export function ShapeIcon({ type, fill, face = false }: { type: PieceType; fill?: string; face?: boolean }) {
  const f = fill ?? 'none';
  switch (type) {
    case 'disco':
      return (
        <Svg>
          <path d="M3 11v2.5c0 2.5 4 4.5 9 4.5s9-2 9-4.5V11z" fill={f} />
          <ellipse cx="12" cy="11" rx="9" ry="4.5" fill={f} />
          {face ? <Face x={12} y={10.6} w={2.5} blush /> : <ellipse cx="12" cy="11" rx="3" ry="1.4" />}
        </Svg>
      );
    case 'cilindro':
      return (
        <Svg>
          <rect x="8.5" y="3" width="7" height="18" rx="3.5" fill={f} />
          {face && <Face x={12} y={10.5} w={1.5} />}
        </Svg>
      );
    case 'esfera':
      return (
        <Svg>
          <circle cx="12" cy="12" r="8" fill={f} />
          {face ? <Face x={12} y={12} w={2.6} blush /> : <path d="M8.5 8.5a5 5 0 0 1 3-2" />}
        </Svg>
      );
    case 'gota':
      return (
        <Svg>
          <path d="M12 3c3 5 6 8 6 11.5a6 6 0 0 1-12 0C6 11 9 8 12 3z" fill={f} />
          {face && <Face x={12} y={14.2} w={2.1} blush />}
        </Svg>
      );
    case 'caixa':
      return (
        <Svg>
          <rect x="4" y="7" width="16" height="11" rx="3" fill={f} />
          {face && <Face x={12} y={11.8} w={2.6} blush />}
        </Svg>
      );
    case 'anel':
      return (
        <Svg>
          <path d="M3.5 12a8.5 5 0 1 0 17 0a8.5 5 0 1 0-17 0zM7.5 12a4.5 2 0 1 1 9 0a4.5 2 0 1 1-9 0z" fill={f} fillRule="evenodd" />
          {face && (
            <g className="face">
              <circle cx="10.4" cy="15.2" r="0.75" fill="currentColor" stroke="none" />
              <circle cx="13.6" cy="15.2" r="0.75" fill="currentColor" stroke="none" />
            </g>
          )}
        </Svg>
      );
    case 'cone':
      return (
        <Svg>
          <path d="M12 3 5 19h14z" fill={f} />
          {face && <Face x={12} y={14} w={1.9} />}
        </Svg>
      );
  }
}
