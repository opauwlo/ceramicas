import { BG_LABELS, LIGHT_LABELS } from '../../model/spec';
import type { BgKey, LightKey } from '../../model/types';
import { BG } from '../../scene/env';
import { useStore } from '../../state/store';
import { frameView } from '../actions';
import { Section, Segmented, Slider, Toggle } from '../controls';

const LIGHT_OPTIONS = Object.entries(LIGHT_LABELS) as Array<[LightKey, string]>;

export function SceneTab() {
  const bg = useStore(s => s.doc.bg);
  const light = useStore(s => s.doc.light);
  const angle = useStore(s => s.doc.lightAngle);
  const snap = useStore(s => s.snap);
  const st = useStore.getState();

  return (
    <>
      <Section title="Fundo">
        <div className="tiles">
          {(Object.keys(BG_LABELS) as BgKey[]).map(k => (
            <button
              key={k}
              type="button"
              className="tile"
              aria-pressed={bg === k}
              onClick={() => {
                st.setScene({ bg: k });
                st.commit();
              }}
            >
              <span className="tp" style={{ background: BG[k].bg }} />
              {BG_LABELS[k]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Luz">
        <Segmented<LightKey>
          label="Luz"
          value={light}
          options={LIGHT_OPTIONS}
          onChange={v => {
            st.setScene({ light: v });
            st.commit();
          }}
        />
        <Slider id="f-la" label="Direção da luz" value={angle} min={-180} max={180} step={1} unit="°" nudge={15} onChange={v => st.setScene({ lightAngle: v })} onCommit={() => useStore.getState().commit()} />
      </Section>

      <Section title="Arrastar">
        <Toggle id="f-snap" label="Assentar em cima de outras peças" checked={snap} onChange={v => st.setSnap(v)} />
        <p className="hint">Ligado, a peça arrastada desce até encostar no que estiver embaixo. Desligado, ela mantém a altura.</p>
      </Section>

      <Section title="Câmera">
        <div className="btns">
          <button type="button" className="btn" onClick={() => frameView('diag')}>
            Enquadrar tudo
          </button>
          <button type="button" className="btn" onClick={() => frameView('cima')}>
            Ver de cima
          </button>
          <button type="button" className="btn" onClick={() => frameView('frente')}>
            Ver de frente
          </button>
        </div>
        <p className="hint">Um dedo no fundo gira a vista. Dois dedos aproximam e arrastam.</p>
      </Section>
    </>
  );
}
