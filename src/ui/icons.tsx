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
  chevron: () => (
    <Svg>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  ),
  mark: () => (
    <Svg>
      <ellipse cx="12" cy="17" rx="10" ry="4.5" />
      <ellipse cx="12" cy="17" rx="5" ry="2" />
      <path d="M12 2.5c1.7 2.5 2.7 3.9 2.7 5.3a2.7 2.7 0 0 1-5.4 0c0-1.4 1-2.8 2.7-5.3z" fill="currentColor" stroke="none" />
    </Svg>
  ),
};

export function ShapeIcon({ type }: { type: PieceType }) {
  switch (type) {
    case 'disco':
      return (
        <Svg>
          <ellipse cx="12" cy="11" rx="9" ry="4.5" />
          <ellipse cx="12" cy="11" rx="3" ry="1.4" />
          <path d="M3 11v2.5c0 2.5 4 4.5 9 4.5s9-2 9-4.5V11" />
        </Svg>
      );
    case 'cilindro':
      return (
        <Svg>
          <rect x="8.5" y="3" width="7" height="18" rx="3.5" />
        </Svg>
      );
    case 'esfera':
      return (
        <Svg>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 8.5a5 5 0 0 1 3-2" />
        </Svg>
      );
    case 'gota':
      return (
        <Svg>
          <path d="M12 3c3 5 6 8 6 11.5a6 6 0 0 1-12 0C6 11 9 8 12 3z" />
        </Svg>
      );
    case 'caixa':
      return (
        <Svg>
          <rect x="4" y="7" width="16" height="11" rx="3" />
        </Svg>
      );
    case 'anel':
      return (
        <Svg>
          <ellipse cx="12" cy="12" rx="8.5" ry="5" />
          <ellipse cx="12" cy="12" rx="4.5" ry="2" />
        </Svg>
      );
    case 'cone':
      return (
        <Svg>
          <path d="M12 3 5 19h14z" />
        </Svg>
      );
  }
}
