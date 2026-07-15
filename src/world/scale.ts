// Sim-space gameplay constants (spec Task 4) — single source of truth for the
// physics the player FEELS. These are tuned for fun, not real astrophysics; the
// HUD shows real SI numbers from hud/physics-data.ts. Per spec invariant the two
// modules never cross-import (this file imports nothing): sim world ≠ real SI.
//
// World model (spec Global Constraints): 1 world unit (wu) = 1 km visual scale,
// star at origin, radius 30 wu, fixed physics step 1/60 s.
// Scale rebalance (2026-07-15 re-fly gate): bodies ×3, star 10→30, kill 25→45 —
// at the old radii a 5 wu planet subtended the same angle at APPROACH_RADIUS as
// the 1.5 wu craft did at its 9 wu chase distance, so the rocket read planet-sized.

export const GM_SIM = 270_000; // wu³/s² — circular orbit at r=300 → v=30 wu/s
export const STAR_RADIUS = 30; // wu
export const KILL_RADIUS = 45; // wu — tidal destruction + respawn (> STAR_RADIUS: die outside the surface)
export const PLAY_RADIUS = 3000; // wu — soft inward-spring boundary of the playable sphere
export const SWARM_CENTER: readonly [number, number, number] = [900, 0, 0]; // wu
export const SWARM_RADIUS = 250; // wu
export const FIXED_DT = 1 / 60; // s — Rapier timeStep
// Visual beam sweep runs real-spin:1:2000 (Amendment A1). PSR B1257+12's true
// 160.8 Hz would strobe; 1:2000 keeps flash events <3 Hz (photosensitivity floor).
export const SPIN_DISPLAY_SLOWDOWN = 2000;
