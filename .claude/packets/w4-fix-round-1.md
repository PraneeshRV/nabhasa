# W4 Overture — Fix Packet (round 1, 6 CONFIRMED findings)

ROLE: builder. Fix exactly the 6 findings below in the w4-overture branch
(this worktree). No other changes.

SCOPE: `src/overture/rail.ts`, `src/overture/skip.ts`, `src/overture/Overture.tsx`,
`src/flight/cameraRig.ts` (export 2 consts ONLY), and the 3 test files
`tests/overture-*.test.ts` (extend, never weaken existing asserts).
NON-SCOPE: App.tsx, conductor.ts logic (comments ok), flight/, world/, any other file.

INVARIANT: all existing 153 tests keep passing unmodified in meaning; rail/skip/conductor
stay pure (no fiber import); no new hardcoded world coordinates (derive from
craftState / cameraRig consts).

## Finding 1 — rail must end at the CHASE pose, not the craft pose
Now: `rail.ts` final waypoint = SPAWN_POS `[600,80,0]` = craft pose. On handover,
CameraRig (src/flight/cameraRig.ts) wants camera at `craftPos − forward·OFFSET_BACK + up·OFFSET_UP`
= `(600, 88, 28)` given craftState initial pos `(600,80,0)`, forward `(0,0,-1)` (src/flight/craftState.ts:30-32).
Result: visible camera pop at handover.
Fix:
- `src/flight/cameraRig.ts`: add `export` to `OFFSET_BACK` and `OFFSET_UP` (lines 18-19). Nothing else.
- `Overture.tsx` `buildOvertureSources()`: compute `spawn` as the chase pose from the
  craftState singleton (import `craftState` from `../flight/craftState`):
  `pos − forward·OFFSET_BACK + (0,1,0)·OFFSET_UP`. Fresh Vector3, no aliasing.
- `rail.ts`: SPAWN_POS stays exported (tests may use it) but update the comment: final
  waypoint is now the CHASE pose passed in by the caller; rail.ts itself unchanged math.
- Look-at pop: CameraRig looks at the CRAFT, Overture looks at STAR_ORIGIN. During the
  handover phase (step.phase === 'handover'), lerp the look target from STAR_ORIGIN to
  craftState.pos using the same `handoverFade(t)` ramp (reuse it), so at t=1 the camera
  orientation matches what CameraRig will impose. Keep a module-scoped scratch Vector3
  (no per-frame alloc).
- Test (`tests/overture-rail.test.ts` or Overture-level pure helper): assert the built
  sources' spawn equals craftState-derived chase pose `(600, 88, 28)` (compute from the
  imported consts, don't hardcode 88/28 as magic — derive in the test the same way).

## Finding 2 — unbound matchMedia → Illegal invocation → reduced-motion never detected
Now: `skip.ts:39-41` grabs `globalThis.matchMedia` into a variable, then calls it
detached at line 47. In real browsers calling detached `matchMedia` throws
`TypeError: Illegal invocation`, the catch swallows it, returns false — the bypass is dead.
Fix: call it bound: inside `prefersReducedMotion()`, do
`const g = globalThis as { matchMedia?: (q: string) => { matches: boolean } };`
`if (typeof g.matchMedia !== 'function') return false;`
`try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }`
— i.e. property access + call on the SAME reference expression (`g.matchMedia(...)`) so
the `this` binding is preserved. Remove getMatchMedia/MatchMediaFn indirection.
Test (`tests/overture-skip.test.ts`): stub `globalThis.matchMedia` with a function that
THROWS if `this` is not the globalThis/undefined-strict-ok — simplest honest test: stub
with a normal function returning `{matches:true}` and assert true; plus a stub that
throws → assert false; plus absent → false. (The binding bug itself can't be reproduced
in node, so also add a comment stating the browser constraint.)

## Finding 3 — coincident waypoints → CatmullRom NaN
Now: `frameWaypoints` can emit two control points <1 wu apart (e.g. glide world near
swarm or degenerate sources) → centripetal Catmull-Rom divides by zero distance → NaN
camera position → black screen.
Fix in `rail.ts` `frameWaypoints`: after building `points`, filter consecutive
duplicates: drop any point whose distance to the previous kept point is < 1 (wu). Always
keep first and last (if last lands <1wu from previous kept, drop the PREVIOUS kept
inner point instead — start and end poses are sacred). If fewer than 2 points remain,
that's the degenerate case: keep [start, spawn]. CatmullRomCurve3 with 2 points is valid
(degenerates to a line).
Update `OvertureWaypoints.points` doc comment. `start/glideWorld/swarm/spawn` named
fields stay the RAW values (they document sources), only `points` is filtered.
Test (`tests/overture-rail.test.ts`): sources with swarm === glideWorld (exact) →
`points` has no consecutive pair closer than 1 wu AND `railPointAt` at p=0, 0.5, 1
returns finite numbers (Number.isFinite on x/y/z). Also degenerate all-equal sources →
finite everywhere, points.length >= 2.

## Finding 4 — sole-camera-driver contract: useFrame priority
Now: Overture's `useFrame((_, rawDt) => …)` runs at default priority 0, same as any
other camera writer; contract "sole camera driver" is convention only.
Fix: `useFrame(cb, 1)` — positive priority runs AFTER default-0 subscribers, so the
overture's camera write wins the frame even if something else touches the camera.
Note: passing a priority makes R3F treat it as a manual-render subscription? NO — only
`priority > 0` on the ROOT render loop matters when using `render="manual"`; in default
mode priority just orders callbacks. State this in the comment. Also extend the mount
note comment: "Overture is the sole camera driver while mounted; CameraRig must NOT be
mounted concurrently (App wiring enforces)."
No new test (R3F integration — not unit-testable under node env). Comment is the artifact.

## Finding 5 — static rail vs orbiting worlds: glide drift (~11 wu/s)
Now: rail is baked once at mount from `getPlanetPositions()`; the glide world keeps
orbiting (~11 wu/s at inner orbit) so after ~50 s the "glide past the world" beat misses
by hundreds of wu.
Fix in `Overture.tsx` (keep rail.ts pure): each frame during the glide phase, read the
LIVE glide-world position `getPlanetPositions()[GLIDE_WORLD_INDEX]` — export
`GLIDE_WORLD_INDEX` from rail.ts (currently module-private const, line ~45) — compute
`drift = livePos − railRef.current.waypoints.glideWorld` (scratch Vector3), and add
`drift · w` to the camera position after the rail sample, where `w` is a triangular
blend: 0 at glide-phase start, →1 mid-glide, →0 by handover-phase start (so the rail's
end pose is untouched). Implement `glideDriftWeight(t): number` as a PURE exported
function in `conductor.ts` or `rail.ts` (pure module) keyed off OVERTURE_BEATS glide/handover
thresholds, so it's unit-testable: 0 at t=glide.t, peak 1 at midpoint, 0 at handover.t,
0 outside [glide.t, handover.t].
Test: assert those 5 values of `glideDriftWeight` exactly (peak midpoint = 1, edges 0,
outside 0), plus monotonic up then down.

## Finding 6 — stale callback closures (onHandover/onBeat/onHud)
Now: `useFrame` in R3F does keep the latest callback, BUT the `useEffect([], …)` skip
listener and `handoverOnce` capture the FIRST render's `onHandover` via closure chain if
a parent re-renders with a new callback identity (App wiring will: setState-driven).
The error-path `handoverOnce()` inside useFrame closes over the render-scoped function —
fine per-frame — but the empty-dep effect's `trigger` → `handedOver` ref only; the real
hazard is any path calling a stale prop.
Fix: hoist callbacks into refs updated every render:
`const onHandoverRef = useRef(onHandover); onHandoverRef.current = onHandover;` (same
for onBeat, onHud). `handoverOnce` and the frame loop call `onHandoverRef.current()`
etc. `handoverOnce` itself becomes a stable `useRef`-held or plain function reading refs
only.
No new test (React lifecycle — not node-unit-testable here); the ref pattern is the fix.

## GATE (run all, paste output)
1. `npx tsc --noEmit` — clean.
2. `npx vitest run` — ALL green (153 existing + new ones; expect ≥158).
3. `npm run build` — succeeds.
4. Grep gates: `grep -n "matchMedia" src/overture/skip.ts` shows bound-call pattern;
   `grep -rn "from '@react-three/fiber'" src/overture/rail.ts src/overture/skip.ts src/overture/conductor.ts`
   returns NOTHING (purity preserved).

## OUTPUT FORMAT
Unified diff summary per finding (1-6): file, what changed, which test covers it.
Then verbatim gate outputs. Commit NOTHING — leave working tree dirty for conductor review.

## ABORT CONDITIONS
- Any existing test needs its ASSERTION changed (not just an import) → stop, report which.
- Finding conflicts with code you read (line moved, logic differs) → adapt to the real
  code, note the delta; if the finding seems already fixed, report instead of forcing.
