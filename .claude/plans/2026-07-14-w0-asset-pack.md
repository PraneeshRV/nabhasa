# W0 — Art-Direction v2.1 + Asset Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock art-direction v2.1 (AI-asset amendment) and produce the curated, ledgered asset pack that unblocks visual waves W1–W5.

**Architecture:** No app code changes. Deliverables are docs (`art-direction.md` amendment, prompt packets), generated candidate assets (Pollinations via conductor; Gemini Omni/Flow via Praneesh), a contact-sheet review page, and `docs/assets-ledger.md` entries for approved+compressed finals in `public/assets/`.

**Tech Stack:** Pollinations MCP (stills), Gemini Omni + Google Flow/Veo (Praneesh-run), ImageMagick/ffmpeg + `toktx`(KTX2)/`avifenc` for compression.

**Executors:** Task 1, 4, 5 → GLM 5.2 (`GLM_EFFORT=max`) doc-writing packets. Tasks 2, 3, 6 → conductor (MCP + compression tooling; GLM has no MCP access). Task 7 → Praneesh gate.

## Global Constraints (verbatim from spec + art-direction)

- Palette: `--void #030407`, `--star-hot #AFE3FF`, `--star-mid #5FA8D8`, `--ui-cold #8A93A6`, `--ui-dim #3A4150`, `--irradiated #C46A4A`; per-biome table in `docs/art-direction.md` §Per-biome palettes.
- Hard bans apply to generated assets: purple/teal "space nebula" gradients · bloom-on-everything look · lens dirt · any second global hot accent.
- Every shipped asset: art-direction citation + Praneesh batch approval + `docs/assets-ledger.md` entry. No raw AI output straight to prod.
- Weight budget: 5–8 MB initial payload total; skybox ≤1.5 MB compressed; each texture plate ≤300 kB KTX2.
- AI output is a *plate/ingredient* — final look is graded in-engine (TSL); prompts must request neutral, gradeable output (no baked bloom, no watermark, no text).

---

### Task 1: Art-direction v2.1 amendment (GLM packet)

**Files:**
- Modify: `docs/art-direction.md` (header STATUS block + §Reference board line + new §Generated assets)

**Interfaces:**
- Produces: §"Generated assets (v2.1)" section that Tasks 2–6 cite as law.

- [ ] **Step 1: Amend STATUS block** — add line:

```markdown
> **STATUS v2.1:** Spec `2026-07-14-nabhasa-elevation.md` amendment — AI-generated
> assets MAY ship after curation (this doc §Generated assets). Approved with the
> elevation spec 2026-07-14; supersedes "AI gen = moodboard-never-shipped" below.
```

- [ ] **Step 2: Add §Generated assets (v2.1) section** (after §Reference board):

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/art-direction.md
git commit -m "docs(art): v2.1 — sanction curated generated assets (elevation spec)"
```

---

### Task 2: Moodboard pass — Pollinations (conductor)

**Files:**
- Create: `docs/moodboard/w0/*.jpg` (≈12 stills) + `docs/moodboard/w0/index.html` (contact sheet)

**Interfaces:**
- Produces: approved visual direction refs cited by Tasks 3–5 prompts.

- [ ] **Step 1: Generate 12 moodboard stills via Pollinations MCP** — one per: arrival vista, lensing ring closeup, spawn-region nebulosity, swarm glitter wave, 8× per-biome world hero (prompt = biome's lore "Looks" line + palette hexes + "photographic restraint, single blinding blue-white key light, near-black space, no purple, no teal gradient, no lens flare, no text").
- [ ] **Step 2: Build contact sheet** — plain HTML grid, filename + prompt under each image.
- [ ] **Step 3: Verify** — `ls docs/moodboard/w0/ | wc -l` ≥ 13; open contact sheet in preview, screenshot.
- [ ] **Step 4: Commit** (`git add docs/moodboard/w0 && git commit -m "art(w0): moodboard pass"`)

---

### Task 3: Skybox + nebula candidate plates — Pollinations (conductor)

**Files:**
- Create: `public/assets/_candidates/skybox/*.jpg` (4 candidates), `public/assets/_candidates/nebula/*.jpg` (4 candidates), appended rows in contact sheet

**Interfaces:**
- Produces: candidate pool for Task 6 curation; final skybox consumed by W1 (`src/world/` skybox).

- [ ] **Step 1: Generate 4 skybox plate candidates** — prompt core: "seamless equirectangular deep space panorama, near-black #030407 background, dense faint starfield, very subtle blue-grey nebulosity #5FA8D8 at 5% intensity, photographic, no purple, no teal, no bright nebula, no lens flare, no text, no planets", 2:1 aspect, max resolution Pollinations allows.
- [ ] **Step 2: Generate 4 nebula plate candidates** (spawn-region ambience, additive-blend-ready): "wispy dark nebula filaments on pure black, monochrome blue-grey #5FA8D8, faint, high dynamic range, no stars, no purple, no teal, no text".
- [ ] **Step 3: Palette gate check** — `magick <file> -resize 1x1 txt:` dominant hue per candidate; reject any outside blue-grey family. Record pass/fail per file in contact sheet.
- [ ] **Step 4: Verify + commit** — 8 files exist, contact sheet updated, commit `art(w0): skybox+nebula candidates`.

---

### Task 4: Gemini Omni prompt packets — hi-res finals (GLM packet, conductor reviews)

**Files:**
- Create: `docs/prompt-packets-w0.md`

**Interfaces:**
- Consumes: moodboard refs (Task 2 filenames) + art-direction §Per-biome palettes.
- Produces: packet doc Praneesh executes; outputs land in `public/assets/_incoming/`.

- [ ] **Step 1: Write packet doc.** One packet per asset, exact format:

```markdown
### PKT-01 — Skybox final (4K equirect)
Tool: Gemini Omni · Aspect 2:1 · Generate 2, pick 1 · Save as: skybox-final-{a,b}.png
PROMPT: Seamless equirectangular deep-space panorama, 4096x2048. Near-black
#030407 void, dense pinpoint starfield of cold white-blue stars, one very
subtle drift of blue-grey #5FA8D8 nebulosity under 5% brightness. Photographic
realism, Interstellar Gargantua restraint. No purple, no teal, no bright
nebula clouds, no lens flare, no planets, no text, no watermark, no vignette.
REJECT IF: any purple/teal cast · nebula brighter than stars · visible seam at
edges · baked glow.
```

Packets required (same format, palette hexes from art-direction table):
PKT-01 skybox final · PKT-02..09 per-biome surface detail plates (Brace crust+lava veins, Praesidium sea/cloud, Aletheia glass facets, Kiln copper/rust, Vesper canopy+city-lights, Riven fractured rock, Corona band strip, Threshold hull greeble) — each: tileable texture, 2048², "flat even lighting, albedo only, no shadows baked, no glow" · PKT-10 Corona ring-band strip 4096×512.

- [ ] **Step 2: Conductor review** — every packet cites art-direction section + reject-if line present. Fix inline.
- [ ] **Step 3: Commit** (`docs(w0): gemini omni prompt packets`).
- [ ] **Step 4: Hand to Praneesh** — he runs packets, drops outputs in `public/assets/_incoming/`.

---

### Task 5: Flow/Veo hero video packet (GLM packet, conductor reviews)

**Files:**
- Modify: `docs/prompt-packets-w0.md` (append PKT-V1)

**Interfaces:**
- Produces: hero video plate candidate for overture/preloader backdrop (W4 consumes).

- [ ] **Step 1: Append PKT-V1:**

```markdown
### PKT-V1 — Collapse echo plate (hero video)
Tool: Google Flow (Veo) · 8s · 16:9 · Generate 2 takes · Save as: collapse-echo-{a,b}.mp4
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
```

- [ ] **Step 2: Commit** (`docs(w0): veo hero video packet`).

---

### Task 6: Curation gate + compression + ledger (conductor)

**Files:**
- Create: `public/assets/` finals (compressed), rows in `docs/assets-ledger.md`
- Delete: rejected candidates from `public/assets/_candidates/` + `_incoming/`

**Interfaces:**
- Consumes: all candidates (Tasks 3–5 outputs).
- Produces: final asset set W1/W2/W4 import; ledger as integration contract.

- [ ] **Step 1: Contact-sheet review session** — Praneesh batch approve/reject per asset (browser, one pass).
- [ ] **Step 2: Compress approved** — textures: `toktx --genmipmap --encode uastc` → `.ktx2` (fallback: `magick` → AVIF if toktx absent — RECON: check `which toktx avifenc` first); video: `ffmpeg -crf 28 -c:v libx265` (+ AV1 if time) target ≤2 MB.
- [ ] **Step 3: Size gate** — `du -h public/assets/` pasted; skybox ≤1.5 MB, plates ≤300 kB each, video ≤2 MB.
- [ ] **Step 4: Ledger rows** — one per shipped file: `| file | tool | prompt-ref (packet id) | date | license | art-dir citation | approved-by |`.
- [ ] **Step 5: Delete rejects, commit** (`art(w0): curated asset pack + ledger`).

---

### Task 7: W0 gate — Praneesh sign-off

- [ ] **Step 1:** Praneesh reviews: art-direction v2+v2.1 (one combined sign-off — v2 was already pending), moodboard, final asset pack.
- [ ] **Step 2:** Sign-off recorded in art-direction STATUS block + spec revision log. **Unblocks W1/W2/W4.**

## Self-review notes
- Spec coverage: W0 scope fully mapped (art v2 sign-off ✓, skybox/nebula/biome/video assets ✓, ledger ✓, gate ✓).
- No placeholders; prompts inline; PKT-02..09 share format with PKT-01 with per-biome hexes from art-direction table (source cited, not duplicated here — GLM copies exact hexes from the table).
- Video/texture budgets consistent with spec §asset pipeline.
