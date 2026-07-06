// NabhasaCanvas — single R3F <Canvas> wrapping an async WebGPURenderer factory
// (spec Task 2). Auto WebGL2 fallback via forceWebGL on the 'webgl2' tier.
import * as THREE from 'three/webgpu';
import { Canvas, extend } from '@react-three/fiber';
import { useCallback, type ReactNode } from 'react';
import { QUALITY } from './quality';
import type { Tier } from './tiers';

extend(THREE as any);

export function NabhasaCanvas({ tier, children }: { tier: Tier; children: ReactNode }) {
  // Gotcha (spec revision log + LensingDev.tsx): the async `gl` factory MUST be
  // referentially stable across parent re-renders, or R3F re-inits the renderer
  // on every render (the 5fps bug). useCallback on `tier` keeps it stable for the
  // app lifetime — tier is detected once and never changes.
  const gl = useCallback(
    async (props: unknown) => {
      const renderer = new THREE.WebGPURenderer({
        ...(props as any),
        antialias: true,
        forceWebGL: tier === 'webgl2',
      });
      await renderer.init(); // WebGPU probe + auto WebGL2 fallback
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      return renderer;
    },
    [tier],
  );

  return (
    <Canvas
      dpr={QUALITY[tier].dpr as any}
      frameloop="always"
      camera={{ position: [0, 0, 60], fov: 60 }}
      gl={gl}
      // WebGPU: R3F's initial resize can land while init() is still pending, leaving
      // the depth texture at the canvas default 300×150 (GPUValidationError: depth
      // attachment size mismatch). Re-apply the real size once the renderer exists.
      onCreated={({ gl: renderer, size, viewport }) => {
        (renderer as unknown as THREE.WebGPURenderer).setPixelRatio(viewport.dpr);
        (renderer as unknown as THREE.WebGPURenderer).setSize(size.width, size.height, false);
      }}
    >
      {children}
    </Canvas>
  );
}
