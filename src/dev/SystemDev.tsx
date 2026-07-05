// /dev/system — Lich system prototype: spinning neutron star + the three real
// pulsar planets (Draugr/Poltergeist/Phobetor), procedural PBR surfaces, lensed
// sky. URL: /?dev=system (+&forceTier=webgl2).
// ponytail: dev harness duplicated from LensingDev; Task 2's NabhasaCanvas
// replaces both at integration.

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import { createLensedSkyMaterial } from '../shaders/lensing';
import { createStarSurfaceMaterial } from '../shaders/starSurface';
import { LICH_SYSTEM, createPlanetMaterial, type PlanetSpec } from '../world/planets';

extend(THREE as any);

// Display spin: B1257+12 really spins at 6.22 ms (~161 Hz). Visual runs 1:2000
// (~4.6 s/rev) — honest label lives in the HUD layer later.
const SPIN_DISPLAY_RAD_S = (2 * Math.PI) / 4.6;

function LensedSky() {
  const [material] = useState(createLensedSkyMaterial);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} frustumCulled={false}>
      <sphereGeometry args={[5000, 48, 24]} />
    </mesh>
  );
}

function NeutronStar() {
  const ref = useRef<THREE.Mesh>(null);
  const [material] = useState(createStarSurfaceMaterial);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += SPIN_DISPLAY_RAD_S * Math.min(dt, 1 / 30);
  });
  return (
    <group rotation={[0, 0, (15 * Math.PI) / 180]}>
      <mesh ref={ref} material={material}>
        <sphereGeometry args={[10, 64, 64]} />
      </mesh>
      {/* the star is the only light source — one key, photographic discipline */}
      <pointLight intensity={60000} distance={0} decay={2} color={'#ffd9b8'} />
    </group>
  );
}

function Planet({ spec, phase }: { spec: PlanetSpec; phase: number }) {
  const orbitRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => createPlanetMaterial(spec), [spec]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (orbitRef.current) orbitRef.current.rotation.y += ((2 * Math.PI) / spec.periodS) * dt;
    if (bodyRef.current) bodyRef.current.rotation.y += ((2 * Math.PI) / spec.axialDayS) * dt;
  });
  return (
    <group ref={orbitRef} rotation={[0, phase, 0]}>
      <mesh ref={bodyRef} position={[spec.orbitWu, 0, 0]} material={material}>
        <sphereGeometry args={[spec.radiusWu, 96, 96]} />
      </mesh>
    </group>
  );
}

function FpsProbe({ out }: { out: React.RefObject<HTMLSpanElement | null> }) {
  const acc = useRef({ frames: 0, t: 0 });
  useFrame((_, dt) => {
    acc.current.frames += 1;
    acc.current.t += dt;
    if (acc.current.t >= 1) {
      if (out.current) out.current.textContent = String(Math.round(acc.current.frames / acc.current.t));
      acc.current.frames = 0;
      acc.current.t = 0;
    }
  });
  return null;
}

export default function SystemDev() {
  const [backend, setBackend] = useState('…');
  const fpsRef = useRef<HTMLSpanElement | null>(null);

  const glFactory = useCallback(async (props: unknown) => {
    const forceWebGL = new URLSearchParams(location.search).get('forceTier') === 'webgl2';
    const renderer = new THREE.WebGPURenderer({ ...(props as any), antialias: true, forceWebGL });
    await renderer.init();
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <Canvas
        camera={{ position: [120, 90, 420], fov: 55, near: 0.1, far: 20000 }}
        gl={glFactory}
        onCreated={({ gl }) =>
          setBackend(((gl as any).backend as any)?.isWebGPUBackend ? 'WebGPU/WGSL' : 'WebGL2/GLSL')
        }
      >
        <LensedSky />
        <NeutronStar />
        {LICH_SYSTEM.map((spec, i) => (
          <Planet key={spec.name} spec={spec} phase={(i * 2.1) + 0.7} />
        ))}
        <FpsProbe out={fpsRef} />
        <OrbitControls target={[0, 0, 0]} minDistance={40} maxDistance={3000} />
      </Canvas>
      <div
        style={{
          position: 'fixed',
          left: 12,
          bottom: 12,
          color: '#9aa',
          font: '12px monospace',
          userSelect: 'none',
        }}
      >
        lich-system-dev · PSR B1257+12 · {backend} · <span ref={fpsRef}>0</span> fps · spin display 1:2000
      </div>
    </div>
  );
}
