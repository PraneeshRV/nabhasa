// Per-tier knobs (spec Task 2). Single source of every tier-dependent number —
// scene code never hardcodes particle counts or DPR; it reads QUALITY[tier].
// ponytail: lensing 'half' (half-res RT + bilateral upscale, LensingSkybox
// DEVIATION 3) is deferred until a live tier probes <30fps at full-res. Every
// shipped lensing tier renders the full-res sphere, so the table says 'full'
// (honest — a reviewer reading QUALITY gets what runs, not an unimplemented tier).
export const QUALITY = {
  'webgpu-high': { dpr: [1, 2], collapseParticles: 1_000_000, swarmTiles: 150_000, beamSegments: 32, starCount: 30_000, lensing: 'full', post: true, auroraBands: 3 },
  'webgpu-low': { dpr: [1, 1.5], collapseParticles: 200_000, swarmTiles: 40_000, beamSegments: 24, starCount: 16_000, lensing: 'full', post: true, auroraBands: 1 },
  'webgl2': { dpr: [1, 1.5], collapseParticles: 50_000, swarmTiles: 10_000, beamSegments: 16, starCount: 8_000, lensing: 'full', post: false, auroraBands: 1 },
  'static': { dpr: [1, 1], collapseParticles: 0, swarmTiles: 0, beamSegments: 0, starCount: 0, lensing: 'off', post: false, auroraBands: 0 },
} as const;
