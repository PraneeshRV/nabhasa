// /dev/lensing — standalone prototype page for the lensing skybox (spec Task 7,
// steps 1–2). Orbit camera + leva-tunable uniforms + backend badge + fps readout.
// URL: /?dev=lensing · WebGL2 check: /?dev=lensing&forceTier=webgl2
// ponytail: local renderer bootstrap; Task 2's NabhasaCanvas replaces it at integration.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three/webgpu';
import { useControls } from 'leva';
import { createLensedSkyMaterial, lensingUniforms } from '../shaders/lensing';

extend(THREE as any);

function LensedSky() {
  const [material] = useState(createLensedSkyMaterial);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} frustumCulled={false}>
      <sphereGeometry args={[5000, 48, 24]} />
    </mesh>
  );
}

function StarBody() {
  // Stand-in for Task 5's NeutronStar: emissive sphere at the spec radius (10 wu).
  return (
    <mesh>
      <sphereGeometry args={[10, 48, 48]} />
      <meshBasicMaterial color={'#ffc9a3'} />
    </mesh>
  );
}

function FpsProbe({ out }: { out: React.RefObject<HTMLSpanElement | null> }) {
  // Writes straight to the DOM — a setState here re-renders the parent, which
  // hands <Canvas> a new gl closure and re-inits the whole renderer (5fps bug).
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

function LevaBindings() {
  const c = useControls('lensing', {
    rsVis: { value: 6.0, min: 0, max: 20, step: 0.1 },
    photonRing: { value: 15.0, min: 5, max: 40, step: 0.5 },
    bendK: { value: 2.0, min: 0, max: 8, step: 0.05 },
    ringIntensity: { value: 1.4, min: 0, max: 5, step: 0.05 },
    ringWidth: { value: 0.9, min: 0.1, max: 5, step: 0.05 },
    dopplerStrength: { value: 0.12, min: 0, max: 0.5, step: 0.01 },
    starScale: { value: 64, min: 16, max: 128, step: 1 },
    starThreshold: { value: 0.984, min: 0.95, max: 0.999, step: 0.001 },
  });
  useEffect(() => {
    for (const [k, v] of Object.entries(c)) {
      (lensingUniforms as any)[k].value = v;
    }
  }, [c]);
  return null;
}

export default function LensingDev() {
  const [backend, setBackend] = useState('…');
  const fpsRef = useRef<HTMLSpanElement | null>(null);

  // Stable across re-renders — a fresh gl closure makes R3F re-init the renderer.
  const glFactory = useCallback(async (props: unknown) => {
    const forceWebGL = new URLSearchParams(location.search).get('forceTier') === 'webgl2';
    const renderer = new THREE.WebGPURenderer({
      ...(props as any),
      antialias: true,
      forceWebGL,
    });
    await renderer.init();
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <Canvas
        camera={{ position: [0, 30, 220], fov: 60, near: 0.1, far: 20000 }}
        gl={glFactory}
        onCreated={({ gl }) =>
          setBackend(((gl as any).backend as any)?.isWebGPUBackend ? 'WebGPU/WGSL' : 'WebGL2/GLSL')
        }
      >
        <LensedSky />
        <StarBody />
        <FpsProbe out={fpsRef} />
        <OrbitControls target={[0, 0, 0]} minDistance={30} maxDistance={2000} />
      </Canvas>
      <LevaBindings />
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
        lensing-dev · {backend} · <span ref={fpsRef}>0</span> fps
      </div>
    </div>
  );
}
