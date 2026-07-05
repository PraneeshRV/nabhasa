import { lazy, Suspense, useEffect, useState } from 'react';
import { NabhasaCanvas } from './core/renderer';
import { usePerfProbe } from './core/perfProbe';
import { detectTier, type Tier } from './core/tiers';
import { QUALITY } from './core/quality';
import { Starfield } from './world/Starfield';
import { NeutronStar } from './world/NeutronStar';
import { PulsarBeams } from './signatures/PulsarBeams';
import { CameraRig } from './flight/cameraRig';
import { LensingSkybox } from './signatures/LensingSkybox';

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

function MainExperience() {
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
  if (!tier) return null;
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
      <Suspense fallback={null}>
        <Craft />
      </Suspense>
      <CameraRig />
      <PerfLogger />
    </NabhasaCanvas>
  );
}

export function App() {
  const dev = new URLSearchParams(location.search).get('dev');
  const Page = dev ? DEV_PAGES[dev] : undefined;
  if (Page) {
    return (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    );
  }
  return <MainExperience />;
}
