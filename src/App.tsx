import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NabhasaCanvas } from './core/renderer';
import { useFrame, useThree } from '@react-three/fiber';
import { usePerfProbe } from './core/perfProbe';
import { detectTier, type Tier } from './core/tiers';
import { QUALITY } from './core/quality';
import { Starfield } from './world/Starfield';
import { REGION_PROFILES, useRegion } from './world/regions';
import type { AmbientLight } from 'three';
import { NeutronStar, starSpinAngle, starClock } from './world/NeutronStar';
import { LichPlanets } from './world/LichPlanets';
import { Aurora } from './world/Aurora';
import { PulsarBeams } from './signatures/PulsarBeams';
import { DysonSwarm } from './signatures/DysonSwarm';
import { CameraRig } from './flight/cameraRig';
import { attachInput } from './flight/input';
import { LensingSkybox } from './signatures/LensingSkybox';
import { CollapsePreloader } from './signatures/CollapsePreloader';
import { StaticExperience } from './fallback/StaticExperience';
import { initAudio, setMuted } from './audio/engine';
import { startAmbient, getAmbient } from './audio/ambient';
import { initSonify, setActiveSonify, getActiveSonify, noop } from './audio/sonify';
// Task 14 gate (finding 3): game/courier + score + ResultCard + hudStore + Beacons
// must NOT load on the mobile route. These were statically imported → they landed
// in the entry chunk fetched on EVERY route (incl. mobile). React.lazy splits them
// into the desktop chunk (rendered only inside ExperienceShell / MainExperience,
// desktop after ENGAGE). useCourierStore is a store (not a component) → reached
// via flight/Craft's static import (Craft itself lazy-loads, so courier lands in
// the flight chunk, never the entry/mobile chunk). The old onKill dynamic import
// here was redundant (finding 3); the fail dispatch is now synchronous in Craft.
const Telemetry = lazy(() => import('./hud/Telemetry').then((m) => ({ default: m.Telemetry })));
const HudSampler = lazy(() => import('./hud/hudStore').then((m) => ({ default: m.HudSampler })));
const MissionResult = lazy(() => import('./hud/MissionResult').then((m) => ({ default: m.MissionResult })));
const Beacons = lazy(() => import('./signatures/Beacons').then((m) => ({ default: m.Beacons })));
// A2 P3b: approach-triggered portfolio panel. ApproachSampler (useFrame leaf, 5Hz)
// mounts in-canvas next to HudSampler; ApproachPanel is the DOM overlay (mounted
// next to Telemetry in ExperienceShell). Lazy like HudSampler/Telemetry so neither
// the sampler's world deps nor the panel reach the mobile/static chunks.
const ApproachSampler = lazy(() => import('./hud/approachStore').then((m) => ({ default: m.ApproachSampler })));
const ApproachPanel = lazy(() => import('./hud/ApproachPanel').then((m) => ({ default: m.ApproachPanel })));

// ponytail: query-param dev routing; real region/experience shell arrives in Wave 1.
const DEV_PAGES: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  lensing: lazy(() => import('./dev/LensingDev')),
  system: lazy(() => import('./dev/SystemDev')),
};

// Rapier WASM stays out of the first-paint bundle: the whole flight chunk
// (incl. @react-three/rapier static imports) lazy-loads here. Craft brings its
// own <Physics gravity={[0,0,0]} timeStep={FIXED_DT} updateLoop="independent">.
// Craft.tsx has no default export → unwrap the named export for React.lazy.
const Craft = lazy(() => import('./flight/Craft').then((m) => ({ default: m.Craft })));

// Mobile designed-down film (Task 14): own chunk. Imports the world signatures
// (now decoupled from flight/Craft via the craftState leaf) but NOT flight/Craft,
// flight/cameraRig, or game/* → Rapier + courier/score chunks are never fetched
// on the mobile route (spec gate: verify in DevTools network tab).
const FlythroughFilm = lazy(() => import('./mobile/FlythroughFilm').then((m) => ({ default: m.FlythroughFilm })));

function PerfLogger() {
  usePerfProbe('main');
  return null;
}

// Region atmosphere (spec Task 5 wiring): the streamed region (Craft pushes
// regionAt(pos) ~10Hz into useRegionStore) drives renderer exposure + the scene
// ambient floor +, when audio is armed, the ambient bed gain. Lerps over ~1s via
// refs — never setState in useFrame. The ambient light is owned HERE: none existed
// before (only the star pointLight), so nightside planets read fully black vs
// art-direction's per-region ambient floor. exposure comes from REGION_PROFILES;
// the renderer's default toneMappingExposure is 1.0 = arrival, so no startup pop.
function RegionAtmosphere() {
  const gl = useThree((s) => s.gl);
  const region = useRegion();
  const ambRef = useRef<AmbientLight>(null);
  const cur = useRef({ exp: 1, amb: REGION_PROFILES.arrival.ambientLevel });
  const tgt = REGION_PROFILES[region];
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const k = 1 - Math.exp(-dt / 0.3); // ~1s exponential settle
    cur.current.exp += (tgt.exposure - cur.current.exp) * k;
    cur.current.amb += (tgt.ambientLevel - cur.current.amb) * k;
    gl.toneMappingExposure = cur.current.exp;
    if (ambRef.current) ambRef.current.intensity = cur.current.amb;
    const amb = getAmbient();
    if (amb) amb.setBedGain(cur.current.amb);
  });
  // ponytail: dim blue-grey floor; intensity={0} so R3F's region-change prop
  // re-apply (which clobbered the lerped ref to 0.015 for one frame mid-transition,
  // finding 6) is harmless — useFrame's ref write is the SOLE owner, and it runs in
  // the same frame after commit, overwriting the 0. Starts black, lerps to arrival
  // on the first frame. Color is a feel knob.
  return <ambientLight ref={ambRef} color="#2a3548" intensity={0} />;
}

function MainExperience({ tier }: { tier: Tier }) {
  // Flight input (spec Task 3): attach keyboard/touch once on mount; attachInput
  // returns its cleanup. Desktop live scene only — mobile film + the static route
  // never render MainExperience, so kbd never binds there (constraint honored).
  // Gamepad is polled per physics step inside CraftBody (input.pollGamepad), so no
  // extra per-frame wiring is needed.
  useEffect(() => attachInput(document.body), []);

  // Sky ownership (spec Task 7 step 3): lensing owns the sky on every lensing tier
  // to avoid a double sky; <Starfield> owns it only on the 'off' (static) tier.
  // Starfield's cubemap bake therefore only runs where it renders — fine while the
  // lensing shader uses its procedural sky (see LensingSkybox DEVIATION 2).
  const lensing = QUALITY[tier].lensing;
  return (
    <NabhasaCanvas tier={tier}>
      {lensing === 'off' ? <Starfield tier={tier} /> : <LensingSkybox tier={tier} />}
      <NeutronStar />
      <LichPlanets />
      <Aurora tier={tier} />
      <PulsarBeams tier={tier} />
      <DysonSwarm tier={tier} />
      <RegionAtmosphere />
      <Suspense fallback={null}>
        <Beacons />
        <Craft />
        <HudSampler />
        <ApproachSampler />
      </Suspense>
      <CameraRig />
      <PerfLogger />
    </NabhasaCanvas>
  );
}

// Detect tier once (every shell needs it). Called unconditionally at the top of
// App so the rules of hooks hold across the dev-page early returns.
function useTier(): Tier | null {
  const [tier, setTier] = useState<Tier | null>(null);
  useEffect(() => {
    let alive = true;
    detectTier().then((t) => {
      if (alive) setTier(t);
    });
    return () => {
      alive = false;
    };
  }, []);
  return tier;
}

// Warm the real lazy payload (Rapier WASM) during the preloader so the main
// scene is instant on ENGAGE. This mirrors Craft's own lazy import (cached), and
// its resolution is the preloader's honest `ready` signal. A failed load still
// resolves ready so the gate can never stall on a dead chunk.
function useRapierWarm(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import('./flight/Craft')
      .then(() => alive && setReady(true))
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

// WebAudio unlock — MUST run inside the ENGAGE click (browser autoplay policy), so
// CollapsePreloader fires it synchronously from the gesture, NOT from the delayed
// (650ms setTimeout) scene swap. Guards double-init: initAudio is idempotent and
// startAmbient has its own guard, but initSonify is not — a second call would stack
// a second pulse tone. The handle is stashed in the sonify active-registry
// (sonify.ts) so HudSampler's 10Hz tick drives update() (Task 9 loop, finding 1);
// its base-gain heartbeat plays as soon as it's armed.
let audioEngaged = false;
function engageAudio() {
  if (audioEngaged) return;
  audioEngaged = true;
  initAudio();
  setMuted(false); // master defaults muted; "sound on" unmutes
  startAmbient();
  setActiveSonify(initSonify({ getSpinPhase: () => starSpinAngle(starClock.t) }));
}

// Live tiers: collapse gate → main scene. The preloader owns the only active
// canvas during the burst (clean perf gate); the main scene mounts on ENGAGE.
function ExperienceShell({ tier }: { tier: Tier }) {
  const rapierReady = useRapierWarm();
  const [entered, setEntered] = useState(false);
  // Own the audio graph's lifetime: engageAudio fires in the ENGAGE gesture inside
  // this shell, so on unmount stop+disconnect the ambient bed + the active sonify
  // handle (sonify.ts active registry). Reset audioEngaged so a remount re-arms on
  // the next ENGAGE — otherwise the module guard would leave a returned-to route
  // silent (the ctx itself stays alive; only ambient/sonify nodes are rebuilt).
  useEffect(
    () => () => {
      getActiveSonify().dispose();
      setActiveSonify(noop);
      getAmbient()?.dispose();
      audioEngaged = false;
    },
    [],
  );
  return (
    <>
      {entered && <MainExperience tier={tier} />}
      {entered && (
        <Suspense fallback={null}>
          <Telemetry />
          <MissionResult />
          <ApproachPanel />
        </Suspense>
      )}
      {!entered && (
        <CollapsePreloader
          tier={tier}
          ready={rapierReady}
          onEnter={() => setEntered(true)}
          onSoundUnlock={engageAudio}
        />
      )}
    </>
  );
}

// /?dev=collapse — art-direction harness for the preloader (spec Task 8 Step 1):
// leva drives progress + phase manually; real loading is bypassed.
function CollapseHarness({ tier }: { tier: Tier }) {
  return <CollapsePreloader tier={tier} ready onEnter={() => {}} dev />;
}

// Mobile film route detection (spec Task 14): coarse pointer + narrow viewport.
function isCoarseMobile(): boolean {
  return matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
}

// Spec Task 14: coarse pointer caps at webgpu-low-or-below (DPR ≤1.5, reduced
// particle/swarm counts via QUALITY). detectTier already returns webgpu-low for
// coarse pointers; this only guards a coarse+wide+desktop-GPU edge case.
function mobileTier(t: Tier): Tier {
  return t === 'webgpu-high' ? 'webgpu-low' : t;
}

// Mobile gate: the collapse preloader (reveal #1, unchanged signature) doubles
// as the WebAudio unlock gesture, then the designed-down fly-through carries
// reveals #2–4 (lensing orbit → beam transit → swarm assembly). No
// useRapierWarm here — the Rapier/game chunk must stay unfetched on mobile.
function FilmShell({ tier }: { tier: Tier }) {
  const [entered, setEntered] = useState(false);
  const [sound, setSound] = useState(false);
  if (!entered) {
    return (
      <CollapsePreloader
        tier={tier}
        ready
        onEnter={() => setEntered(true)}
        onSoundUnlock={() => {
          // WebAudio MUST unlock inside this gesture (autoplay policy): initAudio
          // builds the graph + resumes the ctx synchronously HERE. setSound then
          // arms FlythroughFilm's own ambient/sonify path (idempotent — initAudio
          // no-ops on its second call). Mirrors ExperienceShell's engageAudio.
          initAudio();
          setSound(true);
        }}
      />
    );
  }
  return (
    <Suspense fallback={null}>
      <FlythroughFilm tier={tier} sound={sound} />
    </Suspense>
  );
}

export function App() {
  // Top-level so hooks run unconditionally regardless of dev routing below.
  const tier = useTier();
  const dev = new URLSearchParams(location.search).get('dev');

  if (dev === 'collapse') {
    return tier ? <CollapseHarness tier={tier} /> : null;
  }
  const Page = dev ? DEV_PAGES[dev] : undefined;
  if (Page) {
    return (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    );
  }

  if (!tier) return null;
  if (tier === 'static') return <StaticExperience />; // reduced-motion: no-motion fallback
  // Mobile designed-down cut (Task 14). Runs AFTER the static check so a
  // reduced-motion mobile user still gets the static experience, not the film.
  if (isCoarseMobile()) return <FilmShell tier={mobileTier(tier)} />;
  return <ExperienceShell tier={tier} />;
}
