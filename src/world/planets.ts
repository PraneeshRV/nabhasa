// PSR B1257+12 "Lich" system — the first exoplanets ever discovered (1992,
// Wolszczan & Frail; IAU names 2015). Real bodies, undead names: Draugr,
// Poltergeist, Phobetor. Display scales compressed for legibility; real values
// ride along for the diegetic HUD. [VERIFY against NASA Exoplanet Archive at
// physics review — masses/periods from training knowledge.]
//
// Materials: procedural TSL PBR — fractal albedo, worley crater mottling,
// noise displacement for real silhouette bumps, ember irradiation rim on the
// star-facing limb (pulsar wind). Zero texture files (anti-slop: procedural
// first; KB not MB).

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
  positionLocal,
  normalLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  mx_fractal_noise_float,
  mx_worley_noise_float,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';

export interface PlanetSpec {
  name: string;
  // real data (HUD layer)
  realMassEarths: number;
  realSemiMajorAU: number;
  realPeriodDays: number;
  // display (scene layer)
  radiusWu: number;
  orbitWu: number;
  periodS: number; // compressed, Kepler ratios preserved vs Draugr = 60s
  axialDayS: number;
  palette: [string, string]; // light, dark
  crater: number; // worley strength 0..1
  displaceAmp: number; // silhouette bump amplitude (fraction of radius)
}

export const LICH_SYSTEM: PlanetSpec[] = [
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

// Shared ember irradiation tint (--irradiated token, art-direction.md).
const EMBER = color('#C46A4A');

export function createPlanetMaterial(spec: PlanetSpec) {
  const mat = new MeshStandardNodeMaterial();

  const uScale = uniform(3.0); // master noise scale
  const base = positionLocal.mul(uScale);

  // Albedo: 5-octave fractal base + worley cell darkening (crater floors).
  const terrain = mx_fractal_noise_float(base, 5, 2.0, 0.55, 1.0); // ~[-1,1]
  const t01 = clamp(terrain.mul(0.5).add(0.5), 0.0, 1.0);
  const cells = mx_worley_noise_float(base.mul(1.7));
  const craterMask = clamp(pow(cells, 2.0).mul(spec.crater), 0.0, 1.0);
  const albedo = mix(color(spec.palette[0]), color(spec.palette[1]), t01).mul(
    float(1.0).sub(craterMask.mul(0.55)),
  );
  mat.colorNode = albedo;

  // Silhouette bumps: displace along the normal by low-frequency terrain.
  const h = mx_fractal_noise_float(base.mul(0.6), 4, 2.0, 0.5, 1.0);
  mat.positionNode = positionLocal.add(normalLocal.mul(h.mul(spec.displaceAmp * spec.radiusWu)));

  // Roughness: rocky, rougher in crater floors.
  mat.roughnessNode = clamp(float(0.82).add(craterMask.mul(0.15)).sub(t01.mul(0.1)), 0.0, 1.0);
  mat.metalnessNode = float(0.02);

  // Pulsar-wind irradiation: faint ember rim on the star-facing limb only.
  // fresnel(view) × facing(star at origin) — reads as space weather, not bloom spam.
  const V = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(clamp(float(1.0).sub(dot(normalWorld, V)), 0.0, 1.0), 3.0);
  const toStar = normalize(positionWorld.negate());
  const facing = max(dot(normalWorld, toStar), 0.0);
  mat.emissiveNode = EMBER.mul(fresnel.mul(facing).mul(0.35));

  return mat;
}
