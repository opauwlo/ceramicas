import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { downloadBlob, stamp } from '../lib/download';
import { useStore } from '../state/store';
import { Icon } from '../ui/icons';
import { ModeSwitch } from '../ui/ModeSwitch';
import { PhotoDialog, ToastView } from '../ui/Overlay';
import { CUTTERS } from './cutters';
import { feel } from './feel';
import { createClayApp, type ClayApp } from './scene';
import { useClay, type ClayTool, type Nivel, type Size3 } from './state';
import { CutterIcon, ToolIcon } from './ToolIcons';

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

/** A bancada, em grupos, com o recado que aparece ao pegar cada ferramenta. */
const BANCADA: ReadonlyArray<readonly [string, ReadonlyArray<readonly [ClayTool, string, string]>]> = [
  [
    'Modelar',
    [
      ['dedo', 'Dedo', 'Aperte, arraste e esfregue. Dois dedos na massa beliscam.'],
      ['rolo', 'Rolo', 'Toque para o rolo passar e abrir a massa. Segure para continuar rolando.'],
      ['boleador', 'Boleador', 'Toque onde quer o buraquinho; arraste para um sulco. O ímã acerta o lugar.'],
      ['silicone', 'Silicone', 'Arraste em cima da massa para unir emendas e esfumar.'],
    ],
  ],
  [
    'Cortar e marcar',
    [
      ['espatula', 'Espátula', 'Risque onde quer cortar e solte. O ímã endireita a linha.'],
      ['esteca', 'Esteca', 'Risque na massa e solte. Quase reto vira reta; uma volta vira círculo.'],
      ['cortador', 'Cortador', 'Toque na massa e solte para cortar. O ímã puxa para o meio.'],
    ],
  ],
  [
    'Acabamento',
    [
      ['agua', 'Pincel d’água', 'Pincele para tirar marquinhas. A massa fica molhada e seca sozinha.'],
      ['esponja', 'Esponja', 'Passe a esponja úmida para deixar tudo lisinho.'],
      ['lixa', 'Lixa', 'Lixe para acertar bordas. Tira um pouquinho de massa e o verniz.'],
    ],
  ],
  [
    'Cor',
    [
      ['tinta', 'Tinta', 'Pingo: pingue e sove para tingir a massa. Pincel: pinte por cima.'],
      ['verniz', 'Verniz', 'Pincele verniz para dar brilho. No fosco, tira o brilho.'],
    ],
  ],
];

const HINT = new Map(BANCADA.flatMap(([, ts]) => ts.map(([t, , h]) => [t, h] as const)));

const DICAS: ReadonlyArray<readonly [string, string]> = [
  ['Escolha e toque', 'A ferramenta fica do lado da massa. Um toque e ela vai lá, trabalha e volta.'],
  ['Ímã', 'Enquanto o dedo está na tela aparece a sugestão: meio da massa, grade de 0,5 cm, reta ou círculo. Soltou, ela age.'],
  ['Rolo e niveladores', 'Cada toque é uma passada. Os niveladores de 3, 5 ou 8 mm seguram a espessura.'],
  ['Dedo', 'Aperte e segure, arraste, esfregue. Dois dedos na massa beliscam.'],
  ['Acabamento e cor', 'Pincéis, esponja e lixa vêm até o dedo. Pingue tinta e sove, ou pinte por cima.'],
  ['Bailarina', 'Arraste fora da massa para girar, ou toque em Girar para um quarto de volta.'],
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
        else useClay.getState().set({ tool: 'dedo', coach: false });
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

/** Recadinho do que a ferramenta está fazendo, no alto da mesa. */
function Doing() {
  const doing = useClay(s => s.doing);
  if (!doing) return null;
  return (
    <div className="doing" key={doing} aria-live="polite">
      {doing}…
    </div>
  );
}

function pick(tool: ClayTool) {
  const s = useClay.getState();
  feel.tick(5);
  s.set({ tool });
  const h = HINT.get(tool);
  if (h) useStore.getState().notify(h);
}

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<readonly [T, string]>; onChange(v: T): void }) {
  return (
    <div className="opt-seg" role="group" aria-label={label}>
      {options.map(([k, t]) => (
        <button
          key={String(k)}
          type="button"
          aria-pressed={value === k}
          onClick={() => {
            feel.tick(4);
            onChange(k);
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const SIZES: ReadonlyArray<readonly [Size3, string]> = [
  ['P', 'P'],
  ['M', 'M'],
  ['G', 'G'],
];

/** Opções da ferramenta escolhida, logo acima da bancada. */
function ToolOptions() {
  const s = useClay();
  const set = s.set;
  switch (s.tool) {
    case 'rolo':
      return (
        <div className="opts">
          <span className="opt-label">Niveladores</span>
          <Seg<Nivel>
            label="Espessura dos niveladores"
            value={s.nivel}
            options={[
              [0, 'Sem'],
              [3, '3 mm'],
              [5, '5 mm'],
              [8, '8 mm'],
            ]}
            onChange={nivel => set({ nivel })}
          />
        </div>
      );
    case 'boleador':
      return (
        <div className="opts">
          <span className="opt-label">Bolinha</span>
          <Seg<Size3> label="Tamanho da bolinha" value={s.bol} options={SIZES} onChange={bol => set({ bol })} />
        </div>
      );
    case 'esteca':
      return (
        <div className="opts">
          <span className="opt-label">Ponta</span>
          <Seg
            label="Ponta da esteca"
            value={s.esteca}
            options={[
              ['fina', 'Fina'],
              ['grossa', 'Grossa'],
            ]}
            onChange={esteca => set({ esteca })}
          />
        </div>
      );
    case 'cortador':
      return (
        <div className="opts">
          <div className="opt-shapes" role="group" aria-label="Formato do cortador">
            {CUTTERS.map(([k, name]) => (
              <button
                key={k}
                type="button"
                aria-label={name}
                title={name}
                aria-pressed={s.cutter === k}
                onClick={() => {
                  feel.tick(4);
                  set({ cutter: k });
                }}
              >
                <CutterIcon shape={k} />
              </button>
            ))}
          </div>
          <Seg<Size3> label="Tamanho do cortador" value={s.cutterSize} options={SIZES} onChange={cutterSize => set({ cutterSize })} />
        </div>
      );
    case 'tinta':
      return (
        <div className="opts">
          <Seg
            label="Jeito de usar a tinta"
            value={s.tintaModo}
            options={[
              ['pingo', 'Pingo'],
              ['pincel', 'Pincel'],
            ]}
            onChange={tintaModo => set({ tintaModo })}
          />
          <div className="tintas" role="group" aria-label="Cor da tinta">
            {TINTAS.map(([c, name]) => (
              <button
                key={c}
                type="button"
                className="pingo"
                style={{ '--c': c } as CSSProperties}
                aria-label={name}
                title={name}
                aria-pressed={s.color === c}
                onClick={() => {
                  feel.tick(5);
                  set({ color: c });
                }}
              />
            ))}
          </div>
        </div>
      );
    case 'verniz':
      return (
        <div className="opts">
          <Seg
            label="Acabamento do verniz"
            value={s.verniz}
            options={[
              ['brilho', 'Brilho'],
              ['fosco', 'Fosco'],
            ]}
            onChange={verniz => set({ verniz })}
          />
        </div>
      );
    default:
      return <p className="opts opt-hint">{HINT.get(s.tool)}</p>;
  }
}

function ClayBar({ app }: { app: AppRef }) {
  const tool = useClay(s => s.tool);
  const color = useClay(s => s.color);
  const grams = useClay(s => s.grams);
  const spinning = useClay(s => s.spinning);
  return (
    <section className="claybar" aria-label="Bancada de ferramentas">
      <ToolOptions />
      <div className="tooltray" role="toolbar" aria-label="Ferramentas">
        {BANCADA.map(([group, tools]) => (
          <div className="toolgroup" key={group} role="group" aria-label={group}>
            <span className="toolgroup-name" aria-hidden="true">
              {group}
            </span>
            <div className="toolgroup-row">
              {tools.map(([t, label]) => (
                <button key={t} type="button" className="tool" aria-pressed={tool === t} onClick={() => pick(t)}>
                  <ToolIcon tool={t} color={t === 'tinta' ? color : undefined} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="claybar-row">
        <span className="chip">≈ {Math.round(grams)} g</span>
        <button type="button" className={`btn sm${spinning ? ' on' : ''}`} title="Um quarto de volta na bailarina" onClick={() => app.current?.spin()}>
          <Icon.spin />
          Girar
        </button>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            app.current?.fresh();
            useStore.getState().notify('Massa nova na bancada. Desfazer traz a outra de volta.');
          }}
        >
          <Icon.blob />
          Nova
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
        <button type="button" className="ib" aria-label="Como usar a bancada" title="Como usar a bancada" onClick={() => useClay.getState().set({ coach: true })}>
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
      localStorage.setItem('atelie-massa-dicas', '2');
    } catch {
      // tudo bem
    }
  };
  return (
    <div className="coach" role="dialog" aria-modal="true" aria-label="Como usar a bancada" onClick={e => e.target === e.currentTarget && close()}>
      <div className="coach-box">
        <span className="buddy" aria-hidden="true">
          <Icon.mark />
        </span>
        <h2>Sua bancada de cerâmica fria</h2>
        <ul>
          {DICAS.map(([t, d]) => (
            <li key={t}>
              <b>{t}</b> {d}
            </li>
          ))}
        </ul>
        <button type="button" className="btn primary" onClick={close}>
          Bora modelar!
        </button>
      </div>
    </div>
  );
}
