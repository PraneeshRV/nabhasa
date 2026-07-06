# Nabhasa — Art Direction

> STATUS: APPROVED — Praneesh sign-off 2026-07-06 (Task 0 gate passed). Amendments require re-approval.

This doc gates all visual work. Every scene, shader, and post decision cites this. If a
scene wants something not covered here, amend this doc first, then build.

## One-line direction

A dead star that is still dangerous: near-black vacuum, one blinding blue-white source,
everything else lit only by it. Photographic restraint over sci-fi decoration —
Gargantua's discipline, not a synthwave poster.

## Palette (exact, committed)

| Token | Hex | Role |
|---|---|---|
| `--void` | `#030407` | Base space/background. Near-black with a breath of blue. Never pure `#000` in-scene (banding); `#000` only as HTML bg pre-canvas. |
| `--star-hot` | `#AFE3FF` | THE accent. Star surface peak, beam cores, lensing ring, thruster tips. This is the only hot color in the experience. Emissive values push it >1.0 into bloom; as flat UI color it stays ≤ this hex. |
| `--star-mid` | `#5FA8D8` | Star limb, beam falloff, sonification-reactive glow. Derived from `--star-hot`, never used for UI. |
| `--ui-cold` | `#8A93A6` | All HUD/telemetry text and rules. Desaturated slate — reads as instrumentation, never competes with the star. |
| `--ui-dim` | `#3A4150` | Secondary HUD: rules, inactive labels, graph grids. |
| `--irradiated` | `#C46A4A` | Planet dayside irradiation rim ONLY (Lich planets, existing `planets.ts` ember rim). Material color, never emissive >1, never UI. Not a second accent — it exists so the planets read as cooked rock. One sanctioned exception (amended 2026-07-06): the collapse preloader’s pre-collapse supergiant may pass through the warm blackbody ramp — a dying red giant is physically warm; the ramp is transient and ends at `--star-hot`. |

Rule: one hot accent (`--star-hot` family). If a new element "needs" its own color, it doesn't.

## Typography

Fonts: **Space Grotesk** (display) · **Inter** (body) · **JetBrains Mono** (telemetry). OFL, self-hosted woff2 latin subset. No Orbitron, no glitch/typewriter effects.

| Use | Font | Size / line | Tracking | Case |
|---|---|---|---|---|
| Title (NABHASA, region names) | Space Grotesk 500 | clamp(40px, 7vw, 96px) / 1.0 | +0.02em | UPPER |
| Section/beat headings | Space Grotesk 500 | 24–32px / 1.1 | +0.01em | Title |
| Body / narrative copy | Inter 400 | 16px / 1.6 | 0 | Sentence |
| HUD telemetry values | JetBrains Mono 400 | 13px / 1.4 | 0 | UPPER labels, tabular-nums values |
| HUD micro-labels / units | JetBrains Mono 400 | 11px / 1.3 | +0.08em | UPPER |

HUD text color `--ui-cold`; the value currently being sonified/changed may pulse to `--star-hot` at ≤3Hz.

## Reference board (real references only; AI gen = moodboard-never-shipped)

1. Lusion — https://lusion.co — interaction polish bar; "would Lusion ship this?" review standard.
2. Bruno Simon — https://bruno-simon.com — site-is-the-game structure; discovery over instruction.
3. OceanX "Unseen" (2025) — https://oceanx.org / Awwwards entry — dark single-source lighting in a void, restrained HUD.
4. Persepolis Reimagined — https://persepolis.getty.edu — paced spatial reveal, monumental scale reads.
5. "Singularity" by MisterPrada — https://webgpu.com/showcase/singularity — WebGPU black-hole rendering ceiling; what our lensing competes with.
6. NASA SVS neutron-star visualizations — https://svs.gsfc.nasa.gov (search "neutron star", e.g. pulsar beam anims) — beam geometry, magnetosphere color truth.
7. Interstellar Gargantua stills (Double Negative / Kip Thorne renders) — lensing ring value structure: thin blinding ring, everything else near-black.
8. Obys Agency — https://obys.agency — typographic discipline on dark grounds; how far restraint can carry a page.
9. ESA Integral/XMM pulsar artist impressions — https://www.esa.int (CC BY, credit in footer if any still is referenced directly in textures).

## Per-region mood + lighting key

Photographic discipline everywhere: **one key + one rim + ambient floor**, nothing else.
The star is the sole GLOBAL point light. Amended 2026-07-06 (needs re-approval): one region-scoped, non-decaying key light is sanctioned inside the Dyson swarm only — the region's own lighting key demands a readable specular glint, and the star's real irradiance at 900 wu (~0.074) cannot provide it. No other region gets a second light.

### Arrival (spawn, r ≈ 1500–3000 wu)
- Mood: silence, scale, dread of the small bright thing far away.
- Key: the star, tiny but blinding (emissive core >1). Rim: none. Ambient floor: `0.015` blue-grey so the craft silhouette barely separates from void.
- Starfield dense but dim; lensing ring visible as a thin anomaly when the star occludes the field — the "how did they do that" hook is visible from spawn.

### Near-star (r < 300 wu, beams + kill radius)
- Mood: violence. Everything is over-lit from one side, hard shadows, the HUD is the only calm thing.
- Key: star, now dominant (exposure drops ~1 stop vs arrival — committed constant per region, not auto). Rim: beam sweep acts as a moving rim light when it passes. Ambient floor: `0.008` — shadows go nearly black.
- Beam sweep 1:2000 display rate (A1, PSR B1257+12); flash events stay <3Hz (photosensitivity, locked).

### Swarm (Dyson region, (900,0,0) r=250 wu)
- Mood: industry among the dead — the one place with geometry density. Human-made regularity vs natural chaos.
- Key: star (distant, cooler exposure). Rim: `--irradiated` bounce off tile faces facing the star — the only warm light in the experience, earned here. Ambient floor: `0.02`.

### Lich planets (A1)
- Follow `planets.ts` prototype: fractal albedo, worley craters, ember irradiation rim in `--irradiated`. Dayside/nightside split hard (single point light, no fill).

## Post-processing intent (per region — bloom is a tool, not a default)

- Global: AgX tone mapping, SRGB out. Bloom threshold **>1.0 — emissive-only, always**. Diffuse surfaces can never bloom.
- Arrival: bloom exists ONLY to make the distant star read as blinding at 4px size. Radius small, intensity low. Nothing else crosses threshold.
- Near-star: bloom is FOR the beam cores and star limb. Wider radius acceptable; HUD is DOM, never blooms.
- Swarm: bloom nearly off (only star). The swarm reads by geometry and rim light, not glow.
- webgl2 tier: post off (quality table) — scenes must still read correctly with zero bloom; if a scene only works with bloom, the scene is wrong.

## Imperfection layer

- Film grain: subtle, luminance-only, ~0.03 amplitude, constant across regions (webgpu tiers only).
- Chromatic aberration: ONLY at high-G moments (kill-radius proximity, boost) — ramp with g-load, zero at cruise.
- Lens dirt: never.
- Vignette: faint (≤0.15), static; deepens slightly near-star with the exposure drop.

## Hard bans (slop tells)

Bloom-on-everything · Orbitron · glitch/typewriter text · lens dirt · auto-exposure ·
purple/teal "space nebula" gradients · particle trails on the cursor · scroll hijack
(there is no scroll) · any second hot accent.
