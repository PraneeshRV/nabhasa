import { lazy, Suspense, useEffect, useState } from 'react';
import { NabhasaCanvas } from './core/renderer';
import { usePerfProbe } from './core/perfProbe';
import { detectTier, type Tier } from './core/tiers';

// ponytail: query-param dev routing; real region/experience shell arrives in Wave 1.
const DEV_PAGES: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  lensing: lazy(() => import('./dev/LensingDev')),
  system: lazy(() => import('./dev/SystemDev')),
};

// Placeholder emissive star (spec Task 2 Step 5) — stand-in until NeutronStar (Task 5).
function PlaceholderStar() {
  return (
    <mesh>
      <sphereGeometry args={[10, 48, 48]} />
      {/* toneMapped={false} keeps the color hot so it reads as emissive without a >1 node pass. */}
      <meshBasicMaterial color={'#ffb070'} toneMapped={false} />
    </mesh>
  );
}

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
      <PlaceholderStar />
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
