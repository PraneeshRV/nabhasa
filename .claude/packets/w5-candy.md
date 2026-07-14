# W5 — Micro Eye-Candy (arrival choreography, panel motion, HUD breathing, time-dilation UI)

ROLE: builder, branch w5-candy (this worktree). Spec wave W5
(.claude/specs/2026-07-14-nabhasa-elevation.md line 66). Art-direction governs
every visual number: docs/art-direction.md — READ the "Approach" region section
(~lines 218-254) and the palette table before writing any CSS.

SCOPE: `src/hud/` (Telemetry.tsx, ApproachPanel.tsx, hud.css, approach.css,
hudStore.ts, approachStore.ts — additive only), `src/world/` (smallest possible
arrival cue), new pure helpers + tests in `tests/`.
NON-SCOPE: src/overture/ (just merged — do not touch), src/flight/, src/core/,
src/App.tsx, shaders, post stack, any lighting/exposure change, new dependencies.

INVARIANTS (each is a gate — violating any = abort):
- Art-direction line ~238: a panel/UI event is DOM-only — it NEVER spawns a light,
  changes exposure, or blooms. `git grep -n "intensity\|exposure" src/hud/` must
  show no new writes.
- ALL new motion respects `prefers-reduced-motion: reduce` (CSS `@media` guard —
  animation/transition off, end-state shown). Verify: grep each new animation has
  a reduced-motion override.
- Existing 163 vitest stay green unmodified.
- No setState in useFrame; per-frame values go through refs/stores like the
  existing HudSampler idiom.

## Step 1 — HUD breathing (rest / approach / danger)
Pure helper `src/hud/breath.ts`: `hudBreathState(approaching: boolean, beamTransit: number): 'rest' | 'approach' | 'danger'` —
danger when beamTransit > 0.4 (reuse/export Telemetry's TRAN_THRESHOLD, single
source), approach when an approach target is active (approachStore exposes this —
recon exact field first), else rest.
CSS: `.hud-root[data-breath=...]` drives a subtle luminance/glow pulsation on
`.hud-cluster` borders: rest ~6 s period barely-there, approach ~3 s, danger
~1.2 s + border color shifts toward a warning tone FROM THE ART-DIRECTION PALETTE
(no invented hexes; if no warning hex exists in art-direction.md, use --star-hot
and note it). Telemetry sets `data-breath` from the helper (10 Hz store cadence
is fine).
Verify: new `tests/hud-breath.test.ts` pins the 3-state truth table + threshold
edge (0.4 exactly → not danger). Expected: state function is trivial and pure.
Likely failure: approachStore field name differs from assumption → RECON: read
approachStore.ts first; the check is `git grep -n "export" src/hud/approachStore.ts`.

## Step 2 — ApproachPanel open/close motion
Slide + settle on open (translateX ~24px→0 + opacity 0→1, 320 ms,
cubic-bezier(0.16, 1, 0.3, 1)), mirrored close at ~200 ms. CSS-only in
approach.css keyed off the panel's existing mount/visible mechanism — recon how
ApproachPanel currently shows/hides (mount vs class) and use the LEAST invasive
hook (class toggle preferred; if mount-gated, animate open only and note close
needs exit-state — do NOT add an animation library or portal rework).
Reduced-motion: instant show/hide.
Verify: tsc + build; describe in output which mechanism was found and used.

## Step 3 — per-world arrival choreography (smallest honest version)
Art-direction ~line 236: "arrival shifts from dread to recognition — the world
opens as you near it." Implement the SMALLEST world-side cue: when the approach
target becomes active for a world, that world's existing decorative elements
(ring/moon/debris — whatever LichPlanets already renders per world) get a gentle
scale/opacity ease-in over ~2 s — driven by a ref-lerp inside the existing world
useFrame, reading the SAME approach signal the panel uses (import the store
getter, no new plumbing).
HARD BOUND: ≤ ~40 new lines in src/world/. If the wiring genuinely needs more,
ABORT this step and report the design options instead of building infrastructure.
Verify: tsc + build + existing planets tests green; describe the exact visual
change + where a reviewer sees it in code.

## Step 4 — time-dilation UI emphasis
Recon: does hudStore/Telemetry already carry a time-dilation value? (physics-data
has the formula; check what HudSampler samples.) If yes: when dilation < 0.9 the
Telemetry dilation row gets a highlighted state (value color → --star-hot, slow
1.5 s pulse) + the HUD gains `data-dilated` for a page-level slow-breath cue
(reuse Step 1 machinery, do not invent a second system). If NO dilation value
reaches the HUD today: add it to the existing sampler payload following the
sampler's exact idiom (SI-honest from physics-data), then the above.
Verify: tests for the pure threshold mapping (a `dilationEmphasis(d: number)`
helper); tsc + vitest + build.

## GATES (run all, paste verbatim)
1. `npx tsc --noEmit`
2. `npx vitest run` (163 existing + new; report count)
3. `npm run build`
4. `git grep -n "prefers-reduced-motion" src/hud/*.css` — every new animation block covered.

## OUTPUT FORMAT
Per step: what changed (files), mechanism found in recon, verify evidence.
Then verbatim gate outputs. Commit NOTHING — leave tree dirty for conductor.

## ABORT CONDITIONS
- Any invariant would break.
- Step 3 exceeds the 40-line bound.
- An existing test's assertion needs changing.
- approach/hud store shape contradicts the packet's assumption in a way that
  changes the design (not just a field name) → stop, report.
