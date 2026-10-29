import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildMaterial, disposeMaterial, materialKey } from '../geometry/material';
import { buildGeometry, geometryKey, pieceVolume } from '../geometry/shapes';
import { round, wrapAngle } from '../lib/format';
import { buzz } from '../lib/haptics';
import { canSmooth, clampPress, press, smooth } from '../model/hands';
import type { BgKey, LightKey, Piece } from '../model/types';
import { useMetrics, useStore, type Tool } from '../state/store';
import { anim, LIFT } from './anim';
import { atRest, bridge, meshes, type FrameKind } from './bridge';
import { BG, envTexture, groundTexture, LIGHTS } from './env';

const rad = THREE.MathUtils.degToRad;

export function Viewport() {
  const select = useStore(s => s.select);
  return (
    <Canvas
      className="canvas"
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ fov: 35, near: 0.05, far: 300, position: [0.3, 9, 6] }}
      onPointerMissed={() => select(null)}
      aria-label="Mesa 3D. Toque numa peça e arraste para mover, amassar, girar ou alisar, conforme a mão escolhida. Arraste o fundo para girar a vista."
    >
      <SceneContents />
    </Canvas>
  );
}

function SceneContents() {
  const pieces = useStore(s => s.doc.pieces);
  const bg = useStore(s => s.doc.bg);
  const light = useStore(s => s.doc.light);
  const angle = useStore(s => s.doc.lightAngle);
  const bgColor = BG[bg].bg;
  return (
    <>
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={[bgColor, 24, 70]} />
      <EnvMap bg={bg} />
      <Lights light={light} angle={angle} />
      <Ground bg={bg} />
      <group>
        {pieces.map(p => (
          <PieceMesh key={p.id} piece={p} />
        ))}
      </group>
      <SelectionBox />
      <Controls />
      <HandController />
      <PhotoBridge />
      <AnimKick />
    </>
  );
}

function EnvMap({ bg }: { bg: BgKey }) {
  const scene = useThree(s => s.scene);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    scene.environment = envTexture(bg);
    invalidate();
  }, [bg, scene, invalidate]);
  return null;
}

function Lights({ light, angle }: { light: LightKey; angle: number }) {
  const L = LIGHTS[light];
  const gl = useThree(s => s.gl);
  const invalidate = useThree(s => s.invalidate);
  const key = useRef<THREE.DirectionalLight>(null);
  const a = rad(angle);
  const [x, y, z] = L.kp;
  const pos: [number, number, number] = [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)];

  useEffect(() => {
    gl.toneMappingExposure = L.exp;
    invalidate();
  }, [gl, L, invalidate]);

  useLayoutEffect(() => {
    const k = key.current;
    if (!k) return;
    const c = k.shadow.camera;
    c.left = -10;
    c.right = 10;
    c.top = 10;
    c.bottom = -10;
    c.near = 0.5;
    c.far = 40;
    c.updateProjectionMatrix();
    k.shadow.mapSize.set(2048, 2048);
    k.shadow.bias = -0.0006;
    k.shadow.normalBias = 0.02;
  }, []);

  return (
    <>
      <hemisphereLight args={[L.sky, L.gnd, L.hi * Math.PI]} />
      <directionalLight ref={key} position={pos} color={L.key} intensity={L.ki * Math.PI} castShadow />
      <directionalLight position={[4, 5, 6]} intensity={L.fi * Math.PI} />
    </>
  );
}

function Ground({ bg }: { bg: BgKey }) {
  const gl = useThree(s => s.gl);
  const tex = useMemo(() => groundTexture(bg, Math.min(8, gl.capabilities.getMaxAnisotropy())), [bg, gl]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, BG[bg].ground === 'paper' ? 0.35 : 0]} receiveShadow>
      <planeGeometry args={[120, 120]} />
      <meshStandardMaterial key={bg} map={tex} roughness={0.95} />
    </mesh>
  );
}

const PieceMesh = memo(function PieceMesh({ piece }: { piece: Piece }) {
  const ref = useRef<THREE.Mesh>(null);
  const gKey = geometryKey(piece);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => buildGeometry(piece), [gKey]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const mKey = materialKey(piece);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const material = useMemo(() => buildMaterial(piece), [mKey]);
  useEffect(() => () => disposeMaterial(material), [material]);

  const vol = useMemo(() => pieceVolume(piece, geometry), [geometry]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = useMetrics(s => s.put);
  const id = piece.id;

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    meshes.set(id, m);
    const precise = !useStore.getState().dragging;
    const s = atRest(() => {
      m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m, precise);
      return b.isEmpty() ? new THREE.Vector3() : b.getSize(new THREE.Vector3());
    });
    put(id, { vol: vol * piece.scale ** 3, size: [s.x, s.y, s.z] });
  }, [id, piece.pos, piece.rot, piece.scale, geometry, vol, put]);

  // quique, queda e "segurar no ar": mexe só no desenho, conservando o volume
  const posed = useRef(false);
  useFrame(state => {
    const m = ref.current;
    if (!m) return;
    const pose = anim.pose(id);
    if (!pose) {
      if (posed.current) {
        posed.current = false;
        m.position.set(piece.pos[0], piece.pos[1], piece.pos[2]);
        m.scale.setScalar(piece.scale);
        state.invalidate();
      }
      return;
    }
    posed.current = true;
    const k = pose.hidden ? 1e-4 : piece.scale;
    const side = 1 / Math.sqrt(pose.sy);
    m.position.set(piece.pos[0], piece.pos[1] + pose.dy, piece.pos[2]);
    m.scale.set(k * side, k * pose.sy, k * side);
    state.invalidate();
  });

  useEffect(
    () => () => {
      meshes.delete(id);
      useMetrics.getState().drop(id);
    },
    [id],
  );

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    drag.start?.(id, e);
  };

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      position={piece.pos}
      rotation={[rad(piece.rot[0]), rad(piece.rot[1]), rad(piece.rot[2])]}
      scale={piece.scale}
      visible={piece.visible}
      castShadow
      receiveShadow
      onPointerDown={piece.visible ? onDown : undefined}
    />
  );
});

function SelectionBox() {
  const sel = useStore(s => s.selectedId);
  const doc = useStore(s => s.doc);
  const invalidate = useThree(s => s.invalidate);
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#e0703f'));
    h.visible = false;
    return h;
  }, []);
  useEffect(() => {
    bridge.helper = helper;
    return () => {
      if (bridge.helper === helper) bridge.helper = undefined;
    };
  }, [helper]);
  useEffect(() => invalidate(), [sel, doc, invalidate]);
  useFrame(() => {
    const m = sel ? meshes.get(sel) : undefined;
    if (m && m.visible) {
      m.updateMatrixWorld(true);
      helper.box.setFromObject(m);
      helper.visible = true;
    } else helper.visible = false;
  });
  return <primitive object={helper} />;
}

function frameAll(kind: FrameKind, camera: THREE.PerspectiveCamera, ctl: OrbitControls) {
  const box = new THREE.Box3();
  atRest(() =>
    meshes.forEach(m => {
      if (!m.visible) return;
      m.updateMatrixWorld(true);
      box.expandByObject(m);
    }),
  );
  if (box.isEmpty()) box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 1, 2));
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const v = rad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(v) * camera.aspect);
  const f = Math.min(v, hf);
  const dist = Math.max(2, (sph.radius / Math.sin(f)) * 1.06);
  const dirs: Record<FrameKind, [number, number, number]> = { cima: [0, 1, 0.0001], frente: [0, 0.32, 1], diag: [0.05, 0.85, 0.55] };
  const d = new THREE.Vector3(...dirs[kind]).normalize();
  ctl.target.copy(sph.center);
  camera.position.copy(sph.center).addScaledVector(d, dist);
  camera.updateProjectionMatrix();
  ctl.update();
}

function Controls() {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree(s => s.gl);
  const connected = useThree(s => s.events.connected) as unknown;
  const set = useThree(s => s.set);
  const invalidate = useThree(s => s.invalidate);

  const ctl = useMemo(() => {
    const c = new OrbitControls(camera);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.maxPolarAngle = 1.5;
    c.minDistance = 1.2;
    c.maxDistance = 40;
    c.target.set(0.5, 0.3, -0.3);
    return c;
  }, [camera]);

  useEffect(() => {
    // liga no mesmo elemento dos eventos do R3F, depois deles: assim, ao tocar numa peça,
    // o arrastar desliga a câmera antes de ela começar a girar
    const el = connected instanceof HTMLElement ? connected : gl.domElement;
    ctl.connect(el);
    const onChange = () => invalidate();
    ctl.addEventListener('change', onChange);
    set({ controls: ctl as unknown as THREE.EventDispatcher });
    return () => {
      ctl.removeEventListener('change', onChange);
      ctl.disconnect();
      set({ controls: null });
    };
  }, [ctl, connected, gl, set, invalidate]);

  useEffect(() => {
    bridge.frame = kind => {
      frameAll(kind, camera, ctl);
      invalidate();
    };
    const raf = requestAnimationFrame(() => bridge.frame?.('diag'));
    return () => {
      cancelAnimationFrame(raf);
      bridge.frame = undefined;
    };
  }, [camera, ctl, invalidate]);

  useEffect(() => () => ctl.dispose(), [ctl]);

  useFrame(() => {
    ctl.update();
  });
  return null;
}

/** Faz as peças caírem na mesa quando ela aparece, e liga as animações ao quadro da cena. */
function AnimKick() {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    anim.onKick(() => invalidate());
    const pieces = useStore.getState().doc.pieces.filter(p => p.visible);
    anim.dropIn([...pieces].sort((a, b) => a.pos[1] - b.pos[1]).map(p => p.id));
    return () => anim.onKick(null);
  }, [invalidate]);
  return null;
}

/** Começo de um toque numa peça. A cena chama aqui; o controle de mãos decide o que fazer. */
export const drag: { start: ((id: string, e: ThreeEvent<PointerEvent>) => void) | null } = { start: null };

/** Quanto o dedo precisa andar para virar um gesto (e não um toque). */
const SLOP = 6;
/** Pixels de arraste para a massa achatar ou esticar 2,7 vezes. */
const PRESS_PX = 160;
/** Graus por pixel ao girar. */
const SPIN_DEG = 0.6;
/** Pixels esfregando para alisar quase tudo. */
const RUB_PX = 900;

interface Gesture {
  id: string;
  pid: number;
  tool: Tool;
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  moved: boolean;
  /** a peça como estava no começo do gesto */
  base: Piece;
  offX: number;
  offZ: number;
  bottom: number;
  /** degrau de vibração já tocado */
  tick: number;
  /** distância esfregada, no alisar */
  dist: number;
  /** [tempo, ângulo sem dar a volta] para medir a velocidade ao girar */
  samples: Array<[number, number]>;
}

/** Velocidade de giro no fim do arraste, em graus por milissegundo. */
function spinSpeed(smp: Array<[number, number]>, now: number): number {
  if (smp.length < 2) return 0;
  const [t1, a1] = smp[smp.length - 1];
  // ficou parado antes de soltar: não sai girando
  if (now - t1 > 80) return 0;
  const [t0, a0] = smp[0];
  return t1 > t0 ? (a1 - a0) / (t1 - t0) : 0;
}

/**
 * As mãos. Mover arrasta pela mesa (com o ímã, assenta em cima do que estiver embaixo).
 * Amassar: para baixo achata, para cima estica, sem perder massa. Girar: para os lados,
 * como no torno, e continua girando se soltar com força. Alisar: esfregar tira o jeito torto.
 */
function HandController() {
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);
  const controls = useThree(s => s.controls) as unknown as OrbitControls | null;

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const from = new THREE.Vector3();
    const DOWN = new THREE.Vector3(0, -1, 0);
    let g: Gesture | null = null;
    let spin: { id: string; v: number; rot: number; last: number; turned: number; raf: number } | null = null;

    const topBelow = (x: number, z: number, skip: string) =>
      atRest(() => {
        from.set(x, 200, z);
        ray.set(from, DOWN);
        const targets: THREE.Object3D[] = [];
        meshes.forEach((m, mid) => {
          if (mid !== skip && m.visible) targets.push(m);
        });
        const hits = ray.intersectObjects(targets, false);
        return hits.length ? hits[0].point.y : 0;
      });

    const stopSpin = () => {
      if (!spin) return;
      cancelAnimationFrame(spin.raf);
      const id = spin.id;
      spin = null;
      useStore.getState().commit();
      anim.play(id, 'boop', { amp: 0.4 });
    };

    const startSpin = (id: string, v: number, rot: number) => {
      const sp = { id, v, rot, last: performance.now(), turned: 0, raf: 0 };
      spin = sp;
      const step = (t: number) => {
        if (spin !== sp) return;
        const dt = Math.max(0, Math.min(48, t - sp.last));
        sp.last = t;
        const pc = useStore.getState().doc.pieces.find(p => p.id === id);
        // alguém mexeu na peça no meio do giro (desfazer, controle deslizante): para aqui
        if (!pc || Math.abs(pc.rot[1] - sp.rot) > 0.05) {
          stopSpin();
          return;
        }
        sp.v *= Math.exp(-dt / 520);
        const d = sp.v * dt;
        sp.rot = round(wrapAngle(sp.rot + d), 2);
        sp.turned += Math.abs(d);
        if (sp.turned >= 30) {
          sp.turned -= 30;
          buzz(4);
        }
        useStore.getState().patchPiece(id, p => {
          p.rot[1] = sp.rot;
        });
        if (Math.abs(sp.v) < 0.012) {
          stopSpin();
          return;
        }
        sp.raf = requestAnimationFrame(step);
      };
      sp.raf = requestAnimationFrame(step);
    };

    const onMove = (ev: PointerEvent) => {
      if (!g || ev.pointerId !== g.pid) return;
      const ddx = ev.clientX - g.lx;
      const ddy = ev.clientY - g.ly;
      g.lx = ev.clientX;
      g.ly = ev.clientY;
      const s = useStore.getState();
      if (!g.moved) {
        if (Math.hypot(ev.clientX - g.sx, ev.clientY - g.sy) < SLOP) return;
        g.moved = true;
        s.setDragging(true);
        if (g.tool === 'mover') anim.play(g.id, 'lift');
        else buzz(6);
      }
      const id = g.id;
      switch (g.tool) {
        case 'mover': {
          const r = gl.domElement.getBoundingClientRect();
          ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(ndc, camera);
          if (!ray.ray.intersectPlane(plane, hit)) return;
          const x = hit.x - g.offX;
          const z = hit.z - g.offZ;
          const y = s.snap ? topBelow(x, z, id) + g.bottom : g.base.pos[1];
          s.movePiece(id, [round(x, 3), round(y, 3), round(z, 3)]);
          break;
        }
        case 'amassar': {
          const k = clampPress(g.base, Math.exp(-(ev.clientY - g.sy) / PRESS_PX));
          const tick = Math.round(Math.log(k) / 0.12);
          if (tick !== g.tick) {
            g.tick = tick;
            buzz(4);
          }
          const p = press(g.base, k);
          s.patchPiece(id, pc => {
            pc.p = p;
          });
          break;
        }
        case 'girar': {
          const now = performance.now();
          const a = g.base.rot[1] + (ev.clientX - g.sx) * SPIN_DEG;
          g.samples.push([now, a]);
          while (g.samples.length > 2 && now - g.samples[0][0] > 100) g.samples.shift();
          const tick = Math.floor(a / 30);
          if (tick !== g.tick) {
            g.tick = tick;
            buzz(3);
          }
          const rot = round(wrapAngle(a), 2);
          s.patchPiece(id, pc => {
            pc.rot[1] = rot;
          });
          break;
        }
        case 'alisar': {
          g.dist += Math.hypot(ddx, ddy);
          const tick = Math.floor(g.dist / 140);
          if (tick !== g.tick) {
            g.tick = tick;
            buzz(3);
          }
          const r = smooth(g.base, Math.exp(-g.dist / RUB_PX));
          // degraus: a textura pintada do disco é refeita a cada mudança, então muda pouco de vez em quando
          const clay = Math.round(r.clay * 20) / 20;
          const irr = 'irregular' in r.p ? Math.round(r.p.irregular * 100) / 100 : null;
          const cur = s.doc.pieces.find(p => p.id === id);
          if (!cur || (cur.clay === clay && (irr === null || cur.p.irregular === irr))) break;
          s.patchPiece(id, pc => {
            pc.clay = clay;
            if (irr !== null) pc.p.irregular = irr;
          });
          break;
        }
      }
    };

    const end = (ev: PointerEvent) => {
      if (!g || ev.pointerId !== g.pid) return;
      const cur = g;
      g = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (controls) controls.enabled = true;
      const s = useStore.getState();
      if (!cur.moved) {
        // um toque só: a peça dá um pulinho e as ferramentas dela abrem
        anim.play(cur.id, 'boop', { amp: 0.7 });
        if (s.tab === 'pecas') s.setTab('forma');
        return;
      }
      s.setDragging(false);
      switch (cur.tool) {
        case 'mover':
          s.commit();
          anim.play(cur.id, 'drop', { h: LIFT, amp: 0.55 });
          buzz(8);
          break;
        case 'girar': {
          const v = ev.type === 'pointerup' ? spinSpeed(cur.samples, performance.now()) : 0;
          const pc = s.doc.pieces.find(p => p.id === cur.id);
          if (pc && Math.abs(v) > 0.08) startSpin(cur.id, Math.max(-1.5, Math.min(1.5, v)), pc.rot[1]);
          else {
            s.commit();
            anim.play(cur.id, 'boop', { amp: 0.4 });
          }
          break;
        }
        default:
          s.commit();
          anim.play(cur.id, 'boop', { amp: 0.6 });
          buzz(6);
      }
    };

    drag.start = (id, e) => {
      if (g) return;
      stopSpin();
      const mesh = meshes.get(id);
      const s = useStore.getState();
      const pc = s.doc.pieces.find(p => p.id === id);
      if (!mesh || !pc) return;
      s.select(id);
      if (controls) controls.enabled = false;
      if (s.tool === 'alisar' && !canSmooth(pc)) s.notify('Essa peça já está lisinha.');
      const box = atRest(() => {
        mesh.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(mesh, true);
      });
      plane.set(new THREE.Vector3(0, 1, 0), -e.point.y);
      g = {
        id,
        pid: e.pointerId,
        tool: s.tool,
        sx: e.nativeEvent.clientX,
        sy: e.nativeEvent.clientY,
        lx: e.nativeEvent.clientX,
        ly: e.nativeEvent.clientY,
        moved: false,
        base: structuredClone(pc),
        offX: e.point.x - pc.pos[0],
        offZ: e.point.z - pc.pos[2],
        bottom: pc.pos[1] - box.min.y,
        tick: s.tool === 'girar' ? Math.floor(pc.rot[1] / 30) : 0,
        dist: 0,
        samples: [],
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };

    return () => {
      drag.start = null;
      if (spin) cancelAnimationFrame(spin.raf);
      spin = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (controls) controls.enabled = true;
    };
  }, [camera, gl, controls]);

  return null;
}

/** Foto em alta resolução, sem a caixa de seleção. */
function PhotoBridge() {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    bridge.photo = () => {
      const helper = bridge.helper;
      const wasVisible = helper?.visible ?? false;
      if (helper) helper.visible = false;
      const pr = gl.getPixelRatio();
      try {
        gl.setPixelRatio(Math.min(3, Math.max(2, pr * 1.5)));
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      } catch {
        return null;
      } finally {
        gl.setPixelRatio(pr);
        if (helper) helper.visible = wasVisible;
        invalidate();
      }
    };
    return () => {
      bridge.photo = undefined;
    };
  }, [gl, scene, camera, invalidate]);
  return null;
}
