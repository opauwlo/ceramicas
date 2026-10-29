import * as THREE from 'three';
import { round } from '../lib/format';
import type { Vec3 } from '../model/types';

/*
 * Grudar uma peça numa superfície. Toda peça nasce com a base em y = 0 e centrada,
 * então basta pôr a origem dela no ponto tocado e virar o "em cima" dela para fora.
 */

const UP = new THREE.Vector3(0, 1, 0);
const D = THREE.MathUtils.degToRad;
const G = THREE.MathUtils.radToDeg;

/** Superfície mais deitada que isso conta como "em cima": a peça só assenta, sem tombar. */
export const FLAT = 0.97;

export const quatOf = (rot: Vec3) => new THREE.Quaternion().setFromEuler(new THREE.Euler(D(rot[0]), D(rot[1]), D(rot[2]), 'XYZ'));

export function rotOf(q: THREE.Quaternion): Vec3 {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [round(G(e.x), 2) + 0, round(G(e.y), 2) + 0, round(G(e.z), 2) + 0];
}

/** Para onde aponta o "em cima" da peça. */
export const upOf = (rot: Vec3) => UP.clone().applyQuaternion(quatOf(rot));

/**
 * Giro da peça grudada numa superfície de normal `n`: o "em cima" aponta para fora da superfície
 * e o giro da peça em volta do próprio eixo continua o mesmo.
 */
export function stickRot(base: Vec3, n: THREE.Vector3): Vec3 {
  const q = quatOf(base);
  const up = UP.clone().applyQuaternion(q);
  // tira a inclinação que a peça já tinha e fica só com o giro no próprio eixo
  const spin = new THREE.Quaternion().setFromUnitVectors(UP, up).invert().multiply(q);
  const out = new THREE.Quaternion().setFromUnitVectors(UP, n.clone().normalize()).multiply(spin);
  return rotOf(out);
}
