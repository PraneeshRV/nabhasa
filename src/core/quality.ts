// Per-tier knobs (spec Task 2). Single source of every tier-dependent number —
// scene code never hardcodes particle counts or DPR; it reads QUALITY[tier].
// ponytail: lensing 'half' (half-res RT + bilateral upscale, LensingSkybox
// DEVIATION 3) is deferred until a live tier probes <30fps at full-res. Every
// shipped lensing tier renders the full-res sphere, so the table says 'full'
// (honest — a reviewer reading QUALITY gets what runs, not an unimplemented tier).
export const QUALITY = {
  'webgpu-high': { dpr: [1, 2], collapseParticles: 1_000_000, swarmTiles: 150_000, beamSegments: 32, starCount: 60_000, bakeStarScale: 110, lensing: 'full', post: true, auroraBands: 3 },
  'webgpu-low': { dpr: [1, 1.5], collapseParticles: 200_000, swarmTiles: 40_000, beamSegments: 24, starCount: 32_000, bakeStarScale: 92, lensing: 'full', post: true, auroraBands: 1 },
  // post:true (2026-07-15 look-elevation L1): webgl2 is now the DEFAULT tier
  // (tiers.ts demotion) and post-off left the whole approved presentation flat —
  // star rendered as a cutout disc (headless capture evidence). Bloom/CA/vignette
  // run fine on the forceWebGL backend; grain stays webgpu-high-only in post.tsx.
  'webgl2': { dpr: [1, 1.5], collapseParticles: 50_000, swarmTiles: 10_000, beamSegments: 16, starCount: 12_000, bakeStarScale: 80, lensing: 'full', post: true, auroraBands: 1 },
  'static': { dpr: [1, 1], collapseParticles: 0, swarmTiles: 0, beamSegments: 0, starCount: 0, bakeStarScale: 64, lensing: 'off', post: false, auroraBands: 0 },
} as const;
