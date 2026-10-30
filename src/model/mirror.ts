import type { Vec3 } from './types';

/** Lado do espelho: 'x' troca esquerda e direita, 'z' troca frente e trás. */
export type MirrorAxis = 'x' | 'z';

// "+ 0" troca -0 por 0, que o JSON não preserva
const neg = (v: number) => -v + 0;

/**
 * Posição e giro do par da peça do outro lado de um espelho em pé (o plano x = c ou z = c).
 * Espelhar um giro XYZ: o giro em volta do eixo espelhado fica, os outros dois trocam de sinal.
 * As peças são simétricas, então o par sai igualzinho, só do outro lado.
 */
export function mirrorPose(pos: Vec3, rot: Vec3, axis: MirrorAxis, c: number): { pos: Vec3; rot: Vec3 } {
  if (axis === 'x') return { pos: [2 * c - pos[0] + 0, pos[1], pos[2]], rot: [rot[0], neg(rot[1]), neg(rot[2])] };
  return { pos: [pos[0], pos[1], 2 * c - pos[2] + 0], rot: [neg(rot[0]), neg(rot[1]), rot[2]] };
}
