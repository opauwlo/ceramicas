import { useStore } from '../state/store';

/** Troca entre sovar uma massa com o dedo e montar com peças prontas. */
export function ModeSwitch() {
  const mode = useStore(s => s.mode);
  return (
    <div className="modes" role="tablist" aria-label="Jeito de modelar">
      <button type="button" role="tab" aria-selected={mode === 'massa'} onClick={() => useStore.getState().setMode('massa')}>
        Massa
      </button>
      <button type="button" role="tab" aria-selected={mode === 'pecas'} onClick={() => useStore.getState().setMode('pecas')}>
        Peças
      </button>
    </div>
  );
}
