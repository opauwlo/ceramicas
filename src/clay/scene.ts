import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { DENSITY } from '../model/spec';
import { useStore } from '../state/store';
import { CUTTER_SIZES, cutterOutline } from './cutters';
import { Dough, type DoughShot, type RGB, type XZ } from './dough';
import { feel, type Flow } from './feel';
import type { V3 } from './mesh';
import { makeBlade, makeCutter, makeHandTool, makeLevelers, makeRoller, makeTurntable, makeTurntableFoot, type HandTool } from './props';
import { useClay, type ClayTool } from './state';
import { loadDough, saveDough } from './storage';

/*
 * A bancada: a massa em cima da base de corte, na bailarina, com as ferramentas.
 * Tudo em three.js direto (sem camadas no meio), para a ferramenta responder no mesmo quadro.
 *
 * A massa e a base de corte giram juntas na bailarina; a câmera fica parada (só sobe e desce).
 * Por isso as ferramentas trabalham nas medidas da massa ("local"): segurando uma ferramenta
 * parada com a bailarina girando, ela risca um círculo perfeito, como no ateliê de verdade.
 *
 * Gestos:
 *  - um dedo na massa: usa a ferramenta escolhida;
 *  - rolo, espátula e cortador funcionam em qualquer lugar da base de corte;
 *  - um dedo fora: gira a bailarina (para os lados) e inclina a vista (para cima e para baixo);
 *  - dois dedos: aproximam e afastam; com o dedo (ferramenta) na massa, o segundo dedo belisca.
 */

export const MASSA = '#efe6d8';

export const linear = (hex: string): RGB => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

export interface ClayApp {
  undo(): void;
  redo(): void;
  fresh(): void;
  /** dá um empurrão na bailarina, ou para ela se já estiver girando */
  spin(): void;
  photo(): string | null;
  stl(): Blob;
  dispose(): void;
}

interface Ptr {
  x: number;
  y: number;
  /** tamanho do contato do dedo, quando o aparelho informa */
  w: number;
}

interface Hit {
  /** ponto e normal nas medidas da massa */
  c: V3;
  n: V3;
  /** ponto e normal no mundo */
  cw: THREE.Vector3;
  nw: THREE.Vector3;
  /** 1 = superfície de frente para quem olha, 0 = de lado */
  face: number;
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'orbit'; id: number; lx: number; ly: number; lt: number }
  | { kind: 'zoom'; d0: number; dist0: number }
  | { kind: 'knead'; id: number; c: V3; n: V3; force: number; trail: Array<[number, number, number]>; lx: number; ly: number; dx: number; dy: number }
  | { kind: 'pinch'; a: number; b: number; lastD: number; r: number }
  | { kind: 'stroke'; id: number; tool: HandTool; prev: V3 | null; lx: number; ly: number; depth: number }
  | { kind: 'roll'; id: number; q: THREE.Vector3; dir: XZ; H: number; leveled: boolean }
  | { kind: 'blade'; id: number; a: THREE.Vector3; b: THREE.Vector3 }
  | { kind: 'cutter'; id: number; at: THREE.Vector3 };

const HISTORY = 30;

/** Medidas de cada ferramenta de mão, em cm. */
const BOL = { P: 0.12, M: 0.22, G: 0.35 } as const;
const ESTECA = { fina: [0.1, 0.09], grossa: [0.18, 0.15] } as const;
const R_TOOL: Record<Exclude<HandTool, 'boleador' | 'esteca'>, number> = {
  silicone: 0.35,
  agua: 0.3,
  esponja: 0.85,
  lixa: 0.55,
  tinta: 0.16,
  verniz: 0.38,
};

const FLOW_OF: Record<HandTool, Flow> = {
  boleador: 'press',
  esteca: 'scrape',
  silicone: 'rub',
  agua: 'brush',
  esponja: 'sponge',
  lixa: 'sand',
  tinta: 'brush',
  verniz: 'brush',
};

const DOING_OF: Record<HandTool, string> = {
  boleador: 'boleando',
  esteca: 'vincando',
  silicone: 'esfumando',
  agua: 'molhando e alisando',
  esponja: 'passando a esponja',
  lixa: 'lixando',
  tinta: 'pintando',
  verniz: 'envernizando',
};

const handTool = (t: ClayTool): HandTool | null =>
  t === 'boleador' || t === 'esteca' || t === 'silicone' || t === 'agua' || t === 'esponja' || t === 'lixa' || t === 'verniz' ? t : t === 'tinta' && useClay.getState().tintaModo === 'pincel' ? 'tinta' : null;

export function createClayApp(host: HTMLElement): ClayApp {
  // ---------- cena ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'clay-canvas';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 1.1, 0);
  const yaw = 0.35;
  let pitch = 0.62;
  let dist = 9;
  let distGoal = 9;
  /** depois que a pessoa aproxima ou afasta, a câmera não reenquadra sozinha */
  let userZoom = false;

  scene.add(new THREE.HemisphereLight(0xfff3e4, 0x7a5a44, 0.7));
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.6);
  sun.position.set(-3.5, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 24;
  // massa amassada tem muita dobrinha: folga maior evita listras de sombra
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(4, 3, -3);
  scene.add(fill);

  // bailarina: gira com a base de corte e a massa em cima; o pé fica parado
  const table = makeTurntable();
  const turn = table.group;
  scene.add(turn);
  scene.add(makeTurntableFoot());
  let spinAngle = 0;
  let spinVel = 0;

  // ---------- massa ----------
  const dough = new Dough(1.6, 5, linear(MASSA));
  loadDough(dough);
  dough.measure();
  dough.paint();
  dough.squash(0.55);

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(dough.pos, 3).setUsage(THREE.DynamicDrawUsage);
  const nrmAttr = new THREE.BufferAttribute(dough.pn, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(dough.col, 3).setUsage(THREE.DynamicDrawUsage);
  const glossAttr = new THREE.BufferAttribute(dough.gloss, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', nrmAttr);
  geo.setAttribute('color', colAttr);
  geo.setAttribute('gloss', glossAttr);
  geo.setIndex(new THREE.BufferAttribute(dough.idx, 1));
  // a massa nunca sai deste espaço; assim não precisa recalcular a esfera a cada quadro
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 12);
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.66,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xffffff),
    clearcoat: 0.06,
    clearcoatRoughness: 0.6,
  });
  // verniz e água por ponto: onde tem brilho, a massa fica lisa e com camada de verniz
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float gloss;\nvarying float vGloss;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvGloss = gloss;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGloss;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, vGloss);')
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat = mix(material.clearcoat, 1.0, vGloss);\nmaterial.clearcoatRoughness = mix(material.clearcoatRoughness, 0.04, vGloss);\n#endif',
      );
  };
  mat.customProgramCacheKey = () => 'massa-brilho';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  turn.add(mesh);

  // ---------- ferramentas em 3D ----------
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xb8502b, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);

  const roller = makeRoller();
  scene.add(roller.group);
  const levelers = makeLevelers();
  scene.add(levelers.group);
  const blade = makeBlade();
  scene.add(blade);
  let cutterMesh: THREE.Mesh | null = null;
  let cutterKey = '';
  const hands = new Map<HandTool, ReturnType<typeof makeHandTool>>();
  const handOf = (k: HandTool) => {
    let h = hands.get(k);
    if (!h) {
      h = makeHandTool(k);
      h.group.visible = false;
      scene.add(h.group);
      hands.set(k, h);
    }
    return h;
  };
  const hideTools = () => {
    ring.visible = false;
    roller.group.visible = false;
    levelers.group.visible = false;
    blade.visible = false;
    if (cutterMesh) cutterMesh.visible = false;
    hands.forEach(h => (h.group.visible = false));
    needsRender = true;
  };

  /** Animações curtinhas das ferramentas (descer o cortador, sumir a espátula). */
  const fx: Array<{ t0: number; dur: number; step(u: number): void; done?(): void }> = [];
  const play = (dur: number, step: (u: number) => void, done?: () => void) => {
    fx.push({ t0: performance.now(), dur, step, done });
    needsRender = true;
  };

  const ui = useClay.getState();
  ui.set({ grams: dough.vol0 * DENSITY, canUndo: false, canRedo: false, spinning: false });
  feel.setSound(ui.sound);

  // ---------- desfazer ----------
  const past: DoughShot[] = [];
  let future: DoughShot[] = [];
  let edit: { snap: DoughShot; changed: boolean; vol: number } | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const syncUi = () => useClay.getState().set({ canUndo: past.length > 0, canRedo: future.length > 0, grams: dough.vol0 * DENSITY });
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDough(dough), 500);
  };
  const beginEdit = () => {
    if (edit) return;
    edit = { snap: dough.shot(), changed: false, vol: dough.vol0 };
    dough.measure();
  };
  const endEdit = () => {
    if (!edit) return;
    if (edit.changed) {
      past.push(edit.snap);
      if (past.length > HISTORY) past.shift();
      future = [];
      scheduleSave();
      const gone = (edit.vol - dough.vol0) * DENSITY;
      if (gone >= 0.5) useStore.getState().notify(`Sobrou ≈ ${Math.round(gone)} g de massa`);
      reframe();
    }
    edit = null;
    syncUi();
  };

  // ---------- câmera ----------
  let camDirty = true;
  const placeCamera = () => {
    const cp = Math.cos(pitch);
    camera.position.set(target.x + dist * cp * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * cp * Math.cos(yaw));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camDirty = false;
  };
  /** Enquadra a massa (bola ou placa aberta) ocupando pouco mais da metade da tela. */
  const reframe = () => {
    if (userZoom) return;
    const e = dough.extent();
    const R = Math.max(1.9, e.radius * 1.12 + 0.25);
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const span = Math.min(t * camera.aspect, t);
    distGoal = Math.min(30, Math.max(6, (2 * R) / 0.62 / span));
    target.y = Math.max(0.3, e.top * 0.42);
    camDirty = true;
  };

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = 35;
    camera.updateProjectionMatrix();
    reframe();
    if (!userZoom) dist = distGoal;
    camDirty = true;
    needsRender = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  /** cm por pixel na altura da massa */
  const wpp = () => (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, canvas.clientHeight);

  // ---------- onde o dedo está ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const aim = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const qSpin = new THREE.Quaternion();
  const hitAt = (x: number, y: number): Hit | null => {
    aim(x, y);
    turn.updateMatrixWorld();
    const h = ray.intersectObject(mesh, false)[0];
    if (!h || !h.face) return null;
    const nl = h.face.normal;
    qSpin.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spinAngle);
    const nw = nl.clone().applyQuaternion(qSpin);
    const cl = turn.worldToLocal(h.point.clone());
    const d = ray.ray.direction;
    return { c: [cl.x, cl.y, cl.z], n: [nl.x, nl.y, nl.z], cw: h.point.clone(), nw, face: -nw.dot(d) };
  };
  /** Ponto da mesa (plano y = h) sob o dedo, no mundo. */
  const groundAt = (x: number, y: number, h = 0): THREE.Vector3 | null => {
    aim(x, y);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), new THREE.Vector3());
  };
  const toLocalXZ = (w: THREE.Vector3): XZ => {
    turn.updateMatrixWorld();
    const l = turn.worldToLocal(new THREE.Vector3(w.x, 0, w.z));
    return [l.x, l.z];
  };
  const dirToLocal = (d: XZ): XZ => {
    const c = Math.cos(spinAngle);
    const s = Math.sin(spinAngle);
    // gira ao contrário da bailarina
    return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
  };
  const centerWorld = () => {
    const e = dough.extent();
    turn.updateMatrixWorld();
    return { e, w: turn.localToWorld(new THREE.Vector3(e.cx, 0, e.cz)) };
  };
  /** raio do dedo na massa, em cm */
  const fingerR = (p: Ptr) => {
    const px = Math.min(70, Math.max(22, p.w > 2 ? p.w : 34));
    return Math.min(0.9, Math.max(0.2, px * 1.1 * wpp()));
  };

  const ptrs = new Map<number, Ptr>();
  let g: Gesture = { kind: 'none' };

  // ---------- começar cada gesto ----------
  const startKnead = (id: number, p: Ptr, h: Hit, ev: PointerEvent) => {
    beginEdit();
    const force = ev.width > 2 ? Math.min(1.6, Math.max(0.7, Math.sqrt(ev.width / 30))) : 1;
    const s = useClay.getState();
    dough.poke(h.c, h.n, fingerR(p), 2.2 * force);
    moving = true;
    if (s.tool === 'tinta') {
      dough.drop(h.c, 0.45, linear(s.color));
      feel.plic();
      if (edit) edit.changed = true;
      colorDirty = true;
    } else feel.touch(force);
    g = { kind: 'knead', id, c: h.c, n: h.n, force, trail: [[performance.now(), p.x, p.y]], lx: p.x, ly: p.y, dx: 0, dy: 0 };
  };

  const startStroke = (id: number, p: Ptr, tool: HandTool) => {
    beginEdit();
    feel.touch(tool === 'esponja' ? 0.8 : tool === 'boleador' || tool === 'esteca' ? 0.6 : 0.35);
    const B = BOL[useClay.getState().bol];
    g = { kind: 'stroke', id, tool, prev: null, lx: p.x, ly: p.y, depth: tool === 'boleador' ? B * 0.45 : 0 };
    useClay.getState().set({ doing: DOING_OF[tool] });
  };

  const startRoll = (id: number, p: Ptr) => {
    beginEdit();
    const { e } = centerWorld();
    const q = groundAt(p.x, p.y, e.top) ?? new THREE.Vector3();
    // começa rolando para longe de quem olha
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    const fl = Math.hypot(f.x, f.z) || 1;
    g = { kind: 'roll', id, q, dir: [f.x / fl, f.z / fl], H: e.top, leveled: false };
    feel.touch(0.7);
    useClay.getState().set({ doing: 'abrindo a massa' });
  };

  const startBlade = (id: number, p: Ptr) => {
    const { e } = centerWorld();
    const a = groundAt(p.x, p.y, e.top * 0.5) ?? new THREE.Vector3();
    g = { kind: 'blade', id, a, b: a.clone() };
    feel.tick(6);
    useClay.getState().set({ doing: 'risque atravessando a massa' });
  };

  const startCutter = (id: number, p: Ptr) => {
    const s = useClay.getState();
    const key = `${s.cutter}-${s.cutterSize}`;
    if (!cutterMesh || key !== cutterKey) {
      if (cutterMesh) {
        scene.remove(cutterMesh);
        cutterMesh.geometry.dispose();
      }
      cutterMesh = makeCutter(cutterOutline(s.cutter), CUTTER_SIZES[s.cutterSize]);
      cutterKey = key;
      scene.add(cutterMesh);
    }
    const { e } = centerWorld();
    const at = groundAt(p.x, p.y, e.top) ?? new THREE.Vector3();
    g = { kind: 'cutter', id, at };
    feel.tick(6);
    useClay.getState().set({ doing: 'solte para cortar' });
  };

  const finishStroke = () => {
    feel.release();
    ring.visible = false;
    hands.forEach(h => (h.group.visible = false));
    roller.group.visible = false;
    levelers.group.visible = false;
    needsRender = true;
    useClay.getState().set({ doing: '' });
    endEdit();
  };

  // ---------- cortes ----------
  /** Base do quadro do cortador: direita da tela e "para cima" da tela, deitados na mesa. */
  const screenAxes = () => {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd).setY(0).normalize();
    return { right, fwd };
  };

  const doBladeCut = (a: THREE.Vector3, b: THREE.Vector3) => {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const { e } = centerWorld();
    const hb = e.top + 0.6;
    const y0 = blade.position.y;
    play(
      130,
      u => {
        blade.position.y = y0 + (hb / 2 - 0.04 - y0) * u * u;
      },
      () => {
        beginEdit();
        const dl = dirToLocal([(b.x - a.x) / L, (b.z - a.z) / L]);
        const removed = dough.cutPlane(toLocalXZ(a), [-dl[1], dl[0]]);
        if (removed > 0) {
          if (edit) edit.changed = true;
          dough.settle(2);
          dough.squash(0.92);
          moving = true;
          feel.cut();
        } else feel.tick(5);
        endEdit();
        play(
          260,
          u => {
            blade.position.y = hb / 2 - 0.04 + u * 1.5;
            (blade.material as THREE.MeshStandardMaterial).opacity = 0.92 * (1 - u);
          },
          () => {
            blade.visible = false;
            (blade.material as THREE.MeshStandardMaterial).opacity = 0.92;
          },
        );
      },
    );
  };

  const doCutterCut = (at: THREE.Vector3) => {
    const s = useClay.getState();
    const cm = cutterMesh;
    if (!cm) return;
    const { e, w } = centerWorld();
    const half = CUTTER_SIZES[s.cutterSize] / 2;
    // fora da massa: o cortador só some
    if (Math.hypot(at.x - w.x, at.z - w.z) > e.radius + half * 0.6) {
      cm.visible = false;
      needsRender = true;
      return;
    }
    const y0 = cm.position.y;
    play(
      140,
      u => {
        cm.position.y = y0 + (-0.04 - y0) * u * u;
      },
      () => {
        beginEdit();
        const { right, fwd } = screenAxes();
        const poly: XZ[] = cutterOutline(s.cutter).map(([u, v]) =>
          toLocalXZ(new THREE.Vector3(at.x + (right.x * u + fwd.x * v) * half, 0, at.z + (right.z * u + fwd.z * v) * half)),
        );
        const removed = dough.cutShape(poly, toLocalXZ(at));
        if (removed > 0) {
          if (edit) edit.changed = true;
          dough.settle(2);
          dough.squash(0.9);
          moving = true;
        }
        feel.cut(true);
        endEdit();
        play(
          280,
          u => {
            cm.position.y = -0.04 + u * (e.top + 1.4);
          },
          () => {
            cm.visible = false;
          },
        );
      },
    );
  };

  // ---------- dedos ----------
  const onDown = (ev: PointerEvent) => {
    if (ptrs.size >= 2) return;
    canvas.setPointerCapture?.(ev.pointerId);
    const p: Ptr = { x: ev.clientX, y: ev.clientY, w: ev.width || 0 };
    ptrs.set(ev.pointerId, p);
    if (ptrs.size === 1) {
      const tool = useClay.getState().tool;
      const h = hitAt(p.x, p.y);
      const gp = groundAt(p.x, p.y, 0);
      const onBoard = !!gp && Math.hypot(gp.x, gp.z) < table.radius;
      // rolo, espátula e cortador começam em qualquer lugar da mesa (até um pouco fora da bailarina)
      const onTable = !!gp && Math.hypot(gp.x, gp.z) < table.radius * 1.8;
      // segurar a massa para a bailarina, como a mão que trava o prato
      if (Math.abs(spinVel) > 1e-5 && (h || onBoard) && tool !== 'dedo' && !handTool(tool)) {
        spinVel = 0;
        useClay.getState().set({ spinning: false });
      }
      if (tool === 'rolo' && (h || onTable)) return startRoll(ev.pointerId, p);
      // a espátula pode começar o risco em qualquer lugar da mesa, para atravessar a massa inteira
      if (tool === 'espatula' && (h || gp)) return startBlade(ev.pointerId, p);
      if (tool === 'cortador' && (h || onTable)) return startCutter(ev.pointerId, p);
      const ht = handTool(tool);
      if (h && ht) return startStroke(ev.pointerId, p, ht);
      if (h && (tool === 'dedo' || tool === 'tinta')) return startKnead(ev.pointerId, p, h, ev);
      g = { kind: 'orbit', id: ev.pointerId, lx: ev.clientX, ly: ev.clientY, lt: performance.now() };
      return;
    }
    const [a, b] = [...ptrs.keys()];
    const pa = ptrs.get(a)!;
    const pb = ptrs.get(b)!;
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    // com um dedo já na massa, o segundo dedo belisca (mesmo que encoste um pouco fora)
    if (g.kind === 'knead') {
      feel.release();
      g = { kind: 'pinch', a, b, lastD: d, r: Math.min(1.2, Math.max(0.25, d * wpp() * 0.45)) };
      feel.touch(0.6);
      return;
    }
    // qualquer outra ferramenta: o segundo dedo larga ela (sem cortar) e vira zoom
    if (g.kind === 'stroke' || g.kind === 'roll') finishStroke();
    if (g.kind === 'blade' || g.kind === 'cutter') {
      hideTools();
      useClay.getState().set({ doing: '' });
    }
    g = { kind: 'zoom', d0: Math.max(10, d), dist0: dist };
  };

  const onMove = (ev: PointerEvent) => {
    const p = ptrs.get(ev.pointerId);
    if (!p) return;
    p.x = ev.clientX;
    p.y = ev.clientY;
    if (ev.width > 2) p.w = ev.width;
    if (g.kind === 'orbit' && g.id === ev.pointerId) {
      const now = performance.now();
      const dx = ev.clientX - g.lx;
      const dy = ev.clientY - g.ly;
      // para os lados gira a bailarina; para cima e para baixo inclina a vista
      const da = dx * 0.011;
      spinAngle += da;
      spinVel = da / Math.max(8, now - g.lt);
      pitch = Math.min(1.4, Math.max(0.12, pitch + dy * 0.006));
      g.lx = ev.clientX;
      g.ly = ev.clientY;
      g.lt = now;
      camDirty = true;
      needsRender = true;
    } else if (g.kind === 'zoom' && ptrs.size === 2) {
      const [pa, pb] = [...ptrs.values()];
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      dist = Math.min(32, Math.max(3.5, (g.dist0 * g.d0) / Math.max(10, d)));
      distGoal = dist;
      userZoom = true;
      camDirty = true;
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.delete(ev.pointerId);
    const cancel = ev.type === 'pointercancel';
    if ((g.kind === 'knead' || g.kind === 'stroke' || g.kind === 'roll') && g.id === ev.pointerId) {
      finishStroke();
      g = { kind: 'none' };
    } else if (g.kind === 'pinch' && (g.a === ev.pointerId || g.b === ev.pointerId)) {
      finishStroke();
      g = { kind: 'none' };
    } else if (g.kind === 'blade' && g.id === ev.pointerId) {
      const { a, b } = g;
      g = { kind: 'none' };
      useClay.getState().set({ doing: '' });
      if (!cancel && Math.hypot(b.x - a.x, b.z - a.z) > 0.4) doBladeCut(a, b);
      else hideTools();
    } else if (g.kind === 'cutter' && g.id === ev.pointerId) {
      const at = g.at;
      g = { kind: 'none' };
      useClay.getState().set({ doing: '' });
      if (!cancel) doCutterCut(at);
      else hideTools();
    } else if (g.kind === 'orbit' && g.id === ev.pointerId) {
      // soltou com embalo: a bailarina continua girando
      if (performance.now() - g.lt > 80) spinVel = 0;
      useClay.getState().set({ spinning: Math.abs(spinVel) > 1e-4 });
      g = { kind: 'none' };
    } else if (g.kind === 'zoom') g = { kind: 'none' };
  };

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    dist = Math.min(32, Math.max(3.5, dist * Math.exp(ev.deltaY * 0.001)));
    distGoal = dist;
    userZoom = true;
    camDirty = true;
  };
  const noMenu = (ev: Event) => ev.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', noMenu);

  // ---------- cada quadro ----------
  let needsRender = true;
  let moving = true;
  let colorDirty = true;
  let wetting = dough.wet.some(w => w > 0);
  let last = performance.now();
  let raf = 0;

  const showRing = (h: Hit, r: number, pulse: number) => {
    ring.visible = true;
    ring.position.copy(h.cw).addScaledVector(h.nw, 0.02);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.nw);
    ring.scale.setScalar(r * pulse);
  };

  /** Põe a ferramenta de mão no lugar: ponta no ponto tocado, cabo inclinado para quem olha. */
  const UP = new THREE.Vector3(0, 1, 0);
  const placeHand = (tool: HandTool, h: Hit, press: number) => {
    const t = handOf(tool);
    t.group.visible = true;
    const toCam = camera.position.clone().sub(h.cw).normalize();
    if (tool === 'esponja' || tool === 'lixa') {
      // deitadas na superfície, achatando um pouco quando apertam
      t.group.position.copy(h.cw).addScaledVector(h.nw, -0.04);
      t.group.quaternion.setFromUnitVectors(UP, h.nw);
      t.group.scale.set(1 + 0.06 * press, 1 - 0.18 * press, 1 + 0.06 * press);
      return;
    }
    const axis = h.nw.clone().multiplyScalar(0.45).addScaledVector(toCam, 0.75).addScaledVector(UP, 0.45).normalize();
    t.group.quaternion.setFromUnitVectors(UP, axis);
    t.group.scale.setScalar(1);
    if (tool === 'boleador' && t.ball) {
      const B = BOL[useClay.getState().bol];
      t.ball.scale.setScalar(B);
      t.ball.position.y = 0;
      t.group.position.copy(h.cw).addScaledVector(h.nw, B * 0.95);
    } else t.group.position.copy(h.cw);
    if (tool === 'tinta' && t.paint) t.paint.color.set(useClay.getState().color);
  };

  const kneadFrame = (k: Extract<Gesture, { kind: 'knead' }>, dt: number) => {
    const p = ptrs.get(k.id);
    if (!p) return false;
    const now = performance.now();
    k.trail.push([now, p.x, p.y]);
    while (k.trail.length > 2 && now - k.trail[0][0] > 320) k.trail.shift();
    let L = 0;
    for (let i = 1; i < k.trail.length; i++) L += Math.hypot(k.trail[i][1] - k.trail[i - 1][1], k.trail[i][2] - k.trail[i - 1][2]);
    const first = k.trail[0];
    const D = Math.hypot(p.x - first[1], p.y - first[2]);
    // voltou para trás de repente também é esfregar (não deixa a massa dobrar no vai e vem)
    const mx = p.x - k.lx;
    const my = p.y - k.ly;
    const back = mx * k.dx + my * k.dy < -40;
    const rub = (L > 50 && D < 0.5 * L) || back;
    const speed = Math.hypot(mx, my) / Math.max(1e-3, dt);
    if (Math.hypot(mx, my) > 1) {
      k.dx = mx;
      k.dy = my;
    }
    k.lx = p.x;
    k.ly = p.y;
    const h = hitAt(p.x, p.y);
    // na beirada (superfície de lado para quem olha) o dedo escorrega: não deforma
    if (!h || h.face < 0.3) {
      feel.flow(0, 'press');
      return false;
    }
    const r = fingerR(p);
    const ui = useClay.getState();
    if (rub) {
      // esfregar desfaz até dobrinhas: três passadas leves
      for (let it = 0; it < 3; it++) dough.smooth(h.c, r * 1.5, 0.45);
      feel.flow(Math.min(1, L / 350), 'rub');
      if (ui.doing !== 'alisando') ui.set({ doing: 'alisando' });
    } else {
      const n = h.n;
      const mv: V3 = [h.c[0] - k.c[0], h.c[1] - k.c[1], h.c[2] - k.c[2]];
      const dn = mv[0] * n[0] + mv[1] * n[1] + mv[2] * n[2];
      mv[0] -= n[0] * dn;
      mv[1] -= n[1] * dn;
      mv[2] -= n[2] * dn;
      const ml = Math.hypot(mv[0], mv[1], mv[2]);
      if (ml > 1e-4 && ml < r * 1.5) {
        dough.smear(h.c, r, mv);
        dough.stir(h.c, r * 1.1, mv);
        // a massa se acomoda atrás do dedo, sem dobrar
        dough.smooth(h.c, r * 1.25, 0.2, 0);
      }
      const still = ml < 0.004;
      // parado, o dedo vai afundando; andando, ele abre um sulco mais raso
      dough.dent(h.c, n, r * 0.85, (still ? 0.8 : 0.12) * k.force * dt);
      feel.flow(Math.min(1, speed / 900 + (still ? 0.25 : 0)), 'press');
      const doing = ui.tool === 'tinta' ? 'sovando a tinta' : still ? 'apertando' : 'levando a massa';
      if (ui.doing !== doing) ui.set({ doing });
    }
    k.c = h.c;
    k.n = h.n;
    showRing(h, r, 1 - 0.08 * Math.sin(now / 90));
    return true;
  };

  const pinchFrame = (q: Extract<Gesture, { kind: 'pinch' }>) => {
    const pa = ptrs.get(q.a);
    const pb = ptrs.get(q.b);
    if (!pa || !pb) return false;
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    const delta = (q.lastD - d) * wpp();
    q.lastD = d;
    if (Math.abs(delta) < 1e-4) return false;
    const h = hitAt((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
    if (!h) return false;
    const ui = useClay.getState();
    if (delta > 0) {
      dough.pinch(h.c, h.n, q.r, delta * 0.9);
      feel.flow(Math.min(1, delta * 30), 'pinch');
      if (ui.doing !== 'beliscando') ui.set({ doing: 'beliscando' });
    } else {
      dough.dent(h.c, h.n, q.r * 1.6, -delta * 0.3, 0.9);
      feel.flow(Math.min(1, -delta * 30), 'press');
      if (ui.doing !== 'esticando') ui.set({ doing: 'esticando' });
    }
    showRing(h, q.r, 1);
    return true;
  };

  /** Ferramenta de mão andando pela massa. Devolve [mudou a forma, mudou a cor]. */
  const strokeFrame = (s: Extract<Gesture, { kind: 'stroke' }>, dt: number): [boolean, boolean] => {
    const p = ptrs.get(s.id);
    if (!p) return [false, false];
    const speed = Math.hypot(p.x - s.lx, p.y - s.ly) / Math.max(1e-3, dt);
    s.lx = p.x;
    s.ly = p.y;
    const h = hitAt(p.x, p.y);
    if (!h || h.face < 0.22) {
      s.prev = null;
      handOf(s.tool).group.visible = false;
      feel.flow(0, FLOW_OF[s.tool]);
      return [false, false];
    }
    const a = s.prev ?? h.c;
    const b = h.c;
    const n = h.n;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    // pulo grande (o dedo saiu e voltou em outro lugar): começa de novo ali
    const from = seg > 1.2 ? b : a;
    s.prev = b;
    const ui = useClay.getState();
    let shape = false;
    let color = false;
    let press = 0.5;
    switch (s.tool) {
      case 'boleador': {
        const B = BOL[ui.bol];
        // parado, a bolinha afunda mais; andando, abre um sulco redondinho
        if (seg < 0.01) s.depth = Math.min(B * 0.92, s.depth + B * 1.3 * dt);
        dough.ball(from, b, n, B, s.depth);
        shape = true;
        press = s.depth / B;
        break;
      }
      case 'esteca': {
        const [r, depth] = ESTECA[ui.esteca];
        dough.crease(from, b, n, r, depth);
        shape = true;
        break;
      }
      case 'silicone': {
        const r = R_TOOL.silicone;
        const mv: V3 = [b[0] - from[0], b[1] - from[1], b[2] - from[2]];
        if (seg > 1e-4) {
          dough.smear(b, r, mv);
          dough.stir(b, r, mv);
        }
        dough.smooth(b, r * 1.2, 0.35, 0.1);
        shape = true;
        break;
      }
      case 'agua': {
        const r = R_TOOL.agua;
        dough.smooth(b, r, 0.5, 0.2);
        dough.smooth(b, r, 0.5, 0.2);
        dough.wetSeg(from, b, r * 1.3, 0.35);
        shape = true;
        color = true;
        break;
      }
      case 'esponja': {
        const r = R_TOOL.esponja;
        dough.smooth(b, r, 0.35, 0.08);
        dough.smooth(b, r, 0.35, 0.08);
        dough.wetSeg(from, b, r, 0.22);
        shape = true;
        color = true;
        break;
      }
      case 'lixa': {
        const r = R_TOOL.lixa;
        dough.sand(b, r, 0.9);
        dough.sand(b, r, 0.9);
        shape = true;
        color = true;
        break;
      }
      case 'tinta':
        dough.paintSeg(from, b, R_TOOL.tinta, linear(ui.color));
        color = true;
        break;
      case 'verniz':
        dough.varnishSeg(from, b, R_TOOL.verniz, ui.verniz === 'brilho');
        color = true;
        break;
    }
    if (color && (s.tool === 'agua' || s.tool === 'esponja')) wetting = true;
    feel.flow(Math.min(1, speed / 800 + (s.tool === 'boleador' && seg < 0.01 ? 0.3 : 0.05)), FLOW_OF[s.tool]);
    placeHand(s.tool, h, press);
    return [shape, color];
  };

  /** Rolo: segue o dedo pela base de corte e, passando por cima da massa, vai abrindo ela. */
  const rollFrame = (r: Extract<Gesture, { kind: 'roll' }>, dt: number) => {
    const p = ptrs.get(r.id);
    if (!p) return false;
    const ui = useClay.getState();
    const nivel = ui.nivel / 10;
    const { e, w } = centerWorld();
    const q = groundAt(p.x, p.y, r.H);
    if (!q) return false;
    const mx = q.x - r.q.x;
    const mz = q.z - r.q.z;
    const m = Math.hypot(mx, mz);
    let shaped = false;
    if (m > 0.002) {
      const k = Math.min(1, m / 0.15);
      let dx = r.dir[0] * (1 - k) + (mx / m) * k;
      let dz = r.dir[1] * (1 - k) + (mz / m) * k;
      // o rolo não vira de ponta-cabeça: ir e voltar é a mesma direção
      if (dx * r.dir[0] + dz * r.dir[1] < 0) {
        dx = -(mx / m) * k + r.dir[0] * (1 - k);
        dz = -(mz / m) * k + r.dir[1] * (1 - k);
      }
      const l = Math.hypot(dx, dz) || 1;
      r.dir = [dx / l, dz / l];
      // o rolo está em cima da massa?
      const along = (w.x - q.x) * r.dir[0] + (w.z - q.z) * r.dir[1];
      const over = Math.abs(along) < e.radius + roller.radius;
      if (over) {
        const floor = nivel > 0 ? nivel : 0.15;
        // cada centímetro rolado baixa a massa um pouquinho: leva umas idas e voltas
        const H = Math.max(floor, Math.min(r.H, e.top) - 0.085 * m);
        if (H < e.top - 1e-4 && dough.roll(dirToLocal(r.dir), H)) shaped = true;
        if (shaped || m > 0.05) {
          // a malha se arruma enquanto a massa espicha, para os detalhes continuarem nítidos
          dough.relax(0.5);
          dough.settle();
          shaped = true;
        }
        const mm = Math.round(Math.min(e.top, H) * 10);
        const label = `abrindo · ${mm} mm`;
        if (ui.doing !== label) ui.set({ doing: label });
        r.H = Math.max(H, floor);
        if (!r.leveled && nivel > 0 && e.top <= nivel + 0.005) {
          r.leveled = true;
          feel.tick(25);
          useStore.getState().notify(`Placa de ${ui.nivel} mm, certinha.`);
        }
      }
      roller.barrel.rotation.x -= m / roller.radius;
      feel.flow(Math.min(1, (m / Math.max(1e-3, dt)) / 12) * (over ? 1 : 0.35), 'roll');
      r.q.copy(q);
    } else feel.flow(0, 'roll');
    // desenho do rolo e dos niveladores
    const A: XZ = [-r.dir[1], r.dir[0]];
    const theta = Math.atan2(-A[1], A[0]);
    const onDough = Math.abs((w.x - r.q.x) * r.dir[0] + (w.z - r.q.z) * r.dir[1]) < e.radius + roller.radius;
    roller.group.visible = true;
    roller.group.position.set(r.q.x, onDough ? Math.max(nivel, e.top) : nivel, r.q.z);
    roller.group.rotation.set(0, theta, 0);
    if (nivel > 0) {
      levelers.setThickness(ui.nivel);
      levelers.group.visible = true;
      levelers.group.position.set(w.x, 0, w.z);
      levelers.group.rotation.set(0, theta, 0);
    } else levelers.group.visible = false;
    needsRender = true;
    return shaped;
  };

  /** Espátula: a lâmina em pé acompanha o risco, flutuando um pouco acima da massa. */
  const bladeFrame = (bl: Extract<Gesture, { kind: 'blade' }>) => {
    const p = ptrs.get(bl.id);
    if (!p) return;
    const { e } = centerWorld();
    const b = groundAt(p.x, p.y, e.top * 0.5);
    if (b) bl.b.copy(b);
    const L = Math.hypot(bl.b.x - bl.a.x, bl.b.z - bl.a.z);
    if (L < 0.05) return;
    const hb = e.top + 0.6;
    blade.visible = true;
    blade.scale.set(L, hb, 1);
    blade.position.set((bl.a.x + bl.b.x) / 2, e.top + 0.05 + hb / 2, (bl.a.z + bl.b.z) / 2);
    blade.rotation.set(0, -Math.atan2(bl.b.z - bl.a.z, bl.b.x - bl.a.x), 0);
    needsRender = true;
  };

  /** Cortador: flutua em cima de onde o dedo está, já no formato e virado para quem olha. */
  const basis = new THREE.Matrix4();
  const cutterFrame = (c: Extract<Gesture, { kind: 'cutter' }>) => {
    const p = ptrs.get(c.id);
    const cm = cutterMesh;
    if (!p || !cm) return;
    const { e } = centerWorld();
    const at = groundAt(p.x, p.y, e.top);
    if (at) c.at.copy(at);
    const { right, fwd } = screenAxes();
    basis.makeBasis(right, fwd, UP);
    cm.quaternion.setFromRotationMatrix(basis);
    cm.position.set(c.at.x, e.top + 0.35, c.at.z);
    cm.visible = true;
    needsRender = true;
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let shaped = false;
    let tinted = false;
    if (g.kind === 'knead') shaped = kneadFrame(g, dt);
    else if (g.kind === 'pinch') shaped = pinchFrame(g);
    else if (g.kind === 'stroke') [shaped, tinted] = strokeFrame(g, dt);
    else if (g.kind === 'roll') shaped = rollFrame(g, dt);
    else if (g.kind === 'blade') bladeFrame(g);
    else if (g.kind === 'cutter') cutterFrame(g);
    if (shaped && g.kind !== 'roll') dough.settle();
    if (shaped || tinted) {
      if (edit) edit.changed = true;
      colorDirty = true;
      needsRender = true;
    }
    if (shaped) moving = true;

    // bailarina com embalo
    if (g.kind !== 'orbit' && Math.abs(spinVel) > 1e-6) {
      spinAngle += spinVel * dt * 1000;
      spinVel *= Math.exp(-dt / 1.6);
      if (Math.abs(spinVel) < 3e-5) {
        spinVel = 0;
        useClay.getState().set({ spinning: false });
      }
      needsRender = true;
    }
    if (turn.rotation.y !== spinAngle) {
      turn.rotation.y = spinAngle;
      needsRender = true;
    }

    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const u = Math.min(1, (now - f.t0) / f.dur);
      f.step(u);
      if (u >= 1) {
        fx.splice(i, 1);
        f.done?.();
      }
      needsRender = true;
    }

    if (Math.abs(dist - distGoal) > 1e-3) {
      dist += (distGoal - dist) * Math.min(1, dt * 4);
      camDirty = true;
    }
    if (camDirty) {
      placeCamera();
      needsRender = true;
    }
    if (moving) {
      moving = dough.step(dt);
      posAttr.needsUpdate = true;
      nrmAttr.needsUpdate = true;
      needsRender = true;
    }
    if (wetting) {
      wetting = dough.dry(dt);
      colorDirty = true;
    }
    if (colorDirty) {
      dough.paint();
      colAttr.needsUpdate = true;
      glossAttr.needsUpdate = true;
      colorDirty = false;
      needsRender = true;
    }
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  };
  resize();
  placeCamera();
  raf = requestAnimationFrame(frame);

  const wake = () => {
    moving = true;
    colorDirty = true;
    needsRender = true;
  };

  return {
    undo() {
      if (edit) return;
      const s = past.pop();
      if (!s) return;
      future.push(dough.shot());
      dough.restore(s);
      wake();
      syncUi();
      reframe();
      scheduleSave();
    },
    redo() {
      if (edit) return;
      const s = future.pop();
      if (!s) return;
      past.push(dough.shot());
      dough.restore(s);
      wake();
      syncUi();
      reframe();
      scheduleSave();
    },
    fresh() {
      if (edit) return;
      past.push(dough.shot());
      if (past.length > HISTORY) past.shift();
      future = [];
      dough.reset(linear(MASSA));
      feel.touch(1.2);
      wake();
      syncUi();
      userZoom = false;
      reframe();
      scheduleSave();
    },
    spin() {
      if (Math.abs(spinVel) > 1e-4) spinVel = 0;
      else spinVel = 0.0042;
      feel.tick(8);
      useClay.getState().set({ spinning: spinVel !== 0 });
    },
    photo() {
      const vis = ring.visible;
      ring.visible = false;
      try {
        renderer.render(scene, camera);
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      } finally {
        ring.visible = vis;
        needsRender = true;
      }
    },
    stl() {
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.BufferAttribute(dough.rest.slice(), 3));
      g2.setIndex(new THREE.BufferAttribute(dough.idx, 1));
      const m = new THREE.Mesh(g2);
      // em milímetros
      m.scale.setScalar(10);
      m.updateMatrixWorld(true);
      const data = new STLExporter().parse(m, { binary: true });
      g2.dispose();
      return new Blob([data as BlobPart], { type: 'model/stl' });
    },
    dispose() {
      cancelAnimationFrame(raf);
      if (saveTimer) clearTimeout(saveTimer);
      saveDough(dough);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', noMenu);
      feel.release();
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const x of mats) {
          (x as THREE.MeshStandardMaterial).map?.dispose();
          x.dispose();
        }
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
