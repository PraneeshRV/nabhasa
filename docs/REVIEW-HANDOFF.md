# Nabhasa — Adversarial Review Handoff

> Prepared 2026-07-10 for external adversarial review (GPT 5.6 terra).
> Repo state: `master` @ `f4fbfcb`. All slice branches merged (verified
> `git merge-base --is-ancestor` for all 9 `a2-*` branches).

## What this is

A flyable neutron-star-system portfolio (PSR B1257+12 "Lich"). Single R3F
`<Canvas>`, `three/webgpu` WebGPURenderer with WebGL2 fallback, TSL-only
shaders. Eight fictional worlds carry portfolio content (approach → diegetic
panel); five courier missions end in a Contact CTA. Quality tiers:
`webgpu-high / webgpu-low / webgl2 / static` — static is a full-content-parity
text page for reduced-motion / no-GPU users.

Binding docs (read in this order):
1. `.claude/specs/2026-07-05-nabhasa.md` — A1 engine spec (stage: flight,
   lensing, beams, swarm, audio, preloader, tiers).
2. `docs/lore.md` — fiction canon (names, biomes, tone). Approved.
3. `docs/art-direction.md` — visual law, v1 approved / v2 pending sign-off.
4. `docs/a2-fantasy-plan.md` — the A2 content+art amendment plan (this is what
   was just built).
5. `PRODUCT.md` — register, users, design principles.

## Progress ledger (chronological)

| Stage | What | State |
|---|---|---|
| A1 | Engine: flight (Rapier), star, lensing skybox, pulsar beams, Dyson swarm, audio, collapse preloader, tier machinery, HUD telemetry, courier FSM + scoring, static tier | merged pre-A2 |
| A2 P3a | `src/content/portfolio.json` — real portfolio copy (Contact links still placeholder) | merged |
| A2 P5a | Praesidium nebula + aurora | merged |
| A2 P1.3 | 8-body gravity (fictional tuned masses) | merged |
| A2 P4 | 5 lore-wired courier missions, "THE EMBER · PSR B1257+12" HUD line | merged |
| A2 P1.2 | 8 Reach worlds: procedural TSL biome materials, rings/moons/debris/tether, Threshold station, `nearestContentWorld`, live-position singleton | merged |
| A2 P3b | Approach-triggered portfolio panels (60 wu radius, 5 Hz sampler, zustand store) | merged |
| A2 P5b | Threshold jump-gate (emissive rim + fold shimmer, tier-gated) | merged |
| a2-tests | Proof-critic tightening: contract values pinned, cross-copy consistency planets↔gravity↔courier, portfolio binding | merged `046b8aa` |
| a2-fixes | 5 verified critic fixes (below) | merged `a724c26` |

## a2-fixes — the last code change (review focus)

Diff: `git show a724c26`. Six files, +69/−22.

1. **Finale reachability (was CRITICAL):** m5-gate's delivery beacon is a fixed
   snapshot; the live Threshold orbits thousands of wu away, so the
   proximity-triggered Contact panel could never open. Fix: `MissionResult.tsx`
   opens the Contact panel event-driven when the m5 result card is dismissed.
   Two deliberate deviations from the original fix packet:
   - New `pinned` flag in `approachStore` — without it the 5 Hz sampler's
     out-of-range branch closes the event-opened panel ≤200 ms later.
   - Open on result-card **dismiss**, not while it shows — both dialogs listen
     for `keydown` ESC on `window`; simultaneous open would let one ESC kill both.
2. **Sticky ESC:** `dismissed: string | null` in the store; sampler won't
   re-open an ESC'd world until the craft leaves `APPROACH_RADIUS`; cleared on
   leaving range or opening a different world.
3. **Kiln ring/tether:** ring co-rotates inside `SphereBody`'s spin group when
   the world has a tether (Kiln); Corona's untethered ring stays static.
4. **Panel interactivity:** `.approach-panel { pointer-events: auto }` (root
   overlay stays `none` so flight input is never blocked).
5. **Tier threading:** `LichPlanets` takes `tier` as a prop from App (no double
   `detectTier()` probe, no wrong-tier transient); self-probe kept as
   null-first fallback; `JumpGate` mounts only after tier resolves.

## Verification evidence (run 2026-07-10 on master a724c26/f4fbfcb)

```
npx tsc --noEmit      → TypeScript: No errors found
npx vitest run        → PASS (110) FAIL (0)
npm run build         → ✓ built in 4.90s  (chunk-size warning pre-existing)
```

Runtime (headless preview): static tier renders full a11y text page, console
clean; `/?forceTier=webgl2` boots main scene + HUD, console clean; Contact
panel verified in DOM with correct copy and pointer-events (auto on panel,
none on root); ESC path verified (closes, records `dismissed`, unpins).

**Honest gaps a reviewer should probe:**
- Sampler-driven behavior (pinned early-return, dismissed clearing) is NOT
  runtime-verified — headless preview's rAF starves when the tab is hidden, so
  `useFrame` logic freezes. Covered by review + types only. Test files exist
  for the pure modules; the P3/P5 behavior layer has partial coverage
  (see proof-critic verdict in `.claude/a2-resume/critic-proof.log` if present).
- No real-browser flight playthrough yet (owner gate pending): fly-feel, the
  5-mission chain, finale Contact CTA, FPS on the three live tiers.
- Deferred known finding: `gravity.ts` Threshold soft-collider r=6.0 vs visible
  structure extent ~3.8 wu → craft stops ~2.2 wu short of the visible gate.
  Deliberate deferral to fly-feel; a2-tests may pin `RADII[7]=6.0`.
- Contact links in `portfolio.json` are placeholders.
- art-direction v2 (per-biome palettes) awaits owner re-approval; builders
  defaulted to v2 values per the A2 plan.
- Bundle: main chunk ~2.27 MB (845 kB gzip) vs plan budget 500 kB — over.

## UX critique (impeccable, dual-agent) — 2026-07-10

Full report: `.impeccable/critique/2026-07-10T07-46-07Z__src-app-tsx.md`.
Method: two isolated sub-agents (design review; deterministic detector +
browser evidence). **Score 20/40 (Acceptable). Not AI slop** — detector exit 0,
zero findings; static page a11y structure verified correct (heading order,
skip link, captioned/scoped tables, ~6.6:1 contrast, clean console both routes).

**3 × P0 (the UX audit's core result — all "demo-ware seams", not craft bugs):**
1. Mission system invisible: courier `offered` state has NO UI anywhere;
   keyboard hints omit KeyC. The 5-mission spine is undiscoverable.
2. Contact endpoint has no contact method: portfolio.json Contact is an
   editorial placeholder AND ApproachPanel has no anchor rendering path — even
   finished copy couldn't be clickable.
3. Content parity claimed but absent: StaticExperience + mobile FlythroughFilm
   contain zero portfolio content (no name, no sections, no contact) — the
   most likely visitor (mobile recruiter) learns nothing.

**2 × P1:** reading panels races orbital mechanics (Praesidium ~11.6 wu/s vs
60 wu radius — panel closes mid-paragraph; delivery beacons are fixed
snapshots while planets orbit); no non-flight content path + no onboarding
beat on desktop (decoupled 6DOF gate in front of all content).

**P2:** no low-fuel warning; mission abandon exists in the reducer, nothing
dispatches it.

Strengths confirmed: collapse preloader (honest load signals, audio-consent
gate), non-modal diegetic panels, failure-recovery engineering.

## How to run

```
npm install
npm run dev -- --port 5199 --strictPort   # or: preview_start "nabhasa"
# forceTier override for tier testing:
#   http://localhost:5199/?forceTier=webgl2   (also webgpu-high|webgpu-low|static)
npx vitest run      # 110 tests
npx tsc --noEmit
npm run build
```

Flight: mouse + WASD (see `src/flight/`), ESC dismisses panels/dialogs.
Missions offer within 40 wu of a mission-from world; approach panels open at
60 wu of content worlds. Spawn at [600, 80, 0] near Brace/Praesidium.
