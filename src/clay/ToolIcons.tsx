import type { ReactNode } from 'react';
import type { CutterShape } from './cutters';
import { cutterOutline } from './cutters';
import type { ClayTool } from './state';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Desenho de cada ferramenta da bancada. */
export function ToolIcon({ tool, color }: { tool: ClayTool; color?: string }) {
  switch (tool) {
    case 'dedo':
      return (
        <Svg>
          <path d="M3.5 19.5c0-2 3.8-3.4 8.5-3.4s8.5 1.4 8.5 3.4" />
          <path d="M9.5 15.5V5.8a2.5 2.5 0 0 1 5 0v9.7" />
          <path d="M10.6 6.4h2.8" strokeWidth={1.2} />
        </Svg>
      );
    case 'rolo':
      return (
        <Svg>
          <rect x="5" y="8.5" width="14" height="7" rx="3.5" />
          <path d="M2 12h3M19 12h3M9 9.2v5.6M14.5 9.2v5.6" />
        </Svg>
      );
    case 'boleador':
      return (
        <Svg>
          <circle cx="7" cy="17" r="3.2" fill="currentColor" fillOpacity={0.18} />
          <path d="M9.3 14.7 15 9" />
          <path d="m15 9 2.4-2.4a1.8 1.8 0 0 1 2.5 2.5L17.5 11.5z" />
        </Svg>
      );
    case 'silicone':
      return (
        <Svg>
          <path d="M5.2 18.8c-1.4-1.4-.6-3.7 1.2-4.4l2.6-1 1.6 1.6-1 2.6c-.7 1.8-3 2.6-4.4 1.2z" fill="currentColor" fillOpacity={0.18} />
          <path d="m10.6 15-1.6-1.6L19 3.4l1.6 1.6z" />
        </Svg>
      );
    case 'espatula':
      return (
        <Svg>
          <path d="M3.5 20.5 13 11l2.5 2.5-9.5 4.8z" fill="currentColor" fillOpacity={0.12} />
          <path d="m15.5 13.5 5-5-2.5-2.5-5 5" />
        </Svg>
      );
    case 'esteca':
      return (
        <Svg>
          <path d="m3.5 20.5 3-1.2 2.3-2.3-1.6-1.6-2.3 2.3z" />
          <path d="m8.8 17 11.5-11.5-1.8-1.8L7 15.2" />
        </Svg>
      );
    case 'cortador':
      return (
        <Svg>
          <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" strokeWidth={2.2} />
        </Svg>
      );
    case 'agua':
      return (
        <Svg>
          <path d="M8 3.5s-3 3.6-3 5.6a3 3 0 0 0 6 0c0-2-3-5.6-3-5.6z" fill="currentColor" fillOpacity={0.18} />
          <path d="m11.5 20.5 3.2-.8 6-6-2.4-2.4-6 6z" />
          <path d="m11.5 20.5 1-3.4" />
        </Svg>
      );
    case 'esponja':
      return (
        <Svg>
          <rect x="3.5" y="7" width="17" height="10" rx="3" fill="currentColor" fillOpacity={0.15} />
          <circle cx="8" cy="11" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12.5" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="9.5" cy="14.5" r="0.6" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'lixa':
      return (
        <Svg>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          {[
            [7.5, 8.5], [11, 9], [15, 8], [8.5, 12.5], [12.5, 12], [16, 13], [7.5, 16], [11.5, 15.5], [15.5, 16.2],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="currentColor" stroke="none" />
          ))}
        </Svg>
      );
    case 'tinta':
      return (
        <Svg>
          <path d="M12 3.5s-5.5 6.2-5.5 10a5.5 5.5 0 0 0 11 0c0-3.8-5.5-10-5.5-10z" fill={color ?? 'currentColor'} fillOpacity={color ? 1 : 0.2} />
        </Svg>
      );
    case 'verniz':
      return (
        <Svg>
          <path d="M7 9h10v9.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
          <path d="M8.5 9V6.5h7V9" />
          <path d="M18.5 3.5v3M17 5h3" />
          <path d="M10 13.5c.7-1 1.6-1.4 2.6-1.3" strokeWidth={1.3} />
        </Svg>
      );
  }
}

/** Contorno do cortador, para os botões de formato. */
export function CutterIcon({ shape }: { shape: CutterShape }) {
  const pts = cutterOutline(shape)
    .filter((_, i) => i % 3 === 0)
    .map(([u, v]) => `${(12 + u * 8.5).toFixed(2)},${(12 - v * 8.5).toFixed(2)}`)
    .join(' ');
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
      <polygon points={pts} />
    </svg>
  );
}
