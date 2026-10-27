import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildMaterial, disposeMaterial, materialKey } from '../geometry/material';
import { buildGeometry, geometryKey, pieceVolume } from '../geometry/shapes';
import { round } from '../lib/format';
import type { BgKey, LightKey, Piece } from '../model/types';
import { useMetrics, useStore } from '../state/store';
import { bridge, meshes, type FrameKind } from './bridge';
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
      aria-label="Mesa 3D. Arraste uma peça para mover, arraste o fundo para girar a vista."
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
      <DragController />
      <PhotoBridge />
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
    m.updateMatrixWorld(true);
    const precise = !useStore.getState().dragging;
    const b = new THREE.Box3().setFromObject(m, precise);
    const s = b.isEmpty() ? new THREE.Vector3() : b.getSize(new THREE.Vector3());
    put(id, { vol: vol * piece.scale ** 3, size: [s.x, s.y, s.z] });
  }, [id, piece.pos, piece.rot, piece.scale, geometry, vol, put]);

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
    const h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#3b6cff'));
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
  meshes.forEach(m => {
    if (!m.visible) return;
    m.updateMatrixWorld(true);
    box.expandByObject(m);
  });
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

/** Arrastar peças pela mesa. Com o ímã ligado, a peça assenta em cima do que estiver embaixo dela. */
export const drag: { start: ((id: string, e: ThreeEvent<PointerEvent>) => void) | null } = { start: null };

function DragController() {
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
    let st: null | { id: string; pid: number; offX: number; offZ: number; bottom: number; y: number; sx: number; sy: number; moved: boolean } = null;

    const topBelow = (x: number, z: number, skip: string) => {
      from.set(x, 200, z);
      ray.set(from, DOWN);
      const targets: THREE.Object3D[] = [];
      meshes.forEach((m, mid) => {
        if (mid !== skip && m.visible) targets.push(m);
      });
      const hits = ray.intersectObjects(targets, false);
      return hits.length ? hits[0].point.y : 0;
    };

    const onMove = (ev: PointerEvent) => {
      if (!st || ev.pointerId !== st.pid) return;
      if (!st.moved) {
        if (Math.hypot(ev.clientX - st.sx, ev.clientY - st.sy) < 6) return;
        st.moved = true;
        useStore.getState().setDragging(true);
      }
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const x = hit.x - st.offX;
      const z = hit.z - st.offZ;
      const s = useStore.getState();
      const y = s.snap ? topBelow(x, z, st.id) + st.bottom : st.y;
      s.movePiece(st.id, [round(x, 3), round(y, 3), round(z, 3)]);
    };

    const end = (ev: PointerEvent) => {
      if (!st || ev.pointerId !== st.pid) return;
      const moved = st.moved;
      st = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (controls) controls.enabled = true;
      const s = useStore.getState();
      if (moved) {
        s.setDragging(false);
        s.commit();
      } else if (s.tab === 'pecas') s.setTab('forma');
    };

    drag.start = (id, e) => {
      if (st) return;
      const mesh = meshes.get(id);
      const pc = useStore.getState().doc.pieces.find(p => p.id === id);
      if (!mesh || !pc) return;
      useStore.getState().select(id);
      if (controls) controls.enabled = false;
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh, true);
      plane.set(new THREE.Vector3(0, 1, 0), -e.point.y);
      st = {
        id,
        pid: e.pointerId,
        offX: e.point.x - pc.pos[0],
        offZ: e.point.z - pc.pos[2],
        bottom: pc.pos[1] - box.min.y,
        y: pc.pos[1],
        sx: e.nativeEvent.clientX,
        sy: e.nativeEvent.clientY,
        moved: false,
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };

    return () => {
      drag.start = null;
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
