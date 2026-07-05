// Dyson swarm assembly region — Nabhasa signature #4 (spec Task 11).
//
// Mood (art-direction §Swarm): industry among the dead — the one place with geometry
// density. Star is the sole key light (distant, cooler exposure). Rim: --irradiated
// #C46A4A bounce off the star-facing tile faces — the ONLY warm light in the
// experience, earned here. Ambient floor 0.02. Bloom nearly off: the swarm reads by
// geometry + rim, not glow.
//
// BEHAVIOR (locked concept #8): QUALITY[tier].swarmTiles mirror-tiles in 3 orbital
// shells around the SWARM_CENTER structure point (a partial node under construction,
// NOT enclosing the star). Assembly a∈[0,1] = smoothstep of craft distance
// (2×SWARM_RADIUS → 0.3×): tiles lerp scattered-cloud → orbital slot with per-tile
// stagger. Slotted tiles catch starlight; the irradiated rim lights star-facing
// faces; PBR specular from the star pointLight IS the glint (the "glitter wave" as
// assembly completes). Occasional flare → sonify.
//
// DEVIATION (documented for conductor review): spec specifies "compute node writes
// instance matrices (WebGPU) / CPU chunked update (WebGL2)". That path depends on
// StorageInstancedBufferAttribute + TSL compute — APIs unverifiable in this dispatch
// (no node_modules read, no browser). Two-strikes + the repo's logged TSL fragility
// make gambling on it the wrong call. Instead the assembly lerp runs in the VERTEX
// shader from `instanceIndex` (procedural per-tile data) + one proximity uniform `a`:
//   • identical code path both backends (WebGL2 benefits too — no CPU ≤2ms loop needed)
//   • zero per-frame buffer writes → instance matrix never changes → trivially one
//     draw call at 150k tiles
//   • uses only the TSL fn set already proven in lensing.ts/starSurface.ts (+ the one
//     standard built-in `instanceIndex`, vertex-stage only)
// Same visual, same invariants (proximity-driven spatial discovery, QUALITY counts,
// one draw call), hits the perf gate. If the conductor requires the literal compute
// path, this is the file to replace.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Fn,
  uniform,
  vec3,
  float,
  fract,
  sin,
  cos,
  sqrt,
  pow,
  max,
  dot,
  cross,
  normalize,
  mix,
  smoothstep,
  length,
  time,
  positionLocal,
  positionWorld,
  instanceIndex,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { SWARM_CENTER, SWARM_RADIUS } from '../world/scale';
import { QUALITY } from '../core/quality';
import type { Tier } from '../core/tiers';
import { craftState } from '../flight/Craft';
import { assemblyParam, flareIntervalS } from './dysonMath';

// ── Tunables (leva-mountable on a future /dev/swarm; committed = art direction) ─
export const swarmUniforms = {
  a: uniform(0), // assembly 0..1 — driven each frame from craft proximity
  tileSize: uniform(2.4), // wu edge length
  assemblyWidth: uniform(0.18), // per-tile stagger window in `a`
  orbitRate: uniform(0.015), // rad/s shell revolution (outer shells faster)
  spinRate: uniform(0.05), // rad/s in-plane pinwheel life
  rimPower: uniform(2.5),
  rimIntensity: uniform(0.7), // material-only; clamped ≤1 (irradiated never blooms)
  selfFloor: uniform(0.012), // cool self-emissive floor so dead-side tiles still read
};

const SWARM_C = vec3(float(SWARM_CENTER[0]), float(SWARM_CENTER[1]), float(SWARM_CENTER[2]));
const STAR_ORIGIN = vec3(0.0, 0.0, 0.0);
const CONE_HALF = float((70 * Math.PI) / 180);
const GOLDEN_ANGLE = float(2.399963229);
const TWO_PI = float(Math.PI * 2);

// Dedicated swarm key light (finding: the star pointLight @ 60000·decay2 falls to
// ~0.074 at 900wu, so PBR specular on the metal tiles is imperceptible). Local,
// non-decaying (decay=0) so tile glints read; a finite `distance` keeps it
// region-scoped — it covers the swarm (~600wu) but not the star (~922wu away) or
// the arrival path. Offset OFF the orbit center so the glint SWEEPS as tiles
// revolve (a light at the exact center hits every inward normal dead-on → no
// sweep). Intensity tuned for metal@0.92 / rough@0.25.
const SWARM_KEY_POS: readonly [number, number, number] = [
  SWARM_CENTER[0],
  SWARM_CENTER[1] + 200,
  SWARM_CENTER[2],
];
const SWARM_KEY_INTENSITY = 4; // ponytail: tune live if the glint reads weak or hot
const SWARM_KEY_DIST = SWARM_RADIUS * 2.4; // ~600wu — covers swarm, not the star

// hash01 → [0,1). Mirror of dysonMath.hash01 (fract(sin) family).
const tslHash01 = /* @__PURE__ */ Fn(([i]: [any]) => fract(sin(i.mul(127.1).add(311.7)).mul(43758.5453)));

// shell index 0..2 + within-shell base index (round-robin, mirror of dysonMath).
const shellOf = /* @__PURE__ */ Fn(([iid]: [any]) => iid.sub(iid.div(3).floor().mul(3)));
const baseOf = /* @__PURE__ */ Fn(([iid]: [any]) => iid.div(3).floor());

// Outward unit slot direction on the +X cone cap, orbit-rotated around X by time.
// Mirror of dysonMath.slotDir (+ orbit). shellR = 90 + shell·60 = {90,150,210}.
const slotDirPost = /* @__PURE__ */ Fn(([iid]: [any]) => {
  const base = baseOf(iid);
  const shell = shellOf(iid);
  const phi = sqrt(base.add(0.5).div(base.add(1.7))).mul(CONE_HALF);
  const theta = base.mul(GOLDEN_ANGLE);
  const sp = sin(phi);
  const cp = cos(phi);
  const dir = vec3(cp, sp.mul(cos(theta)), sp.mul(sin(theta)));
  // orbit around +X: outer shells revolve faster → parallax depth read.
  const ang = time.mul(swarmUniforms.orbitRate).mul(shell.add(1));
  const ca = cos(ang);
  const sa = sin(ang);
  return (vec3 as any)(dir.x, dir.y.mul(ca).sub(dir.z.mul(sa)), dir.y.mul(sa).add(dir.z.mul(ca))); // @types/three TSL gap: swizzle args reject typed overloads
});

// Tile world center: lerp scatter-cloud → slot by per-tile stagger over assembly `a`.
const tileCenter = /* @__PURE__ */ Fn(([iid]: [any]) => {
  const radial = slotDirPost(iid);
  const shell = shellOf(iid);
  const shellR = float(90.0).add(shell.mul(60.0));
  const slotPos = SWARM_C.add(radial.mul(shellR));

  // scatter cloud (mirror of dysonMath.scatterPos): hash unit dir × hash radius.
  const hx = tslHash01(iid.mul(1.9).add(2.1)).mul(2.0).sub(1.0);
  const hy = tslHash01(iid.mul(3.7).add(4.3)).mul(2.0).sub(1.0);
  const hz = tslHash01(iid.mul(5.1).add(6.7)).mul(2.0).sub(1.0);
  const hlen = max(length(vec3(hx, hy, hz)), float(1e-4));
  const cloudR = float(SWARM_RADIUS * 0.5).add(tslHash01(iid.mul(9.1).add(0.5)).mul(float(SWARM_RADIUS * 0.9)));
  const scatter = SWARM_C.add(vec3(hx, hy, hz).div(hlen).mul(cloudR));

  const stg = tslHash01(iid.mul(7.3).add(1.1));
  const lerpT = smoothstep(stg, stg.add(swarmUniforms.assemblyWidth), swarmUniforms.a);
  return mix(scatter, slotPos, lerpT);
});

// ── Node builders (module scope, named — matches lensing.ts `lensedSky()` style) ─
// positionNode + normalNode run in the VERTEX stage (instanceIndex is vertex-safe);
// emissiveNode runs in the FRAGMENT stage and uses positionWorld only — no
// instanceIndex cross-stage, the one API-surface risk kept to a single standard
// built-in consumed in its home stage.
const swarmPosition = /* @__PURE__ */ Fn(() => {
  const iid = float(instanceIndex); // GLSL: uint builtin must be floated before float math
  const radial = slotDirPost(iid); // outward
  const normal = radial.negate(); // tiles face INWARD (toward node center / star)
  const center = tileCenter(iid);

  // ON basis on the tile plane (cross/dot/normalize — verified in lensing.ts).
  const up = vec3(0.0, 1.0, 0.0);
  const tangent = normalize(cross(up, normal));
  const bitang = cross(normal, tangent);

  // in-plane pinwheel spin (subtle life; the glint comes from orbit, not this).
  const sp = time.mul(swarmUniforms.spinRate).add(tslHash01(iid.mul(2.1)).mul(TWO_PI));
  const ca = cos(sp);
  const sa = sin(sp);
  const lx = positionLocal.x.mul(ca).sub(positionLocal.y.mul(sa));
  const ly = positionLocal.x.mul(sa).add(positionLocal.y.mul(ca));
  const offset = tangent.mul(lx).add(bitang.mul(ly));
  return center.add(offset.mul(swarmUniforms.tileSize));
});

// normalNode: inward radial. Drives star PBR specular → the glint; as tiles slot +
// orbit, normals sweep → the "glitter wave" as assembly completes.
const swarmNormal = /* @__PURE__ */ Fn(() => slotDirPost(float(instanceIndex)).negate());

// emissiveNode (fragment, positionWorld only): --irradiated rim on star-facing
// faces + a cool self-floor so dead-side tiles still read with bloom nearly off.
const swarmEmissive = /* @__PURE__ */ Fn(() => {
  const radial = normalize(positionWorld.sub(SWARM_C)); // outward at this tile
  const inward = radial.negate();
  const starDir = normalize(STAR_ORIGIN.sub(positionWorld));
  const facing = max(dot(inward, starDir), float(0.0));
  const rim = pow(facing, swarmUniforms.rimPower).mul(swarmUniforms.rimIntensity);
  const irradiated = vec3(float(0.769), float(0.416), float(0.290)); // #C46A4A / 255
  const floorGlow = vec3(0.10, 0.12, 0.16).mul(swarmUniforms.selfFloor); // cool, dim
  return irradiated.mul(rim).add(floorGlow);
});

function createSwarmMaterial() {
  const mat = new MeshStandardNodeMaterial();
  mat.positionNode = swarmPosition();
  mat.normalNode = swarmNormal();
  mat.colorNode = vec3(0.05, 0.06, 0.08); // dark dead-metal albedo
  mat.roughnessNode = float(0.25); // mirror-ish → star specular reads
  mat.metalnessNode = float(0.92);
  mat.emissiveNode = swarmEmissive();
  mat.toneMapped = true;
  return mat;
}

// ── Flare → sonify seam (spec: "emits flare events to sonify") ──────────────────
// Task 9 not merged yet; this is the decoupled emit point. No consumer = no-op.
// ponytail: minimal pub/sub, no separate bus file; Task 9 imports subscribeSwarmFlare.
const flareCbs = new Set<() => void>();
export function subscribeSwarmFlare(cb: () => void): () => void {
  flareCbs.add(cb);
  return () => {
    flareCbs.delete(cb);
  };
}
function emitFlare() {
  flareCbs.forEach((cb) => cb());
}

export function DysonSwarm({ tier }: { tier: Tier }) {
  const count = QUALITY[tier].swarmTiles;
  const mat = useMemo(() => (count > 0 ? createSwarmMaterial() : null), [count]);
  const flareAccum = useRef(0);

  useEffect(() => {
    if (!mat) return;
    return () => mat.dispose();
  }, [mat]);

  useFrame((_, rawDt) => {
    if (!mat) return;
    const dt = Math.min(rawDt, 1 / 30); // clamp (perf rule)

    // proximity → assembly `a` (craft pos mutated by Craft each frame; refs, no setState)
    const dx = craftState.pos.x - SWARM_CENTER[0];
    const dy = craftState.pos.y - SWARM_CENTER[1];
    const dz = craftState.pos.z - SWARM_CENTER[2];
    const a = assemblyParam(Math.hypot(dx, dy, dz));
    swarmUniforms.a.value = a; // single uniform write/frame

    // flare cadence tightens as assembly completes (≤2Hz, photosafety <3Hz)
    flareAccum.current += dt;
    const interval = flareIntervalS(a);
    if (Number.isFinite(interval) && flareAccum.current >= interval) {
      flareAccum.current = 0;
      emitFlare();
    }
  });

  if (count === 0 || !mat) return null;

  // instanceMatrix stays identity (placement is procedural in the vertex shader) →
  // one draw call, count instances. frustumCulled false: positions are shader-derived
  // (not in the geometry bounding sphere), so culling would wrongly drop the swarm.
  return (
    <>
      <instancedMesh args={[undefined, undefined, count] as any} material={mat} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      {/* Region-scoped key light so metal-tile specular reads; R3F disposes on unmount. */}
      <pointLight
        position={SWARM_KEY_POS}
        color="#AFE3FF"
        intensity={SWARM_KEY_INTENSITY}
        decay={0}
        distance={SWARM_KEY_DIST}
      />
    </>
  );
}
