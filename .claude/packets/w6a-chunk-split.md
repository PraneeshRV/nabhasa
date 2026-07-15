# W6a — Entry-chunk split: DOM-first paint, lazy R3F layer

ROLE: builder, branch w6-perf (this worktree). Spec wave W6 line 67 (perf slice
only — the mobile-film rebuild is W6b, NOT yours).

GOAL: first paint of every route ships NO three.js. Entry chunk (gz) after this
wave = react + app shell only, target < 200 kB gz total first-paint JS for the
live route before the R3F layer streams in. Verify with the build output.

RECON FACTS (conductor-verified, build of master):
- three sits in its own chunk (~371 kB gz) but is FIRST-PAINT because App.tsx
  statically imports CollapsePreloader (src/App.tsx:22) which imports
  @react-three/fiber Canvas (src/signatures/CollapsePreloader.tsx:19), and App
  also statically imports @react-three/fiber + world/signature modules directly
  (src/App.tsx:3-23).
- Craft/Telemetry/etc are already React.lazy — do not touch their pattern.
- StaticExperience must stay DOM-only and three-free (reduced-motion route =
  fastest path, that is the point of it).

SCOPE: src/App.tsx, src/main.tsx (only if needed), new small wrapper file(s)
under src/core/ or src/, vite.config.ts (manualChunks only if genuinely needed).
NON-SCOPE: src/overture/ internals, src/flight/, src/world/ internals,
src/mobile/FlythroughFilm internals (moving its import is fine), CollapsePreloader
internals, any behavior change visible after mount.

DESIGN (follow; deviate only with flagged reasoning):
1. Extract everything R3F-touching that App.tsx renders for the LIVE routes into
   a new module, e.g. src/LiveExperience.tsx: ExperienceShell + MainExperience +
   CollapseHarness + FilmShell + RegionAtmosphere + their R3F imports move there
   (mechanical move, no logic edits). App.tsx keeps: useTier, dev-page router,
   StaticExperience route, and mounts the live layer via
   `const LiveExperience = lazy(() => import('./LiveExperience'))` inside
   `<Suspense fallback={<BootVeil />}>`.
2. BootVeil = minimal DOM placeholder (near-black #030407 full-viewport div,
   optional tiny "INITIALIZING" line in the HUD mono stack) shown while the R3F
   chunk streams. It must not flash for cached loads (render nothing for the
   first ~150 ms — CSS animation-delay trick or opacity keyframe, no JS timer).
3. Dev pages (DEV_PAGES lensing/system) are already lazy — ensure their import
   moves with the live layer if they pull three (they do), i.e. they stay lazy
   and no longer share the entry graph. Verify entry chunk contains no three
   after the move.
4. Audio modules (audio/engine, ambient, sonify) — check whether they pull three
   or are heavy; if they are three-free and small they may stay in entry, else
   they move into LiveExperience.
5. attachInput/craftState/overture: all move with the live layer (they are only
   referenced there after W4 wiring).

GATES (run all, paste verbatim):
1. `npx tsc --noEmit`
2. `npx vitest run` — all green (173 currently).
3. `npm run build` — then list dist/assets sizes and STATE which chunks the
   entry html/script pulls before user interaction: entry must reference NO
   chunk containing three. Evidence: `grep -l "three" dist/assets/index-*.js`
   style checks (adapt to actual names) + the vite build summary.
4. Reduced-motion/static route still renders with JS from entry only (no R3F
   chunk fetch needed for StaticExperience) — prove via the import graph (who
   imports StaticExperience) not by running a browser.

INVARIANTS: behavior after chunks load is IDENTICAL (same component tree, same
props, same mount order — the W4 overture wiring in ExperienceShell must move
verbatim); no new deps; existing 173 tests unmodified.

OUTPUT FORMAT: per design item — what moved where (file:line), then verbatim
gate outputs incl. the chunk table with sizes. Commit NOTHING.

ABORT: circular import appears between App shell and LiveExperience · any test
assertion would need changing · entry still pulls three after the move and the
fix would exceed this scope — report instead of improvising.
