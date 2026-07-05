/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Task 16 step 1: split the three core (three/webgpu + three/tsl) and the
        // react runtime into named vendor chunks so the eager main index chunk
        // clears the ≤500KB gz budget (ex-Rapier). Both stay eager — renderer.tsx
        // imports three/webgpu synchronously — this only changes which file they
        // land in, not when they load. three is also imported by the lazy Craft
        // chunk, so it dedupes into this shared chunk instead of duplicating.
        // '/three/' matches node_modules/three/* (incl. webgpu/tsl) but NOT
        // @react-three/fiber — that path segment is '@react-three', no '/three/'.
        // Dev pages, FlythroughFilm, and the Craft/game lazy chunks stay as-is.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/three/')) return 'three';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
});
