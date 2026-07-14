# Nabhasa Elevation — Award-Tier Cinematic Overhaul

> Spec v1 — 2026-07-14. Approved by Praneesh (approach B, full overhaul, GLM-max builders only, conductor orchestrates/verifies).
> Baseline: `master` @ `04ddb65` (tsc clean, vitest 110/110, build green, UX P0s fixed).
> Supersedes nothing — amends `2026-07-05-nabhasa.md` (A1 engine spec stands) and `docs/a2-fantasy-plan.md` (content stands).

## Problem

Engineering is award-grade; visuals are not. UX critique 20/40, direction review 21/40.
Observed on live scene (webgl2, 2026-07-14): placeholder-grade flat planet materials,
sparse starfield, near-invisible beams, no nebula ambience at spawn, no post-processing,
no arrival choreography. Structural award problem: all content gated behind 6DOF flight
skill — judges/recruiters judge in the first 60 seconds and never learn WASD (review P1).

## Decisions locked 2026-07-14

| Question | Decision |
|---|---|
| Direction | Elevate existing build (no rebuild, no scroll-film conversion) |
| Front door | **Cinematic overture**: 60–90 s camera-on-rails choreographed intro after preloader → seamless handover to free flight. Skippable (any input). `prefers-reduced-motion` → no overture, straight to static/archive path. |
| Anti-slop rule | **AMENDED**: AI gen allowed in shipped assets, curated. Procedural TSL stays backbone; AI fills what shaders can't (nebula/skybox plates, texture detail plates, one hero video moment). Every asset: art-direction citation + Praneesh batch approval + `docs/assets-ledger.md` entry. No raw AI output straight to prod. |
| Gen tools | **Zero-budget (rev. 2026-07-14, Higgsfield scrapped — no free tier)**: Pollinations MCP (keyless, conductor runs directly) for stills/iterations; Gemini Omni + Google Flow (Veo) via Praneesh — conductor writes exact prompts, Praneesh generates and returns files (standing asset-gen rule). |
| Builders | GLM 5.2 `GLM_EFFORT=max` for ALL implementation. Conductor (Claude) = packets, gates, verify, merge, commits only. |
| Ship targets | portfolio → praneeshrv.me, Nabhasa → nabhasa.praneeshrv.me, then Awwwards submission (per locked 2026-07-05 execution plan) |

## Architecture (new code = one module + one stack)

### `src/overture/` — camera rail + conductor
- **Rail**: Catmull-Rom spline through existing world/star/swarm positions
  (import from `src/world/planets.ts` live-position singleton — no duplicated coords).
- **Conductor**: pure timeline (t → rail param + event triggers). Unit-testable
  without WebGL. Events: lensing reveal, beam sweep across camera, swarm glitter
  pass, Reach glide, handover.
- **Handover**: final rail segment lerps camera into flight spawn pose
  [600, 80, 0], then transfers control to existing flight system. HUD fades in
  during last 10 s. On-screen beat: "YOU HAVE THE CRAFT".
- **Skip**: any key/click → accelerated scrub (≤2 s) to handover, not a hard cut.
- Overture must run on webgl2 tier (trimmed effects), full particles on webgpu.

### Post-processing stack (TSL nodes, tier-gated)
- Per-scene designed bloom (NOT global default bloom — anti-slop constitution §2),
  film grain, vignette, chromatic pulse ONLY during beam transit,
  time-dilation shader (page-clock + animation slowdown) near star.
- webgpu-high: full stack. webgpu-low: no grain. webgl2: bloom+vignette only.
  static: none (unchanged page).

### Asset pipeline
Pollinations MCP (stills, conductor-run) + Gemini Omni/Flow via Praneesh
(prompt packets from conductor) → Praneesh batch curation → compress (KTX2
textures, AVIF stills, H.265/AV1 video) → `public/assets/` → ledger entry.
Weight budget stands: 5–8 MB initial, progressive streaming for the rest.

## Build waves

Max 2 GLM builders live, disjoint file sets, worktrees, one serialized merge
gate (conductor). Every wave: tsc + vitest + build + headless screenshot probe
pasted into wave log. Two critics (proof + adversarial) on W2 and W4.

| Wave | Scope | Files (primary) | Gate |
|---|---|---|---|
| W0 | Art-direction v2 sign-off + asset pack (Pollinations stills + Gemini Omni/Flow prompt packets for Praneesh): skybox plates, nebula plates, per-biome texture detail, 1 hero preloader video candidate. Moodboard → finals. | docs/art-direction.md, docs/assets-ledger.md, public/assets/ | **Praneesh sign-off (blocks all visual waves)** |
| W1 | Skybox integration + starfield density/parallax + nebula ambience at spawn | src/world/ (skybox, starfield) | screenshot probe vs art-direction |
| W2 | World materials v2: TSL displacement, rim atmosphere scattering, night-side emissives, ring/moon/debris polish. Kill the flat-ball look on all 8 worlds. | src/world/, src/shaders/ | probe + 2 critics |
| W3 | Post stack per tier + beam visibility pass (beams must read at spawn distance) | src/core/ (post), src/signatures/ | probe per tier |
| W4 | Overture module (rail, conductor, handover, skip, reduced-motion bypass) | src/overture/ (new) | **Praneesh watch session** + 2 critics |
| W5 | Micro eye-candy: per-world arrival choreography, panel open/close motion, HUD breathing (rest/approach/danger), time-dilation UI | src/hud/, src/pages/, src/world/ | probe |
| W6 | Perf: split 2.27 MB main chunk to <500 kB initial (budget), lazy-load overture+worlds, mobile film rebuilt from overture path, fps matrix | vite config, src/mobile/ | **Praneesh fly + FPS run (discrete GPU)** |
| W7 | Ship: portfolio merge `revamp/mission-control`→main + deploy praneeshrv.me; Nabhasa deploy nabhasa.praneeshrv.me; Awwwards submit | — | **Praneesh confirms deploy + submit (external gates)** |

## Testing

- Existing 110 vitest stay green every wave (regression gate).
- New: overture conductor unit tests (pure t→state), rail waypoint contract
  tests (waypoints match live world positions), skip/reduced-motion branch tests.
- Headless limits stand: rAF-dependent behavior verified in Praneesh browser
  gates (W4, W6), not headless.

## Error handling / degradation

- Tier machinery unchanged. Overture failure (asset 404, shader compile fail)
  → log + skip straight to flight; never a black screen.
- ENGAGE gate currently renders invisible in headless screenshot while DOM
  buttons exist — investigate in W3 (suspect: text opacity animation or canvas
  z-order). RECON NEEDED before W4 rail work.

## Done bar

1. Both sites live on their domains.
2. Portfolio Lighthouse ≥90 all categories (built output, scores pasted).
3. Nabhasa fps matrix: 60 fps webgpu-high on Praneesh discrete GPU, 60 fps
   webgl2 mid-tier, static tier axe-clean.
4. All 5 Praneesh gates passed (W0 art, W4 watch, W6 fly+fps, W7 deploy, W7 submit).
5. Initial payload ≤8 MB, first chunk <500 kB.
6. Awwwards submission filed.

## Revision log

- v1 2026-07-14 — initial, decisions from elevation interview (this session).
- v1.1 2026-07-14 — Higgsfield scrapped (no free tier). Gen tools → Pollinations MCP + Gemini Omni/Flow via Praneesh.
- W0 GATE PASSED 2026-07-14 — Praneesh sign-off: art-direction v2+v2.1, moodboard ×12, candidates. Shipped interim: skybox-base.avif, nebula-wisp/dense.avif (ledgered). Omni/Flow packet outputs (docs/prompt-packets-w0.md) still pending Praneesh runs — finals swap in when delivered. W1 unblocked.
