import * as THREE from 'three';
import { discTopAt } from '../geometry/shapes';
import { newPiece } from './spec';
import type { Doc, Finish, Piece, PieceType, Vec3 } from './types';

const deg = THREE.MathUtils.radToDeg;

function mk(type: PieceType, name: string, p: Record<string, number>, color: string, finish: Finish, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], extra: Record<string, unknown> = {}): Piece {
  return newPiece(type, { name, p, color, finish, pos, rot, ...extra });
}

/** Um cilindro de pontas redondas ligando dois pontos. */
function haste(a: THREE.Vector3, b: THREE.Vector3, raio: number, cor: string, fin: Finish, nome: string): Piece {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return mk('cilindro', nome, { raio, altura: len, arredondado: 1, irregular: 0 }, cor, fin, [a.x, a.y, a.z], [deg(e.x), deg(e.y), deg(e.z)]);
}

/** Braço de toca-discos com a agulha encostada em `top` (altura do disco embaixo da agulha). */
function arm(top: number, cw: string, ca: string, fin: Finish): Piece[] {
  const P: Vec3 = [3.25, 0, -2.25];
  const A = new THREE.Vector3(P[0], 0.76, P[2]);
  const N = new THREE.Vector3(1.05, top, -1.58);
  const H = new THREE.Vector3(N.x, top + 0.24, N.z);
  const back = new THREE.Vector3().subVectors(A, H).setY(0).normalize();
  const W = A.clone().addScaledVector(back, 0.45);
  const yaw = deg(Math.atan2(A.x - H.x, A.z - H.z));
  return [
    mk('disco', 'Base do braço', { raio: 0.48, espessura: 0.32, borda: 1, irregular: 0.6 }, cw, fin, P),
    mk('cilindro', 'Pilar', { raio: 0.12, altura: 0.45, arredondado: 0.3, irregular: 0 }, cw, fin, [P[0], 0.31, P[2]]),
    mk('esfera', 'Pivô', { raio: 0.17, achatar: 1, irregular: 0 }, cw, fin, [P[0], 0.6, P[2]]),
    haste(A, H, 0.075, cw, fin, 'Braço'),
    haste(A, W, 0.06, cw, fin, 'Haste do peso'),
    mk('esfera', 'Contrapeso', { raio: 0.2, achatar: 1, irregular: 0.1 }, ca, fin, [W.x, W.y - 0.2, W.z]),
    mk('caixa', 'Cabeçote', { largura: 0.32, altura: 0.14, profundidade: 0.56, canto: 0.8 }, cw, fin, [H.x, H.y - 0.07, H.z], [0, yaw, 0]),
    mk('caixa', 'Cápsula', { largura: 0.18, altura: 0.12, profundidade: 0.22, canto: 0.6 }, ca, fin, [H.x, top + 0.06, H.z], [0, yaw, 0]),
    mk('cone', 'Agulha', { raio: 0.022, altura: 0.07 }, '#d8dade', 'metal', [N.x, top + 0.07, N.z], [180, 0, 0]),
  ];
}

/** Distância do centro do disco até a agulha nos modelos prontos. */
export const NEEDLE_R = Math.hypot(1.05, 1.58);

export type TemplateKey = 'vinilMao' | 'vinilAgua' | 'branco';

export interface Template {
  nome: string;
  desc: string;
  build(): Doc;
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  vinilMao: {
    nome: 'Vinil pintado à mão',
    desc: 'Disco preto envernizado, ondas pintadas, gota presa num arame e agulha.',
    build() {
      const T = 0.34;
      return {
        v: 1,
        bg: 'caderno',
        light: 'mesa',
        lightAngle: 0,
        pieces: [
          mk('disco', 'Disco de vinil', { raio: 2.6, espessura: T, borda: 1, irregular: 0.4 }, '#151417', 'verniz', [0, 0, 0], [0, 0, 0], {
            clay: 0.3,
            s: { sulcos: true, aneis: { on: true, cor: '#f2ece0', qtd: 6, esp: 0.55, inicio: 0.33, mao: true } },
          }),
          mk('disco', 'Rótulo', { raio: 0.62, espessura: 0.08, borda: 1, irregular: 0.5 }, '#f4f1ea', 'verniz', [0, T - 0.01, 0]),
          mk('cilindro', 'Arame', { raio: 0.012, altura: 0.55, arredondado: 0, irregular: 0 }, '#d8dade', 'metal', [0, T + 0.06, 0]),
          mk('esfera', 'Gota', { raio: 0.3, achatar: 1.06, irregular: 0 }, '#cfe3f1', 'verniz', [0, 0.94, 0]),
          ...arm(T, '#f4f1ea', '#151417', 'verniz'),
        ],
      };
    },
  },
  vinilAgua: {
    nome: 'Vinil de água',
    desc: 'O disco ondula como água, com uma gota de vidro logo acima.',
    build() {
      const disc = mk('disco', 'Disco de água', { raio: 2.98, espessura: 0.2, borda: 1, irregular: 0.03 }, '#2c66ad', 'verniz', [0, 0, 0], [0, 0, 0], {
        clay: 0.1,
        s: { amp: 0.055, qtd: 9, inicio: 0.32, cratera: 0.05, sulcos: true, rotulo: { on: true, cor: '#e9f1f9', tam: 0.3, texto: '', corTexto: '#1c211f' } },
      });
      const top = discTopAt(disc, NEEDLE_R);
      return {
        v: 1,
        bg: 'agua',
        light: 'estudio',
        lightAngle: 0,
        pieces: [disc, mk('esfera', 'Gota', { raio: 0.2, achatar: 1.08, irregular: 0 }, '#eef6fd', 'vidro', [0, 0.75, 0]), ...arm(top, '#e9f1f9', '#8fb0d4', 'verniz')],
      };
    },
  },
  branco: {
    nome: 'Mesa vazia',
    desc: 'Um disco liso de argila crua para começar do zero.',
    build() {
      return {
        v: 1,
        bg: 'mesa',
        light: 'estudio',
        lightAngle: 0,
        pieces: [mk('disco', 'Disco', { raio: 2, espessura: 0.3, borda: 0.6, irregular: 0.3 }, '#efe3cf', 'fosco')],
      };
    },
  },
};
