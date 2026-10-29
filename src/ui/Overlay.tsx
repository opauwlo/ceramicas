import { useEffect, useState, type ComponentType } from 'react';
import { dims, grams } from '../lib/format';
import { DENSITY, isClay, SPEC, SWATCHES } from '../model/spec';
import { topOf } from '../scene/bridge';
import { useMetrics, useStore, type Tool } from '../state/store';
import { downloadPhoto, mirrorSelected, rotateSelected, sharePhoto, sitSelected, takePhoto } from './actions';
import { Icon, ShapeIcon } from './icons';

export function TopBar() {
  return (
    <header className="top">
      <div className="brand">
        <Icon.mark />
        <span>Ateliê de Argila</span>
      </div>
      <button
        type="button"
        className="ib"
        aria-label="Desfazer"
        title="Desfazer"
        onClick={() => {
          const s = useStore.getState();
          if (!s.undo()) s.notify('Nada para desfazer');
        }}
      >
        <Icon.undo />
      </button>
      <button
        type="button"
        className="ib"
        aria-label="Refazer"
        title="Refazer"
        onClick={() => {
          const s = useStore.getState();
          if (!s.redo()) s.notify('Nada para refazer');
        }}
      >
        <Icon.redo />
      </button>
      <button type="button" className="btn primary sm" onClick={takePhoto}>
        <Icon.camera />
        Foto
      </button>
    </header>
  );
}

const TOOLS: ReadonlyArray<readonly [Tool, string, ComponentType, string]> = [
  ['mover', 'Mover', Icon.move, 'Mover: arraste a peça pela mesa.'],
  ['amassar', 'Amassar', Icon.press, 'Amassar: arraste a peça para baixo para achatar, para cima para esticar. A massa não some, o volume fica igual.'],
  ['girar', 'Girar', Icon.spin, 'Girar: arraste para os lados, como no torno. Solte com embalo e ela continua girando.'],
  ['alisar', 'Alisar', Icon.smooth, 'Alisar: esfregue o dedo na peça, para lá e para cá.'],
  ['pintar', 'Pintar', Icon.brush, 'Pintar: escolha a cor embaixo e toque nas peças. Passe o dedo para pintar várias.'],
];

/** As mãos: o que o dedo faz ao tocar numa peça. */
export function ToolBelt() {
  const tool = useStore(s => s.tool);
  return (
    <div className="tools" role="toolbar" aria-label="Mãos">
      {TOOLS.map(([k, label, Ico, hint]) => (
        <button
          key={k}
          type="button"
          aria-pressed={tool === k}
          title={hint}
          onClick={() => {
            const s = useStore.getState();
            s.setTool(k);
            s.notify(hint);
          }}
        >
          <Ico />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Paleta da mão Pintar, embaixo da mesa. */
export function PaintBar() {
  const tool = useStore(s => s.tool);
  const brush = useStore(s => s.brush);
  const placing = useStore(s => s.placing);
  if (tool !== 'pintar' || placing) return null;
  const custom = !SWATCHES.some(([c]) => c === brush);
  return (
    <div className="paintbar" role="group" aria-label="Cor do pincel">
      {SWATCHES.map(([c, name]) => (
        <button key={c} type="button" className="dot" style={{ background: c }} aria-label={name} title={name} aria-pressed={brush === c} onClick={() => useStore.getState().setBrush(c)} />
      ))}
      <label className="dot custom" title="Outra cor" aria-pressed={custom} style={custom ? { background: brush } : undefined}>
        <span className="sr">Outra cor</span>
        <input type="color" value={brush} onChange={e => useStore.getState().setBrush(e.target.value)} />
      </label>
    </div>
  );
}

/** Aviso enquanto uma peça escolhida espera o toque na mesa para grudar. */
export function PlaceBanner() {
  const placing = useStore(s => s.placing);
  if (!placing) return null;
  const sp = SPEC[placing];
  return (
    <div className="placing" role="status">
      <span className="placing-ic" aria-hidden="true">
        <ShapeIcon type={placing} fill={sp.color} face />
      </span>
      <span className="placing-tx">
        Toque na mesa ou numa peça para grudar: <b>{sp.label}</b>
      </span>
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          const s = useStore.getState();
          s.setPlacing(null);
          s.addPiece(placing, topOf(s.selectedId));
          s.notify(`Plop! ${sp.label} na mesa.`);
        }}
      >
        Pôr direto
      </button>
      <button type="button" className="ib" aria-label="Cancelar" title="Cancelar" onClick={() => useStore.getState().setPlacing(null)}>
        <Icon.close />
      </button>
    </div>
  );
}

/** Atalhos que aparecem na mesa quando há uma peça selecionada. */
export function QuickBar() {
  const piece = useStore(s => s.doc.pieces.find(p => p.id === s.selectedId));
  if (!piece) return null;
  return (
    <div className="quick" role="toolbar" aria-label={`Ações para ${piece.name}`}>
      <button type="button" onClick={() => rotateSelected(15)}>
        <Icon.rotate />
        +15°
      </button>
      <button type="button" onClick={mirrorSelected}>
        <Icon.mirror />
        Espelhar
      </button>
      <button type="button" onClick={sitSelected}>
        <Icon.down />
        Assentar
      </button>
      <button type="button" onClick={() => useStore.getState().duplicate(piece.id)}>
        <Icon.copy />
        Duplicar
      </button>
      <button
        type="button"
        onClick={() => {
          const s = useStore.getState();
          s.remove(piece.id);
          s.notify('Peça apagada. Desfazer traz de volta.');
        }}
      >
        <Icon.trash />
        Apagar
      </button>
    </div>
  );
}

export function InfoChips() {
  const busy = useStore(s => s.tool === 'pintar' || s.placing !== null);
  const pieces = useStore(s => s.doc.pieces);
  const sel = useStore(s => s.selectedId);
  const m = useMetrics(s => s.m);
  const piece = pieces.find(p => p.id === sel);
  if (busy) return null;
  const total = pieces.reduce((acc, p) => acc + (p.visible && isClay(p) && m[p.id] ? m[p.id].vol * DENSITY : 0), 0);
  const pm = piece ? m[piece.id] : undefined;
  return (
    <div className="info" aria-live="polite">
      {piece && (
        <div className="chip">
          <b>{piece.name}</b>
          {pm ? dims(pm.size) : ''}
          {pm && isClay(piece) ? ` · ${grams(pm.vol * DENSITY)}` : ''}
        </div>
      )}
      <div className="chip">{pieces.length ? `Peça inteira ${grams(total)} de massa` : 'Mesa vazia'}</div>
    </div>
  );
}

export function ToastView() {
  const toast = useStore(s => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    // recado comprido fica mais tempo na tela
    const t = setTimeout(() => setVisible(false), Math.max(2600, toast.msg.length * 60));
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className="toast" role="status" key={toast?.id} hidden={!visible || !toast}>
      {toast?.msg}
    </div>
  );
}

export function PhotoDialog() {
  const url = useStore(s => s.photo);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);
  if (!url) return null;
  const close = () => useStore.getState().setPhoto(null);
  return (
    <div className="foto" role="dialog" aria-modal="true" aria-label="Foto da peça" onClick={e => e.target === e.currentTarget && close()}>
      <div className="foto-box">
        <img src={url} alt="Foto da peça montada" />
        <div className="btns">
          <button type="button" className="btn primary" onClick={() => downloadPhoto(url)}>
            Baixar foto
          </button>
          {canShare && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!(await sharePhoto(url))) useStore.getState().notify('Este aparelho não compartilhou a imagem. Use Baixar foto.');
              }}
            >
              Compartilhar
            </button>
          )}
          <button type="button" className="btn ghost" onClick={close}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
