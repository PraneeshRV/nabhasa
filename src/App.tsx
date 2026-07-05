import { lazy, Suspense } from 'react';

// ponytail: query-param dev routing; real region/experience shell arrives in Wave 1.
const DEV_PAGES: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  lensing: lazy(() => import('./dev/LensingDev')),
  system: lazy(() => import('./dev/SystemDev')),
};

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
  return null;
}
