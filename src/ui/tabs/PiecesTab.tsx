import { dims, grams } from '../../lib/format';
import { DENSITY, isClay, PIECE_TYPES, SPEC } from '../../model/spec';
import { useMetrics, useStore } from '../../state/store';
import { Section } from '../controls';
import { Icon, ShapeIcon } from '../icons';
import type { PieceType } from '../../model/types';

export function PiecesTab() {
  const pieces = useStore(s => s.doc.pieces);
  const sel = useStore(s => s.selectedId);
  const placing = useStore(s => s.placing);
  const metrics = useMetrics(s => s.m);

  // escolhe a peça e espera um toque na mesa: ela gruda onde o dedo tocar
  const add = (t: PieceType) => {
    const s = useStore.getState();
    s.setPlacing(t);
    if (s.panel === 'max') s.setPanel('mid');
  };

  return (
    <>
      <Section title="Adicionar peça">
        <div className="addgrid">
          {PIECE_TYPES.map(t => (
            <button key={t} type="button" className="add" aria-pressed={placing === t} onClick={() => add(t)}>
              <ShapeIcon type={t} fill={SPEC[t].color} face />
              <span>{SPEC[t].label}</span>
            </button>
          ))}
        </div>
        <p className="hint">Escolha uma peça e toque na mesa ou em outra peça: ela gruda ali, virada para fora. Arrastando com a mão Mover, ela gruda onde o dedo passar.</p>
      </Section>

      <Section title="Na mesa" extra={<span className="count">{pieces.length}</span>}>
        {pieces.length === 0 ? (
          <p className="empty">A mesa está vazia. Adicione um disco ou abra um modelo pronto em Arquivo.</p>
        ) : (
          <ul className="list">
            {pieces.map(p => {
              const m = metrics[p.id];
              const g = m && isClay(p) ? m.vol * DENSITY : 0;
              return (
                <li key={p.id} className={`row${p.id === sel ? ' on' : ''}${p.visible ? '' : ' off'}`}>
                  <button
                    type="button"
                    className="row-main"
                    onClick={() => {
                      const s = useStore.getState();
                      s.select(p.id);
                      s.setTab('forma');
                    }}
                  >
                    <span className="sw" style={{ background: p.color }} />
                    <span className="rn">
                      <span className="nm">{p.name}</span>
                      <span className="meta">
                        {SPEC[p.type].label}
                        {m ? ` · ${dims(m.size)}` : ''}
                        {g ? ` · ${grams(g)}` : ''}
                      </span>
                    </span>
                  </button>
                  <button type="button" className="ib" aria-label={`${p.visible ? 'Esconder' : 'Mostrar'} ${p.name}`} onClick={() => useStore.getState().toggleVisible(p.id)}>
                    {p.visible ? <Icon.eye /> : <Icon.eyeOff />}
                  </button>
                  <button type="button" className="ib" aria-label={`Duplicar ${p.name}`} onClick={() => useStore.getState().duplicate(p.id)}>
                    <Icon.copy />
                  </button>
                  <button
                    type="button"
                    className="ib"
                    aria-label={`Apagar ${p.name}`}
                    onClick={() => {
                      const s = useStore.getState();
                      s.remove(p.id);
                      s.notify('Peça apagada. Desfazer traz de volta.');
                    }}
                  >
                    <Icon.trash />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">Peso estimado com massa de {String(DENSITY).replace('.', ',')} g/cm³. Peças de metal e vidro ficam fora da conta.</p>
      </Section>
    </>
  );
}
