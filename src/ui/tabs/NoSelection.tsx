import { useStore } from '../../state/store';

export function NoSelection() {
  return (
    <div className="emptybox">
      <p className="empty">Toque numa peça na mesa ou escolha uma na lista para ajustar.</p>
      <button type="button" className="btn" onClick={() => useStore.getState().setTab('pecas')}>
        Ver peças
      </button>
    </div>
  );
}
