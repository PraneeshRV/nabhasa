# Nabhasa — W0 Prompt Packets (Gemini Omni / Google Flow)

> **Purpose:** Executable prompt packets for the W0 hi-res final asset pass. Run
> these in **Gemini Omni** (still plates) and **Google Flow / Veo** (hero video),
> then drop outputs into `public/assets/_incoming/` for the curation +
> compression gate (Task 6) before anything lands in `public/assets/`.
>
> **How to run (Praneesh):**
> 1. Copy each packet's `PROMPT:` paragraph verbatim into Gemini Omni (still) or
>    Google Flow (video).
> 2. Generate the count noted on the `Tool:` line, pick the best take(s).
> 3. Save under the exact `Save as:` filename into
>    `public/assets/_incoming/<pkt-folder>/`.
> 4. Apply the `REJECT IF:` line to every candidate by eye before it enters the
>    contact sheet. Rejects stay out of the repo.
>
> **Hard rules binding on every packet** (from `docs/art-direction.md`):
> - Diffuse / albedo surfaces **never bloom**; emissive-only threshold >1.0 is
>   graded in-engine, never baked into the plate.
> - Neutral plates: no baked bloom/glow, no lens flares, no text/watermarks.
> - **Purple/teal "space nebula" gradients = auto-reject** (hard ban).
> - One hot accent (`--star-hot` family) for light; biome color is localized
>   material albedo, never a second global accent.
> - Hexes are pinned by the art-direction per-biome table; do not nudge them.

---

### PKT-01 — Skybox final (4K equirect)
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 16:9 max-res (conductor crops to 2:1) · Generate 2, pick 1 · Save as: `public/assets/_incoming/skybox/skybox-final-{a,b}.png`
PROMPT: Seamless equirectangular deep-space panorama, 4096x2048. Near-black
#030407 void, dense pinpoint starfield of cold white-blue stars, one very
subtle drift of blue-grey #5FA8D8 nebulosity under 5% brightness. Photographic
realism, Interstellar Gargantua restraint. No purple, no teal, no bright
nebula clouds, no lens flare, no planets, no text, no watermark, no vignette.
REJECT IF: any purple/teal cast · nebula brighter than stars · visible seam at
edges · baked glow.

---

### PKT-02 — Brace (magma) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-brace-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Close top-down material
study of a magma-world crust: near-black volcanic crust #1A1410 cracked into
rough polygonal plates, cracks filled with bright orange lava #FF6A2A as flat
opaque albedo (no glow — emissive is graded in-engine), crust high points and
rim dusted with a warm irradiated ember tint #C46A4A. Flat even lighting,
albedo only, no baked shadows, no cast light, no emissive glow, no bloom.
Photographic restraint. No purple, no teal, no second hot accent, no lens
flare, no text, no watermark, seamless tile on all four edges.
REJECT IF: lava glows or blooms (diffuse albedo must never bloom — art-direction
post rule) · any purple/teal cast (hard ban) · visible seam at tile edges ·
baked directional shadows or cast light.

---

### PKT-03 — Praesidium (ocean + cloud) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-praesidium-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Top-down material study of
a terraformed ocean-and-cloud world: pale blue-white shallow sea #CFE4EF, low
land masses in muted green #9FC3A6, soft non-emissive cloud-white banks
#F4F8FA drifting over both. The green aurora #7BE8A0 is excluded — it is an
in-engine additive atmospheric layer over the pole, not surface albedo, and
must not appear here. Flat even lighting, albedo only, no baked shadows, no
specular bloom on the sea, no glow. Photographic restraint. No purple, no teal
gradient, no second hot accent, no lens flare, no text, no watermark, seamless
tile on all four edges.
REJECT IF: sea blooms or glows (diffuse albedo must never bloom) · any
purple/teal cast (hard ban) · aurora green baked in as glow · visible seam.

---

### PKT-04 — Aletheia (glass desert) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-aletheia-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Top-down material study of
a glass-desert world: translucent cyan crystal plains #9FE3E6 fractured into
faceted shards, darker facet recesses #2F6A72 in the fracture gaps. The
data-lattice #AFE3FF is excluded as emissive — it is graded in-engine on the
nightside, not baked into this plate. Flat even lighting, albedo only, no
baked shadows, no specular bloom, no glow on the glass, no animated caustics.
Photographic restraint. No purple, no teal, no second hot accent, no lens
flare, no text, no watermark, seamless tile on all four edges.
REJECT IF: glass facets glow or bloom (diffuse albedo must never bloom) · any
purple/teal cast (hard ban) · data-lattice baked as emissive · visible seam.

---

### PKT-05 — Kiln (industrial forge) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-kiln-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Top-down material study of
an industrial forge-world surface: oxidized copper metal sheeting #B07A4A
scarred with dark rust #5A3320, patches of smog-stained grit. Sparse foundry
hot-spots #FF7A2A appear as flat bright orange albedo discs (no glow —
emissive graded in-engine). Flat even lighting, albedo only, no baked shadows,
no glow, no bloom. Photographic restraint. No purple, no teal, no second hot
accent, no lens flare, no text, no watermark, seamless tile on all four edges.
REJECT IF: foundry spots glow or bloom (diffuse albedo must never bloom) · any
purple/teal cast (hard ban) · visible seam · baked directional shadows.

---

### PKT-06 — Vesper (bioluminescent ruins) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-vesper-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Top-down material study of
an overgrown ruins world: deep teal-green forest canopy #1F5E54 tangled with
dark vine shadow #0E2A26. Sparse city-light pinpoints #FFDFA6 appear as flat
warm-white albedo specks (no glow — emissive graded in-engine on the
nightside). Flat even lighting, albedo only, no baked shadows, no glow, no
bloom on the canopy. Photographic restraint — a teal canopy glowing is the
named slop tell this doc exists to prevent. No purple, no teal-as-second-
accent, no lens flare, no text, no watermark, seamless tile on all four edges.
REJECT IF: canopy or city-lights glow/bloom (diffuse albedo must never bloom;
teal canopy glowing is the named slop tell) · any purple cast · visible seam.

---

### PKT-07 — Riven (shattered) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-riven-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Top-down material study of
fractured dead rock: cold mauve-grey core rock #5A4A52 broken into angular
shards, brighter debris-glint mineral flecks #8A8A96 catching light as flat
albedo. No self-light anywhere — Riven reads by albedo and the Ember's rim
only; its silence is the point. Flat even lighting, albedo only, no baked
shadows, no glow, no bloom. Photographic restraint. No purple, no teal, no
second hot accent, no lens flare, no text, no watermark, seamless tile on all
four edges.
REJECT IF: rock glows or blooms (diffuse albedo must never bloom) · any
purple/teal cast (hard ban) · any emissive/self-lit surface · visible seam.

---

### PKT-08 — Corona (gas giant) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-corona-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Top-down material study of
a gas-giant atmosphere: horizontal cloud bands alternating cream #E8D9B0 and
amber #C79A52, soft turbulent band edges, no hard surface. No self-light —
Corona reads by albedo and weather only. Flat even lighting, albedo only, no
baked shadows, no glow, no bloom on the bands (an amber Corona band glowing is
the named slop tell). Photographic restraint. No purple, no teal, no second
hot accent, no lens flare, no text, no watermark, seamless tile left↔right so
bands are continuous; top↔bottom also tileable.
REJECT IF: bands glow or bloom (diffuse albedo must never bloom; amber band
glowing is the named slop tell) · any purple/teal cast · visible seam
left/right.

---

### PKT-09 — Threshold (gate station) surface detail plate
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 1:1 max-res · Generate 2, pick 1 · Save as: `public/assets/_incoming/biomes/biome-threshold-{a,b}.png`
PROMPT: Tileable surface detail texture, 2048x2048. Close material study of
station hull plating: instrumentation-grey hull #3A4150 panels with hull-mid
#4A5360 separator plates, rivets, greeble bays, antenna-mount bosses — built
by the same hand that drew the HUD. The jump-gate ring #AFE3FF is excluded as
emissive — graded in-engine, not baked here. Flat even lighting, albedo only,
no baked shadows, no glow, no bloom. Photographic restraint. No purple, no
teal, no second hot accent, no lens flare, no text, no watermark, seamless
tile on all four edges.
REJECT IF: hull glows or blooms (diffuse albedo must never bloom) · any
purple/teal cast · gate-ring emissive baked in · visible seam.

---

### PKT-10 — Corona ring-band strip
Tool: Gemini image gen (nanobanana/Imagen) · Aspect 16:9 max-res (conductor crops center band to 8:1) · Generate 2, pick 1 · Save as: `public/assets/_incoming/rings/ring-corona-{a,b}.png`
PROMPT: Tileable horizontal ring-band strip, 4096x512. A gas-giant ring system
unwrapped into a flat band texture: alternating radial sub-bands of cream
#E8D9B0 and amber #C79A52 particulate, with clear dark gap structure
(Cassini-style divisions) where the band drops to near-black #030407 void
between denser lanes. Albedo only, no self-light, no glow, no bloom. Flat even
lighting. Photographic restraint. No purple, no teal, no second hot accent, no
lens flare, no text, no watermark, seamless tile left↔right (the strip wraps
the ring circumference).
REJECT IF: bands glow or bloom (diffuse albedo must never bloom) · any
purple/teal cast (hard ban) · no gap structure (rings must read as discrete
lanes with divisions) · seam at the left/right wrap.

---

### PKT-V1 — Collapse echo plate (hero video)
Tool: Google Flow (Veo) · 8s · 16:9 · Generate 2 takes · Save as: `public/assets/_incoming/video/collapse-echo-{a,b}.mp4`
PROMPT: Slow cosmic time-lapse: a dim red-orange supergiant star in near-black
space contracts inward and collapses into a single blinding blue-white point
#AFE3FF, emitting one clean expanding spherical shockwave shell of pale blue
light, then settles to a tiny pulsing white point. Camera static, wide shot,
photographic realism, deep blacks #030407, no lens flare, no text, no purple,
no teal, restrained — Interstellar visual discipline.
REJECT IF: explosion reads outward-fireball instead of inward collapse ·
purple/teal cast · busy debris · camera shake · any text.
NOTE: warm ramp on the supergiant is the sanctioned exception (art-direction
--irradiated note: dying giant may pass warm blackbody ramp ending at --star-hot).
