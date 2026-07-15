import { lazy, Suspense, useEffect, useState } from 'react';
import { detectTier, type Tier } from './core/tiers';
import { StaticExperience } from './fallback/StaticExperience';

// W6a: the entire R3F/live layer (three/webgpu, @react-three/fiber, world,
// signatures, flight, overture, the collapse preloader, the mobile film, audio)
// lazy-splits into its own chunk so the entry chunk ships NO three.js. App
// statically imports only react + core/tiers (three-free feature detection) +
// StaticExperience (the DOM-only reduced-motion route). Cached loads resolve the
// live chunk before BootVeil ever paints (CSS animation-delay, no JS timer);
// genuinely slow streams fade the veil in.
const LiveExperience = lazy(() => import('./LiveExperience'));

// Dev pages already lazy — own chunks, never the entry graph. They pull three
// (lensing skybox / system materials) but only on the dev route, so the entry
// chunk is unaffected.
const DEV_PAGES: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  lensing: lazy(() => import('./dev/LensingDev')),
  system: lazy(() => import('./dev/SystemDev')),
};

// Minimal DOM placeholder while the R3F chunk streams. Near-black #030407 (the
// site void), no canvas, no rAF. The opacity keyframe holds it invisible for the
// first ~150 ms (animation-delay + `both` fill) so a cached/instant chunk load
// never flashes it; only a genuinely slow stream fades it into view. Pure CSS —
// no JS timer, so it can never desync from Suspense resolution.
function BootVeil() {
  return (
    <>
      <style>{`@keyframes bootveil-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: '#030407',
          opacity: 0,
          animation: 'bootveil-in 220ms ease 150ms both',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '62%',
            textAlign: 'center',
            color: '#3A4150',
            fontFamily:
              "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            fontSize: 11,
            letterSpacing: '0.35em',
          }}
        >
          INITIALIZING
        </div>
      </div>
    </>
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

export function App() {
  // Top-level so hooks run unconditionally regardless of dev routing below.
  const tier = useTier();
  const dev = new URLSearchParams(location.search).get('dev');

  if (dev === 'collapse') {
    return tier ? (
      <Suspense fallback={<BootVeil />}>
        <LiveExperience tier={tier} dev="collapse" />
      </Suspense>
    ) : null;
  }
  const Page = dev ? DEV_PAGES[dev] : undefined;
  if (Page) {
    return (
      <Suspense fallback={<BootVeil />}>
        <Page />
      </Suspense>
    );
  }

  if (!tier) return null;
  if (tier === 'static') return <StaticExperience />; // reduced-motion: no-motion fallback
  // Live layer streams in: desktop ExperienceShell, or the mobile FilmShell (the
  // coarse-mobile routing lives inside LiveExperience, three-free from App's POV).
  return (
    <Suspense fallback={<BootVeil />}>
      <LiveExperience tier={tier} />
    </Suspense>
  );
}
