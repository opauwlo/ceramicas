import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadCurrent, saveCurrent } from './lib/storage';
import { TEMPLATES } from './model/templates';
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

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
