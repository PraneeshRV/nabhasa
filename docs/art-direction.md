# Nabhasa — Art Direction (v2)

> **STATUS v1:** APPROVED — Praneesh sign-off 2026-07-06 (Task 0 gate passed). The
> v1 invariants below are unchanged by v2.
>
> **STATUS v2:** **A2 amendment — Praneesh re-approval pending** (drafted 2026-07-06).
> v2 layers the **fantasy layer** (the Nabhasa Reach, per `docs/lore.md`) over the
> built system: per-biome palettes for the eight Kindled worlds, a per-world lighting
> key, and a generous emissive-bloom policy. v2 is **strictly additive** — it records
> sanctioned exceptions, it does not relax a single v1 invariant. Until Praneesh
> signs, v2 is advisory and builders default to v1. Amendments always require
> re-approval.
>
> **STATUS v2.1:** Spec `2026-07-14-nabhasa-elevation.md` amendment — AI-generated
> assets MAY ship after curation (this doc §Generated assets). Approved with the
> elevation spec 2026-07-14; supersedes "AI gen = moodboard-never-shipped" below.

This doc gates all visual work. Every scene, shader, and post decision cites this. If a
scene wants something not covered here, amend this doc first, then build.

## One-line direction

A dead star that is still dangerous: near-black vacuum, one blinding blue-white source,
everything else lit only by it — **and now eight worlds that the Kindled terraformed
around it**, each readable in a single glance by its biome color and the one surface
that glows. Photographic restraint over sci-fi decoration — Gargantua's discipline, not
a synthwave poster. The Reach adds life and color but does not add a second sun.

## Palette (exact, committed)

| Token | Hex | Role |
|---|---|---|
| `--void` | `#030407` | Base space/background. Near-black with a breath of blue. Never pure `#000` in-scene (banding); `#000` only as HTML bg pre-canvas. |
| `--star-hot` | `#AFE3FF` | THE single hot accent. Star surface peak, beam cores, lensing ring, thruster tips, **UI active pulse, and any biome emissive that reads as "the Ember's own light"** (Aletheia data-lattice, Threshold jump-gate). Emissive values push it >1.0 into bloom; as flat UI color it stays ≤ this hex. |
| `--star-mid` | `#5FA8D8` | Star limb, beam falloff, sonification-reactive glow. Derived from `--star-hot`, never used for UI. |
| `--ui-cold` | `#8A93A6` | All HUD/telemetry text and rules. Desaturated slate — reads as instrumentation, never competes with the star. |
| `--ui-dim` | `#3A4150` | Secondary HUD: rules, inactive labels, graph grids. **A2:** also the Threshold station hull family — instrumentation-grey, deliberately, so the station reads as built by the same hand that drew the HUD. |
| `--irradiated` | `#C46A4A` | Planet dayside irradiation rim ONLY (Lich planets, existing `planets.ts` ember rim; **A2:** Brace's ember rim is this same token). Material color, never emissive >1, never UI. One sanctioned exception (amended 2026-07-06): the collapse preloader's pre-collapse supergiant may pass through the warm blackbody ramp — a dying red giant is physically warm; the ramp is transient and ends at `--star-hot`. |

**Rule: one hot accent (`--star-hot` family) for light, UI, and "the Ember's light
re-emitted."** If a new element "needs" its own color, it doesn't — unless it is a
biome's own physical glow, in which case it is a **sanctioned biome emissive** (next
section), never a UI color, never a competing global accent.

### A2 sanctioned biome-albedo exception set

The worlds are terraformed fiction, so their surfaces carry color the original three
real-rock bodies did not. These colors are sanctioned exactly as `--irradiated` is —
they are **material albedo ≤1** (or, for the glow set, **emissive >1**), they exist so a
biome reads as itself, and they are **never** a second hot accent. Two families only:

- **Warm-biome emissives (the fire/glow set, >1):** Brace lava `#FF6A2A`, Kiln foundry
  `#FF7A2A`, Vesper city-lights `#FFDFA6`. These are physically warm light a world makes
  itself — magma, slag, lamps — the same family as `--irradiated`, never used for UI.
- **The Ember's-light emissives (>1):** Aletheia data-lattice and Threshold jump-gate
  use `--star-hot` itself — they are the Ember re-emitted, not a new color.
- **Localized biome color, sub-star, non-UI:** Praesidium aurora `#7BE8A0` (green curl
  over one pole, additive, sub-star intensity — the single non-warm, non-`--star-hot`
  emissive in the Reach; sanctioned because lore mandates it and it stays localized and
  dim, never a global accent).
- **Pure albedo (≤1, never emissive, never UI):** Praesidium sea/land, Aletheia glass,
  Kiln copper/rust, Vesper canopy/vine, Riven rock, Corona cream/amber bands.

Diffuse biome albedo can never bloom (post rule unchanged). Only the glow set above crosses
threshold. Riven and Corona have **no emissive at all** — they read by albedo and the
Ember's rim, honestly dead/weather-only worlds.

## Per-biome palettes (A2 — fantasy layer)

Three committed hexes per world: **Key** = dominant surface albedo (≤1), **Mid** =
secondary surface albedo (≤1), **Accent** = the >1 emissive that bloom is for (or `—`
if the world has no self-light). Hexes for Brace/Praesidium/Aletheia/Kiln/Vesper/Riven/
Corona/Threshold albedo are pinned by `docs/a2-fantasy-plan.md` P2; the three warm
emissives (foundry, city-lights) and the aurora green are **art-director derivations
from lore**, flagged `*` below.

| # | World | Biome | Key (≤1) | Mid (≤1) | Accent (>1 emissive) |
|---|---|---|---|---|---|
| 1 | **Brace** | magma | crust `#1A1410` | ember rim `#C46A4A` (`--irradiated`) | lava `#FF6A2A` |
| 2 | **Praesidium** | ocean + cloud | sea `#CFE4EF` | land `#9FC3A6` | aurora `#7BE8A0` `*` |
| 3 | **Aletheia** | glass desert | glass `#9FE3E6` | facet dark `#2F6A72` | data-lattice `#AFE3FF` (`--star-hot`) |
| 4 | **Kiln** | industrial forge | copper `#B07A4A` | rust `#5A3320` | foundry glow `#FF7A2A` `*` |
| 5 | **Vesper** | bioluminescent ruins | canopy `#1F5E54` | vine `#0E2A26` | city-lights `#FFDFA6` `*` |
| 6 | **Riven** | shattered | core rock `#5A4A52` | debris glint `#8A8A96` | — (no self-light) |
| 7 | **Corona** | gas giant | band cream `#E8D9B0` | band amber `#C79A52` | — (no self-light) |
| 8 | **Threshold** | gate station | hull `#3A4150` (`--ui-dim`) | hull-mid `#4A5360` | gate ring `#AFE3FF` (`--star-hot`) |

`*` = derived from lore by the art director (this amendment), pending Praneesh sign-off.

### Per-world palette notes (secondary albedos + emissive surfaces + lore "Looks")

- **Brace** — *"Too hot to tame, too bright to ignore."* Lore Looks: *black crust cracked
  with orange lava veins; the irradiated ember rim at its limb; close enough to the Ember
  that its dayside glows on its own.* Emissive >1: **lava veins only** (worley-crest-high
  cells). The dayside "glows on its own" is the Ember irradiating dark rock, not material
  emissive — honest.
- **Praesidium** — *"The closest echo of the world they lost."* Lore Looks: *pale
  blue-white, shallow seas, slow cloud bands; a green aurora curls over its pole; one
  small moon.* Secondary albedo: cloud white `#F4F8FA` (scrolling noise layer, ≤1,
  non-emissive); moon grey `#8E97A3`. Emissive >1: **aurora only** (`#7BE8A0`, P5,
  additive, sub-star intensity, over the pole).
- **Aletheia** — *"Built so no Kindled would ever forget."* Lore Looks: *translucent cyan
  plains, faceted spires catching the Ember; data glows in the crystal lattice like city
  lights on the nightside.* Emissive >1: **data-lattice** (`--star-hot`), facing-aware
  (nightside >1, dayside sub-1) — it reads as stored starlight, hence the same token.
- **Kiln** — *"Where every dream is tried in fire."* Lore Looks: *copper-and-rust
  surface, smog haze, a great orbital ring of half-built habitats.* Secondary: smog
  `#7A5A3A` (fresnel atmospheric rim, ≤1). Emissive >1: **foundry points** (`#FF7A2A`,
  sparse, the fire the forge runs on).
- **Vesper** — *"First lit when the Ember was new; its people went to the stars but left
  the lights on."* Lore Looks: *deep teal-green, vine-strangled cities; the nightside
  still glitters with city lights that were never switched off.* Emissive >1:
  **city-light clusters** (`#FFDFA6`, warm-white, facing-aware nightside — the plan's
  "`--star-hot`-warm": warm-shifted lamp glow, not the cold accent).
- **Riven** — *"A world that died of its own ambition."* Lore Looks: *split hemisphere, a
  bright debris belt of fragments; shepherding asteroids.* **No emissive.** Reads as cold
  fractured rock + a bright debris belt (albedo `#8A8A96` catching the Ember). The dead
  warning world; its silence is the point.
- **Corona** — *"Uninhabitable, unharnessable — kept only because it is beautiful."* Lore
  Looks: *banded amber-and-cream, a vast ring system thrown wide, a family of small
  shepherding moons.* **No emissive.** Ring albedo between the two bands (`#DCC78E`,
  ≤1). Pure weather + ring geometry; beauty only.
- **Threshold** — *"Every word to a hundred galaxies passes through this ring."* Lore
  Looks: *a slow-spinning habitat ring, an antenna farm, and the jump-gate: a dark ring
  that folds space.* Hull is `--ui-dim`-family deliberately (built by the same hand as
  the HUD). Emissive >1: **jump-gate ring** (`--star-hot`, P5) + sparse habitat nav-light
  pinpoints (`--star-hot`, <3Hz). The one place self-illumination outweighs reflected
  Ember — it is far out (r ≈ 2700 wu) and powers itself.

## Per-world lighting key (A2)

The Ember is the sole global point light (v1, unchanged; the one Dyson-swarm region key
from the v1 amendment stays). Per world, the lighting key is **how that world reads under
the one light** — exposure offset (relative to arrival), rim, ambient floor, and what
self-emits. Photographic discipline holds: one key + one rim + ambient floor, nothing
else.

- **Brace (magma, r=130):** closest world → hardest Ember light, knife-sharp terminator,
  no atmosphere to scatter. Dayside self-luminous *from the Ember*, not material (honest).
  Exposure **−1.5 stops** vs arrival; ambient floor `0.006`. The lava is the only true
  glow.
- **Praesidium (ocean, r=260):** the soft world. Atmosphere scatters → pale limb glow;
  cloud band self-shadows; aurora additive over the pole (sub-star). Exposure ~arrival;
  ambient floor `0.02` (air fills the shadows).
- **Aletheia (glass, r=400):** crystal facets give the readable specular glint the flat
  worlds can't — faceted normals catch the Ember as bright shard-edges. Data-lattice
  self-emits on the nightside. Ambient floor `0.012`.
- **Kiln (forge, r=560):** matte copper-rust under the Ember; smog reads as a backlit
  fresnel rim. The orbital ring periodically eclipses the Ember → a moving shadow event
  across the surface (free drama, no new light). Foundry points emissive. Ambient floor `0.015`.
- **Vesper (ruins, r=1250):** thick canopy swallows the Ember; the nightside carries
  itself by city-light clusters. Bioluminescence adds a faint sub-star ambient tint.
  Ambient floor `0.018`.
- **Riven (shattered, r=1600):** dead rock, Ember only. The fractured core throws hard
  shadows across its own debris belt. No self-light anywhere — the cold warning. Ambient
  floor `0.008`.
- **Corona (gas giant, r=2050):** no hard surface → bands gradate across the limb; the
  rings cast a wide linear shadow-belt across the upper hemisphere (the postcard read).
  Shepherd moons drop pinprick shadows. Ambient floor `0.012` (atmospheric scatter).
- **Threshold (station, r=2700):** the Ember is far and weak here; the station reads by
  **its own emissive** (gate ring, nav-lights), not reflected starlight. Ambient floor
  `0.02` so the hull silhouette separates from void. Self-illumination > reflected Ember
  — honest, because it is a powered station at the edge.

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

## Generated assets (v2.1 — sanctioned, curated)

Sources: Pollinations (iteration/candidates), Gemini Omni (hi-res finals),
Google Flow/Veo (video plates). Rules, all binding:

1. Allowed asset classes ONLY: skybox/nebula plates, per-biome surface detail
   plates, ring-band strips, one hero video plate (preloader/overture backdrop).
   Never: UI elements, HUD, typography, logos, world silhouettes/hero geometry.
2. Every candidate passes the palette gate: sampled dominant hues must sit in
   the `--void`/`--star-mid` family or the target biome's Key/Mid hexes.
   Purple/teal nebula gradients = auto-reject (hard ban).
3. Neutral plates: no baked bloom/glow, no lens flares, no text/watermarks,
   no recognizable NASA imagery composited in. Grading happens in-engine.
4. Ledger row required before integration: file, source tool, prompt hash,
   date, license note, art-direction citation, approved-by.
5. Praneesh batch-approves via contact sheet; unapproved candidates are
   deleted from the repo (kept only in scratch).

## Per-region mood + lighting key

Photographic discipline everywhere: **one key + one rim + ambient floor**, nothing else.
The star is the sole GLOBAL point light. Amended 2026-07-06 (needs re-approval): one region-scoped, non-decaying key light is sanctioned inside the Dyson swarm only. No other region gets a second light.

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

### Lich planets (A1) → Reach worlds (A2)
- A1's three real-rock bodies become the eight Reach worlds; per-world materials, palettes, and lighting keys are in the **Per-biome palettes** and **Per-world lighting key** sections above. Dayside/nightside split stays hard (single point light, no fill) unless a world's biome supplies its own emissive (lava / lattice / city-lights / aurora / gate).

### Content-world approach (A2)
- Mood: arrival shifts from dread to recognition — the world "opens" as you near it.
- Lighting: **exposure hold, no new light.** Approaching a content world (Praesidium,
  Aletheia, Kiln, Vesper, Threshold) and its portfolio panel sliding in is a **DOM/UI
  event only** — it never spawns a light, never changes exposure, never blooms. The panel
  is instrumentation (per P3), not a flashlight. The world keeps reading exactly as its
  per-world key dictates; the panel simply overlays.

## Post-processing intent

- Global: AgX tone mapping, SRGB out. Bloom threshold **>1.0 — emissive-only, always**. Diffuse surfaces can never bloom.
- **A2 — generous emissive-bloom policy (fantasy layer):** "generous" means **more
  emissive surfaces are allowed to cross the >1.0 threshold**, *not* that the threshold
  drops. The sanctioned >1 set is: star core/limb, beam cores, **Brace lava, Aletheia
  data-lattice, Kiln foundry points, Vesper city-lights, Praesidium aurora (P5),
  Threshold jump-gate (P5)**. These surfaces are *what bloom is for* (v1 §post). The
  bloom radius may widen slightly in-system so these reads register, but the threshold
  stays >1.0 and **diffuse biome albedo still never blooms** — a teal Vesper canopy or
  amber Corona band glowing would be the slop tell this doc exists to prevent.
- Arrival: bloom exists ONLY to make the distant star read as blinding at 4px size. Radius small, intensity low. Nothing else crosses threshold.
- Near-star: bloom is FOR the beam cores and star limb. Wider radius acceptable; HUD is DOM, never blooms.
- Swarm: bloom nearly off (only star). The swarm reads by geometry and rim light, not glow.
- webgl2 tier: post off (quality table) — scenes must still read correctly with zero bloom; if a scene only works with bloom, the scene is wrong. **A2 consequence:** every world's emissive must *also* read as a brighter albedo approximation on webgl2 (e.g. lava reads as bright orange crust, city-lights as bright warm specks) so the biome is legible with post off.

## Photosensitivity (locked)

- Beam sweep flash events and HUD active-pulse: **<3Hz**, locked (v1).
- **A2:** all fantasy-layer emissive animation stays **<3Hz** — city-light twinkle,
  foundry flicker, and lava pulse are slow (<1Hz); aurora drift and jump-gate shimmer are
  near-static (<0.5Hz). No emissive in the Reach strobes. This is the same lock, extended
  to the new surfaces.

## Imperfection layer

- Film grain: subtle, luminance-only, ~0.03 amplitude, constant across regions (webgpu tiers only).
- Chromatic aberration: ONLY at high-G moments (kill-radius proximity, boost) — ramp with g-load, zero at cruise.
- Lens dirt: never.
- Vignette: faint (≤0.15), static; deepens slightly near-star with the exposure drop.

## Hard bans (slop tells)

Bloom-on-everything (diffuse surfaces glowing) · Orbitron · glitch/typewriter text · lens
dirt · auto-exposure · purple/teal "space nebula" gradients · particle trails on the
cursor · scroll hijack (there is no scroll) · **any second global hot accent.**

**A2 clarification — biome color is NOT a second accent:** the warm emissives
(lava/foundry/city-lights), the green aurora, and the biome albedos (teal canopy, cyan
glass, amber bands) are **localized material color**, sanctioned like `--irradiated`.
They never appear in the UI, never replace `--star-hot` as the global hot accent, and the
diffuse ones never bloom. The star stays the one blinding thing; the worlds are lit *by*
it and read *around* it.
