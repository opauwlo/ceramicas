import { useEffect, useRef } from 'react';
import { useStore, type Tab } from '../state/store';
import { Icon } from './icons';
import { FileTab } from './tabs/FileTab';
import { PaintTab } from './tabs/PaintTab';
import { PiecesTab } from './tabs/PiecesTab';
import { SceneTab } from './tabs/SceneTab';
import { ShapeTab } from './tabs/ShapeTab';

const TABS: Array<[Tab, string]> = [
  ['pecas', 'Peças'],
  ['forma', 'Forma'],
  ['pintura', 'Pintura'],
  ['cena', 'Cena'],
  ['arquivo', 'Arquivo'],
];

const PANEL_LABEL = { min: 'Abrir ferramentas', mid: 'Aumentar ferramentas', max: 'Recolher ferramentas' } as const;

export function Panel() {
  const tab = useStore(s => s.tab);
  const panel = useStore(s => s.panel);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <section className="panel" aria-label="Ferramentas">
      <nav className="tabs" role="tablist" aria-label="Ferramentas">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === k}
            onClick={() => {
              const s = useStore.getState();
              s.setTab(k);
              if (s.panel === 'min') s.cyclePanel();
            }}
          >
            {label}
          </button>
        ))}
        <button type="button" className={`ib panel-toggle size-${panel}`} aria-label={PANEL_LABEL[panel]} title={PANEL_LABEL[panel]} onClick={() => useStore.getState().cyclePanel()}>
          <Icon.chevron />
        </button>
      </nav>
      <div className="pane" ref={paneRef} role="tabpanel">
        {tab === 'pecas' && <PiecesTab />}
        {tab === 'forma' && <ShapeTab />}
        {tab === 'pintura' && <PaintTab />}
        {tab === 'cena' && <SceneTab />}
        {tab === 'arquivo' && <FileTab />}
      </div>
    </section>
  );
}
