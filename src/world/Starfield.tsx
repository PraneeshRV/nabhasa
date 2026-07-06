// Starfield — spec Task 5. Two jobs:
//   1. LIVE scene: instanced point-sprites (one <points> draw call) with a TSL
//      twinkle, plus a dim FBM nebula backplate. Cool white-blue stars only —
//      the neutron star owns the single hot accent, distant stars stay ambient.
//   2. CUBEMAKE: bake the starfield+nebula ONCE into a CubeTexture exported as
//      getStarfieldCube(). The lensing shader (Task 7) samples this along bent
//      rays — instance-rendered stars can't be gravitationally deflected, so the
//      bake is how lensing sees our sky. Lensing's procedural skyColor is the
//      fallback until this bake lands / on the static tier (returns null).
//
// ASSUMPTION (gate-verified by conductor probe): three r185 WebGPURenderer
// supports CubeCamera.update(renderer, scene) into a CubeRenderTarget — the
// unified renderer interface. If the gate finds a backend cubemap quirk, this is
// the place to look.

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Fn,
  vec3,
  float,
  fract,
  sin,
  pow,
  floor,
  length,
  smoothstep,
  step,
  normalize,
  time,
  attribute,
  vertexColor,
  positionLocal,
} from 'three/tsl';
import { PointsNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeCamera,
  CubeRenderTarget,
  Mesh,
  Scene,
  SphereGeometry,
} from 'three/webgpu';
import type { CubeTexture } from 'three/webgpu';
import { QUALITY } from '../core/quality';
import type { Tier } from '../core/tiers';
import { createNebulaMaterial } from '../shaders/nebula';

const SHELL_NEAR = 2500;
const SHELL_FAR = 6000;

// ── Live point-sprite material ──────────────────────────────────────────────
// Color per-star from the geometry `color` attribute (cool→white bias); twinkle
// is a time-driven sin keyed off a per-star phase attribute.
function createStarPointsMaterial() {
  const mat = new PointsNodeMaterial();
  // finding 4: shell r=2500–6000 with sizeAttenuation=true projects to ~0.4–0.9px
  // (sub-pixel → near-invisible). Pixel size with attenuation off reads at any range.
  mat.size = 2; // px
  mat.sizeAttenuation = false;
  // ponytail: uniform size; per-point sizeNode deferred (API risk, not needed at this scale)
  const phase = attribute('aPhase') as unknown as ReturnType<typeof float>; // @types/three TSL gap: AttributeNode lacks operator exts
  const twinkle = sin(time.mul(2.0).add(phase)).mul(0.35).add(0.65); // [0.30, 1.00]
  mat.colorNode = vertexColor().mul(twinkle);
  mat.depthWrite = false;
  return mat;
}

function buildStarGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const cool = new Color('#cfe0ff');
  const white = new Color('#ffffff');
  const c = new Color();
  for (let i = 0; i < count; i++) {
    // uniform direction on the sphere
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const r = SHELL_NEAR + Math.random() * (SHELL_FAR - SHELL_NEAR);
    const sv = Math.sin(v);
    positions[i * 3] = r * sv * Math.cos(u);
    positions[i * 3 + 1] = r * sv * Math.sin(u);
    positions[i * 3 + 2] = r * Math.cos(v);
    // mostly cool, a few warm-white — temp^3 biases hard toward cool
    c.copy(cool).lerp(white, Math.pow(Math.random(), 3));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.setAttribute('aPhase', new BufferAttribute(phases, 1));
  return g;
}

// ── Bake star shader (procedural hash stars on an inward sphere) ────────────
// Compact cell-jittered starfield for the cube bake. Two layers, rare bright.
// finding 6: PCG integer hash (uint bit ops) — sin-hash diverges WGSL vs WebGL2
// for sin args far beyond 2π, so the baked sky differed per backend. Mirrors
// three's nodes/math/Hash.js (pcg-random.org). Returns float in [0, 1).
const hash31 = /* @__PURE__ */ Fn(([p]: [any]) => {
  const seed = p.x.toUint().add(p.y.toUint().shiftLeft(1)).add(p.z.toUint().shiftLeft(2));
  const state = seed.mul(747796405).add(2891336453);
  const word = state.shiftRight(state.shiftRight(28).add(4)).bitXor(state).mul(277803737);
  const result = word.shiftRight(22).bitXor(word);
  return result.toFloat().mul(1 / 2 ** 32);
});

const bakeStarLayer = /* @__PURE__ */ Fn(([dir, scale, thresh]: [any, any, any]) => {
  const s = dir.mul(scale);
  const id = floor(s);
  const f = fract(s);
  const h = hash31(id);
  const jitter = vec3(
    hash31(id.add(vec3(1.3, 7.7, 3.1))),
    hash31(id.add(vec3(4.4, 2.2, 8.8))),
    hash31(id.add(vec3(9.1, 5.5, 1.7))),
  )
    .mul(0.8)
    .add(0.1);
  const d = length(f.sub(jitter));
  const core = smoothstep(float(0.12), float(0.0), d);
  const mag = pow(h, 8.0);
  return core.mul(step(thresh, h)).mul(mag.mul(3.0).add(0.4));
});

function createBakeStarMaterial() {
  const mat = new MeshBasicNodeMaterial();
  const dir = normalize(positionLocal);
  const l1 = bakeStarLayer(dir, 64.0, 0.984);
  const l2 = bakeStarLayer(dir.add(vec3(3.7, 1.9, 8.2)), 64.0 * 2.3, 0.988);
  const cool = vec3(0.85, 0.92, 1.1);
  const warm = vec3(1.1, 0.88, 0.72);
  mat.colorNode = cool.mul(l1).add(warm.mul(l2).mul(0.6));
  mat.side = BackSide;
  mat.depthWrite = false;
  mat.toneMapped = false; // baked raw; lensing tone-maps at composite
  return mat;
}

// ── Cubemap export ──────────────────────────────────────────────────────────
let starfieldCube: CubeTexture | null = null;
// finding 5: keep the CubeRenderTarget reachable alongside its texture so it can
// be disposed. Previously rt was dropped after the bake → GPU mem leak for the
// session, and the singleton guard prevented re-bake so the first RT never freed.
let starfieldRT: CubeRenderTarget | null = null;
export function getStarfieldCube(): CubeTexture | null {
  return starfieldCube;
}

// One-shot starfield+nebula bake into the session-singleton CubeTexture, callable
// with or without <Starfield> mounted. LensingSkybox calls this on lensing tiers
// (where <Starfield> doesn't render) so the lensing shader's bent-ray sample sees a
// real sky instead of its procedural fallback. Idempotent: skips if already baked.
// `renderer` is typed as CubeCamera.update's arg (R3F's gl satisfies it) — the only
// thing this fn does with it is drive the 6-face cube render. RT ownership stays in
// this module (starfieldRT/starfieldCube singletons); the unmount dispose below
// clears them only when <Starfield> itself unmounts, so a standalone bake persists
// for the session (Deviation: standalone-bake RT persistence — see LensingSkybox).
export function bakeStarfieldCube(renderer: Parameters<CubeCamera['update']>[0]): void {
  if (starfieldCube) return;
  const rt = new CubeRenderTarget(512);
  const cam = new CubeCamera(0.1, SHELL_FAR * 2, rt);
  const scene = new Scene();
  const nebSphere = new Mesh(new SphereGeometry(SHELL_FAR, 32, 16), createNebulaMaterial());
  const starSphere = new Mesh(new SphereGeometry(SHELL_FAR, 32, 16), createBakeStarMaterial());
  scene.add(nebSphere, starSphere);
  // finding 7: dropped the gl.toneMapping=NoToneMapping toggle — WebGPURenderer
  // compiles pipelines async so the sync toggle can't take effect this call,
  // and bake materials are already toneMapped=false (raw for lensing).
  cam.update(renderer, scene);
  starfieldRT = rt;
  starfieldCube = rt.texture;
  // Drop bake-only GPU resources; the CubeTexture (rt.texture) stays live.
  nebSphere.geometry.dispose();
  starSphere.geometry.dispose();
  nebSphere.material.dispose();
  starSphere.material.dispose();
}

// ── Component ───────────────────────────────────────────────────────────────
export function Starfield({ tier }: { tier: Tier }) {
  const { gl } = useThree();
  const count = QUALITY[tier].starCount;
  const nebulaMat = useMemo(() => createNebulaMaterial(), []);
  const pointsMat = useMemo(() => createStarPointsMaterial(), []);
  const geo = useMemo(() => (count > 0 ? buildStarGeometry(count) : null), [count]);

  useEffect(() => {
    const dispose = () => {
      nebulaMat.dispose();
      pointsMat.dispose();
      geo?.dispose();
    };
    return dispose;
  }, [nebulaMat, pointsMat, geo]);

  // One-shot cubemap bake (skip on static; bakeStarfieldCube's singleton guard is the
  // idempotency fence). Extracted so LensingSkybox can trigger the same bake on lensing
  // tiers where <Starfield> doesn't mount — same fn, same RT singletons, same dispose.
  useEffect(() => {
    if (tier === 'static') return;
    bakeStarfieldCube(gl);
  }, [gl, tier]);

  // finding 5: free the baked CubeRenderTarget on unmount and clear the singleton
  // so a remount rebakes fresh (no leaked RT, no stale disposed texture).
  useEffect(() => {
    return () => {
      if (starfieldRT) {
        starfieldRT.dispose();
        starfieldRT = null;
        starfieldCube = null;
      }
    };
  }, []);

  if (count === 0) return null;

  return (
    <>
      <points geometry={geo ?? undefined} material={pointsMat} frustumCulled={false} />
      <mesh material={nebulaMat} frustumCulled={false}>
        <sphereGeometry args={[SHELL_FAR, 32, 16]} />
      </mesh>
    </>
  );
}
