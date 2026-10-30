import { grams } from '../../lib/format';
import { buzz } from '../../lib/haptics';
import { canSmooth, clampPress, press, smooth } from '../../model/hands';
import { DENSITY, isClay, SPEC } from '../../model/spec';
import type { Piece } from '../../model/types';
import { anim } from '../../scene/anim';
import { useMetrics, useStore } from '../../state/store';
import { rotateSelected, sitSelected } from '../actions';
import { Section, Slider, TextField } from '../controls';
import { Icon } from '../icons';
import { NoSelection } from './NoSelection';

/** Um aperto ou um puxão pelos botões: o mesmo que o gesto na mesa, em passos. */
const SQUEEZE = 0.85;

/** Amassar, esticar e alisar por botão, para quem prefere tocar a arrastar. */
function HandsSection({ piece }: { piece: Piece }) {
  const m = useMetrics(s => s.m[piece.id]);
  const act = (fn: (p: Piece) => void) => {
    const s = useStore.getState();
    s.patchPiece(piece.id, fn);
    s.commit();
    anim.play(piece.id, 'boop', { amp: 0.6 });
    buzz(6);
  };
  const canPress = clampPress(piece, SQUEEZE) < 0.999;
  const canPull = clampPress(piece, 1 / SQUEEZE) > 1.001;
  const peso = m && isClay(piece) ? ` (${grams(m.vol * DENSITY)})` : '';
  return (
    <Section title="Com as mãos">
      <div className="hands">
        <button
          type="button"
          className="btn"
          disabled={!canPress}
          onClick={() =>
            act(p => {
              p.p = press(piece, SQUEEZE);
            })
          }
        >
          <Icon.press />
          Amassar
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canPull}
          onClick={() =>
            act(p => {
              p.p = press(piece, 1 / SQUEEZE);
            })
          }
        >
          <Icon.stretch />
          Esticar
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canSmooth(piece)}
          onClick={() =>
            act(p => {
              const r = smooth(piece, 0.6);
              p.p = r.p;
              p.clay = r.clay;
            })
          }
        >
          <Icon.smooth />
          Alisar
        </button>
      </div>
      <p className="hint">Amassar e esticar mudam o formato, não a quantidade de massa{peso}. Na mesa, escolha uma mão no canto e faça com o dedo.</p>
    </Section>
  );
}

export function ShapeTab() {
  const piece = useStore(s => s.doc.pieces.find(p => p.id === s.selectedId));
  if (!piece) return <NoSelection />;
  return <ShapeEditor piece={piece} />;
}

function ShapeEditor({ piece }: { piece: Piece }) {
  const sp = SPEC[piece.type];
  const s = useStore.getState();
  const patch = (fn: (p: Piece) => void) => s.patchPiece(piece.id, fn);
  const commit = () => useStore.getState().commit();

  return (
    <>
      <div className="phead">
        <TextField
          id="f-nome"
          label="Nome da peça"
          value={piece.name}
          maxLength={40}
          onChange={v => {
            patch(p => {
              p.name = v;
            });
            useStore.getState().commitSoon();
          }}
        />
        <span className="tag">{sp.label}</span>
      </div>

      <HandsSection piece={piece} />

      <Section title="Forma">
        {sp.params.map(q => (
          <Slider
            key={q.key}
            id={`f-p-${q.key}`}
            label={q.label}
            value={piece.p[q.key]}
            min={q.min}
            max={q.max}
            step={q.step}
            unit={q.unit}
            onChange={v =>
              patch(p => {
                p.p[q.key] = v;
              })
            }
            onCommit={commit}
          />
        ))}
      </Section>

      <Section title="Posição">
        <Slider id="f-px" label="Para os lados" value={piece.pos[0]} min={-8} max={8} step={0.01} unit="cm" nudge={0.1} onChange={v => patch(p => void (p.pos[0] = v))} onCommit={commit} />
        <Slider id="f-pz" label="Frente e trás" value={piece.pos[2]} min={-8} max={8} step={0.01} unit="cm" nudge={0.1} onChange={v => patch(p => void (p.pos[2] = v))} onCommit={commit} />
        <Slider id="f-py" label="Altura" value={piece.pos[1]} min={-1} max={8} step={0.01} unit="cm" nudge={0.05} onChange={v => patch(p => void (p.pos[1] = v))} onCommit={commit} />
        <div className="btns">
          <button type="button" className="btn" onClick={sitSelected}>
            Assentar na mesa
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              patch(p => {
                p.pos[0] = 0;
                p.pos[2] = 0;
              });
              commit();
            }}
          >
            Trazer ao centro
          </button>
        </div>
      </Section>

      <Section title="Girar e tamanho">
        <Slider id="f-ry" label="Girar no lugar" value={piece.rot[1]} min={-180} max={180} step={1} unit="°" nudge={15} onChange={v => patch(p => void (p.rot[1] = v))} onCommit={commit} />
        <Slider id="f-rx" label="Inclinar para frente" value={piece.rot[0]} min={-180} max={180} step={1} unit="°" nudge={15} onChange={v => patch(p => void (p.rot[0] = v))} onCommit={commit} />
        <Slider id="f-rz" label="Inclinar para o lado" value={piece.rot[2]} min={-180} max={180} step={1} unit="°" nudge={15} onChange={v => patch(p => void (p.rot[2] = v))} onCommit={commit} />
        <Slider id="f-sc" label="Tamanho geral" value={piece.scale} min={0.1} max={4} step={0.01} unit="×" nudge={0.1} onChange={v => patch(p => void (p.scale = v))} onCommit={commit} />
        <div className="btns">
          <button type="button" className="btn" onClick={() => rotateSelected(45)}>
            Girar 45°
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              patch(p => {
                p.rot = [0, 0, 0];
              });
              commit();
            }}
          >
            Endireitar
          </button>
        </div>
      </Section>

      <section className="sec">
        <div className="btns">
          <button type="button" className="btn" onClick={() => useStore.getState().duplicate(piece.id)}>
            Duplicar
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              const st = useStore.getState();
              st.remove(piece.id);
              st.notify('Peça apagada. Desfazer traz de volta.');
            }}
          >
            Apagar peça
          </button>
        </div>
      </section>
    </>
  );
}
