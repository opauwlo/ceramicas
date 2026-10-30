import { useStore } from '../../state/store';
import { Icon } from '../icons';

export function NoSelection() {
  return (
    <div className="emptybox">
      <span className="buddy" aria-hidden="true">
        <Icon.mark />
      </span>
      <p className="empty">Toque numa peça na mesa ou escolha uma na lista para ajustar.</p>
      <button type="button" className="btn" onClick={() => useStore.getState().setTab('pecas')}>
        Ver peças
      </button>
    </div>
  );
}
