import { lazy, Suspense, useEffect, useState } from 'react';
import { NabhasaCanvas } from './core/renderer';
import { usePerfProbe } from './core/perfProbe';
import { detectTier, type Tier } from './core/tiers';
import { QUALITY } from './core/quality';
import { Starfield } from './world/Starfield';
import { NeutronStar, starSpinAngle, starClock } from './world/NeutronStar';
import { PulsarBeams } from './signatures/PulsarBeams';
import { DysonSwarm } from './signatures/DysonSwarm';
import { CameraRig } from './flight/cameraRig';
import { LensingSkybox } from './signatures/LensingSkybox';
import { CollapsePreloader } from './signatures/CollapsePreloader';
import { StaticExperience } from './fallback/StaticExperience';
import { initAudio, setMuted } from './audio/engine';
import { startAmbient } from './audio/ambient';
import { initSonify } from './audio/sonify';

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

function PerfLogger() {
  usePerfProbe('main');
  return null;
}

function MainExperience({ tier }: { tier: Tier }) {
  // Sky ownership (spec Task 7 step 3): lensing owns the sky on every lensing tier
  // to avoid a double sky; <Starfield> owns it only on the 'off' (static) tier.
  // Starfield's cubemap bake therefore only runs where it renders — fine while the
  // lensing shader uses its procedural sky (see LensingSkybox DEVIATION 2).
  const lensing = QUALITY[tier].lensing;
  return (
    <NabhasaCanvas tier={tier}>
      {lensing === 'off' ? <Starfield tier={tier} /> : <LensingSkybox tier={tier} />}
      <NeutronStar />
      <PulsarBeams tier={tier} />
      <DysonSwarm tier={tier} />
      <Suspense fallback={null}>
        <Craft />
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
// a second pulse tone. initSonify's handle is left for Task 9's update loop; its
// base-gain heartbeat plays as soon as it's armed.
let audioEngaged = false;
function engageAudio() {
  if (audioEngaged) return;
  audioEngaged = true;
  initAudio();
  setMuted(false); // master defaults muted; "sound on" unmutes
  startAmbient();
  initSonify({ getSpinPhase: () => starSpinAngle(starClock.t) });
}

// Live tiers: collapse gate → main scene. The preloader owns the only active
// canvas during the burst (clean perf gate); the main scene mounts on ENGAGE.
function ExperienceShell({ tier }: { tier: Tier }) {
  const rapierReady = useRapierWarm();
  const [entered, setEntered] = useState(false);
  return (
    <>
      {entered && <MainExperience tier={tier} />}
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
  if (tier === 'static') return <StaticExperience />; // reduced-motion: no-motion fallback (Task 15 stub)
  return <ExperienceShell tier={tier} />;
}
