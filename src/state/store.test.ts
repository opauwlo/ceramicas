import { beforeEach, describe, expect, it } from 'vitest';
import { TEMPLATES } from '../model/templates';
import { useStore } from './store';

const st = () => useStore.getState();

beforeEach(() => {
  st().init(TEMPLATES.branco.build());
});

describe('histórico', () => {
  it('desfaz e refaz uma peça nova', () => {
    const before = st().doc.pieces.length;
    const id = st().addPiece('gota');
    expect(st().doc.pieces).toHaveLength(before + 1);
    expect(st().selectedId).toBe(id);

    expect(st().undo()).toBe(true);
    expect(st().doc.pieces).toHaveLength(before);
    expect(st().selectedId).toBeNull();

    expect(st().redo()).toBe(true);
    expect(st().doc.pieces).toHaveLength(before + 1);
  });

  it('agrupa um arraste inteiro num passo só', () => {
    const id = st().doc.pieces[0].id;
    for (let i = 1; i <= 10; i++) st().movePiece(id, [i, 0, 0]);
    st().commit();
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().doc.pieces[0].pos).toEqual([0, 0, 0]);
  });

  it('não grava passo quando nada mudou', () => {
    st().commit();
    st().commit();
    expect(st().past).toHaveLength(0);
    expect(st().undo()).toBe(false);
  });

  it('desfazer grava antes uma edição ainda não registrada', () => {
    const id = st().doc.pieces[0].id;
    st().patchPiece(id, p => {
      p.color = '#123456';
    });
    expect(st().undo()).toBe(true);
    expect(st().doc.pieces[0].color).not.toBe('#123456');
    expect(st().redo()).toBe(true);
    expect(st().doc.pieces[0].color).toBe('#123456');
  });

  it('abrir outro modelo pode ser desfeito', () => {
    const first = st().doc;
    st().loadDoc(TEMPLATES.vinilAgua.build());
    expect(st().doc.bg).toBe('agua');
    st().undo();
    expect(st().doc).toEqual(first);
  });
});

describe('peças', () => {
  it('editar uma peça não muda a referência das outras', () => {
    st().addPiece('cone');
    const [a, b] = st().doc.pieces;
    st().patchPiece(b.id, p => {
      p.scale = 2;
    });
    expect(st().doc.pieces[0]).toBe(a);
    expect(st().doc.pieces[1]).not.toBe(b);
  });

  it('duplica com id novo e um pouco ao lado', () => {
    const src = st().doc.pieces[0];
    st().duplicate(src.id);
    const copy = st().doc.pieces[1];
    expect(copy.id).not.toBe(src.id);
    expect(copy.pos[0]).toBeCloseTo(src.pos[0] + 0.6);
    expect(copy.name).toContain('cópia');
  });

  it('apaga e limpa a seleção', () => {
    const id = st().doc.pieces[0].id;
    st().select(id);
    st().remove(id);
    expect(st().doc.pieces).toHaveLength(0);
    expect(st().selectedId).toBeNull();
  });

  it('não seleciona peça que não existe', () => {
    st().select('nada');
    expect(st().selectedId).toBeNull();
  });
});

describe('mãos', () => {
  it('espelha a peça para o outro lado num passo só', () => {
    const id = st().addPiece('gota', [1.5, 0.2, 0], [0, 0, -60]);
    const before = st().past.length;
    const par = st().mirror(id, 'x', 0);
    const pc = st().doc.pieces.find(p => p.id === par);
    expect(pc?.pos).toEqual([-1.5, 0.2, 0]);
    expect(pc?.rot).toEqual([0, 0, 60]);
    expect(pc?.name).toContain('par');
    expect(st().selectedId).toBe(par);
    expect(st().past.length).toBe(before + 1);
    st().undo();
    expect(st().doc.pieces.some(p => p.id === par)).toBe(false);
  });

  it('peça nova nasce no lugar e no giro pedidos', () => {
    const id = st().addPiece('cone', [0.5, 1, 0], [0, 0, 90]);
    const pc = st().doc.pieces.find(p => p.id === id);
    expect(pc?.pos).toEqual([0.5, 1, 0]);
    expect(pc?.rot).toEqual([0, 0, 90]);
  });

  it('guarda a cor do pincel e a peça esperando para grudar', () => {
    st().setBrush('#123456');
    st().setPlacing('anel');
    expect(st().brush).toBe('#123456');
    expect(st().placing).toBe('anel');
    st().setPlacing(null);
    expect(st().placing).toBeNull();
  });
});
