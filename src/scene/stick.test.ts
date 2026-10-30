import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mirrorPose } from '../model/mirror';
import type { Vec3 } from '../model/types';
import { quatOf, stickRot, upOf } from './stick';

const near = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-3);

/** Onde um ponto da peça (no espaço dela) vai parar na mesa. */
const world = (pos: Vec3, rot: Vec3, local: THREE.Vector3) => local.clone().applyQuaternion(quatOf(rot)).add(new THREE.Vector3(...pos));

describe('grudar', () => {
  it('a peça grudada de lado aponta para fora', () => {
    const n = new THREE.Vector3(1, 0, 0);
    near(upOf(stickRot([0, 0, 0], n)), n);
  });

  it('grudada embaixo, fica de ponta-cabeça', () => {
    const n = new THREE.Vector3(0, -1, 0);
    near(upOf(stickRot([0, 40, 0], n)), n);
  });

  it('mantém o giro da peça no próprio eixo', () => {
    const side = stickRot([0, 30, 0], new THREE.Vector3(0, 0, 1));
    const back = stickRot(side, new THREE.Vector3(0, 1, 0));
    expect(back[0]).toBeCloseTo(0, 2);
    expect(back[1]).toBeCloseTo(30, 2);
    expect(back[2]).toBeCloseTo(0, 2);
  });
});

describe('espelhar', () => {
  const cases: Array<[Vec3, Vec3]> = [
    [[1.2, 0.4, -0.3], [20, 35, -50]],
    [[-0.5, 1, 2], [90, 0, 0]],
    [[2, 0, 0.7], [-15, 120, 70]],
  ];
  for (const axis of ['x', 'z'] as const) {
    it(`o par em ${axis} é o reflexo exato de cada ponto da peça`, () => {
      const c = 0.35;
      const flip = (v: THREE.Vector3) => (axis === 'x' ? new THREE.Vector3(2 * c - v.x, v.y, v.z) : new THREE.Vector3(v.x, v.y, 2 * c - v.z));
      const flipLocal = (v: THREE.Vector3) => (axis === 'x' ? new THREE.Vector3(-v.x, v.y, v.z) : new THREE.Vector3(v.x, v.y, -v.z));
      for (const [pos, rot] of cases) {
        const m = mirrorPose(pos, rot, axis, c);
        for (const p of [new THREE.Vector3(0.3, 0.7, -0.2), new THREE.Vector3(-1, 0.1, 0.5), new THREE.Vector3(0, 2, 0)]) {
          // o reflexo de um ponto da peça é o ponto refletido (no espaço dela) da peça espelhada
          near(flip(world(pos, rot, p)), world(m.pos, m.rot, flipLocal(p)));
        }
      }
    });
  }

  it('não deixa -0 no arquivo', () => {
    const m = mirrorPose([0, 0, 0], [0, 0, 0], 'x', 0);
    expect(Object.is(m.rot[1], -0)).toBe(false);
    expect(Object.is(m.pos[0], -0)).toBe(false);
  });
});
