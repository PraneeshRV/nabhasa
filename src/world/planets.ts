// The Nabhasa Reach — eight Kindled worlds (Amendment A2, lore canon) orbit the
// Ember (PSR B1257+12 "Lich"). The shown bodies are FICTIONAL terraformings;
// the star's real astrophysics stays as diegetic instrumentation flavor
// (hud/physics-data.ts, unchanged). Orbital order is canon — lore.md "the
// fly-path reads as a sentence": burn → garden → library → forge → history →
// ruins → beauty → door.
//
// REACH_SYSTEM is the single world contract for P1.2 (render) / P1.3 (gravity)
// / P3 (approach panels) / P4 (courier missions). Orbit radii sit inside
// PLAY_RADIUS=3000 with a clean gap around the untouched Dyson swarm
// (centered (900,0,0), r≈250 → spans ~650–1150 wu): four inner worlds inside,
// four outer worlds outside. Periods are the contract table values
// (Kepler-ratioed in intent from semi-major, base Brace = 50 s).
//
// LICH_SYSTEM is RETAINED (not replaced): the three REAL PSR B1257+12 bodies
// stay as the "first exoplanets ever discovered" reference for the static
// no-WebGPU fallback (StaticExperience.tsx) — their real mass/AU/period table
// is honest educational content the lore explicitly preserves. It is a subtype
// of PlanetSpec (adds the real-* columns), so the live-scene importers
// (LichPlanets.tsx, SystemDev.tsx) keep compiling against the new types and
// render via the default rocky material branch until P1.2 switches them to
// REACH_SYSTEM.
//
// Materials: procedural TSL PBR — fractal albedo, worley mottling, noise
// displacement, ember irradiation rim on the star-facing limb. Per-biome
// branches extend the same skeleton. Zero texture files (anti-slop:
// procedural first; KB not MB). Emissive discipline (art-direction v2): only
// lava / data-lattice / city-lights / foundry cross >1.0 — they are what bloom
// is for. Diffuse biome albedo is ≤1 and never blooms.

import {
  Fn,
  uniform,
  float,
  vec3,
  color,
  mix,
  clamp,
  pow,
  dot,
  normalize,
  max,
  sin,
  smoothstep,
  step,
  abs,
  cross,
  time,
  positionLocal,
  normalLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  transformNormalToView,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';

// ── Reach world contract (P1.1 — single source for P1.2/P1.3/P3/P4) ──────────

export type Biome =
  | 'magma'
  | 'ocean'
  | 'glass'
  | 'industrial'
  | 'bioluminescent'
  | 'shattered'
  | 'gasGiant'
  | 'station';

export type ContentSlot = 'About' | 'Research' | 'Projects' | 'Experience' | 'Contact';

export interface WorldProps {
  moons?: number; // small shepherd / habitat moons
  ring?: { inner: number; outer: number; tilt: number }; // wu band + tilt (rad)
  debris?: number; // instanced fragment base count (Riven; render scales by QUALITY)
  tether?: boolean; // space-elevator line (Kiln)
  antennaFarm?: boolean; // (Threshold structure)
}

export interface PlanetSpec {
  name: string;
  // Reach lore metadata — present on the 8 fictional worlds; OPTIONAL so the
  // real Lich bodies (LICH_SYSTEM) still satisfy PlanetSpec for the live-scene
  // importers. createPlanetMaterial treats a missing biome as the default
  // rocky path (the original Lich look).
  title?: string; // lore epithet, e.g. 'the garden'
  biome?: Biome;
  myth?: string; // lore.md myth line (HUD / panel flavor)
  massEarthsTuned?: number; // FICTIONAL gameplay-tuned; feeds gravity perturbation (P1.3)
  props?: WorldProps; // rings / moons / debris / tether / station
  contentSlot?: ContentSlot; // P3 docks a portfolio panel here
  // display (scene) — shared with the real Lich bodies
  radiusWu: number;
  orbitWu: number;
  periodS: number; // contract table (Kepler-ratioed in intent)
  axialDayS: number;
  palette: [string, string]; // light, dark — biome albedo (art-direction v2, ≤1)
  crater: number; // worley strength 0..1 (rocky biomes)
  displaceAmp: number; // silhouette bump (fraction of radius)
}

// Real Lich bodies carry real astrophysics for the diegetic HUD + the static
// fallback table. Subtype of PlanetSpec: adds the real-* columns. The shown
// worlds are now fictional (REACH_SYSTEM); these three stay only as the
// "first exoplanets" instrumentation reference.
export interface LichBodySpec extends PlanetSpec {
  realMassEarths: number;
  realSemiMajorAU: number;
  realPeriodDays: number;
}

// ── The Nabhasa Reach (8 worlds, contract table) ────────────────────────────
// Palettes (light, dark) are the art-direction v2 per-biome albedo hexes
// (material albedo ≤1). >1 emissives (lava / lattice / city-lights / foundry)
// live in the material, not the palette.
export const REACH_SYSTEM: PlanetSpec[] = [
  {
    name: 'Brace',
    title: 'the burning world',
    biome: 'magma',
    myth: 'Too hot to tame, too bright to ignore — the Kindled left it burning as a reminder of what the Ember still is.',
    radiusWu: 3.0,
    orbitWu: 130,
    periodS: 50,
    axialDayS: 38,
    palette: ['#3a261a', '#160f0a'],
    crater: 0.6,
    displaceAmp: 0.03,
    massEarthsTuned: 0.4,
  },
  {
    name: 'Praesidium',
    title: 'the garden',
    biome: 'ocean',
    myth: 'The closest echo of the world they lost; the one place they allow themselves to be sentimental.',
    radiusWu: 5.0,
    orbitWu: 260,
    periodS: 141,
    axialDayS: 52,
    palette: ['#cfe4ef', '#9fc3a6'], // sea, land
    crater: 0.1,
    displaceAmp: 0.006,
    massEarthsTuned: 1.0,
    props: { moons: 1 }, // one small moon (aurora is P5)
    contentSlot: 'About',
  },
  {
    name: 'Aletheia',
    title: 'the library',
    biome: 'glass',
    myth: 'Built so no Kindled would ever forget; its surface is shelves, and every shelf is full.',
    radiusWu: 4.6,
    orbitWu: 400,
    periodS: 269,
    axialDayS: 61,
    palette: ['#9fe3e6', '#2f6a72'], // glass, facet dark
    crater: 0.4,
    displaceAmp: 0.04,
    massEarthsTuned: 0.8,
    contentSlot: 'Research',
  },
  {
    name: 'Kiln',
    title: 'the forge',
    biome: 'industrial',
    myth: 'Where every dream is tried in fire; half its craters are stars that didn’t take.',
    radiusWu: 5.8,
    orbitWu: 560,
    periodS: 448,
    axialDayS: 70,
    palette: ['#b07a4a', '#5a3320'], // copper, rust
    crater: 0.5,
    displaceAmp: 0.02,
    massEarthsTuned: 1.2,
    props: { ring: { inner: 8.7, outer: 11.0, tilt: 0.25 }, tether: true }, // orbital habitat ring + elevator
    contentSlot: 'Projects',
  },
  // ── swarm gap (900, r≈250) — architecture untouched, sits between Kiln & Vesper ──
  {
    name: 'Vesper',
    title: 'the first colony',
    biome: 'bioluminescent',
    myth: 'First lit when the Ember was new; its people went to the stars but left the lights on.',
    radiusWu: 6.2,
    orbitWu: 1250,
    periodS: 1667,
    axialDayS: 47,
    palette: ['#1f5e54', '#0e2a26'], // canopy, vine
    crater: 0.35,
    displaceAmp: 0.02,
    massEarthsTuned: 1.1,
    contentSlot: 'Experience',
  },
  {
    name: 'Riven',
    title: 'the shattered world',
    biome: 'shattered',
    myth: 'A world that died of its own ambition; its rubble is now the Reach’s outer wall.',
    radiusWu: 5.4, // fractured core; debris belt is a render prop
    orbitWu: 1600,
    periodS: 2164,
    axialDayS: 55,
    palette: ['#8a8a96', '#5a4a52'], // debris glint, core rock
    crater: 0.7,
    displaceAmp: 0.05,
    massEarthsTuned: 0.6,
    props: { debris: 64 }, // base count; render scales by QUALITY (+ shepherd asteroids)
  },
  {
    name: 'Corona',
    title: 'the ringed giant',
    biome: 'gasGiant',
    myth: 'Uninhabitable, unharnessable — kept only because it is beautiful, and beauty is a Kindled engineering constraint.',
    radiusWu: 9.0,
    orbitWu: 2050,
    periodS: 2800,
    axialDayS: 22,
    palette: ['#e8d9b0', '#c79a52'], // band cream, band amber
    crater: 0.0,
    displaceAmp: 0.0, // fluid — no silhouette displacement
    massEarthsTuned: 95, // massive but far → negligible pull (honest)
    props: { ring: { inner: 12.0, outer: 22.0, tilt: 0.45 }, moons: 3 }, // vast ring + shepherd moons
  },
  {
    name: 'Threshold',
    title: 'the gate station',
    biome: 'station',
    myth: 'Every word to a hundred galaxies passes through this ring; it is the loudest mailbox in the Reach.',
    radiusWu: 3.0, // structure half-extent proxy (NOT a sphere — dedicated render path in P1.2)
    orbitWu: 2700,
    periodS: 3797,
    axialDayS: 120, // ring spin
    palette: ['#4a5360', '#3a4150'], // hull-mid, hull (--ui-dim family)
    crater: 0.0,
    displaceAmp: 0.0,
    massEarthsTuned: 0.1, // gravity-soft; kinematic collider only (A1 close-out pattern)
    props: { antennaFarm: true }, // habitat torus + jump-gate are dedicated P1.2/P5 geometry
    contentSlot: 'Contact',
  },
];

// ── Real PSR B1257+12 "Lich" bodies — RETAINED for the static fallback ──────
// Real bodies, undead names: Draugr, Poltergeist, Phobetor (Wolszczan & Frail
// 1992; IAU names 2015). Real values ride along for the diegetic HUD + the
// StaticExperience table. [VERIFY against NASA Exoplanet Archive at physics
// review — masses/periods from training knowledge.]
export const LICH_SYSTEM: LichBodySpec[] = [
  {
    name: 'Draugr',
    realMassEarths: 0.02, // smallest known exoplanet
    realSemiMajorAU: 0.19,
    realPeriodDays: 25.26,
    radiusWu: 2.2,
    orbitWu: 150,
    periodS: 60,
    axialDayS: 41,
    palette: ['#74747c', '#33333b'],
    crater: 0.85,
    displaceAmp: 0.035,
  },
  {
    name: 'Poltergeist',
    realMassEarths: 4.3,
    realSemiMajorAU: 0.36,
    realPeriodDays: 66.54,
    radiusWu: 5.4,
    orbitWu: 260,
    periodS: 158, // 60 × (66.54/25.26)
    axialDayS: 67,
    palette: ['#8a5a44', '#41281f'],
    crater: 0.45,
    displaceAmp: 0.02,
  },
  {
    name: 'Phobetor',
    realMassEarths: 3.9,
    realSemiMajorAU: 0.46,
    realPeriodDays: 98.21,
    radiusWu: 5.0,
    orbitWu: 340,
    periodS: 233, // 60 × (98.21/25.26)
    axialDayS: 89,
    palette: ['#7c88a2', '#2e3547'],
    crater: 0.3,
    displaceAmp: 0.025,
  },
];

// Shared ember irradiation tint (--irradiated token, art-direction.md) + the
// single hot accent (--star-hot) used by Ember-light emissives (Aletheia
// data-lattice, Threshold gate).
const EMBER = color('#C46A4A');
const STARHOT = color('#AFE3FF');

// Surface-normal relief for displaced biomes (W2). three's NodeMaterial does NOT
// recompute normals from a displaced positionNode — setupNormal() falls back to
// the geometry normal attribute, so vertices displaced in the vertex stage still
// shade as a smooth sphere (the flat-ball tell). This perturbs the smooth normal
// by the finite-difference gradient of a 2-octave fractal-noise height field
// (cheaper than the 5-oct color noise), re-sampled at two in-plane offsets.
// Pole-stable tangent frame (swaps the reference axis near the poles so the
// cross product never collapses to NaN). One definition; each displaced branch
// calls it with that branch's noise scale + a bump strength.
const bumpNormal = (scale: number, amp: number) => {
  const s = float(scale);
  const a = float(amp);
  const n = normalLocal;
  const ref = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), step(float(0.99), abs(n.y)));
  const t1 = normalize(ref.sub(n.mul(dot(n, ref))));
  const t2 = cross(n, t1);
  const eps = float(0.04);
  const p = positionLocal;
  const hC = mx_fractal_noise_float(p.mul(s), 2, 2.0, 0.5, 1.0);
  const hX = mx_fractal_noise_float(p.add(t1.mul(eps)).mul(s), 2, 2.0, 0.5, 1.0);
  const hY = mx_fractal_noise_float(p.add(t2.mul(eps)).mul(s), 2, 2.0, 0.5, 1.0);
  // normalNode is consumed as the VIEW-space normal (NodeMaterial.setupNormal
  // returns it verbatim into the normalView pipeline) — transform the perturbed
  // LOCAL normal to view space or lighting rotates with the camera.
  return transformNormalToView(
    normalize(n.sub(t1.mul(hX.sub(hC)).mul(a)).sub(t2.mul(hY.sub(hC)).mul(a))),
  );
};

// ── Biome material factory (TSL MeshStandardNodeMaterial, star = sole light) ─
// Extends the original fractal + worley + displace + ember-rim skeleton; the
// `default` branch is the original Lich rocky material verbatim, so LICH_SYSTEM
// still renders unchanged and any spec without a biome falls back to it.
export function createPlanetMaterial(spec: PlanetSpec): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();

  const uScale = uniform(3.0); // master noise scale
  const base = positionLocal.mul(uScale);

  // Shared terrain fields.
  const terrain = mx_fractal_noise_float(base, 5, 2.0, 0.55, 1.0); // raw octave sum ±~2.1 — clamp below is LOAD-BEARING (albedo ≤1 rule)
  const t01 = clamp(terrain.mul(0.5).add(0.5), 0.0, 1.0);
  const cells = mx_worley_noise_float(base.mul(1.7));

  // Shared star-facing geometry: fresnel(view) × facing(star at origin).
  const V = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(clamp(float(1.0).sub(dot(normalWorld, V)), 0.0, 1.0), 3.0);
  const toStar = normalize(positionWorld.negate());
  const starDot = dot(normalWorld, toStar);
  const day = max(starDot, 0.0); // dayside mask
  const night = max(starDot.negate(), 0.0); // nightside mask

  const cLight = color(spec.palette[0]);
  const cDark = color(spec.palette[1]);
  const craterMask = clamp(pow(cells, 2.0).mul(spec.crater), 0.0, 1.0);

  switch (spec.biome) {
    case 'magma': {
      // Dark crust; bright lava veins (worley crests) emissive >1; strong ember rim.
      mat.colorNode = mix(cDark, cLight, t01.mul(0.5)).mul(float(1.0).sub(craterMask.mul(0.4)));
      const h = mx_fractal_noise_float(base.mul(0.6), 4, 2.0, 0.5, 1.0);
      mat.positionNode = positionLocal.add(normalLocal.mul(h.mul(spec.displaceAmp * spec.radiusWu)));
      mat.normalNode = bumpNormal(0.6, 3.0); // crust-crack relief catches the Ember
      mat.roughnessNode = float(0.9);
      mat.metalnessNode = float(0.0);
      const lava = smoothstep(0.55, 0.85, cells);
      mat.emissiveNode = color('#ff6a2a')
        .mul(lava.mul(lava).mul(2.6))
        .add(EMBER.mul(fresnel.mul(day).mul(0.5)));
      break;
    }
    case 'ocean': {
      // Pale sea (glossy) vs land (rough); slow self-shadowing cloud band scroll.
      const land = smoothstep(0.45, 0.55, t01); // terrain-high → land
      const surf = mix(cLight, cDark, land); // sea light, land green
      const cloud = smoothstep(
        0.55,
        0.75,
        mx_fractal_noise_float(base.mul(0.8).add(vec3(time.mul(0.02), 0, 0)), 4, 2.0, 0.5, 1.0),
      );
      mat.colorNode = mix(surf, color('#f4f8fa'), cloud.mul(0.5));
      mat.roughnessNode = mix(float(0.15), float(0.85), land); // sea glossy, land rough
      mat.metalnessNode = float(0.0);
      mat.positionNode = positionLocal.add(normalLocal.mul(spec.displaceAmp * spec.radiusWu * 0.2));
      // Pale atmosphere limb (Rayleigh scatter), sub-1 — Praesidium's only >1 glow
      // is the aurora (separate mount). Not day-gated: the limb reads around the
      // terminator too (the soft world, per art-direction lighting key).
      mat.emissiveNode = cLight.mul(fresnel).mul(float(0.3));
      break;
    }
    case 'glass': {
      // Cyan translucent albedo; spire displacement; data-lattice nightside >1 (facing-aware).
      mat.colorNode = mix(cLight, cDark, t01).mul(float(1.0).sub(craterMask.mul(0.3)));
      const spire = mx_fractal_noise_float(base.mul(1.1), 4, 2.0, 0.6, 1.0);
      mat.positionNode = positionLocal.add(normalLocal.mul(spire.mul(spec.displaceAmp * spec.radiusWu)));
      mat.normalNode = bumpNormal(1.1, 4.0); // faceted spire edges catch the Ember as bright shards
      mat.roughnessNode = mix(float(0.05), float(0.35), t01); // glass glossy
      mat.metalnessNode = float(0.0);
      const lattice = smoothstep(0.6, 0.85, cells);
      mat.emissiveNode = STARHOT.mul(lattice.mul(night).mul(2.2)); // stored starlight, nightside
      break;
    }
    case 'industrial': {
      // Copper-rust worley mottle; smog fresnel rim (≤1); sparse foundry emissive >1.
      mat.colorNode = mix(cLight, cDark, t01).mul(float(1.0).sub(craterMask.mul(0.4)));
      const h = mx_fractal_noise_float(base.mul(0.6), 4, 2.0, 0.5, 1.0);
      mat.positionNode = positionLocal.add(normalLocal.mul(h.mul(spec.displaceAmp * spec.radiusWu)));
      mat.normalNode = bumpNormal(0.6, 2.0); // forge mottle relief (subtle)
      mat.roughnessNode = float(0.75);
      mat.metalnessNode = float(0.1);
      const foundry = smoothstep(0.7, 0.9, cells);
      mat.emissiveNode = color('#ff7a2a')
        .mul(foundry.mul(foundry).mul(2.2))
        .add(color('#7a5a3a').mul(fresnel.mul(0.25))); // smog backlit rim
      break;
    }
    case 'bioluminescent': {
      // Teal-green canopy with vine-noise darkening; city-light clusters nightside >1.
      const vine = clamp(mx_fractal_noise_float(base.mul(2.0), 4, 2.0, 0.6, 1.0), 0.0, 1.0);
      mat.colorNode = mix(cLight, cDark, t01).mul(float(1.0).sub(vine.mul(0.5)));
      const h = mx_fractal_noise_float(base.mul(0.6), 4, 2.0, 0.5, 1.0);
      mat.positionNode = positionLocal.add(normalLocal.mul(h.mul(spec.displaceAmp * spec.radiusWu)));
      mat.normalNode = bumpNormal(0.6, 2.0); // canopy relief (subtle)
      mat.roughnessNode = float(0.8);
      mat.metalnessNode = float(0.0);
      const city = smoothstep(0.55, 0.8, cells);
      mat.emissiveNode = color('#ffdfa6').mul(city.mul(night).mul(2.0)); // warm lamp glow, nightside
      break;
    }
    case 'shattered': {
      // Fractured high-frequency crack displacement; cold rock, no self-light.
      mat.colorNode = mix(cLight, cDark, t01).mul(float(1.0).sub(craterMask.mul(0.5)));
      const crack = mx_fractal_noise_float(base.mul(2.4), 5, 2.2, 0.6, 1.0);
      mat.positionNode = positionLocal.add(normalLocal.mul(crack.mul(spec.displaceAmp * spec.radiusWu)));
      mat.normalNode = bumpNormal(2.4, 5.0); // fracture relief — cold rock, no self-light
      mat.roughnessNode = float(0.85);
      mat.metalnessNode = float(0.02);
      mat.emissiveNode = EMBER.mul(fresnel.mul(day).mul(0.08)); // faint rim only
      break;
    }
    case 'gasGiant': {
      // Fluid: NO displacement. Latitudinal bands (sin lat) + slow swirl scroll.
      const lat = positionLocal.y.mul(1.0 / spec.radiusWu); // ~[-1,1]
      const bands = sin(lat.mul(9.0)).mul(0.5).add(0.5);
      const swirl = mx_fractal_noise_float(
        base.mul(0.5).add(vec3(time.mul(0.03), 0, 0)),
        4,
        2.0,
        0.5,
        1.0,
      )
        .mul(0.5)
        .add(0.5)
        // 4-oct noise is ±~1.9 raw, not ±1 — clamp so the albedo mix can never
        // extrapolate past the palette (≤1 rule holds by construction, not luck)
        .clamp(0.0, 1.0);
      mat.colorNode = mix(cLight, cDark, mix(bands, swirl, 0.4));
      mat.roughnessNode = float(0.6);
      mat.metalnessNode = float(0.0);
      // Atmospheric cloud-band turbulence (NOT a hard surface: no silhouette
      // displacement, displaceAmp stays 0 — the bands just read as flowing 3D
      // relief instead of painted stripes). Subtle amp; bands still gradate at the limb.
      mat.normalNode = bumpNormal(0.5, 1.0);
      mat.emissiveNode = EMBER.mul(fresnel.mul(day).mul(0.06));
      break;
    }
    case 'station': {
      // Hull grey (--ui-dim family), built metal. Dedicated structure is P1.2;
      // this is the sphere-fallback material if one is ever made.
      mat.colorNode = mix(cLight, cDark, t01.mul(0.5));
      mat.roughnessNode = float(0.5);
      mat.metalnessNode = float(0.6);
      mat.emissiveNode = STARHOT.mul(fresnel.mul(0.4)); // sub-1 nav rim; gate ring is P5
      break;
    }
    default: {
      // Original Lich rocky material (fractal albedo + worley crater mottling +
      // noise displacement + ember irradiation rim). LICH_SYSTEM lands here.
      const albedo = mix(cLight, cDark, t01).mul(float(1.0).sub(craterMask.mul(0.55)));
      mat.colorNode = albedo;
      const h = mx_fractal_noise_float(base.mul(0.6), 4, 2.0, 0.5, 1.0);
      mat.positionNode = positionLocal.add(normalLocal.mul(h.mul(spec.displaceAmp * spec.radiusWu)));
      mat.roughnessNode = clamp(float(0.82).add(craterMask.mul(0.15)).sub(t01.mul(0.1)), 0.0, 1.0);
      mat.metalnessNode = float(0.02);
      mat.emissiveNode = EMBER.mul(fresnel.mul(day).mul(0.35));
      break;
    }
  }

  return mat;
}
