import { lazy, Suspense } from 'react';

// ponytail: query-param dev routing; real region/experience shell arrives in Wave 1.
const LensingDev = lazy(() => import('./dev/LensingDev'));

export function App() {
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev === 'lensing') {
    return (
      <Suspense fallback={null}>
        <LensingDev />
      </Suspense>
    );
  }
  return null;
}
