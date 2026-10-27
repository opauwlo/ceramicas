import { useRef, useState } from 'react';
import { listSaved, writeSaved, type SavedModel } from '../../lib/storage';
import { normalizeDoc } from '../../model/spec';
import { TEMPLATES, type TemplateKey } from '../../model/templates';
import type { Doc } from '../../model/types';
import { useStore } from '../../state/store';
import { downloadDoc, downloadSTL, frameSoon, takePhoto } from '../actions';
import { Section } from '../controls';

function openDoc(doc: Doc, msg: string) {
  const s = useStore.getState();
  s.loadDoc(doc);
  frameSoon();
  s.notify(msg);
}

export function FileTab() {
  const [saved, setSaved] = useState<SavedModel[]>(() => listSaved());
  const [name, setName] = useState('');
  const [armed, setArmed] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const s = useStore.getState();
    s.commit();
    const nome = name.trim() || `Modelo ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    const item: SavedModel = { nome, quando: new Date().toLocaleDateString('pt-BR'), doc: s.doc };
    const next = [item, ...saved.filter(m => m.nome !== nome)];
    if (writeSaved(next)) {
      setSaved(next);
      setName('');
      s.notify('Salvo neste aparelho');
    } else s.notify('O navegador não deixou salvar. Baixe o arquivo para guardar.');
  };

  const removeSaved = (i: number) => {
    if (armed !== i) {
      setArmed(i);
      return;
    }
    const next = saved.filter((_, j) => j !== i);
    writeSaved(next);
    setSaved(next);
    setArmed(null);
    useStore.getState().notify('Modelo apagado');
  };

  const importText = (text: string): boolean => {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setError('Esse texto não é um modelo. Copie de novo pelo botão Copiar código.');
      return false;
    }
    const doc = normalizeDoc(raw);
    if (!doc) {
      setError('O modelo não tem peças. Confira se o código veio inteiro.');
      return false;
    }
    setError('');
    openDoc(doc, 'Modelo aberto');
    return true;
  };

  const copyCode = async () => {
    const text = JSON.stringify(useStore.getState().doc);
    try {
      await navigator.clipboard.writeText(text);
      useStore.getState().notify('Código copiado');
    } catch {
      setCode(text);
      useStore.getState().notify('Selecione o texto da caixa e copie');
    }
  };

  return (
    <>
      <Section title="Modelos prontos">
        <div className="cards">
          {(Object.keys(TEMPLATES) as TemplateKey[]).map(k => (
            <div key={k} className="card">
              <div>
                <b>{TEMPLATES[k].nome}</b>
                <p>{TEMPLATES[k].desc}</p>
              </div>
              <button type="button" className="btn" onClick={() => openDoc(TEMPLATES[k].build(), `${TEMPLATES[k].nome} na mesa`)}>
                Abrir
              </button>
            </div>
          ))}
        </div>
        <p className="hint">Abrir um modelo troca o que está na mesa. O botão desfazer traz de volta.</p>
      </Section>

      <Section title="Meus modelos">
        <form
          className="saverow"
          onSubmit={e => {
            e.preventDefault();
            save();
          }}
        >
          <label className="sr" htmlFor="f-salvar">
            Nome do modelo
          </label>
          <input id="f-salvar" type="text" placeholder="Peça do livro" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
          <button type="submit" className="btn primary">
            Salvar
          </button>
        </form>
        {saved.length ? (
          <ul className="list">
            {saved.map((m, i) => (
              <li key={`${m.nome}-${i}`} className="row">
                <div className="row-main static">
                  <span className="rn">
                    <span className="nm">{m.nome}</span>
                    <span className="meta">
                      {m.quando} · {m.doc.pieces.length} peças
                    </span>
                  </span>
                </div>
                <button type="button" className="btn sm" onClick={() => openDoc(m.doc, `${m.nome} na mesa`)}>
                  Abrir
                </button>
                <button type="button" className={`btn sm ${armed === i ? 'danger' : 'ghost'}`} onClick={() => removeSaved(i)}>
                  {armed === i ? 'Confirmar' : 'Apagar'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nada salvo ainda. Os modelos ficam guardados neste aparelho, neste navegador.</p>
        )}
      </Section>

      <Section title="Baixar">
        <div className="btns">
          <button type="button" className="btn" onClick={takePhoto}>
            Foto (PNG)
          </button>
          <button type="button" className="btn" onClick={() => downloadDoc(useStore.getState().doc, name || 'modelo')}>
            Arquivo do modelo
          </button>
          <button type="button" className="btn" onClick={downloadSTL}>
            STL para impressão 3D
          </button>
        </div>
        <p className="hint">O arquivo do modelo abre aqui de novo, em qualquer aparelho. O STL sai em milímetros.</p>
      </Section>

      <Section title="Abrir">
        <div className="btns">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Abrir arquivo do modelo
          </button>
          <button type="button" className="btn" onClick={copyCode}>
            Copiar código
          </button>
        </div>
        <input
          ref={fileRef}
          className="sr"
          type="file"
          accept=".json,application/json"
          aria-label="Escolher arquivo do modelo"
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) importText(await f.text());
          }}
        />
        <label className="sr" htmlFor="f-codigo">
          Código do modelo
        </label>
        <textarea
          id="f-codigo"
          rows={3}
          placeholder="Ou cole aqui o código de um modelo"
          value={code}
          onChange={e => {
            setCode(e.target.value);
            setError('');
          }}
        />
        {error && <p className="err">{error}</p>}
        <div className="btns">
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!code.trim()) setError('Cole o código de um modelo na caixa acima.');
              else if (importText(code)) setCode('');
            }}
          >
            Abrir código colado
          </button>
        </div>
      </Section>
    </>
  );
}
