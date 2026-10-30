import * as THREE from 'three';
import type { XZ } from './dough';

/*
 * As coisas da bancada em 3D: a bailarina com a base de corte, o rolo, os niveladores
 * e as ferramentas de mão. Cada ferramenta de mão nasce com a ponta em (0, 0, 0) e o cabo
 * subindo em +y; a cena só põe a ponta no lugar e inclina o cabo.
 */

const steel = () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.9, roughness: 0.28 });
const wood = (c = 0xd9b07c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
const plastic = (c: number, opacity = 1) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, transparent: opacity < 1, opacity });

/** Base de corte verde com grade de 1 cm, como as de papelaria. */
function matTexture(size: number): THREE.CanvasTexture {
  const px = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#2f7d62';
    g.fillRect(0, 0, px, px);
    const cm = px / size;
    for (let i = 0; i <= size; i++) {
      const thick = i % 5 === 0;
      g.strokeStyle = thick ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)';
      g.lineWidth = thick ? 3 : 1.5;
      g.beginPath();
      g.moveTo(i * cm, 0);
      g.lineTo(i * cm, px);
      g.moveTo(0, i * cm);
      g.lineTo(px, i * cm);
      g.stroke();
    }
    // diagonais de 45°, discretas
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(px, px);
    g.moveTo(px, 0);
    g.lineTo(0, px);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `600 ${Math.round(cm * 0.32)}px system-ui, sans-serif`;
    for (let i = 1; i < size; i++) g.fillText(String(i), i * cm + 4, cm * 0.36);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Bailarina (prato giratório) com a base de corte em cima. O topo da base fica em y = 0. */
export function makeTurntable(): { group: THREE.Group; radius: number } {
  const group = new THREE.Group();
  const R = 5.4;
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.28, 96), plastic(0xf3efe8));
  plate.position.y = -0.2;
  plate.receiveShadow = true;
  group.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 8, 128), steel());
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.06;
  group.add(rim);
  const S = 8;
  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(S, 0.06, S),
    [plastic(0x2a6b54), plastic(0x2a6b54), new THREE.MeshStandardMaterial({ map: matTexture(S), roughness: 0.85 }), plastic(0x2a6b54), plastic(0x2a6b54), plastic(0x2a6b54)],
  );
  mat.position.y = -0.03;
  mat.receiveShadow = true;
  group.add(mat);
  // pé da bailarina, parado
  return { group, radius: R };
}

export function makeTurntableFoot(): THREE.Mesh {
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 0.5, 64), plastic(0xd9d3c9));
  foot.position.y = -0.6;
  foot.receiveShadow = true;
  return foot;
}

/**
 * Rolo de abrir massa, deitado no eixo x, com o barril num grupo próprio para rodar.
 * O comprimento acompanha a placa (`setLength`), para o rolo sempre passar por cima dos niveladores.
 */
export function makeRoller(): { group: THREE.Group; barrel: THREE.Group; radius: number; setLength(L: number): void } {
  const group = new THREE.Group();
  const barrel = new THREE.Group();
  const r = 0.3;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 40), wood(0xe6c697));
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  barrel.add(body);
  // veio da madeira: uma faixa mais escura, para dar para ver o rolo girando
  const mark = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.05), wood(0xc89a62));
  mark.position.y = r;
  barrel.add(mark);
  barrel.position.y = r;
  group.add(barrel);
  const handles: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.9, 16), wood(0xb98552));
    h.rotation.z = Math.PI / 2;
    h.position.set(s, r, 0);
    h.castShadow = true;
    handles.push(h);
    group.add(h);
  }
  const setLength = (L: number) => {
    body.scale.y = L;
    mark.scale.x = L * 0.94;
    handles[0].position.x = -(L / 2 + 0.45);
    handles[1].position.x = L / 2 + 0.45;
  };
  setLength(5);
  group.visible = false;
  return { group, barrel, radius: r, setLength };
}

/** Par de niveladores (réguas de espessura), um de cada lado da massa, ao longo de z. */
export function makeLevelers(): { group: THREE.Group; set(mm: number, halfGap: number, length: number): void } {
  const group = new THREE.Group();
  const bars: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 1), plastic(0xbfe3f2, 0.85));
    b.castShadow = true;
    bars.push(b);
    group.add(b);
  }
  group.visible = false;
  return {
    group,
    set(mm: number, halfGap: number, length: number) {
      const h = Math.max(0.01, mm / 10);
      bars.forEach((b, i) => {
        b.scale.set(1, h, length);
        b.position.set((i ? 1 : -1) * (halfGap + 0.2), h / 2, 0);
      });
    },
  };
}

/** Potinho de tinta: o pingo sai dele. `setColor` troca a cor da tinta. */
export function makePaintPot(): { group: THREE.Group; setColor(hex: string): void } {
  const group = new THREE.Group();
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.5, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, transmission: 0.6, thickness: 0.1 }));
  jar.position.y = 0.25;
  jar.castShadow = true;
  group.add(jar);
  const ink = new THREE.MeshStandardMaterial({ color: 0xe0473c, roughness: 0.3 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.27, 0.32, 24), ink);
  liquid.position.y = 0.18;
  group.add(liquid);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 24), plastic(0xf3efe8));
  lid.position.set(0.45, 0.05, 0.1);
  lid.rotation.z = 0.2;
  group.add(lid);
  group.visible = false;
  return { group, setColor: (hex: string) => ink.color.set(hex) };
}

/** Pingo de tinta caindo. */
export function makeDrop(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe0473c, roughness: 0.2 }));
  m.scale.set(1, 1.35, 1);
  m.visible = false;
  return m;
}

function handle(len: number, r: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 16), wood(color));
  m.castShadow = true;
  return m;
}

export type HandTool = 'boleador' | 'esteca' | 'silicone' | 'agua' | 'esponja' | 'lixa' | 'tinta' | 'verniz';

/** Ferramenta de mão. `tip` é onde ela encosta na massa; `paint` recebe a cor da ponta, se tiver. */
export function makeHandTool(kind: HandTool): { group: THREE.Group; paint?: THREE.MeshStandardMaterial; ball?: THREE.Mesh } {
  const group = new THREE.Group();
  const add = (m: THREE.Mesh, y: number) => {
    m.position.y = y;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  switch (kind) {
    case 'boleador': {
      // bolinha de aço na ponta de uma haste; a escala da bolinha muda com o tamanho
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), steel());
      ball.castShadow = true;
      group.add(ball);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10), steel()), 0.8);
      add(handle(2.6, 0.13, 0xe85d75), 2.9);
      return { group, ball };
    }
    case 'esteca': {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 4), steel());
      tip.rotation.x = Math.PI;
      add(tip, 0.45);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 10), steel()), 1.3);
      add(handle(3, 0.14, 0xd9b07c), 3.2);
      return { group };
    }
    case 'silicone': {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), plastic(0xb7b9c2));
      tip.scale.set(1, 1.6, 1);
      add(tip, 0.28);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 12), steel()), 0.8);
      add(handle(3, 0.14, 0x2b2b2e), 2.5);
      return { group };
    }
    case 'agua':
    case 'tinta': {
      const paint = plastic(kind === 'agua' ? 0x9fd3ef : 0xe0473c);
      const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 14), paint);
      bristles.rotation.x = Math.PI;
      add(bristles, 0.35);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.45, 14), steel()), 0.9);
      // o pincel d'água tem o cabo transparente com água dentro
      const body = kind === 'agua' ? new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 2.6, 16), plastic(0xbfe3f2, 0.55)) : handle(2.8, 0.12, 0x2f6fb0);
      add(body, kind === 'agua' ? 2.4 : 2.5);
      return { group, paint };
    }
    case 'verniz': {
      const paint = new THREE.MeshPhysicalMaterial({ color: 0xf5e9c8, roughness: 0.15, clearcoat: 1 });
      const bristles = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.14), paint);
      add(bristles, 0.3);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.35, 0.2), steel()), 0.75);
      add(handle(2.4, 0.13, 0x8a5a3c), 2.1);
      return { group, paint };
    }
    case 'esponja': {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.1, 4, 2, 4), plastic(0xf6d35c));
      // cantos gastos
      const pos = s.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        v.multiplyScalar(1 - 0.08 * (Math.abs(v.x) / 0.75) * (Math.abs(v.z) / 0.55));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      s.geometry.computeVertexNormals();
      add(s, 0.35);
      return { group };
    }
    case 'lixa': {
      add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1), new THREE.MeshStandardMaterial({ color: 0xb8915e, roughness: 1 })), 0.03);
      add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.9), plastic(0x3d6fb3)), 0.31);
      return { group };
    }
  }
}

/** Espátula de corte: uma lâmina de aço em pé, que a cena estica do começo ao fim do risco. */
export function makeBlade(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.03), new THREE.MeshStandardMaterial({ color: 0xd3d6db, metalness: 0.92, roughness: 0.22, transparent: true, opacity: 0.92 }));
  m.castShadow = true;
  m.visible = false;
  return m;
}

/** Cortador de metal no formato do contorno (u, v), com parede fininha e 0,9 cm de altura. */
export function makeCutter(outline: XZ[], size: number): THREE.Mesh {
  const half = size / 2;
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u * half, v * half)));
  const k = Math.max(0.5, 1 - 0.07 / half);
  shape.holes.push(new THREE.Path(outline.map(([u, v]) => new THREE.Vector2(u * half * k, v * half * k))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 1 });
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd9dce1, metalness: 0.88, roughness: 0.25, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}
