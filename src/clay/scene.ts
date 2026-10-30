import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { DENSITY } from '../model/spec';
import { Dough, type RGB } from './dough';
import { feel } from './feel';
import type { V3 } from './mesh';
import { useClay } from './state';
import { loadDough, saveDough } from './storage';

/*
 * A bancada de sovar: a massa em cima de uma tábua, a luz, a câmera e os dedos.
 * Tudo em three.js direto (sem camadas no meio), para o dedo responder no mesmo quadro.
 *
 * Gestos:
 *  - um dedo na massa: aperta (parado afunda), arrasta (leva a massa e a cor junto),
 *    esfrega para lá e para cá (alisa);
 *  - dois dedos na massa: juntar belisca e puxa uma ponta, afastar achata;
 *  - um dedo fora da massa: gira a tábua; dois dedos fora: aproxima e afasta.
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
  photo(): string | null;
  stl(): Blob;
  dispose(): void;
}

interface Ptr {
  x: number;
  y: number;
  /** tamanho do contato do dedo, quando o aparelho informa */
  w: number;
  onDough: boolean;
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'orbit'; id: number; lx: number; ly: number; lt: number }
  | { kind: 'zoom'; d0: number; dist0: number }
  | { kind: 'knead'; id: number; c: V3; n: V3; force: number; trail: Array<[number, number, number]>; lx: number; ly: number; dx: number; dy: number }
  | { kind: 'pinch'; a: number; b: number; lastD: number; r: number };

interface Snap {
  rest: Float32Array;
  ink: Float32Array;
}

const HISTORY = 30;

export function createClayApp(host: HTMLElement): ClayApp {
  // ---------- cena ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
  let yaw = 0.35;
  let pitch = 0.52;
  let dist = 9;
  let yawVel = 0;
  /** depois que a pessoa aproxima ou afasta, a câmera não reenquadra sozinha */
  let userZoom = false;

  scene.add(new THREE.HemisphereLight(0xfff3e4, 0x7a5a44, 0.7));
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.6);
  sun.position.set(-3.5, 7, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 20;
  // massa amassada tem muita dobrinha: folga maior evita listras de sombra
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(4, 3, -3);
  scene.add(fill);

  // tábua redonda de madeira clara
  const board = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.3, 0.3, 96),
    new THREE.MeshStandardMaterial({ color: 0xc8955f, roughness: 0.8 }),
  );
  board.position.y = -0.15;
  board.receiveShadow = true;
  scene.add(board);

  // ---------- massa ----------
  const dough = new Dough(1.6, 5, linear(MASSA));
  loadDough(dough);
  dough.measure();
  dough.squash(0.55);

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(dough.pos, 3).setUsage(THREE.DynamicDrawUsage);
  const nrmAttr = new THREE.BufferAttribute(dough.pn, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(dough.col, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', nrmAttr);
  geo.setAttribute('color', colAttr);
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
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // marquinha da ponta do dedo
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xb8502b, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);

  const ui = useClay.getState();
  ui.set({ grams: dough.vol0 * DENSITY, canUndo: false, canRedo: false });
  feel.setSound(ui.sound);

  // ---------- desfazer ----------
  const past: Snap[] = [];
  let future: Snap[] = [];
  let edit: { snap: Snap; changed: boolean } | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const syncUi = () => useClay.getState().set({ canUndo: past.length > 0, canRedo: future.length > 0, grams: dough.vol0 * DENSITY });
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDough(dough), 500);
  };
  const beginEdit = () => {
    if (edit) return;
    edit = { snap: dough.shot(), changed: false };
    dough.measure();
  };
  const endEdit = () => {
    if (!edit) return;
    if (edit.changed) {
      past.push(edit.snap);
      if (past.length > HISTORY) past.shift();
      future = [];
      scheduleSave();
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
    camDirty = false;
  };

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = 35;
    camera.updateProjectionMatrix();
    // enquadra a massa ocupando pouco mais da metade da largura (ou da altura, na tela deitada)
    if (!userZoom) {
      const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const span = Math.min(t * camera.aspect, t);
      dist = Math.min(18, Math.max(6, 4 / 0.58 / span));
    }
    camDirty = true;
    needsRender = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  /** cm por pixel na altura da massa */
  const wpp = () => (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, canvas.clientHeight);

  // ---------- tocar na massa ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** Ponto da massa sob o dedo. `face` diz o quanto a superfície está de frente (1) ou de lado (0). */
  const hitAt = (x: number, y: number): { c: V3; n: V3; face: number } | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(mesh, false)[0];
    if (!h || !h.face) return null;
    const n = h.face.normal;
    const d = ray.ray.direction;
    return { c: [h.point.x, h.point.y, h.point.z], n: [n.x, n.y, n.z], face: -(n.x * d.x + n.y * d.y + n.z * d.z) };
  };
  /** raio do dedo na massa, em cm */
  const fingerR = (p: Ptr) => {
    const px = Math.min(70, Math.max(22, p.w > 2 ? p.w : 34));
    return Math.min(0.9, Math.max(0.2, px * 1.1 * wpp()));
  };

  const ptrs = new Map<number, Ptr>();
  let g: Gesture = { kind: 'none' };

  const startKnead = (id: number, p: Ptr, h: { c: V3; n: V3 }, ev: PointerEvent) => {
    beginEdit();
    const force = ev.width > 2 ? Math.min(1.6, Math.max(0.7, Math.sqrt(ev.width / 30))) : 1;
    const drop = useClay.getState().drop;
    dough.poke(h.c, h.n, fingerR(p), 2.2 * force);
    moving = true;
    if (drop) {
      dough.drop(h.c, 0.45, linear(drop));
      feel.plic();
      if (edit) edit.changed = true;
      colorDirty = true;
    } else feel.touch(force);
    g = { kind: 'knead', id, c: h.c, n: h.n, force, trail: [[performance.now(), p.x, p.y]], lx: p.x, ly: p.y, dx: 0, dy: 0 };
  };

  const finishStroke = () => {
    feel.release();
    ring.visible = false;
    needsRender = true;
    useClay.getState().set({ doing: '' });
    endEdit();
  };

  const onDown = (ev: PointerEvent) => {
    if (ptrs.size >= 2) return;
    canvas.setPointerCapture?.(ev.pointerId);
    const h = hitAt(ev.clientX, ev.clientY);
    const p: Ptr = { x: ev.clientX, y: ev.clientY, w: ev.width || 0, onDough: !!h };
    ptrs.set(ev.pointerId, p);
    yawVel = 0;
    if (ptrs.size === 1) {
      if (h) startKnead(ev.pointerId, p, h, ev);
      else g = { kind: 'orbit', id: ev.pointerId, lx: ev.clientX, ly: ev.clientY, lt: performance.now() };
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
    } else {
      if (g.kind === 'knead') finishStroke();
      g = { kind: 'zoom', d0: Math.max(10, d), dist0: dist };
    }
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
      yaw -= dx * 0.009;
      pitch = Math.min(1.35, Math.max(0.08, pitch + dy * 0.006));
      yawVel = (-dx * 0.009) / Math.max(8, now - g.lt);
      g.lx = ev.clientX;
      g.ly = ev.clientY;
      g.lt = now;
      camDirty = true;
    } else if (g.kind === 'zoom' && ptrs.size === 2) {
      const [pa, pb] = [...ptrs.values()];
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      dist = Math.min(20, Math.max(3.8, (g.dist0 * g.d0) / Math.max(10, d)));
      userZoom = true;
      camDirty = true;
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.delete(ev.pointerId);
    if (g.kind === 'knead' && g.id === ev.pointerId) {
      finishStroke();
      g = { kind: 'none' };
    } else if (g.kind === 'pinch' && (g.a === ev.pointerId || g.b === ev.pointerId)) {
      finishStroke();
      g = { kind: 'none' };
    } else if (g.kind === 'orbit' && g.id === ev.pointerId) {
      // soltou girando: a tábua continua um pouquinho
      if (performance.now() - g.lt > 80) yawVel = 0;
      g = { kind: 'none' };
    } else if (g.kind === 'zoom') g = { kind: 'none' };
  };

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    dist = Math.min(20, Math.max(3.8, dist * Math.exp(ev.deltaY * 0.001)));
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
  let colorDirty = false;
  let last = performance.now();
  let raf = 0;

  const showRing = (c: V3, n: V3, r: number, pulse: number) => {
    ring.visible = true;
    ring.position.set(c[0] + n[0] * 0.02, c[1] + n[1] * 0.02, c[2] + n[2] * 0.02);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2]));
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
      const doing = still ? 'apertando' : 'levando a massa';
      if (ui.doing !== doing) ui.set({ doing });
    }
    k.c = h.c;
    k.n = h.n;
    showRing(h.c, h.n, r, 1 - 0.08 * Math.sin(now / 90));
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
    showRing(h.c, h.n, q.r, 1);
    return true;
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let shaped = false;
    if (g.kind === 'knead') shaped = kneadFrame(g, dt);
    else if (g.kind === 'pinch') shaped = pinchFrame(g);
    if (shaped) {
      dough.settle();
      if (edit) edit.changed = true;
      colorDirty = true;
      moving = true;
      needsRender = true;
    }

    if (g.kind === 'none' && Math.abs(yawVel) > 1e-5) {
      yaw += yawVel * dt * 1000;
      yawVel *= Math.exp(-dt / 0.35);
      if (Math.abs(yawVel) < 2e-5) yawVel = 0;
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
    if (colorDirty) {
      dough.paint();
      colAttr.needsUpdate = true;
      colorDirty = false;
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
      scheduleSave();
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
      geo.dispose();
      mat.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
