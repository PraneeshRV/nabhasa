// The Nabhasa Reach — eight Kindled worlds (Amendment A2, lore canon) orbit the
// Ember (PSR B1257+12 "Lich"). P1.2 renders REACH_SYSTEM (8 fictional worlds)
// instead of A1's three real LICH bodies. Seven are procedural-TSL spheres via
// createPlanetMaterial; Threshold (biome 'station') is a dedicated structure —
// habitat torus + antenna farm + dark gate-ring placeholder — NOT a sphere.
//
// Per-world props — moons / ring / debris / tether / antennaFarm — are plain lit
// geometry (MeshStandardNodeMaterial, NO emissiveNode). The >1 bloom set lives
// ONLY inside createPlanetMaterial (art-direction v2 + this slice's invariant:
// "emissive >1 only comes from createPlanetMaterial; you add no new emissive
// surfaces"). Diffuse prop albedo is ≤1 and never blooms.
//
// Live positions stay the module-singleton Vector3[] (the A1 leaf idiom, same
// shape as flight/craftState), written in place once/frame, read by
// flight/gravity + flight/Craft's kinematic planet-collider proxy. Craft.tsx's
// PlanetColliders maps over gravity.PLANET_RADII_WU and syncs to
// getPlanetPositions() — so Threshold's ~6 wu collider is provisioned when P1.3
// widens PLANET_RADII_WU to 8. We do NOT register Rapier bodies here: that would
// double-register + drag rapier into the world chunk (violates "flight
// untouched" / "no new deps"). The A1 close-out fix keeps ONE collider proxy in
// Craft, ONE hull here.
//
// QUALITY tier: App passes its resolved tier as a prop (<LichPlanets tier={tier}/>)
// — no re-probe, no wrong-tier transient. The internal detectTier() self-probe
// (NOT cached — tiers.ts re-runs the adapter request per call) survives only as a
// prop-absent fallback, starting at null so count-heavy props (debris belt,
// antenna farm) render at multiplier 0 until the tier is known. Counts scale by
// the QUALITY swarm-count ratios. Moons are lore-fixed (1 / 3) and never scaled.
// static ⇒ multiplier 0 (LichPlanets never mounts on static anyway: App routes it
// to StaticExperience).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color, float, fract, length, step, uv } from 'three/tsl';
import { REACH_SYSTEM, createPlanetMaterial, type PlanetSpec } from './planets';
import { detectTier, type Tier } from '../core/tiers';
import { QUALITY } from '../core/quality';
import { JumpGate } from './JumpGate'; // P5b: Threshold jump-gate (self-tracks index 7)

// Planet contract for any consumer (diegetic HUD, etc.). Single source = planets.ts.
export const PLANETS = REACH_SYSTEM;

// Staggered start phases (rad) — same idiom as A1 so the worlds don't line up.
const PHASES = REACH_SYSTEM.map((_, i) => i * 2.1 + 0.7);

// ---- live position singleton (leaf: written here, read by gravity + Craft) ----
// Initialized phase-correct so consumers see the true start pose before the first
// frame; written in place each frame → no per-frame allocation. Length 8 now.
const POSITIONS: THREE.Vector3[] = REACH_SYSTEM.map((p, i) => {
  const az = PHASES[i];
  return new THREE.Vector3(p.orbitWu * Math.cos(az), 0, -p.orbitWu * Math.sin(az));
});

export function getPlanetPositions(): readonly THREE.Vector3[] {
  return POSITIONS;
}

// P3 approach trigger radius (wu). > planet radius, > courier.OFFER_RADIUS (40)
// so a panel can open (outer) before a mission offers (inner) — concentric.
// 2× APPROACH_RADIUS is the generous nearest-world cutoff below.
export const APPROACH_RADIUS = 60;
const APPROACH_CUTOFF = APPROACH_RADIUS * 2; // 120 wu

// Nearest content-bearing world within APPROACH_CUTOFF, else null. P3 docks here.
export function nearestContentWorld(
  pos: THREE.Vector3,
): { id: string; name: string; slot: string; dist: number } | null {
  let best: { id: string; name: string; slot: string; dist: number } | null = null;
  let bestD = APPROACH_CUTOFF;
  for (let i = 0; i < REACH_SYSTEM.length; i++) {
    const w = REACH_SYSTEM[i];
    if (!w.contentSlot) continue;
    const d = POSITIONS[i].distanceTo(pos);
    if (d < bestD) {
      bestD = d;
      best = { id: w.name, name: w.name, slot: w.contentSlot, dist: d };
    }
  }
  return best;
}

// QUALITY-derived 0..1 tier scalar (swarm-count ratio vs webgpu-high). static ⇒ 0.
// Scales debris / antenna counts; moons stay lore-fixed.
const TIER_K: Record<Tier, number> = {
  'webgpu-high': 1,
  'webgpu-low': QUALITY['webgpu-low'].swarmTiles / QUALITY['webgpu-high'].swarmTiles,
  webgl2: QUALITY['webgl2'].swarmTiles / QUALITY['webgpu-high'].swarmTiles,
  static: 0,
};

// Deterministic 0..1 hash — stable visuals across reloads (no Math.random).
const hash01 = (i: number): number => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const UP = new THREE.Vector3(0, 1, 0);

// Fibonacci-sphere unit direction (for antenna-farm placement).
const fibDir = (i: number, n: number, out: THREE.Vector3): THREE.Vector3 => {
  const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * 2.39996323; // golden angle
  return out.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
};

// Plain lit prop material — albedo + roughness + metalness ONLY (no emissiveNode).
function propMaterial(hex: string, metal = 0.1, rough = 0.9): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = color(hex);
  m.roughnessNode = float(rough);
  m.metalnessNode = float(metal);
  return m;
}

// ── spherical world: biome material + axial spin (+ optional Kiln tether) ─────
function SphereBody({ spec }: { spec: PlanetSpec }) {
  const spinRef = useRef<THREE.Group>(null);
  const material = useMemo(() => createPlanetMaterial(spec), [spec]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (spinRef.current) spinRef.current.rotation.y += ((2 * Math.PI) / spec.axialDayS) * dt;
  });

  return (
    <group ref={spinRef}>
      <mesh material={material}>
        <sphereGeometry args={[spec.radiusWu, 96, 96]} />
      </mesh>
      {/* Kiln space-elevator: anchored to the surface, co-rotates with the axis.
          Its ring co-rotates too, so the tether's ring-anchor never sweeps away. */}
      {spec.props?.tether ? (
        <>
          <Tether spec={spec} />
          {spec.props?.ring ? <Ring spec={spec} /> : null}
        </>
      ) : null}
    </group>
  );
}

// ── moons: small instanced spheres on inclined orbits (Praesidium, Corona) ────
// Lore-fixed count (1 / 3) — never tier-scaled (they're discrete + trivial).
function Moons({ spec }: { spec: PlanetSpec }) {
  const n = spec.props?.moons ?? 0;
  const material = useMemo(() => propMaterial('#8e97a3', 0, 0.95), []);
  useEffect(() => () => material.dispose(), [material]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const acc = useRef(0);
  const moons = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        r: spec.radiusWu * (1.7 + hash01(i * 2 + 1) * 0.9),
        phase: i * 2.4 + hash01(i * 2 + 1) * 6.2832,
        speed: 0.2 + hash01(i * 2 + 2) * 0.3,
        inc: (hash01(i * 2 + 2) - 0.5) * 0.6,
        size: spec.radiusWu * 0.14 * (0.7 + hash01(i * 2 + 3) * 0.5),
      })),
    [n, spec.radiusWu],
  );
  const mesh = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 12, 12);
    return new THREE.InstancedMesh(geo, material, n);
  }, [material, n]);
  useEffect(() => () => { mesh.geometry.dispose(); mesh.dispose(); }, [mesh]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    acc.current += dt;
    for (let i = 0; i < n; i++) {
      const mo = moons[i];
      const a = mo.phase + acc.current * mo.speed;
      const s = Math.sin(a);
      const c = Math.cos(a);
      // inclined circle: (c,0,s)·r rotated about X by mo.inc
      dummy.position.set(c * mo.r, -s * mo.r * Math.sin(mo.inc), s * mo.r * Math.cos(mo.inc));
      dummy.scale.setScalar(mo.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

// ── ring: ringGeometry with concentric banded alpha + tilt (Kiln, Corona) ──────
function Ring({ spec }: { spec: PlanetSpec }) {
  const r = spec.props!.ring!;
  const isGiant = spec.biome === 'gasGiant';
  const bands = isGiant ? 12 : 6; // gas-giant: fine rings; forge: chunkier habitat tiles
  const ringHex = isGiant ? '#dcc78e' : '#4a3528'; // Corona band-mid / Kiln dark metal
  const material = useMemo(() => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = color(ringHex);
    m.roughnessNode = float(0.7);
    m.metalnessNode = float(0.0);
    // ringGeometry uv maps the annulus into a centered square, so radial distance
    // from center = length(uv·2 − 1) ∈ [inner/outer, 1]. Concentric Cassini bands.
    const radial = length(uv().mul(float(2)).sub(float(1)));
    m.opacityNode = step(float(0.5), fract(radial.mul(float(bands))));
    m.transparent = true;
    m.side = THREE.DoubleSide;
    return m;
  }, [ringHex, bands]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh rotation={[r.tilt, 0, 0]} material={material}>
      <ringGeometry args={[r.inner, r.outer, 128]} />
    </mesh>
  );
}

// ── debris belt: instanced fragments around the shattered core (Riven) ────────
// Count scales by the QUALITY tier scalar (heavy-ish cloud).
function Debris({ spec, k }: { spec: PlanetSpec; k: number }) {
  const base = spec.props?.debris ?? 0;
  const count = Math.max(8, Math.round(base * k));
  const material = useMemo(() => propMaterial('#8a8a96', 0.1, 0.9), []);
  useEffect(() => () => material.dispose(), [material]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const acc = useRef(0);
  const frags = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        r: spec.radiusWu * (1.4 + hash01(i * 3 + 1) * 1.6),
        phase: hash01(i * 3 + 2) * Math.PI * 2,
        y: (hash01(i * 3 + 3) - 0.5) * spec.radiusWu * 0.5,
        speed: 0.08 + hash01(i * 3 + 4) * 0.12,
        scale: spec.radiusWu * 0.08 * (0.5 + hash01(i * 3 + 5)),
        spin: hash01(i * 3 + 6) * Math.PI,
      })),
    [count, spec.radiusWu],
  );
  const mesh = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    return new THREE.InstancedMesh(geo, material, count);
  }, [material, count]);
  useEffect(() => () => { mesh.geometry.dispose(); mesh.dispose(); }, [mesh]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    acc.current += dt;
    for (let i = 0; i < count; i++) {
      const f = frags[i];
      const a = f.phase + acc.current * f.speed;
      dummy.position.set(Math.cos(a) * f.r, f.y, Math.sin(a) * f.r);
      dummy.rotation.set(f.spin, a * 2, f.spin * 0.5);
      dummy.scale.setScalar(f.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

// ── tether: thin space-elevator line, surface → orbital ring (Kiln) ───────────
function Tether({ spec }: { spec: PlanetSpec }) {
  const ring = spec.props!.ring!;
  const len = ring.inner - spec.radiusWu; // surface → ring inner
  const material = useMemo(() => propMaterial('#2a2018', 0.5, 0.6), []);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group rotation={[ring.tilt, 0, 0]}>
      <mesh position={[0, spec.radiusWu + len / 2, 0]} material={material}>
        <cylinderGeometry args={[0.04, 0.04, len, 6]} />
      </mesh>
    </group>
  );
}

// ── antenna farm: instanced thin spikes on the station shell (Threshold) ──────
// Count scales by the QUALITY tier scalar. Shares the hull material (owner
// disposes it). Static matrices — set once at allocation; spins with the station.
function AntennaFarm({ k, hull }: { k: number; hull: THREE.MeshStandardNodeMaterial }) {
  const base = 28;
  const count = Math.max(8, Math.round(base * k));
  const mesh = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.03, 0.05, 0.6, 5);
    const m = new THREE.InstancedMesh(geo, hull, count);
    const d = new THREE.Object3D();
    const dir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      fibDir(i, count, dir);
      d.position.copy(dir).multiplyScalar(2.6); // just outside the torus
      d.quaternion.setFromUnitVectors(UP, dir); // orient the +Y cylinder along dir
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    return m;
  }, [hull, count]);
  useEffect(() => () => { mesh.geometry.dispose(); mesh.dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

// ── Threshold: NOT a sphere — habitat torus + antenna farm + dark gate ring ───
// Jump-gate emissive/distortion is P5b; here it's a plain dark ring placeholder.
function ThresholdStructure({ spec, k }: { spec: PlanetSpec; k: number }) {
  const spinRef = useRef<THREE.Group>(null);
  const hull = useMemo(() => propMaterial('#3a4150', 0.6, 0.5), []); // --ui-dim family
  const gate = useMemo(() => propMaterial('#222831', 0.4, 0.7), []); // dark, non-emissive
  useEffect(
    () => () => {
      hull.dispose();
      gate.dispose();
    },
    [hull, gate],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (spinRef.current) spinRef.current.rotation.y += ((2 * Math.PI) / spec.axialDayS) * dt;
  });

  return (
    <group>
      <group ref={spinRef}>
        {/* habitat torus */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={hull}>
          <torusGeometry args={[2.2, 0.45, 12, 48]} />
        </mesh>
        <AntennaFarm k={k} hull={hull} />
      </group>
      {/* dark gate-ring placeholder (jump-gate FX = P5b) */}
      <mesh rotation={[Math.PI / 2 + 0.3, 0, 0]} material={gate}>
        <ringGeometry args={[3.4, 3.8, 64]} />
      </mesh>
    </group>
  );
}

// ── one world: orbital group publishes the live position; props orbit it ──────
function ReachWorld({
  spec,
  phase,
  idx,
  k,
}: {
  spec: PlanetSpec;
  phase: number;
  idx: number;
  k: number;
}) {
  const orbitRef = useRef<THREE.Group>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (orbitRef.current) orbitRef.current.rotation.y += ((2 * Math.PI) / spec.periodS) * dt;

    // Publish the live world position into the singleton so gravity + courier +
    // the Craft collider proxy read EXACTLY what the player sees. World pos of a
    // body at local [orbitWu,0,0] under R_y(θ) is [r·cosθ, 0, −r·sinθ].
    const theta = orbitRef.current?.rotation.y ?? phase;
    POSITIONS[idx]?.set(spec.orbitWu * Math.cos(theta), 0, -spec.orbitWu * Math.sin(theta));
  });

  return (
    <group ref={orbitRef} rotation={[0, phase, 0]}>
      <group position={[spec.orbitWu, 0, 0]}>
        {spec.biome === 'station' ? (
          <ThresholdStructure spec={spec} k={k} />
        ) : (
          <SphereBody spec={spec} />
        )}
        {/* tethered ring (Kiln) mounts inside SphereBody's spin group instead */}
        {spec.props?.ring && !spec.props?.tether ? <Ring spec={spec} /> : null}
        {spec.props?.moons ? <Moons spec={spec} /> : null}
        {spec.props?.debris ? <Debris spec={spec} k={k} /> : null}
      </group>
    </group>
  );
}

export function LichPlanets({ tier: tierProp }: { tier?: Tier }) {
  // Prop-first: App already resolved the tier. Self-probe is fallback only,
  // starting at null → multiplier 0 (no wrong-count pop-in while resolving).
  const [probed, setProbed] = useState<Tier | null>(null);
  useEffect(() => {
    if (tierProp) return;
    let alive = true;
    detectTier().then((t) => {
      if (alive) setProbed(t);
    });
    return () => {
      alive = false;
    };
  }, [tierProp]);
  const tier = tierProp ?? probed;
  const k = tier ? TIER_K[tier] : 0;

  return (
    <>
      {REACH_SYSTEM.map((spec, i) => (
        <ReachWorld key={spec.name} spec={spec} phase={PHASES[i]} idx={i} k={k} />
      ))}
      {/* P5b: Threshold jump-gate. Self-tracks Threshold's live pos (idx 7) like
          Aurora; mounts only once the tier is resolved (prop-first) so webgl2
          never renders the webgpu-only fold disc transiently. */}
      {tier ? <JumpGate tier={tier} /> : null}
    </>
  );
}
