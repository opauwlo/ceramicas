import * as THREE from 'three';
import type { Piece } from '../model/types';
import { clayNoise, needsPaint, paintDisc } from './paint';

/** Chave que muda só quando a aparência muda. */
export function materialKey(pc: Piece): string {
  return JSON.stringify([pc.finish, pc.color, pc.clay, pc.type === 'disco' ? [pc.s, pc.p.raio, pc.seed] : 0]);
}

/** Força do relevo. Ajustada para o modelo de bump do three atual. */
const BUMP = 1;

export function buildMaterial(pc: Piece): THREE.MeshStandardMaterial {
  const maps = pc.type === 'disco' && needsPaint(pc.s) ? paintDisc(pc) : null;
  const color = maps ? new THREE.Color('#ffffff') : new THREE.Color(pc.color);
  let m: THREE.MeshStandardMaterial;
  switch (pc.finish) {
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.25 });
      break;
    case 'vidro':
      m = new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.4, ior: 1.33, clearcoat: 1, clearcoatRoughness: 0.02 });
      break;
    case 'fosco':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.88 });
      break;
    case 'acetinado':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.3 });
      break;
    default:
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 });
  }
  if (maps) {
    m.map = maps.map;
    m.bumpMap = maps.bump;
    m.bumpScale = (0.6 + pc.clay * 0.8) * BUMP;
  } else if (pc.finish !== 'metal' && pc.finish !== 'vidro' && pc.clay > 0) {
    m.bumpMap = clayNoise();
    m.bumpScale = pc.clay * 0.9 * BUMP;
  }
  return m;
}

export function disposeMaterial(m: THREE.MeshStandardMaterial) {
  m.map?.dispose();
  if (m.bumpMap && m.bumpMap !== clayNoise()) m.bumpMap.dispose();
  m.dispose();
}
