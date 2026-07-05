import { lazy, Suspense, useEffect, useState } from 'react';
import { NabhasaCanvas } from './core/renderer';
import { usePerfProbe } from './core/perfProbe';
import { detectTier, type Tier } from './core/tiers';
import { Starfield } from './world/Starfield';
import { NeutronStar } from './world/NeutronStar';
import { CameraRig } from './flight/cameraRig';

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
  return (
    <NabhasaCanvas tier={tier}>
      <Starfield tier={tier} />
      <NeutronStar />
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
