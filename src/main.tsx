import { createRoot } from 'react-dom/client';
import { App } from './App';

// No StrictMode: double-mount races the WebGPURenderer async init (gl factory
// resolves into an already-disposed mount and the remount deadlocks). R3F +
// async renderers are not StrictMode-idempotent.
createRoot(document.getElementById('root')!).render(<App />);
