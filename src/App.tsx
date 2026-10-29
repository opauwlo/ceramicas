import { useEffect } from 'react';
import { Viewport } from './scene/Viewport';
import { useStore } from './state/store';
import { InfoChips, PaintBar, PhotoDialog, PlaceBanner, QuickBar, ToastView, ToolBelt, TopBar } from './ui/Overlay';
import { Panel } from './ui/Panel';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.key === 'Escape') {
        if (s.photo) s.setPhoto(null);
        else if (s.placing) s.setPlacing(null);
        else s.select(null);
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        e.preventDefault();
        s.remove(s.selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const panel = useStore(s => s.panel);
  useShortcuts();
  return (
    <div className={`app panel-${panel}`}>
      <TopBar />
      <main className="view">
        <Viewport />
        <ToolBelt />
        <QuickBar />
        <InfoChips />
        <PaintBar />
        <PlaceBanner />
        <ToastView />
      </main>
      <Panel />
      <PhotoDialog />
    </div>
  );
}
