import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadCurrent, saveCurrent } from './lib/storage';
import { TEMPLATES } from './model/templates';
import { anim } from './scene/anim';
import { useStore } from './state/store';
import './styles.css';

useStore.getState().init(loadCurrent() ?? TEMPLATES.vinilMao.build());

// guarda o trabalho no aparelho a cada mudança, sem pesar enquanto arrasta
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => saveCurrent(useStore.getState().doc), 400);
});

// peça que chega na mesa (nova, duplicada, de volta pelo desfazer, modelo aberto) cai com um quique
useStore.subscribe((s, prev) => {
  if (s.doc.pieces === prev.doc.pieces) return;
  const before = new Set(prev.doc.pieces.map(p => p.id));
  const fresh = s.doc.pieces.filter(p => p.visible && !before.has(p.id));
  if (fresh.length) anim.dropIn(fresh.sort((a, b) => a.pos[1] - b.pos[1]).map(p => p.id));
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
