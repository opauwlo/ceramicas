import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { downloadBlob, stamp } from '../lib/download';
import { useStore } from '../state/store';
import { Icon } from '../ui/icons';
import { ModeSwitch } from '../ui/ModeSwitch';
import { PhotoDialog, ToastView } from '../ui/Overlay';
import { feel } from './feel';
import { createClayApp, type ClayApp } from './scene';
import { useClay } from './state';

/** Tintas para pingar na massa, como guache em porcelana fria. */
const TINTAS: ReadonlyArray<readonly [string, string]> = [
  ['#e0473c', 'Vermelho'],
  ['#f08a3c', 'Laranja'],
  ['#f2c84b', 'Amarelo'],
  ['#5bb55c', 'Verde'],
  ['#3f7fd6', 'Azul'],
  ['#8a5cc7', 'Roxo'],
  ['#ef8fb3', 'Rosa'],
  ['#8b5a3c', 'Marrom'],
  ['#2a2626', 'Preto'],
  ['#ffffff', 'Branco'],
];

const DICAS: ReadonlyArray<readonly [string, string]> = [
  ['Aperte', 'Encoste e segure. O dedo afunda e a massa estufa em volta.'],
  ['Arraste', 'A massa (e a cor) vai junto com o dedo.'],
  ['Esfregue', 'Vai e volta rapidinho no mesmo lugar: alisa.'],
  ['Belisque', 'Dois dedos na massa, juntando: puxa uma ponta. Afastando: achata.'],
  ['Pingue tinta', 'Escolha uma cor, toque na massa e sove até misturar.'],
  ['Gire', 'Arraste fora da massa para girar a tábua. Dois dedos aproximam.'],
];

/** Sovar: uma bola de massa para apertar, arrastar, beliscar, alisar e tingir com o dedo. */
export function ClayScreen() {
  const host = useRef<HTMLDivElement>(null);
  const app = useRef<ClayApp | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const a = createClayApp(host.current);
    app.current = a;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) a.redo();
        else a.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        a.redo();
      } else if (e.key === 'Escape') {
        const s = useStore.getState();
        if (s.photo) s.setPhoto(null);
        else useClay.getState().set({ drop: null, coach: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      a.dispose();
      app.current = null;
    };
  }, []);

  return (
    <div className="clay">
      <ClayTop app={app} />
      <main className="clay-view" ref={host}>
        <Doing />
        <ToastView />
      </main>
      <ClayBar app={app} />
      <Coach />
      <PhotoDialog />
    </div>
  );
}

type AppRef = RefObject<ClayApp | null>;

function ClayTop({ app }: { app: AppRef }) {
  const canUndo = useClay(s => s.canUndo);
  const canRedo = useClay(s => s.canRedo);
  const sound = useClay(s => s.sound);
  return (
    <header className="top">
      <div className="brand">
        <Icon.mark />
        <span>Ateliê de Argila</span>
      </div>
      <ModeSwitch />
      <button type="button" className="ib" aria-label="Desfazer" title="Desfazer" disabled={!canUndo} onClick={() => app.current?.undo()}>
        <Icon.undo />
      </button>
      <button type="button" className="ib" aria-label="Refazer" title="Refazer" disabled={!canRedo} onClick={() => app.current?.redo()}>
        <Icon.redo />
      </button>
      <button
        type="button"
        className="ib"
        aria-label={sound ? 'Tirar o som' : 'Ligar o som'}
        title={sound ? 'Tirar o som' : 'Ligar o som'}
        aria-pressed={!sound}
        onClick={() => {
          const on = !useClay.getState().sound;
          feel.setSound(on);
          useClay.getState().set({ sound: on });
          try {
            localStorage.setItem('atelie-massa-som', on ? '1' : '0');
          } catch {
            // tudo bem
          }
        }}
      >
        {sound ? <Icon.sound /> : <Icon.mute />}
      </button>
      <button
        type="button"
        className="btn primary sm"
        onClick={() => {
          const url = app.current?.photo();
          if (url && url.length > 100) useStore.getState().setPhoto(url);
          else useStore.getState().notify('Não consegui tirar a foto. Tente de novo.');
        }}
      >
        <Icon.camera />
        <span className="foto-tx">Foto</span>
      </button>
    </header>
  );
}

/** Recadinho do que o dedo está fazendo, no alto da mesa. */
function Doing() {
  const doing = useClay(s => s.doing);
  const drop = useClay(s => s.drop);
  const text = doing ? `${doing}…` : drop ? 'toque na massa para pingar a tinta' : '';
  if (!text) return null;
  return (
    <div className="doing" key={text} aria-live="polite">
      {text}
    </div>
  );
}

function ClayBar({ app }: { app: AppRef }) {
  const drop = useClay(s => s.drop);
  const grams = useClay(s => s.grams);
  return (
    <section className="claybar" aria-label="Tintas e massa">
      <div className="tintas" role="group" aria-label="Pingos de tinta">
        {TINTAS.map(([c, name]) => (
          <button
            key={c}
            type="button"
            className="pingo"
            style={{ '--c': c } as CSSProperties}
            aria-label={`Pingo de ${name.toLowerCase()}`}
            title={name}
            aria-pressed={drop === c}
            onClick={() => {
              feel.tick(5);
              useClay.getState().set({ drop: drop === c ? null : c });
            }}
          />
        ))}
      </div>
      <div className="claybar-row">
        <span className="chip">≈ {Math.round(grams)} g de massa</span>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            app.current?.fresh();
            useClay.getState().set({ drop: null });
            useStore.getState().notify('Massa nova na tábua. Desfazer traz a outra de volta.');
          }}
        >
          <Icon.blob />
          Massa nova
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            const b = app.current?.stl();
            if (b) downloadBlob(b, `massa-${stamp()}.stl`);
          }}
        >
          STL
        </button>
        <button type="button" className="ib" aria-label="Como sovar" title="Como sovar" onClick={() => useClay.getState().set({ coach: true })}>
          <Icon.help />
        </button>
      </div>
    </section>
  );
}

function Coach() {
  const open = useClay(s => s.coach);
  if (!open) return null;
  const close = () => {
    useClay.getState().set({ coach: false });
    try {
      localStorage.setItem('atelie-massa-dicas', '1');
    } catch {
      // tudo bem
    }
  };
  return (
    <div className="coach" role="dialog" aria-modal="true" aria-label="Como sovar" onClick={e => e.target === e.currentTarget && close()}>
      <div className="coach-box">
        <span className="buddy" aria-hidden="true">
          <Icon.mark />
        </span>
        <h2>Sove com o dedo</h2>
        <ul>
          {DICAS.map(([t, d]) => (
            <li key={t}>
              <b>{t}</b> {d}
            </li>
          ))}
        </ul>
        <button type="button" className="btn primary" onClick={close}>
          Bora sovar!
        </button>
      </div>
    </div>
  );
}
