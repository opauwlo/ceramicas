import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { DENSITY } from '../model/spec';
import { useStore } from '../state/store';
import { CUTTER_SIZES, cutterOutline } from './cutters';
import { Dough, type DoughShot, type RGB, type XZ } from './dough';
import { feel, type Flow } from './feel';
import type { V3 } from './mesh';
import { makeBlade, makeCutter, makeDrop, makeHandTool, makeLevelers, makePaintPot, makeRoller, makeTurntable, makeTurntableFoot, type HandTool } from './props';
import { snapLine, snapPath, snapPoint, type SnapLine, type SnapPath } from './snap';
import { useClay, type ClayTool } from './state';
import { loadDough, saveDough } from './storage';

/*
 * A bancada: a massa em cima da base de corte, na bailarina, com as ferramentas.
 *
 * A ferramenta escolhida fica deitada ao lado da massa, sempre à vista. Um toque manda ela
 * trabalhar: ela vai até a massa, faz o serviço animado e volta para o lugar.
 *  - Rolo: cada toque é uma passada (vai e volta), alternando a direção. Segurar continua rolando.
 *  - Cortador, espátula, esteca e boleador: enquanto o dedo está na tela aparece a sugestão
 *    (o ímã acerta o lugar: centro, grade de 0,5 cm, reta, círculo); ao soltar, a ferramenta age.
 *  - Pincéis, esponja, lixa e silicone: vêm até o dedo e trabalham enquanto ele anda (com o traço
 *    suavizado), e voltam quando solta.
 *  - Dedo: aperta, arrasta, esfrega e belisca direto na massa.
 * A massa e a base de corte giram juntas na bailarina, só enquanto se arrasta fora da massa
 * (ou um quarto de volta pelo botão). As ferramentas trabalham nas medidas da massa ("local").
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
  /** um quarto de volta na bailarina */
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

type LiveTool = 'silicone' | 'agua' | 'esponja' | 'lixa' | 'tinta' | 'verniz';
type AimTool = 'cortador' | 'espatula' | 'esteca' | 'boleador';

type Gesture =
  | { kind: 'none' }
  | { kind: 'orbit'; id: number; sx: number; lx: number; ly: number; moved: boolean }
  | { kind: 'zoom'; d0: number; dist0: number }
  | { kind: 'knead'; id: number; c: V3; n: V3; force: number; trail: Array<[number, number, number]>; lx: number; ly: number; dx: number; dy: number }
  | { kind: 'pinch'; a: number; b: number; lastD: number; r: number }
  | { kind: 'live'; id: number; tool: LiveTool; prev: V3 | null; sx: number; sy: number; lx: number; ly: number }
  | { kind: 'aim'; id: number; tool: AimTool; sx: number; sy: number; start: XZ | null; raw: XZ[]; end: XZ | null; key: string }
  | { kind: 'roll'; id: number }
  /** toque na bancada fora da massa com o dedo: não faz nada (e não gira a bailarina) */
  | { kind: 'idle'; id: number };

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
}

interface Step {
  dur: number;
  start?(): void;
  tick(u: number, dt: number): void;
  end?(): void;
}

const HISTORY = 30;

/** Medidas de cada ferramenta, em cm. */
const BOL = { P: 0.12, M: 0.22, G: 0.35 } as const;
const ESTECA = { fina: [0.12, 0.12], grossa: [0.2, 0.2] } as const;
const R_LIVE: Record<LiveTool, number> = { silicone: 0.35, agua: 0.3, esponja: 0.85, lixa: 0.55, tinta: 0.16, verniz: 0.3 };
/** pincel largo de tinta e de verniz */
const R_LARGO = 0.42;
/** As ferramentas de mão aparecem nesse tamanho (o desenho original é de cabo comprido). */
const HAND_SCALE = 0.6;

const FLOW_OF: Record<LiveTool, Flow> = { silicone: 'rub', agua: 'brush', esponja: 'sponge', lixa: 'sand', tinta: 'brush', verniz: 'brush' };
const DOING_OF: Record<LiveTool, string> = {
  silicone: 'esfumando',
  agua: 'molhando e alisando',
  esponja: 'passando a esponja',
  lixa: 'lixando',
  tinta: 'pintando',
  verniz: 'envernizando',
};

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const easeOutBack = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
const UP = new THREE.Vector3(0, 1, 0);

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

  // ---------- massa ----------
  const dough = new Dough(1.6, 5, linear(MASSA));
  loadDough(dough);
  dough.measure();
  dough.paint();
  dough.squash(0.55);
  let ext = dough.extent();
  const refreshExt = () => {
    ext = dough.extent();
  };

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

  // ---------- câmera ----------
  let camDirty = true;
  /** direita e frente de quem olha, deitadas na mesa (a câmera só sobe e desce, então não mudam) */
  const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const placeCamera = () => {
    const cp = Math.cos(pitch);
    camera.position.set(target.x + dist * cp * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * cp * Math.cos(yaw));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camDirty = false;
  };
  /** Enquadra a massa e a ferramenta deitada ao lado, ocupando bem a tela. */
  const reframe = () => {
    if (userZoom) return;
    const Rr = Math.max(2.2, ext.radius + 1.3);
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const span = Math.min(t * camera.aspect, t);
    distGoal = Math.min(30, Math.max(5, (2 * Rr) / 0.86 / span));
    target.y = Math.max(0.3, ext.top * 0.42);
    camDirty = true;
  };

  // ---------- ferramentas em 3D ----------
  const accent = 0xe0703f;
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
  const pot = makePaintPot();
  scene.add(pot.group);
  const drop = makeDrop();
  scene.add(drop);
  const hands = new Map<HandTool, ReturnType<typeof makeHandTool>>();
  const handOf = (k: HandTool) => {
    let h = hands.get(k);
    if (!h) {
      h = makeHandTool(k);
      h.group.visible = false;
      scene.add(h.group);
      hands.set(k, h);
    }
    // a bolinha do boleador no tamanho escolhido (a ferramenta toda aparece reduzida)
    if (k === 'boleador') h.ball?.scale.setScalar(BOL[useClay.getState().bol] / HAND_SCALE);
    return h;
  };
  let cutterMesh: THREE.Mesh | null = null;
  let cutterKey = '';
  const ghostMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.45, depthWrite: false });
  const ghostCutter = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat);
  ghostCutter.visible = false;
  ghostCutter.renderOrder = 3;
  scene.add(ghostCutter);
  const ensureCutter = () => {
    const s = useClay.getState();
    const key = `${s.cutter}-${s.cutterSize}`;
    if (cutterMesh && key === cutterKey) return cutterMesh;
    if (cutterMesh) {
      scene.remove(cutterMesh);
      cutterMesh.geometry.dispose();
    }
    cutterMesh = makeCutter(cutterOutline(s.cutter), CUTTER_SIZES[s.cutterSize]);
    cutterMesh.visible = false;
    cutterKey = key;
    scene.add(cutterMesh);
    ghostCutter.geometry = cutterMesh.geometry;
    return cutterMesh;
  };
  // sugestões do ímã: desenhadas na massa (nas medidas dela, girando junto)
  const ghostBall = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), ghostMat);
  ghostBall.visible = false;
  ghostBall.renderOrder = 3;
  turn.add(ghostBall);
  const tubeMat = new THREE.MeshBasicMaterial({ color: accent });
  const rawMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.3, depthWrite: false });
  const tubeSug = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
  const tubeRaw = new THREE.Mesh(new THREE.BufferGeometry(), rawMat);
  tubeSug.renderOrder = 4;
  tubeRaw.renderOrder = 3;
  tubeSug.visible = tubeRaw.visible = false;
  turn.add(tubeSug, tubeRaw);
  const setTube = (m: THREE.Mesh, pts: V3[], radius: number, closed = false) => {
    m.geometry.dispose();
    if (pts.length < 2) {
      m.visible = false;
      m.geometry = new THREE.BufferGeometry();
      return;
    }
    const curve = new THREE.CatmullRomCurve3(
      pts.map(p => new THREE.Vector3(p[0], p[1], p[2])),
      closed,
    );
    m.geometry = new THREE.TubeGeometry(curve, Math.min(400, pts.length * 2), radius, 6, closed);
    m.visible = true;
  };
  const clearPreview = () => {
    ghostCutter.visible = false;
    ghostBall.visible = false;
    tubeSug.visible = false;
    tubeRaw.visible = false;
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
  const markChanged = () => {
    if (edit) edit.changed = true;
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
    }
    edit = null;
    refreshExt();
    reframe();
    syncUi();
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
    qSpin.setFromAxisAngle(UP, spinAngle);
    const nw = nl.clone().applyQuaternion(qSpin);
    const cl = turn.worldToLocal(h.point.clone());
    const d = ray.ray.direction;
    return { c: [cl.x, cl.y, cl.z], n: [nl.x, nl.y, nl.z], cw: h.point.clone(), nw, face: -nw.dot(d) };
  };
  /** Ponto da mesa (plano y = h) sob o dedo, no mundo. */
  const groundAt = (x: number, y: number, h = 0): THREE.Vector3 | null => {
    aim(x, y);
    return ray.ray.intersectPlane(new THREE.Plane(UP, -h), new THREE.Vector3());
  };
  const toLocalXZ = (w: THREE.Vector3): XZ => {
    turn.updateMatrixWorld();
    const l = turn.worldToLocal(new THREE.Vector3(w.x, 0, w.z));
    return [l.x, l.z];
  };
  const toWorld = (x: number, y: number, z: number) => {
    turn.updateMatrixWorld();
    return turn.localToWorld(new THREE.Vector3(x, y, z));
  };
  const nToWorld = (n: V3) => {
    qSpin.setFromAxisAngle(UP, spinAngle);
    return new THREE.Vector3(n[0], n[1], n[2]).applyQuaternion(qSpin);
  };
  const dirToLocal = (d: XZ): XZ => {
    const c = Math.cos(spinAngle);
    const s = Math.sin(spinAngle);
    return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
  };
  /** Ponto da superfície de cima da massa em (x, z) local, olhando de cima. */
  const down = new THREE.Vector3(0, -1, 0);
  const surfaceAt = (x: number, z: number): { c: V3; n: V3 } | null => {
    ray.set(toWorld(x, 30, z), down);
    const h = ray.intersectObject(mesh, false)[0];
    if (!h || !h.face) return null;
    const cl = turn.worldToLocal(h.point.clone());
    const n = h.face.normal;
    return { c: [cl.x, cl.y, cl.z], n: [n.x, n.y, n.z] };
  };
  const centerLocal = (): XZ => [ext.cx, ext.cz];
  const centerWorld = () => toWorld(ext.cx, 0, ext.cz);
  /** raio do dedo na massa, em cm */
  const fingerR = (p: Ptr) => {
    const px = Math.min(70, Math.max(22, p.w > 2 ? p.w : 34));
    return Math.min(0.9, Math.max(0.2, px * 1.1 * wpp()));
  };

  // ---------- animações em fila (a ferramenta indo, trabalhando e voltando) ----------
  let steps: Step[] = [];
  let stepT0 = 0;
  let stepStarted = false;
  let afterSteps: (() => void) | null = null;
  const busy = () => steps.length > 0;
  const run = (list: Step[], done?: () => void) => {
    steps = list;
    stepT0 = performance.now();
    stepStarted = false;
    afterSteps = done ?? null;
    needsRender = true;
  };
  const tickSteps = (now: number, dt: number) => {
    while (steps.length) {
      const s = steps[0];
      if (!stepStarted) {
        s.start?.();
        stepStarted = true;
        stepT0 = now;
      }
      const u = s.dur <= 0 ? 1 : Math.min(1, (now - stepT0) / s.dur);
      s.tick(u, dt);
      needsRender = true;
      if (u < 1) return;
      s.end?.();
      steps.shift();
      stepStarted = false;
      stepT0 = now;
    }
    if (afterSteps) {
      const f = afterSteps;
      afterSteps = null;
      f();
    }
  };
  const poseOf = (o: THREE.Object3D): Pose => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
  const setPose = (o: THREE.Object3D, a: Pose, b: Pose, u: number) => {
    o.position.lerpVectors(a.p, b.p, u);
    o.quaternion.slerpQuaternions(a.q, b.q, u);
    o.scale.lerpVectors(a.s, b.s, u);
  };
  /** Passo que leva o objeto da pose atual até `to()` (calculada na hora em que o passo começa). */
  const moveTo = (o: THREE.Object3D, to: () => Pose, dur: number, curve: (u: number) => number = ease): Step => {
    let a: Pose | null = null;
    let b: Pose | null = null;
    return {
      dur,
      start() {
        a = poseOf(o);
        b = to();
      },
      tick(u) {
        if (a && b) setPose(o, a, b, curve(u));
      },
    };
  };

  // ---------- a ferramenta deitada ao lado da massa ----------
  /** Lugar de descanso: à direita da massa, um pouco para perto de quem olha. */
  const slot = () => centerWorld().addScaledVector(R, ext.radius + 1.0).addScaledVector(F, -0.5);
  const basisQ = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const negR = R.clone().negate();
  /** Direita da tela, para longe e para cima: o cortador fica "de pé" para quem olha. */
  const screenQ = basisQ(R, F, UP);
  /** Cabo deitado apontando para longe, girado um tiquinho para parecer largado na mesa. */
  const lyingQ = new THREE.Quaternion().setFromAxisAngle(UP, 0.25).multiply(screenQ);
  const rollerQ = (axis: THREE.Vector3) => new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-axis.z, axis.x));
  const one = new THREE.Vector3(1, 1, 1);

  type RigKey = ClayTool | 'pote' | '';
  const rigKeyOf = (): RigKey => {
    const s = useClay.getState();
    if (s.tool === 'dedo') return '';
    if (s.tool === 'tinta') return s.tintaModo === 'pingo' ? 'pote' : 'tinta';
    return s.tool;
  };
  const rigObj = (k: RigKey): THREE.Object3D | null => {
    switch (k) {
      case '':
        return null;
      case 'rolo':
        return roller.group;
      case 'espatula':
        return blade;
      case 'cortador':
        return ensureCutter();
      case 'pote':
        return pot.group;
      case 'dedo':
        return null;
      default:
        return handOf(k).group;
    }
  };
  const restPose = (k: RigKey): Pose => {
    const sp = slot();
    switch (k) {
      case 'rolo': {
        roller.setLength(Math.max(3.6, 2 * ext.radius + 1.4));
        return { p: centerWorld().addScaledVector(F, -(ext.radius + 0.9)), q: rollerQ(R), s: one.clone() };
      }
      case 'espatula':
        // deitada, com a lâmina ao comprido apontando para longe
        return { p: sp.clone().setY(0.02), q: basisQ(F, negR, UP), s: new THREE.Vector3(2.6, 0.7, 1) };
      case 'cortador':
        return { p: sp.clone().setY(0), q: screenQ.clone(), s: one.clone() };
      case 'pote':
        return { p: sp.clone().setY(0), q: new THREE.Quaternion(), s: one.clone() };
      case 'esponja':
      case 'lixa':
        return { p: sp.clone().setY(0), q: new THREE.Quaternion().setFromAxisAngle(UP, 0.3), s: one.clone().multiplyScalar(0.75) };
      default:
        return { p: sp.clone().setY(0.1), q: lyingQ.clone(), s: one.clone().multiplyScalar(HAND_SCALE) };
    }
  };
  let rigKey: RigKey = '';
  let rig: THREE.Object3D | null = null;
  /** chegando na bancada (pulinho quando troca de ferramenta) */
  let rigIntro = 0;
  const syncRig = () => {
    const k = rigKeyOf();
    if (k === rigKey && rig === rigObj(k)) return;
    if (rig) rig.visible = false;
    rigKey = k;
    rig = rigObj(k);
    clearPreview();
    levelers.group.visible = false;
    if (rig) {
      setPose(rig, restPose(k), restPose(k), 1);
      rig.visible = true;
      rigIntro = performance.now();
      if (k === 'pote') pot.setColor(useClay.getState().color);
    }
    needsRender = true;
  };
  /** Parada no lugar, acompanhando a massa quando ela cresce ou gira. */
  const idleRig = (now: number) => {
    if (!rig || busy()) return;
    if (g.kind === 'live') return;
    const r = restPose(rigKey);
    const t = Math.min(1, (now - rigIntro) / 380);
    if (t < 1) r.p.y += 1.6 * (1 - easeOutBack(t));
    const d = rig.position.distanceTo(r.p) + rig.scale.distanceTo(r.s) + 1 - Math.abs(rig.quaternion.dot(r.q));
    if (d < 1e-4) return;
    setPose(rig, poseOf(rig), r, t < 1 ? 1 : 0.25);
    needsRender = true;
  };
  const unsubRig = useClay.subscribe((s, prev) => {
    if (s.tool !== prev.tool || s.tintaModo !== prev.tintaModo || s.cutter !== prev.cutter || s.cutterSize !== prev.cutterSize) syncRig();
    if (s.color !== prev.color && rigKey === 'pote') pot.setColor(s.color);
    if (s.bol !== prev.bol && hands.has('boleador')) {
      handOf('boleador');
      needsRender = true;
    }
  });

  // ---------- rolo: cada passada animada ----------
  let rollHold = false;
  let rollAxis = 0;
  let leveledToast = false;
  const rollPass = () => {
    if (busy() || !rig || rigKey !== 'rolo') return;
    const s = useClay.getState();
    const nivel = s.nivel / 10;
    const floor = nivel > 0 ? nivel : 0.15;
    const H0 = ext.top;
    const H1 = H0 - floor < 0.02 ? floor : Math.max(floor, Math.min(H0 - 0.12, floor + (H0 - floor) * 0.45));
    // alterna a direção: de frente para trás, depois de um lado para o outro
    const dirW = rollAxis % 2 === 0 ? F.clone() : R.clone();
    const axisW = rollAxis % 2 === 0 ? R.clone() : F.clone().negate();
    rollAxis++;
    const dirL = dirToLocal([dirW.x, dirW.z]);
    beginEdit();
    const rad = () => ext.radius;
    const path = (t: number) => centerWorld().addScaledVector(dirW, -(rad() + 0.45) + t * 2 * (rad() + 0.45));
    let lastP: THREE.Vector3 | null = null;
    const rollStep = (from: number, to: number, H: (u: number) => number | null): Step => ({
      dur: 520,
      start() {
        lastP = null;
        roller.setLength(Math.max(3.6, 2 * rad() + 1.4));
      },
      tick(u) {
        const h = H(u);
        if (h !== null && h < ext.top - 1e-4 && dough.roll(dirL, h)) markChanged();
        dough.relax(0.5);
        dough.settle();
        refreshExt();
        markChanged();
        moving = true;
        colorDirty = true;
        const p = path(from + (to - from) * ease(u));
        const along = p.clone().sub(centerWorld()).dot(dirW);
        p.y = Math.abs(along) < rad() ? Math.max(nivel, ext.top) : nivel;
        if (lastP) roller.barrel.rotation.x += p.distanceTo(lastP) / roller.radius * (to > from ? -1 : 1);
        lastP = p.clone();
        roller.group.position.copy(p);
        feel.flow(0.7 * Math.sin(Math.PI * u), 'roll');
      },
    });
    const showLevelers = () => {
      if (nivel <= 0) return;
      levelers.set(s.nivel, rad() + 0.25, 2 * rad() + 2.4);
      levelers.group.position.copy(centerWorld());
      levelers.group.quaternion.copy(rollerQ(axisW));
      levelers.group.visible = true;
    };
    useClay.getState().set({ doing: 'abrindo a massa' });
    run(
      [
        {
          dur: 0,
          tick() {
            showLevelers();
          },
        },
        moveTo(roller.group, () => ({ p: path(0).setY(nivel), q: rollerQ(axisW), s: one.clone() }), 260),
        rollStep(0, 1, u => H0 + (H1 - H0) * ease(u)),
        rollStep(1, 0, () => null),
        {
          dur: 0,
          tick() {
            feel.release();
            levelers.group.visible = false;
            endEdit();
            const mm = Math.round(ext.top * 10);
            useClay.getState().set({ doing: '' });
            if (nivel > 0 && ext.top <= nivel + 0.005) {
              if (!leveledToast) useStore.getState().notify(`Placa de ${s.nivel} mm, certinha.`);
              leveledToast = true;
              feel.tick(20);
            } else {
              leveledToast = false;
              useStore.getState().notify(`${mm} mm. Toque de novo para abrir mais.`);
            }
          },
        },
        moveTo(roller.group, () => restPose('rolo'), 280),
      ],
      () => {
        if (rollHold) rollPass();
      },
    );
  };

  // ---------- cortador ----------
  const cutterStamp = (at: XZ) => {
    const cm = cutterMesh;
    if (busy() || !cm || rig !== cm) return;
    const s = useClay.getState();
    const half = CUTTER_SIZES[s.cutterSize] / 2;
    const top = ext.top;
    const w = toWorld(at[0], 0, at[1]);
    run([
      moveTo(cm, () => ({ p: w.clone().setY(top + 0.6), q: screenQ.clone(), s: one.clone() }), 300),
      moveTo(cm, () => ({ p: w.clone().setY(-0.04), q: screenQ.clone(), s: one.clone() }), 150, u => u * u),
      {
        dur: 0,
        tick() {
          beginEdit();
          const poly: XZ[] = cutterOutline(s.cutter).map(([u, v]) =>
            toLocalXZ(new THREE.Vector3(w.x + (R.x * u + F.x * v) * half, 0, w.z + (R.z * u + F.z * v) * half)),
          );
          if (dough.cutShape(poly, at) > 0) {
            markChanged();
            dough.settle(2);
            dough.squash(0.9);
            moving = true;
          }
          feel.cut(true);
          endEdit();
        },
      },
      moveTo(cm, () => ({ p: w.clone().setY(ext.top + 0.8), q: screenQ.clone(), s: one.clone() }), 220),
      moveTo(cm, () => restPose('cortador'), 320),
    ]);
  };

  // ---------- espátula ----------
  const bladeCut = (line: SnapLine) => {
    if (busy() || rig !== blade) return;
    const span = ext.radius + 0.5;
    const a = toWorld(line.o[0] - line.u[0] * span, 0, line.o[1] - line.u[1] * span);
    const b = toWorld(line.o[0] + line.u[0] * span, 0, line.o[1] + line.u[1] * span);
    const D = b.clone().sub(a).setY(0);
    const L = D.length();
    D.normalize();
    const m = a.clone().add(b).multiplyScalar(0.5);
    const hb = ext.top + 0.5;
    const q = basisQ(D, UP, D.clone().cross(UP));
    const sc = new THREE.Vector3(L, hb, 1);
    run([
      moveTo(blade, () => ({ p: m.clone().setY(ext.top + 0.15 + hb / 2), q, s: sc }), 320),
      moveTo(blade, () => ({ p: m.clone().setY(hb / 2 - 0.03), q, s: sc }), 150, u => u * u),
      {
        dur: 0,
        tick() {
          beginEdit();
          if (dough.cutPlane(line.o, [-line.u[1], line.u[0]]) > 0) {
            markChanged();
            dough.settle(2);
            dough.squash(0.92);
            moving = true;
            feel.cut();
          } else feel.tick(5);
          endEdit();
        },
      },
      moveTo(blade, () => ({ p: m.clone().setY(hb / 2 + 1), q, s: sc }), 220),
      moveTo(blade, () => restPose('espatula'), 320),
    ]);
  };

  // ---------- esteca e boleador seguindo um caminho ----------
  /** Pose de trabalho: ponta no ponto, cabo inclinado para quem olha. */
  const workPose = (tool: HandTool, cw: THREE.Vector3, nw: THREE.Vector3, lift = 0): Pose => {
    if (tool === 'esponja' || tool === 'lixa') {
      return { p: cw.clone().addScaledVector(nw, lift - 0.03), q: new THREE.Quaternion().setFromUnitVectors(UP, nw), s: one.clone().multiplyScalar(0.75) };
    }
    const toCam = camera.position.clone().sub(cw).normalize();
    const axis = nw.clone().multiplyScalar(0.45).addScaledVector(toCam, 0.75).addScaledVector(UP, 0.45).normalize();
    const p = cw.clone().addScaledVector(nw, lift);
    if (tool === 'boleador') p.addScaledVector(nw, BOL[useClay.getState().bol] * 0.95);
    return { p, q: new THREE.Quaternion().setFromUnitVectors(UP, axis), s: one.clone().multiplyScalar(HAND_SCALE) };
  };

  interface Sample {
    c: V3;
    n: V3;
  }
  const samplesOf = (pts: XZ[]): Sample[] => {
    const out: Sample[] = [];
    for (const [x, z] of pts) {
      const s = surfaceAt(x, z);
      if (s && s.n[1] > 0.2) out.push(s);
    }
    return out;
  };

  const tracePath = (tool: 'esteca' | 'boleador', path: SnapPath) => {
    if (busy() || !rig) return;
    const sm = samplesOf(path.pts);
    if (sm.length < 2) {
      useStore.getState().notify('Risque em cima da massa.');
      return;
    }
    const t = handOf(tool);
    const ui = useClay.getState();
    const B = BOL[ui.bol];
    const [er, ed] = ESTECA[ui.esteca];
    let done = 0;
    const wAt = (i: number) => toWorld(sm[i].c[0], sm[i].c[1], sm[i].c[2]);
    let len = 0;
    for (let i = 1; i < sm.length; i++) len += Math.hypot(sm[i].c[0] - sm[i - 1].c[0], sm[i].c[1] - sm[i - 1].c[1], sm[i].c[2] - sm[i - 1].c[2]);
    useClay.getState().set({ doing: tool === 'esteca' ? (path.kind === 'circulo' ? 'riscando um círculo' : 'vincando') : 'abrindo um sulco' });
    run([
      {
        dur: 0,
        tick() {
          beginEdit();
          done = 0;
        },
      },
      moveTo(t.group, () => workPose(tool, wAt(0), nToWorld(sm[0].n), 0.6), 260),
      moveTo(t.group, () => workPose(tool, wAt(0), nToWorld(sm[0].n)), 140),
      {
        dur: Math.min(2200, Math.max(450, len * 260)),
        tick(u) {
          const upto = Math.min(sm.length - 1, Math.floor(u * (sm.length - 1)));
          for (; done < upto; done++) {
            const a = sm[done];
            const b = sm[done + 1];
            // pulo grande (o caminho saiu da massa e voltou): não liga os dois lados
            if (Math.hypot(b.c[0] - a.c[0], b.c[2] - a.c[2]) > 0.3) continue;
            const n: V3 = [(a.n[0] + b.n[0]) / 2, (a.n[1] + b.n[1]) / 2, (a.n[2] + b.n[2]) / 2];
            if (tool === 'esteca') dough.crease(a.c, b.c, n, er, ed);
            else dough.ball(a.c, b.c, n, B, B * 0.6);
            markChanged();
          }
          dough.settle();
          moving = true;
          const i = Math.min(sm.length - 1, upto);
          setPose(t.group, workPose(tool, wAt(i), nToWorld(sm[i].n)), workPose(tool, wAt(i), nToWorld(sm[i].n)), 1);
          feel.flow(0.6, tool === 'esteca' ? 'scrape' : 'press');
        },
      },
      {
        dur: 0,
        tick() {
          feel.release();
          endEdit();
          useClay.getState().set({ doing: '' });
        },
      },
      moveTo(t.group, () => workPose(tool, wAt(sm.length - 1), nToWorld(sm[sm.length - 1].n), 0.6), 160),
      moveTo(t.group, () => restPose(tool), 280),
    ]);
  };

  const boleadorHole = (at: XZ) => {
    if (busy() || !rig) return;
    const s = surfaceAt(at[0], at[1]);
    if (!s) return;
    const t = handOf('boleador');
    const B = BOL[useClay.getState().bol];
    const cw = () => toWorld(s.c[0], s.c[1], s.c[2]);
    const nw = () => nToWorld(s.n);
    run([
      moveTo(t.group, () => workPose('boleador', cw(), nw(), 0.7), 280),
      {
        dur: 0,
        tick() {
          beginEdit();
        },
      },
      {
        dur: 380,
        start() {
          feel.touch(0.6);
        },
        tick(u) {
          const depth = B * 0.8 * ease(u);
          dough.ball(s.c, s.c, s.n, B, depth);
          dough.settle();
          markChanged();
          moving = true;
          setPose(t.group, workPose('boleador', cw(), nw(), -depth), workPose('boleador', cw(), nw(), -depth), 1);
          feel.flow(0.5, 'press');
        },
      },
      {
        dur: 0,
        tick() {
          feel.release();
          endEdit();
        },
      },
      moveTo(t.group, () => workPose('boleador', cw(), nw(), 0.7), 160),
      moveTo(t.group, () => restPose('boleador'), 280),
    ]);
  };

  // ---------- começar cada gesto ----------
  const ptrs = new Map<number, Ptr>();
  let g: Gesture = { kind: 'none' };
  let pendingDrop: { c: V3; n: V3; w: THREE.Vector3; t0: number; top: number } | null = null;

  const startKnead = (id: number, p: Ptr, h: Hit, ev: PointerEvent) => {
    beginEdit();
    const force = ev.width > 2 ? Math.min(1.6, Math.max(0.7, Math.sqrt(ev.width / 30))) : 1;
    const s = useClay.getState();
    if (s.tool === 'tinta') {
      // o pingo cai do alto e só tinge quando encosta
      pendingDrop = { c: h.c, n: h.n, w: h.cw.clone(), t0: performance.now(), top: h.cw.y + 2.2 };
      (drop.material as THREE.MeshStandardMaterial).color.set(s.color);
      drop.visible = true;
    } else {
      dough.poke(h.c, h.n, fingerR(p), 2.2 * force);
      moving = true;
      feel.touch(force);
    }
    g = { kind: 'knead', id, c: h.c, n: h.n, force, trail: [[performance.now(), p.x, p.y]], lx: p.x, ly: p.y, dx: 0, dy: 0 };
  };

  const startLive = (id: number, p: Ptr, tool: LiveTool) => {
    beginEdit();
    feel.touch(tool === 'esponja' ? 0.8 : 0.35);
    g = { kind: 'live', id, tool, prev: null, sx: p.x, sy: p.y, lx: p.x, ly: p.y };
    useClay.getState().set({ doing: DOING_OF[tool] });
  };

  /** Ponto da mesa (local) que o dedo está apontando, na altura do topo da massa. */
  const aimLocal = (x: number, y: number, tool: AimTool): XZ | null => {
    if (tool === 'esteca' || tool === 'boleador') {
      const h = hitAt(x, y);
      if (h && h.face > 0.2) return [h.c[0], h.c[2]];
    }
    const gp = groundAt(x, y, tool === 'espatula' ? ext.top * 0.5 : ext.top);
    return gp ? toLocalXZ(gp) : null;
  };

  const startAim = (id: number, p: Ptr, tool: AimTool) => {
    const at = aimLocal(p.x, p.y, tool);
    g = { kind: 'aim', id, tool, sx: p.x, sy: p.y, start: at, raw: at ? [at] : [], end: at, key: '' };
    feel.tick(5);
    updateAim(g);
  };

  /** Desenha a sugestão do ímã e dá um toquinho quando ela gruda num lugar novo. */
  const updateAim = (a: Extract<Gesture, { kind: 'aim' }>) => {
    const c = centerLocal();
    const ui = useClay.getState();
    let key = '';
    let label = '';
    const moved = Math.hypot((ptrs.get(a.id)?.x ?? a.sx) - a.sx, (ptrs.get(a.id)?.y ?? a.sy) - a.sy);
    if (a.tool === 'cortador' && a.end && cutterMesh) {
      const s = snapPoint(a.end, c);
      const w = toWorld(s.p[0], 0, s.p[1]);
      ghostCutter.position.set(w.x, ext.top + 0.02, w.z);
      ghostCutter.quaternion.copy(screenQ);
      ghostCutter.scale.set(1, 1, 0.08);
      ghostCutter.visible = true;
      key = `${s.kind}:${s.p[0].toFixed(2)},${s.p[1].toFixed(2)}`;
      label = s.kind === 'centro' ? 'ímã: no meio da massa' : s.kind === 'grade' ? 'ímã: na grade' : 'solte para cortar';
    } else if (a.tool === 'espatula' && a.start && a.end) {
      if (moved < 18) {
        tubeSug.visible = false;
        label = 'arraste para riscar o corte';
      } else {
        const l = snapLine(a.start, a.end, c);
        const pts: V3[] = [];
        const span = ext.radius + 0.4;
        for (let t = -span; t <= span; t += 0.08) {
          const s = surfaceAt(l.o[0] + l.u[0] * t, l.o[1] + l.u[1] * t);
          if (s) pts.push([s.c[0] + s.n[0] * 0.03, s.c[1] + s.n[1] * 0.03, s.c[2] + s.n[2] * 0.03]);
        }
        setTube(tubeSug, pts, 0.035);
        key = `${l.kind}:${l.o[0].toFixed(2)},${l.o[1].toFixed(2)},${l.u[0].toFixed(2)}`;
        label = l.kind === 'centro' ? 'ímã: pelo meio' : l.kind === 'grade' ? 'ímã: na grade' : 'solte para cortar';
      }
    } else if (a.tool === 'esteca' || a.tool === 'boleador') {
      const pathLen = a.raw.reduce((L, p, i) => (i ? L + Math.hypot(p[0] - a.raw[i - 1][0], p[1] - a.raw[i - 1][1]) : 0), 0);
      if (a.tool === 'boleador' && pathLen < 0.35) {
        tubeSug.visible = tubeRaw.visible = false;
        const s = snapPoint(a.end ?? c, c);
        const sf = surfaceAt(s.p[0], s.p[1]);
        if (sf) {
          const B = BOL[ui.bol];
          ghostBall.position.set(sf.c[0] + sf.n[0] * B * 0.6, sf.c[1] + sf.n[1] * B * 0.6, sf.c[2] + sf.n[2] * B * 0.6);
          ghostBall.scale.setScalar(B);
          ghostBall.visible = true;
        }
        key = `${s.kind}:${s.p[0].toFixed(2)},${s.p[1].toFixed(2)}`;
        label = s.kind === 'centro' ? 'ímã: no meio da massa' : s.kind === 'grade' ? 'ímã: na grade' : 'solte para furar';
      } else if (a.raw.length > 1) {
        ghostBall.visible = false;
        const sp = snapPath(a.raw, c, 0.08);
        const lift = (pts: XZ[]) => {
          const out: V3[] = [];
          for (const [x, z] of pts) {
            const s = surfaceAt(x, z);
            if (s) out.push([s.c[0] + s.n[0] * 0.03, s.c[1] + s.n[1] * 0.03, s.c[2] + s.n[2] * 0.03]);
          }
          return out;
        };
        setTube(tubeRaw, lift(a.raw), 0.02);
        setTube(tubeSug, lift(sp.pts), 0.035, sp.closed);
        key = sp.kind;
        label = sp.kind === 'reta' ? 'ímã: reta' : sp.kind === 'circulo' ? 'ímã: círculo em volta do meio' : 'solte para riscar';
      }
    }
    if (key && key !== a.key && (key.startsWith('centro') || key.startsWith('grade') || key === 'reta' || key === 'circulo')) feel.tick(7);
    a.key = key;
    if (label && ui.doing !== label) ui.set({ doing: label });
    needsRender = true;
  };

  const finishAim = (a: Extract<Gesture, { kind: 'aim' }>, cancel: boolean) => {
    clearPreview();
    useClay.getState().set({ doing: '' });
    if (cancel) return;
    const c = centerLocal();
    if (a.tool === 'cortador') {
      if (!a.end) return;
      const s = snapPoint(a.end, c);
      if (Math.hypot(s.p[0] - c[0], s.p[1] - c[1]) > ext.radius + 0.3) {
        useStore.getState().notify('Toque em cima da massa para cortar.');
        return;
      }
      cutterStamp(s.p);
    } else if (a.tool === 'espatula') {
      if (!a.start || !a.end || Math.hypot(a.end[0] - a.start[0], a.end[1] - a.start[1]) < 0.4) {
        useStore.getState().notify('Arraste o dedo para riscar onde cortar.');
        return;
      }
      bladeCut(snapLine(a.start, a.end, c));
    } else {
      const pathLen = a.raw.reduce((L, q, i) => (i ? L + Math.hypot(q[0] - a.raw[i - 1][0], q[1] - a.raw[i - 1][1]) : 0), 0);
      if (a.tool === 'boleador' && pathLen < 0.35) {
        boleadorHole(snapPoint(a.end ?? c, c).p);
        return;
      }
      if (pathLen < 0.25) {
        useStore.getState().notify('Arraste o dedo em cima da massa para riscar.');
        return;
      }
      tracePath(a.tool, snapPath(a.raw, c, 0.06));
    }
  };

  const finishStroke = () => {
    feel.release();
    ring.visible = false;
    needsRender = true;
    useClay.getState().set({ doing: '' });
    endEdit();
  };

  // ---------- dedos ----------
  const onDown = (ev: PointerEvent) => {
    if (ptrs.size >= 2) return;
    canvas.setPointerCapture?.(ev.pointerId);
    const p: Ptr = { x: ev.clientX, y: ev.clientY, w: ev.width || 0 };
    ptrs.set(ev.pointerId, p);
    if (ptrs.size === 1) {
      const s = useClay.getState();
      const tool = s.tool;
      const h = hitAt(p.x, p.y);
      const gp = groundAt(p.x, p.y, 0);
      const onTable = !!gp && Math.hypot(gp.x, gp.z) < table.radius * 1.8;
      // em cima da bancada (bailarina e base de corte) a bailarina nunca gira: só arrastando o fundo
      const onBench = !!gp && Math.hypot(gp.x, gp.z) < table.radius * 1.12;
      const orbit = () => {
        g = { kind: 'orbit', id: ev.pointerId, sx: p.x, lx: p.x, ly: p.y, moved: false };
      };
      if (busy()) {
        // a ferramenta está trabalhando: segurar o rolo continua rolando; na bancada, nada acontece
        if (tool === 'rolo' && (h || onTable)) {
          rollHold = true;
          g = { kind: 'roll', id: ev.pointerId };
          return;
        }
        if (h || onBench) {
          g = { kind: 'idle', id: ev.pointerId };
          return;
        }
        return orbit();
      }
      if (tool === 'rolo' && (h || onTable)) {
        rollHold = true;
        g = { kind: 'roll', id: ev.pointerId };
        rollPass();
        return;
      }
      if (tool === 'espatula' && (h || gp)) return startAim(ev.pointerId, p, 'espatula');
      if (tool === 'cortador' && (h || onTable)) return startAim(ev.pointerId, p, 'cortador');
      // esteca, boleador e pincéis podem começar fora da massa: só agem quando o dedo chega nela
      if ((tool === 'esteca' || tool === 'boleador') && (h || onBench)) return startAim(ev.pointerId, p, tool);
      if ((h || onBench) && (tool === 'silicone' || tool === 'agua' || tool === 'esponja' || tool === 'lixa' || tool === 'verniz')) return startLive(ev.pointerId, p, tool);
      if ((h || onBench) && tool === 'tinta' && s.tintaModo === 'pincel') return startLive(ev.pointerId, p, 'tinta');
      if (h && (tool === 'dedo' || tool === 'tinta')) return startKnead(ev.pointerId, p, h, ev);
      if (onBench) {
        g = { kind: 'idle', id: ev.pointerId };
        return;
      }
      return orbit();
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
    // qualquer outra ferramenta: o segundo dedo larga ela (sem agir) e vira zoom
    if (g.kind === 'live') {
      finishStroke();
      if (rig) run([moveTo(rig, () => restPose(rigKey), 260)]);
    }
    if (g.kind === 'aim') {
      clearPreview();
      useClay.getState().set({ doing: '' });
    }
    if (g.kind === 'roll') rollHold = false;
    g = { kind: 'zoom', d0: Math.max(10, d), dist0: dist };
  };

  const onMove = (ev: PointerEvent) => {
    const p = ptrs.get(ev.pointerId);
    if (!p) return;
    p.x = ev.clientX;
    p.y = ev.clientY;
    if (ev.width > 2) p.w = ev.width;
    if (g.kind === 'orbit' && g.id === ev.pointerId) {
      // só gira depois de um arrasto de verdade: um toque que erra a massa não mexe em nada
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.ly) < 12) return;
      if (!g.moved) {
        g.moved = true;
        g.lx = p.x;
        g.ly = p.y;
        return;
      }
      const dx = p.x - g.lx;
      const dy = p.y - g.ly;
      spinAngle += dx * 0.011;
      pitch = Math.min(1.4, Math.max(0.12, pitch + dy * 0.006));
      g.lx = p.x;
      g.ly = p.y;
      camDirty = true;
      needsRender = true;
    } else if (g.kind === 'zoom' && ptrs.size === 2) {
      const [pa, pb] = [...ptrs.values()];
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      dist = Math.min(32, Math.max(3.5, (g.dist0 * g.d0) / Math.max(10, d)));
      distGoal = dist;
      userZoom = true;
      camDirty = true;
    } else if (g.kind === 'aim' && g.id === ev.pointerId) {
      const at = aimLocal(p.x, p.y, g.tool);
      if (at) {
        g.end = at;
        if (!g.start) g.start = at;
        const last = g.raw[g.raw.length - 1];
        if (!last || Math.hypot(at[0] - last[0], at[1] - last[1]) > 0.03) g.raw.push(at);
      }
      updateAim(g);
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!ptrs.has(ev.pointerId)) return;
    const cancel = ev.type === 'pointercancel';
    if (g.kind === 'aim' && g.id === ev.pointerId) {
      const a = g;
      g = { kind: 'none' };
      finishAim(a, cancel);
    }
    ptrs.delete(ev.pointerId);
    if (g.kind === 'knead' && g.id === ev.pointerId) {
      finishStroke();
      g = { kind: 'none' };
    } else if (g.kind === 'live' && g.id === ev.pointerId) {
      finishStroke();
      g = { kind: 'none' };
      if (rig) run([moveTo(rig, () => restPose(rigKey), 280)]);
    } else if (g.kind === 'pinch' && (g.a === ev.pointerId || g.b === ev.pointerId)) {
      finishStroke();
      g = { kind: 'none' };
    } else if (g.kind === 'roll' && g.id === ev.pointerId) {
      rollHold = false;
      g = { kind: 'none' };
    } else if ((g.kind === 'orbit' || g.kind === 'idle') && g.id === ev.pointerId) g = { kind: 'none' };
    else if (g.kind === 'zoom') g = { kind: 'none' };
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
  /** um quarto de volta da bailarina, animado */
  let turnAnim: { from: number; to: number; t0: number } | null = null;

  const showRing = (h: Hit, r: number, pulse: number) => {
    ring.visible = true;
    ring.position.copy(h.cw).addScaledVector(h.nw, 0.02);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.nw);
    ring.scale.setScalar(r * pulse);
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

  /** Pincéis, esponja, lixa e silicone: seguem o dedo com o traço suavizado. [forma, cor] */
  const liveFrame = (s: Extract<Gesture, { kind: 'live' }>, dt: number): [boolean, boolean] => {
    const p = ptrs.get(s.id);
    if (!p) return [false, false];
    // o traço anda um pouco atrás do dedo: tira a tremedeira
    s.sx += (p.x - s.sx) * 0.45;
    s.sy += (p.y - s.sy) * 0.45;
    const speed = Math.hypot(s.sx - s.lx, s.sy - s.ly) / Math.max(1e-3, dt);
    s.lx = s.sx;
    s.ly = s.sy;
    const h = hitAt(s.sx, s.sy);
    if (!h || h.face < 0.22) {
      s.prev = null;
      feel.flow(0, FLOW_OF[s.tool]);
      return [false, false];
    }
    const a = s.prev ?? h.c;
    const b = h.c;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const from = seg > 1.2 ? b : a;
    s.prev = b;
    const ui = useClay.getState();
    let shape = false;
    let color = false;
    switch (s.tool) {
      case 'silicone': {
        const r = R_LIVE.silicone;
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
        const r = R_LIVE.agua;
        dough.smooth(b, r, 0.5, 0.2);
        dough.smooth(b, r, 0.5, 0.2);
        dough.wetSeg(from, b, r * 1.3, 0.35);
        shape = color = true;
        wetting = true;
        break;
      }
      case 'esponja': {
        const r = R_LIVE.esponja;
        dough.smooth(b, r, 0.35, 0.08);
        dough.smooth(b, r, 0.35, 0.08);
        dough.wetSeg(from, b, r, 0.22);
        shape = color = true;
        wetting = true;
        break;
      }
      case 'lixa':
        dough.sand(b, R_LIVE.lixa, 0.9);
        dough.sand(b, R_LIVE.lixa, 0.9);
        shape = color = true;
        break;
      case 'tinta':
        dough.paintSeg(from, b, ui.pincel === 'largo' ? R_LARGO : R_LIVE.tinta, linear(ui.color));
        color = true;
        break;
      case 'verniz':
        dough.varnishSeg(from, b, ui.pincel === 'largo' ? R_LARGO : R_LIVE.verniz, ui.verniz === 'brilho');
        color = true;
        break;
    }
    feel.flow(Math.min(1, speed / 800 + 0.05), FLOW_OF[s.tool]);
    // a ferramenta desliza do lugar dela até o dedo e acompanha
    if (rig) {
      const tgt = workPose(s.tool, h.cw, h.nw);
      if (s.tool === 'tinta') handOf('tinta').paint?.color.set(ui.color);
      setPose(rig, poseOf(rig), tgt, 0.45);
    }
    return [shape, color];
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
    else if (g.kind === 'live') [shaped, tinted] = liveFrame(g, dt);
    if (shaped) dough.settle();
    if (shaped || tinted) {
      markChanged();
      colorDirty = true;
      needsRender = true;
    }
    if (shaped) moving = true;

    // pingo de tinta caindo
    if (pendingDrop) {
      const u = Math.min(1, (now - pendingDrop.t0) / 200);
      drop.position.copy(pendingDrop.w).setY(pendingDrop.top + (pendingDrop.w.y - pendingDrop.top) * u * u);
      needsRender = true;
      if (u >= 1) {
        dough.drop(pendingDrop.c, 0.45, linear(useClay.getState().color));
        dough.poke(pendingDrop.c, pendingDrop.n, 0.4, 1.2);
        feel.plic();
        markChanged();
        colorDirty = true;
        moving = true;
        drop.visible = false;
        pendingDrop = null;
      }
    }

    tickSteps(now, dt);
    idleRig(now);

    if (turnAnim) {
      const u = Math.min(1, (now - turnAnim.t0) / 420);
      spinAngle = turnAnim.from + (turnAnim.to - turnAnim.from) * ease(u);
      if (u >= 1) {
        turnAnim = null;
        useClay.getState().set({ spinning: false });
      }
    }
    if (turn.rotation.y !== spinAngle) {
      turn.rotation.y = spinAngle;
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
      // a forma mudou: a sombrinha dos vincos acompanha
      colorDirty = true;
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
  syncRig();
  raf = requestAnimationFrame(frame);

  const wake = () => {
    moving = true;
    colorDirty = true;
    needsRender = true;
  };

  return {
    undo() {
      if (edit || busy()) return;
      const s = past.pop();
      if (!s) return;
      future.push(dough.shot());
      dough.restore(s);
      wake();
      refreshExt();
      syncUi();
      reframe();
      scheduleSave();
    },
    redo() {
      if (edit || busy()) return;
      const s = future.pop();
      if (!s) return;
      past.push(dough.shot());
      dough.restore(s);
      wake();
      refreshExt();
      syncUi();
      reframe();
      scheduleSave();
    },
    fresh() {
      if (edit || busy()) return;
      past.push(dough.shot());
      if (past.length > HISTORY) past.shift();
      future = [];
      dough.reset(linear(MASSA));
      feel.touch(1.2);
      wake();
      refreshExt();
      syncUi();
      userZoom = false;
      rollAxis = 0;
      reframe();
      scheduleSave();
    },
    spin() {
      if (turnAnim) return;
      turnAnim = { from: spinAngle, to: spinAngle + Math.PI / 2, t0: performance.now() };
      feel.tick(8);
      useClay.getState().set({ spinning: true });
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
      unsubRig();
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
