import { FINISHES, SWATCHES } from '../../model/spec';
import type { Finish, Piece, Surface } from '../../model/types';
import { useStore } from '../../state/store';
import { ColorField, Section, Segmented, Slider, TextField, Toggle } from '../controls';
import { NoSelection } from './NoSelection';

export function PaintTab() {
  const piece = useStore(s => s.doc.pieces.find(p => p.id === s.selectedId));
  if (!piece) return <NoSelection />;
  return <PaintEditor piece={piece} />;
}

function PaintEditor({ piece }: { piece: Piece }) {
  const s = useStore.getState();
  const patch = (fn: (p: Piece) => void) => s.patchPiece(piece.id, fn);
  const commit = () => useStore.getState().commit();
  const soon = () => useStore.getState().commitSoon();
  const surf = (fn: (x: Surface) => void) =>
    patch(p => {
      if (p.s) fn(p.s);
    });

  return (
    <>
      <Section title={`Cor de ${piece.name}`}>
        <div className="swatches">
          {SWATCHES.map(([hex, name]) => (
            <button
              key={hex}
              type="button"
              className={`swb${hex === piece.color ? ' on' : ''}`}
              style={{ background: hex }}
              aria-label={name}
              title={name}
              onClick={() => {
                patch(p => void (p.color = hex));
                commit();
              }}
            />
          ))}
        </div>
        <ColorField
          id="f-cor"
          label="Outra cor"
          value={piece.color}
          onChange={v => {
            patch(p => void (p.color = v));
            soon();
          }}
        />
      </Section>

      <Section title="Acabamento">
        <Segmented<Finish>
          label="Acabamento"
          value={piece.finish}
          options={FINISHES}
          onChange={v => {
            patch(p => void (p.finish = v));
            commit();
          }}
        />
        <Slider id="f-clay" label="Textura da argila" value={piece.clay} min={0} max={1} step={0.01} unit="%" nudge={0.1} onChange={v => patch(p => void (p.clay = v))} onCommit={commit} />
      </Section>

      {piece.s ? (
        <DiscSurface s={piece.s} surf={surf} commit={commit} soon={soon} />
      ) : (
        <section className="sec">
          <p className="hint">Ondas em relevo, anéis pintados, sulcos e rótulo ficam nas peças do tipo Disco.</p>
        </section>
      )}
    </>
  );
}

function DiscSurface({ s, surf, commit, soon }: { s: Surface; surf: (fn: (x: Surface) => void) => void; commit(): void; soon(): void }) {
  const tog = (fn: (x: Surface) => void) => {
    surf(fn);
    commit();
  };
  return (
    <>
      <Section title="Ondas em relevo">
        <Slider id="f-amp" label="Altura das ondas" value={s.amp} min={0} max={0.15} step={0.005} unit="cmmm" onChange={v => surf(x => void (x.amp = v))} onCommit={commit} />
        <Slider id="f-qtd" label="Quantidade" value={s.qtd} min={1} max={16} step={1} unit="" onChange={v => surf(x => void (x.qtd = v))} onCommit={commit} />
        <Slider id="f-ini" label="Distância do centro" value={s.inicio} min={0} max={0.8} step={0.01} unit="%" nudge={0.05} onChange={v => surf(x => void (x.inicio = v))} onCommit={commit} />
        <Slider id="f-cra" label="Afundar o centro" value={s.cratera} min={0} max={0.3} step={0.005} unit="cmmm" onChange={v => surf(x => void (x.cratera = v))} onCommit={commit} />
      </Section>

      <Section title="Anéis pintados">
        <Toggle id="f-an" label="Pintar anéis" checked={s.aneis.on} onChange={v => tog(x => void (x.aneis.on = v))} />
        {s.aneis.on && (
          <div className="sub">
            <ColorField
              id="f-anc"
              label="Cor da tinta"
              value={s.aneis.cor}
              onChange={v => {
                surf(x => void (x.aneis.cor = v));
                soon();
              }}
            />
            <Slider id="f-anq" label="Quantidade" value={s.aneis.qtd} min={1} max={12} step={1} unit="" onChange={v => surf(x => void (x.aneis.qtd = v))} onCommit={commit} />
            <Slider id="f-ane" label="Espessura do traço" value={s.aneis.esp} min={0.1} max={1.5} step={0.05} unit="mm" onChange={v => surf(x => void (x.aneis.esp = v))} onCommit={commit} />
            <Slider id="f-ani" label="Distância do centro" value={s.aneis.inicio} min={0} max={0.8} step={0.01} unit="%" nudge={0.05} onChange={v => surf(x => void (x.aneis.inicio = v))} onCommit={commit} />
            <Toggle id="f-anm" label="Traço quebrado, feito à mão" checked={s.aneis.mao} onChange={v => tog(x => void (x.aneis.mao = v))} />
          </div>
        )}
      </Section>

      <Section title="Sulcos e rótulo">
        <Toggle id="f-sul" label="Sulcos finos de vinil" checked={s.sulcos} onChange={v => tog(x => void (x.sulcos = v))} />
        <Toggle id="f-rot" label="Rótulo pintado no centro" checked={s.rotulo.on} onChange={v => tog(x => void (x.rotulo.on = v))} />
        {s.rotulo.on && (
          <div className="sub">
            <ColorField
              id="f-rc"
              label="Cor do rótulo"
              value={s.rotulo.cor}
              onChange={v => {
                surf(x => void (x.rotulo.cor = v));
                soon();
              }}
            />
            <Slider id="f-rt" label="Tamanho" value={s.rotulo.tam} min={0.05} max={0.6} step={0.01} unit="%" nudge={0.05} onChange={v => surf(x => void (x.rotulo.tam = v))} onCommit={commit} />
            <TextField
              id="f-rtx"
              label="Texto ou letra"
              value={s.rotulo.texto}
              placeholder="Deixe vazio para liso"
              maxLength={12}
              onChange={v => {
                surf(x => void (x.rotulo.texto = v));
                soon();
              }}
            />
            <ColorField
              id="f-rtc"
              label="Cor do texto"
              value={s.rotulo.corTexto}
              onChange={v => {
                surf(x => void (x.rotulo.corTexto = v));
                soon();
              }}
            />
          </div>
        )}
      </Section>
    </>
  );
}
