# Nabhasa — Amendment A2 Implementation Plan (the Fantasy Layer)

> STATUS: AUTHORED 2026-07-06 by spec author. Builds on `docs/lore.md` (approved
> canon, 2026-07-07) over the machine-complete system from
> `.claude/specs/2026-07-05-nabhasa.md`. This is the **content + art** layer; the
> engine, flight, preloader, lensing, beams, and audio are the stage it plays on.
>
> **Path note (honest):** `docs/lore.md` line 10 cites the build amendment at
> `.claude/specs/2026-07-07-a2-fantasy-system.md`. That file does not exist, and
> `.claude/` is write-blocked for the author role. **THIS file
> (`docs/a2-fantasy-plan.md`) is the A2 plan.** If the conductor wants the
> amendment canonically under `.claude/specs/`, port it there (mechanical copy);
> until then, treat this doc + `docs/lore.md` as the binding A2 pair.

**Goal:** Reforest the built neutron-star system with the **Nabhasa Reach** —
eight named Kindled worlds (lore canon) carrying biome-distinct procedural TSL
materials, rings/moons/debris/station props, lore-wired courier missions, a
diegetic portfolio (approach a world → its content opens), and three eye-candy
upgrades. The flight engine, lensing, beams, swarm, audio, preloader, and tier
machinery are **untouched** — A2 swaps the *contents of the system*, not the
stage.

**Architecture invariants (carry forward from A1 spec, non-negotiable):**

- Single R3F `<Canvas>`, `three/webgpu` `WebGPURenderer` (WebGL2 fallback), **TSL
  only** (`three/tsl`). Never import shader-relevant classes from bare `three`.
  No `@react-three/postprocessing`; post = native three TSL nodes.
- **QUALITY tiers respected:** `webgpu-high` / `webgpu-low` / `webgl2` / `static`.
  Every visual task states per-tier behavior; counts come from `QUALITY` only.
- **FPS gate:** ≥60fps mid-tier laptop (DPR 1.5, 1080p) on its tier; ≥30fps
  webgl2. Measured with `core/perfProbe.ts` `window.__perf`, pasted in report.
- **Perf rules:** never `setState` in `useFrame`; refs + throttled zustand sink;
  `dt ≤ 1/30` clamp; dispose on unmount; live positions via module-singleton
  `Vector3[]` (the `LichPlanets.tsx` leaf idiom — extend, do not reinvent).
- **Art-direction discipline (P2 amends, does not break):** one hot accent
  (`--star-hot`); **no Orbitron, no lens dirt, no second hot accent, no purple/teal
  "space nebula" gradients**; bloom threshold >1.0 emissive-only, always.
- **Physics honesty (reframed by A2):** the **Ember = PSR B1257+12 "Lich"** stays
  real — `hud/physics-data.ts` `PULSAR`, time dilation, tidal, surface g are
  unchanged and remain the HUD's real numbers. The **worlds are fictional**
  (Kindled terraformings), so A1's three *real* exoplanets (Draugr / Poltergeist /
  Phobetor) **retire as the shown bodies**; their real-mass HUD role retires with
  them (lore dossier replaces it — see P4). The star's real astrophysics stays as
  *instrumentation flavor*, exactly as `lore.md` "How the lore maps to the build"
  mandates.
- **No new deps. No Bash from the author role** (verify commands below are for the
  conductor / GLM executors to run).

**Packet format (same as A1 spec):** each task header carries
`role · scope · non-scope · invariant · gate`. One merge gate, serialized; the
conductor verifies every gate personally and pastes output.

---

## The Reach world contract (single source for P1 + P3 + P4)

Every slice below reads THIS table. P1.1 writes it into `planets.ts` as
`REACH_SYSTEM`; P1.3 duplicates the gravity-relevant columns into `gravity.ts`
(three-free dup, existing pattern); P4 duplicates names + orbit radii into
`courier.ts` (existing pattern). **Orbital order is canon** (lore.md "the
fly-path reads as a sentence": burn → garden → library → forge → history →
ruins → beauty → door).

Orbit radii keep a **clean gap around the Dyson swarm** (centered `(900,0,0)`,
r=250 → spans ~650–1150 wu): four inner worlds inside, four outer worlds outside.
Periods are Kepler-ratioed from semi-major (`T ∝ a^1.5`, base Brace = 50 s) —
outer giants drift near-static over a session, which reads correctly.

| # | World | Biome | orbit (wu) | radius (wu) | period (s) | axialDay (s) | mass (M⊕, tuned) | Content slot | Lore props |
|--|--|--|--|--|--|--|--|--|--|
| 1 | **Brace** | magma | 130 | 3.0 | 50 | 38 | 0.4 | — | irradiated ember rim; no atmosphere |
| 2 | **Praesidium** | ocean + cloud | 260 | 5.0 | 141 | 52 | 1.0 | **About** | pale blue-white; 1 small moon; green aurora (P5) |
| 3 | **Aletheia** | glass desert | 400 | 4.6 | 269 | 61 | 0.8 | **Research** | translucent cyan; faceted spires; data-lattice nightside |
| 4 | **Kiln** | industrial forge | 560 | 5.8 | 448 | 70 | 1.2 | **Projects** | copper-rust; smog haze; orbital ring + space-elevator tether |
| | *(swarm 900, r250 — architecture untouched, sits in the gap)* | | | | | | | | |
| 5 | **Vesper** | bioluminescent ruins | 1250 | 6.2 | 1667 | 47 | 1.1 | **Experience** | deep teal-green; vine-strangled cities; city lights nightside |
| 6 | **Riven** | shattered | 1600 | 5.4 (core) | 2164 | 55 | 0.6 | — | fractured hemisphere; debris belt + shepherd asteroids |
| 7 | **Corona** | gas giant | 2050 | 9.0 | 2800 | 22 | 95 | — | banded amber-cream; vast ring system; shepherd moons |
| 8 | **Threshold** | gate station | 2700 | (structure) | 3797 | 120 (ring spin) | 0.1 | **Contact** | habitat ring + antenna farm + jump-gate (gate FX = P5) |

Masses are **gameplay-tuned fictional** (not real); they feed `PLANET_GM_SCALE`
perturbation in `gravity.ts`. Corona is massive but far → negligible pull (honest).
Threshold is a station, not a sphere — rendered by a dedicated path, gravity-soft.

**Content-bearing worlds (P3 docks here):** Praesidium→About, Aletheia→Research,
Kiln→Projects, Vesper→Experience, Threshold→Contact. Brace/Riven/Corona are
pure eye-candy + warning (no panel).

---

## P1 — Planet-system rework (8 worlds)

**Packet:** role=builder(visual) · scope=`src/world/planets.ts`, `src/world/LichPlanets.tsx`, `src/flight/gravity.ts` · non-scope=lensing/beams/audio/swarm/regions/flight-feel/courier/HUD · invariant=`REACH_SYSTEM` is the single world contract; biome materials are TSL `MeshStandardNodeMaterial` lit by the star (sole point light) like the existing Lich materials; live positions stay a module-singleton `Vector3[]` written in place once/frame · gate=`tsc` + `vitest` (new 8-body orbit + 8-body gravity tests) green, probe ≥60/30fps all live tiers, fresh-eyes screenshot review vs lore "looks".

**Files:**
- Modify: `src/world/planets.ts` — replace `LICH_SYSTEM` (3 real bodies) → `REACH_SYSTEM` (8 lore worlds); extend `PlanetSpec`; branch `createPlanetMaterial` on `biome`.
- Modify: `src/world/LichPlanets.tsx` — render 8 worlds + per-world props (rings/moons/debris/tether/station); keep `getPlanetPositions()`; add `nearestContentWorld(pos)`.
- Modify: `src/flight/gravity.ts` — extend `PLANET_MASS_EARTHS` / `PLANET_RADII_WU` / comment orbit list to 8 entries; signature unchanged.
- Modify (tests): `tests/gravity.test.ts` (add 8-body perturbation case), new `tests/planets.test.ts` (contract sanity).
- **Untouched:** `regions.ts` (approach is proximity-based, not a region), `scale.ts`, `courier.ts` (P4 owns), `App.tsx` routing.

**Interfaces (consumed by P3/P4; stable, cite this):**

```ts
// planets.ts
export type Biome = 'magma' | 'ocean' | 'glass' | 'industrial'
  | 'bioluminescent' | 'shattered' | 'gasGiant' | 'station';

export interface WorldProps {
  moons?: number;          // small shepherd/habitat moons
  ring?: { inner: number; outer: number; tilt: number }; // wu, band
  debris?: number;          // instanced fragments (Riven)
  tether?: boolean;         // space-elevator line (Kiln)
  antennaFarm?: boolean;    // (Threshold structure)
}

export interface PlanetSpec {
  name: string;
  title: string;            // lore epithet, e.g. 'the garden'
  biome: Biome;
  myth: string;             // lore.md myth line (HUD/panel flavor)
  // display (scene)
  radiusWu: number;
  orbitWu: number;
  periodS: number;          // Kepler-ratioed (contract table)
  axialDayS: number;
  palette: [string, string];// light, dark — biome albedo, art-direction-sanctioned
  crater: number;           // worley strength 0..1 (rocky biomes)
  displaceAmp: number;      // silhouette bump (fraction of radius)
  massEarthsTuned: number;  // fictional; feeds gravity perturbation
  props?: WorldProps;       // rings/moons/debris/tether/station
  contentSlot?: 'About' | 'Research' | 'Projects' | 'Experience' | 'Contact';
}

export const REACH_SYSTEM: PlanetSpec[];          // 8 entries, contract table
export function createPlanetMaterial(spec: PlanetSpec): MeshStandardNodeMaterial;
```

```ts
// LichPlanets.tsx — exports P3 reads
export function getPlanetPositions(): readonly THREE.Vector3[];   // unchanged shape, now len 8
export function nearestContentWorld(pos: THREE.Vector3):
  | { id: string; name: string; slot: string; dist: number }
  | null;                                                          // P3 approach trigger
```

```ts
// gravity.ts — arrays widened to 8, signature UNCHANGED (orbit test stays exact)
export const PLANET_MASS_EARTHS: readonly number[];  // len 8, fictional tuned
export const PLANET_RADII_WU: readonly number[];     // len 8, soft radii
export function gravityAccelWithPlanets(pos, out, positions, gms, softRadii): Vector3;
```

**Per-biome material notes (extend the existing fractal+worley+displace skeleton):**

- **magma (Brace):** dark crust albedo; **lava veins = emissive >1** where worley
  crests run high (reads under bloom); strong `--irradiated` ember rim; no atmosphere.
- **ocean (Praesidium):** pale blue-white smooth albedo, high roughness-contrast
  (sea = glossy, land = rough); animated cloud band = second scrolling-noise layer
  in `positionNode`/`colorNode`; moon rendered in `LichPlanets`. Aurora is P5
  (additive, not in this material).
- **glass (Aletheia):** cyan translucent albedo; facet the normal by quantizing
  worley cells (flat spires catch the Ember); **data-lattice nightside = emissive
  >1**, facing-aware (opposite the star), sub-1 elsewhere.
- **industrial (Kiln):** copper-rust albedo (worley mottle); smog = fresnel
  brownish rim haze; sparse foundry emissive points. Orbital ring + tether =
  `LichPlanets` geometry (instanced habitat tiles + a thin cylinder line).
- **bioluminescent (Vesper):** teal-green albedo, vine-noise darkening;
  **city-light clusters nightside = emissive >1** point pattern (like a
  nightside city grid), facing-aware.
- **shattered (Riven):** fractured displacement (high-frequency crack noise);
  geometry stays a sphere core; the debris belt is `LichPlanets` instanced
  fragments + shepherd asteroids (instanced, count from `QUALITY`).
- **gasGiant (Corona):** **no displacement** (fluid) — latitudinal bands via
  `sin(lat)` + swirl-noise scroll in `colorNode`; amber-cream palette; vast ring
  = `LichPlanets` (`ringGeometry`, banded alpha). Shepherd moons instanced.
- **station (Threshold):** **not a sphere** — `createPlanetMaterial` is skipped;
  `LichPlanets` renders a dedicated structure (habitat torus + antenna farm +
  gate ring). Gravity-soft (small `massEarthsTuned`); kinematic collider only
  (matches the A1-close-out kinematic-planet-collider fix).

> Emissive discipline: lava / data-lattice / city-lights / aurora(P5) / gate(P5)
> are the only >1 surfaces — they are *what bloom is for* (art-direction §post).
> Biome albedo colors (teal-green, cyan, amber) are material albedo ≤1, sanctioned
> exactly as `--irradiated` is — never a second hot accent.

**Sub-slices (disjoint write sets — see Parallelization):**

- **P1.1 — `planets.ts`** (contract + materials). Gates P1.2/P1.3/P3/P4.
- **P1.2 — `LichPlanets.tsx`** (8-world render + props + `nearestContentWorld`). Depends on P1.1.
- **P1.3 — `gravity.ts`** (8-body arrays + test). Depends on P1.1 (masses/radii).

**Verify (conductor runs, pastes output):**

```bash
npx tsc --noEmit
npx vitest run tests/planets.test.ts tests/gravity.test.ts
npm run build
# probe all 3 live tiers, paste window.__perf:
#   ?forceTier=webgpu-high  → avgFps ≥60 in-system
#   ?forceTier=webgpu-low   → ≥60
#   ?forceTier=webgl2       → ≥30
# /?dev=system (existing SystemDev harness) → 8 worlds render, biomes distinct,
#   rings/moons/debris/tether/station present, no shader compile errors in console.
```

Manual: fly the full orbital sentence inner→outer; confirm 5 content worlds
proximity-trigger (P3) and 3 eye-candy worlds are inert. Commit per slice:
`feat(world): REACH_SYSTEM 8-world contract + biome materials`,
`feat(world): render 8 worlds + rings/moons/debris/station`,
`feat(flight): 8-body planet perturbation`.

---

## P2 — Art-direction v2 (per-biome palettes)

**Packet:** role=art director · scope=`docs/art-direction.md` only · non-scope=any code · invariant=additive amendment; one hot accent and every Hard Ban stay; biome palettes are *material albedo* (≤1), sanctioned like `--irradiated`; bloom stays >1 emissive-only · gate=Praneesh sign-off (approval line + date at top of doc).

**Files:** Modify: `docs/art-direction.md`. No code.

**Content (concretely):**

- New section **"Per-biome palettes (A2)"** — one row per world with light/dark
  albedo hex + emissive surfaces list (the >1 set), each citing the lore "Looks"
  line. Palette tokens derived from lore, not invented:
  - Brace: crust `#1a1410` / lava `#ff6a2a` (emissive>1) / ember rim `--irradiated`.
  - Praesidium: sea `#cfe4ef` / land `#9fc3a6` / cloud white; moon grey.
  - Aletheia: glass `#9fe3e6` / facet dark `#2f6a72`; lattice `--star-hot` (emissive>1).
  - Kiln: copper `#b07a4a` / rust `#5a3320`; smog `#7a5a3a` rim.
  - Vesper: canopy `#1f5e54` / vine `#0e2a26`; city lights `--star-hot`-warm (emissive>1).
  - Riven: core rock `#5a4a52` / debris glint `#8a8a96`.
  - Corona: band cream `#e8d9b0` / band amber `#c79a52`.
  - Threshold: hull `--ui-dim`-family / emissive gate `--star-hot` (P5, >1).
- Amend the **"one hot accent"** rule note to record the sanctioned biome-albedo
  exception set (mirrors how `--irradiated` was sanctioned 2026-07-06).
- Amend **Post-processing intent**: sanction "generous emissive bloom" = **more
  emissive surfaces cross threshold** (lava, lattice, city lights, aurora, gate),
  *not* a lower threshold. Threshold stays >1.0. Diffuse surfaces still never bloom.
- Amend **Per-region mood**: keep arrival/nearStar/swarm; add a one-line
  "content-world approach" lighting note (panel open = exposure hold, no new light).

**Verify:** Praneesh reviews + records approval line + date at top of doc. Commit:
`docs(art): A2 per-biome palettes + emissive-bloom amendment`.

---

## P3 — Content docking (approach → portfolio panel)

**Packet:** role=builder(UI) · scope=new `src/content/portfolio.json`, new `src/hud/ApproachPanel.tsx`, new `src/hud/approachStore.ts` · non-scope=HUD telemetry (P4), world rendering (P1), new physics · invariant=panels are DOM overlays (crisp, a11y, like `Telemetry.tsx`); approach is proximity-triggered via `nearestContentWorld`, never forced; content JSON is the single source for copy; dismissable, never locks free flight · gate=`tsc` + `axe-core` clean on a panel + manual approach/dismiss pass.

**Files:**
- Create: `src/content/portfolio.json` — five sections keyed by content slot.
- Create: `src/hud/approachStore.ts` — zustand store (throttled ~5Hz, mirrors `hudStore` idiom).
- Create: `src/hud/ApproachPanel.tsx` — DOM overlay panel.
- Consume: `nearestContentWorld()` from `LichPlanets.tsx` (P1.2).

**Interfaces:**

```ts
// content/portfolio.json — shape (real copy is a Praneesh input gate)
type Slot = 'About' | 'Research' | 'Projects' | 'Experience' | 'Contact';
interface PortfolioSection {
  slot: Slot;
  world: string;          // 'Praesidium' etc — binds to REACH_SYSTEM name
  headline: string;       // Space Grotesk display
  myth: string;           // lore.md myth line (echo)
  blocks: { heading: string; body: string }[];  // Inter body
}
// Portfolio = Record<Slot, PortfolioSection>
```

```ts
// approachStore.ts
interface ApproachState {
  open: boolean;
  slot: Slot | null;
  world: string | null;
  set: (s: Partial<ApproachState>) => void;
}
```

```ts
// ApproachPanel.tsx
export function ApproachPanel(): JSX.Element | null;
// wiring: a useFrame leaf (added in App or LichPlanets, single mount site —
// serializes after P1.2) samples nearestContentWorld(craftPos) at 5Hz;
// within APPROACH_RADIUS (default 60 wu, > planet radius, < OFFER_RADIUS) of a
// content world → approachStore.set({open:true, slot, world}); leaving radius
// or pressing ESC/input.interact-hold → close.
```

**Behavior:** Craft approaches Praesidium within 60 wu → panel slides in (DOM,
GSAP 300ms, reduced-motion = instant), shows About section bound to that world;
ESC or fly away dismisses. Five worlds → five sections. Brace/Riven/Corona never
open (no slot). Panel typography from art-direction table (Space Grotesk /
Inter / JetBrains Mono); `aria-live="polite"` on the panel title (low update rate,
unlike telemetry — a11y-correct here).

**Verify:**

```bash
npx tsc --noEmit
npx @axe-core/cli ?forceTier=static   # panels render in static fallback too (DOM)
# manual: approach each of the 5 content worlds → correct section opens; ESC +
#   fly-away dismiss; reduced-motion toggle → no slide animation.
```

Commit: `feat(hud): approach-triggered portfolio panels`.

---

## P4 — Lore-wired missions + HUD strings

**Packet:** role=builder(gameplay+UI) · scope=`src/game/courier.ts`, `tests/courier.test.ts`, `src/hud/Telemetry.tsx` · non-scope=courier FSM logic (untouched), physics, world rendering · invariant=FSM + scoring + fuel rules unchanged; only `MISSIONS` content + HUD display strings change; missions still chain (each `to` = next `from`), never lock free flight, route between **named worlds** · gate=`vitest` courier tests green (renamed fixtures) + full 5-mission playthrough.

**Files:**
- Modify: `src/game/courier.ts` — rewrite `MISSIONS` as Kindled deliveries between named worlds; rename waypoint constants to the new orbit radii (contract table); keep FSM, `tick`, `reduce`, scoring verbatim.
- Modify: `tests/courier.test.ts` — update mission-id + waypoint fixtures.
- Modify: `src/hud/Telemetry.tsx` — lore display strings (Ember identity line, mission world names); no formula changes.

**Mission rewrite (lore-wired, chain preserved, fuel/pars tuned for the wider Reach):**

| id | name (lore) | from → to | par (s) | budget | sense |
|--|--|--|--|--|--|
| `m1-emberlight` | Emberlight Outbound | spawn → **Praesidium** | 50 | 0.7 | straight run onto the garden's shell |
| `m2-archive` | The Archive Run | Praesidium → **Aletheia** | 80 | 0.55 | single assist, garden→library |
| `m3-forge` | Forge Handoff | Aletheia → **Kiln** | 90 | 0.4 | tight periapsis, library→forge |
| `m4-ruins` | The Long Dark | Kiln → **Vesper** | 130 | 0.45 | threads across the swarm gap, forge→ruins |
| `m5-gate` | To the Door | Vesper → **Threshold** | 160 | 0.5 | outer-system run, reaches the gate (Contact) |

Finale lands the player on Threshold = the Contact panel (P3) — the portfolio's
call-to-action is diegetic. Waypoint shells reuse the existing `shell(r,az,y)`
helper at the contract orbit radii (Praesidium 260 … Threshold 2700). m4's
azimuth is chosen to pass through the swarm region (signature 4 payoff, as today).

**HUD strings (Telemetry.tsx, surgical):**

- TL cluster pulsar line: keep real `PULSAR.name` value, prefix the **lore** label
  → `THE EMBER · {PULSAR.name}` (real designation stays as instrumentation).
- Mission line already reads the store; with renamed missions it shows
  `Emberlight Outbound · → Praesidium` (world names from `MISSIONS`).
- No new formulas, no `physics-data.ts` change (the Ember's real numbers are the
  point and stay). World myth quotes are P3's panel concern, not HUD clutter.

**Verify:**

```bash
npx tsc --noEmit
npx vitest run tests/courier.test.ts tests/score.test.ts
# manual: full 5-mission playthrough; finale opens Contact panel on Threshold.
```

Commit: `feat(game): lore-wired Kindled courier missions + Ember HUD strings`.

---

## P5 — Eye-candy (richer nebula, aurora, jump-gate)

**Packet:** role=builder(visual) · scope=`src/shaders/nebula.ts`, new `src/shaders/aurora.ts`, new `src/world/Aurora.tsx`, new `src/world/JumpGate.tsx` (+ single mount-site edit) · non-scope=star surface, lensing, beams, swarm, audio · invariant=TSL only; counts from `QUALITY`; additive layers never compete with the star (dim, emissive-floor discipline); off on `static` tier; aurora + gate read at ≥30fps webgl2 · gate=probe + Lusion-check screenshot review.

**Files:**
- Modify: `src/shaders/nebula.ts` — enrich the backplate (more octaves / domain warp), **stay within the art-direction ban** (no purple/teal "space nebula" gradients — keep it dim, near-`--void`, star-hot dust only). webgl2 must still read.
- Create: `src/shaders/aurora.ts` + `src/world/Aurora.tsx` — green curl over **Praesidium's** pole (lore: "a green aurora curls over its pole"); ribbon TSL (lat-band curl, additive, sub-star intensity); optional fainter band on Vesper.
- Create: `src/world/JumpGate.tsx` — **Threshold's** dark ring that "folds space": a thin emissive `--star-hot` ring + a subtle radial-distortion pass (TSL screen UV warp, cheap — NOT the lensing graph; a localized distortion, threshold-gated to the gate's screen bounds). Mounts on the Threshold structure from P1.2.
- Mount: one edit in `LichPlanets.tsx` (or `App.tsx`) to render `<Aurora/>` + `<JumpGate/>` — **serializes after P1.2** (write-set overlap on the mount site).

**Tier behavior:** nebula octave count already scales; aurora ribbons `QUALITY`-scaled (high=3 bands, low=1, webgl2=1 lower-res, static=off); jump-gate distortion is a screen pass off on webgl2/static (ring geometry stays, distortion drops) — honest table, commit the per-tier matrix.

**Verify:**

```bash
npx tsc --noEmit
npm run build
# probe all tiers, paste window.__perf; confirm aurora/gate off on ?forceTier=static.
# manual: orbit Praesidium pole (aurora curls), approach Threshold (gate ring +
#   localized distortion reads). Screenshot review vs art-direction.
```

Commit: `feat(world): richer nebula + Praesidium aurora + Threshold jump-gate`.

---

## Parallelization map (disjoint write sets + serialization order)

One merge gate, serialized (A1 spec / fable-orchestration-laws). Write sets are
disjoint **except the explicitly-serialized dependencies below**.

```
SERIAL 0 — P2  docs/art-direction.md              [GATES all visual: P1 materials, P3, P5]
              ↓ (merged + approved)
SERIAL 1 — P1.1 src/world/planets.ts              [REACH_SYSTEM contract — GATES P1.2/P1.3/P3/P4]
              ↓ (merged)
PARALLEL 2 (disjoint write sets, fan out):
   P1.2  src/world/LichPlanets.tsx
   P1.3  src/flight/gravity.ts + tests/gravity.test.ts
   P3a   src/content/portfolio.json                (data only — no code dep)
   P4    src/game/courier.ts + tests/courier.test.ts
   P5a   src/shaders/nebula.ts + src/shaders/aurora.ts + src/world/Aurora.tsx
         (new files; nebula.ts is P5-exclusive in this group — no other slice touches it)
              ↓ (each merged one at a time; rebase next onto current HEAD)
SERIAL 3 (depend on P1.2's nearestContentWorld export / Threshold structure):
   P3b   src/hud/ApproachPanel.tsx + src/hud/approachStore.ts + single mount edit
   P4    src/hud/Telemetry.tsx                     (lore strings; can also ride in group 2)
   P5b   src/world/JumpGate.tsx + mount edit in LichPlanets.tsx (gate on Threshold from P1.2)
```

**Write-set disjointness proof:** `planets.ts` (P1.1) · `LichPlanets.tsx` (P1.2,
then P3b/P5b mount edits serialize after it) · `gravity.ts` (P1.3) · `courier.ts`
+ its test (P4) · `portfolio.json` (P3a) · `ApproachPanel/approachStore` (P3b,
new files) · `Telemetry.tsx` (P4) · `nebula.ts/aurora.ts/Aurora.tsx/JumpGate.tsx`
(P5). The only shared mutable files are `LichPlanets.tsx` (P1.2 owns, then P3b/P5b
append-only mount lines serialize) and `docs/art-direction.md` (P2 owns). No two
group-2 slices touch the same file.

**Merge rule:** one slice merged at a time on current evidence; conductor runs
that slice's verify gate, pastes output; rebase the next slice before merge.
Courier test fixtures (P4) and gravity test (P1.3) update in their own slices —
no cross-slice test coupling.

**RECON NEEDED (assumptions the plan rests on, to confirm at merge):**

1. **Portfolio copy** (`portfolio.json` bodies) is a **Praneesh input gate**, not
   autogenerated — ship P3a with placeholder structure + one real section, real
   copy on review (mirrors how Task 4 physics numbers were user-reviewed).
2. **Approach vs offer radius:** `APPROACH_RADIUS` (P3, default 60 wu) must be
   `> planet radius` and `< courier.OFFER_RADIUS (40)` is FALSE — offer is 40,
   approach 60 means a panel can open before a mission offers. **Decision needed:**
   make approach (60) and offer (40) concentric (panel opens outer, mission offers
   inner) — intended, or shrink approach to 30. Settle at P1.2/P3 merge.
3. **Threshold collider:** station structure needs a kinematic collider (A1
   close-out fix pattern) — confirm Rapier interaction shape at P1.2.

---

## Done bar (verify against THIS, not against what got built)

1. **Eight worlds** orbit the Ember in the canon sentence order (Brace → Praesidium
   → Aletheia → Kiln → Vesper → Riven → Corona → Threshold), Kepler-ratioed, with
   a clean gap around the untouched Dyson swarm. ✓ = `/dev/system` shows all 8,
   biomes visually distinct.
2. **Biome materials are procedural TSL** (no texture files); each world reads as
   its lore "Looks" line (lava veins, glass facets, city lights, gas bands, ring).
   Rings/moons/debris/tether/station present per lore. ✓ = screenshot review.
3. **Emissive-only bloom** survives: lava / data-lattice / city-lights / aurora /
   gate are the only >1 surfaces; diffuse biomes never bloom; webgl2 reads with
   post off. ✓ = probe + webgl2 screenshot.
4. **Five content worlds dock the portfolio:** approach Praesidium→About,
   Aletheia→Research, Kiln→Projects, Vesper→Experience, Threshold→Contact; three
   eye-candy worlds stay inert. ✓ = manual approach pass, axe-clean panels.
5. **Courier missions are Kindled deliveries** between named worlds, chaining to
   the Threshold gate (Contact); FSM/scoring/fuel rules unchanged from A1. ✓ =
   `vitest` courier green + 5-mission playthrough lands on Contact.
6. **HUD reads lore without losing physics honesty:** "THE EMBER · PSR B1257+12";
   real dilation/tidal/surface-g numbers intact; mission line shows world names.
7. **Eye-candy shipped:** richer (ban-compliant) nebula, Praesidium aurora,
   Threshold jump-gate with localized distortion — all tier-scaled, off on static.
8. **No architecture touched:** engine/flight/preloader/lensing/beams/audio/swarm/
   regions verbatim; no new deps; QUALITY tiers respected; TSL/`three/webgpu` only.
9. **Perf held:** ≥60fps mid-tier (≥30 webgl2) in-system across all added worlds +
   eye-candy; `tsc` 0; `npm run build` green; eager bundle still within the A1
   budget decision (no new heavy chunks).
