// Pure, deterministic geometry for the Dyson-swarm assembly region (spec Task 11).
// NO three import → unit-testable in vitest without a GL context. The TSL shader in
// DysonSwarm.tsx MIRRORS these hashes/distributions (kept in lockstep, comment-marked
// at each mirror site); this module is the testable + CPU-mirror surface (flare timing).
//
// World model: SWARM_CENTER=(900,0,0), a partial node UNDER CONSTRUCTION (not a full
// sphere — scale honesty per spec), 3 orbital shells around the structure point.

import { SWARM_CENTER, SWARM_RADIUS } from '../world/scale';

// ── Assembly parameter (spec: smoothstep of craft distance, 2×→0.3× SWARM_RADIUS) ──
// a = 0 far away (scattered cloud), a = 1 in close (tiles slotted into the node).
const A_FAR = 2 * SWARM_RADIUS; // 500 wu → a = 0
const A_NEAR = 0.3 * SWARM_RADIUS; // 75 wu  → a = 1

export function assemblyParam(distFromCenter: number): number {
  const t = (A_FAR - distFromCenter) / (A_FAR - A_NEAR);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c); // smoothstep
}

// ── Deterministic hash → [0,1) ─────────────────────────────────────────────────
// Same fract(sin(dot)) family as lensing.ts/starSurface.ts. TSL mirror: hash01.
export function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ── Slot distribution: 3 shells on a spherical CAP (partial node) ──────────────
// The cap is centered on +X (NODE_AXIS) with half-angle CONE_HALF — the under-
// construction arc, NOT a full enclosing sphere. Golden-angle spiral fills the cap.
export const SHELL_RADIUS = [90, 150, 210] as const; // wu from SWARM_CENTER
const CONE_HALF = (70 * Math.PI) / 180;
const GOLDEN_ANGLE = 2.399963229; // rad

// Shell index + within-shell index for tile i (round-robin across shells so each
// shell fills uniformly as tiles assemble, not shell-0-then-1).
export function shellOf(i: number): number {
  return i % SHELL_RADIUS.length;
}
export function baseOf(i: number): number {
  return Math.floor(i / SHELL_RADIUS.length);
}

// Unit direction on the cap for within-shell index `base`. |dir|=1, dir·X ≥ cos(CONE).
// Basis: +X axis, perp0=+Y, perp1=+Z. TSL mirror: slotDir (pre-orbit).
export function slotDir(base: number): [number, number, number] {
  const phi = Math.sqrt((base + 0.5) / (base + 1.7)) * CONE_HALF;
  const theta = base * GOLDEN_ANGLE;
  const sp = Math.sin(phi);
  return [Math.cos(phi), sp * Math.cos(theta), sp * Math.sin(theta)];
}

export function slotPos(i: number): [number, number, number] {
  const d = slotDir(baseOf(i));
  const r = SHELL_RADIUS[shellOf(i)];
  return [SWARM_CENTER[0] + d[0] * r, SWARM_CENTER[1] + d[1] * r, SWARM_CENTER[2] + d[2] * r];
}

// ── Scatter cloud: disordered pre-assembly positions around the structure point ─
export function scatterPos(i: number): [number, number, number] {
  const ux = hash01(i * 1.9 + 2.1) * 2 - 1;
  const uy = hash01(i * 3.7 + 4.3) * 2 - 1;
  const uz = hash01(i * 5.1 + 6.7) * 2 - 1;
  const len = Math.hypot(ux, uy, uz) || 1;
  const r = SWARM_RADIUS * 0.5 + hash01(i * 9.1 + 0.5) * SWARM_RADIUS * 0.9; // 125..350 wu
  return [
    SWARM_CENTER[0] + (ux / len) * r,
    SWARM_CENTER[1] + (uy / len) * r,
    SWARM_CENTER[2] + (uz / len) * r,
  ];
}

// Per-tile assembly stagger ∈ [0,1): tiles lerp into their slot over a window of `a`,
// not all at once — the "wave". TSL mirror: stagger.
export function stagger(i: number): number {
  return hash01(i * 7.3 + 1.1);
}

// ── Flare cadence → sonify (spec: occasional specular glint event) ──────────────
// Returns the min seconds between emitted flares at assembly level a. No flares until
// assembly is meaningfully underway (a ≤ 0.25 → none). Floor 0.5s = 2Hz (photosafety
// <3Hz). ponytail: coarse proxy — emits while the visual glitter wave is active,
// doesn't mirror 150k tile alignments. Sonify (Task 9) subscribes via the component.
export function flareIntervalS(a: number): number {
  if (a <= 0.25) return Infinity;
  const t = (a - 0.25) / 0.75; // 0..1 across the active band
  return 2.0 - 1.5 * t; // 2s → 0.5s
}
