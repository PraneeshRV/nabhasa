// NebulaPlates — W1 art-direction ambience layer. 1–2 large additive billboard
// planes fixed in world space, textured with the curated nebula plates
// (nebula-wisp.avif / nebula-dense.avif). They sit off the star axis at
// ~4200–4500 wu — far ambient color that never competes with the neutron star or
// the lensing ring. Each plane faces the camera every frame (billboard) so the
// plate always reads face-on; there is NO time-animation (photosafety: static
// art only — texture, position, and intensity are constant for the session).
//
// Tier gate (fps risk on weaker tiers — task constraint):
//   webgpu-high → wisp + dense (both plates)
//   webgpu-low  → wisp only
//   webgl2/static → render null (no plates)
//
// Far-plane dependency: plates at ~4500 wu sit inside LensingSkybox's FAR_FLOOR
// (20000), which floors the camera far on every lensing tier — and NebulaPlates
// only mounts on webgpu tiers where LensingSkybox also mounts. frustumCulled=false
// stops the giant planes from being wrongly culled at the view frustum edges.
//
// Texture load is non-suspending (TextureLoader in useEffect, mirroring the
// LensingSkybox plate-load idiom): a plate renders nothing until its texture
// lands, so there is no Suspense dependency and no blank-canvas flash.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, SRGBColorSpace, TextureLoader } from 'three';
import type { Mesh, Texture } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, vec3 } from 'three/tsl';
import type { Tier } from '../core/tiers';

// Cool blue-grey tint (art-direction: distant nebula reads as ambient cool
// light; the neutron star owns the single hot accent). Created fresh inside each
// material's graph (JumpGate/lensing idiom) — avoids sharing one vec3 node
// across two materials' builds.
const TINT_R = 0.55;
const TINT_G = 0.66;
const TINT_B = 0.85;

const ASSET = `${import.meta.env.BASE_URL}assets/nebula/`;

type PlateDef = { file: string; position: [number, number, number]; intensity: number };

// Positions off the star axis, visible from the arrival spawn ~[600,80,0].
// Component magnitudes → ~4200–4500 wu distance. Intensities kept conservative
// (additive over a dark sky — see constraint "plate intensity conservative");
// art-feel knobs, screenshot-tunable at the gate.
const WISP: PlateDef = { file: 'nebula-wisp.avif', position: [2400, 1500, 3400], intensity: 0.6 };
const DENSE: PlateDef = { file: 'nebula-dense.avif', position: [1800, -1100, -3600], intensity: 0.5 };

function NebulaPlate({ file, position, intensity }: PlateDef) {
  const camera = useThree((s) => s.camera);
  const [tex, setTex] = useState<Texture | null>(null);
  const meshRef = useRef<Mesh>(null);

  // Non-suspending async load. colorSpace set before first GPU upload; onLoad
  // flips the plate visible once decoded. `t` (the immediate return) and the
  // onLoad arg are the same Texture instance.
  useEffect(() => {
    const t = new TextureLoader().load(`${ASSET}${file}`, (loaded) => setTex(loaded));
    t.colorSpace = SRGBColorSpace;
    return () => t.dispose();
  }, [file]);

  const material = useMemo(() => {
    if (!tex) return null;
    const mat = new MeshBasicNodeMaterial();
    mat.colorNode = texture(tex).rgb.mul(vec3(TINT_R, TINT_G, TINT_B)).mul(intensity);
    mat.blending = AdditiveBlending;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = DoubleSide;
    mat.toneMapped = true;
    return mat;
  }, [tex, intensity]);

  useEffect(() => () => material?.dispose(), [material]);

  // Billboard: face the camera each frame. Orientation tracking, not oscillation
  // — no time-driven motion (photosafety ✓).
  useFrame(() => {
    meshRef.current?.lookAt(camera.position);
  });

  if (!tex || !material) return null;
  return (
    <mesh ref={meshRef} material={material} position={position} frustumCulled={false}>
      <planeGeometry args={[4000, 4000]} />
    </mesh>
  );
}

export function NebulaPlates({ tier }: { tier: Tier }) {
  // webgpu-high → both plates; webgpu-low → wisp only; webgl2/static → none.
  if (tier === 'webgpu-high') {
    return (
      <>
        <NebulaPlate {...WISP} />
        <NebulaPlate {...DENSE} />
      </>
    );
  }
  if (tier === 'webgpu-low') {
    return <NebulaPlate {...WISP} />;
  }
  return null;
}
