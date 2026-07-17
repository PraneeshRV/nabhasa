# Nabhasa

A flyable neutron-star system that is also a portfolio.

You wake in a courier craft inside PSR B1257+12 — the Lich, a dead star still
dangerous — and fly. Eight fictional worlds orbit it, each carrying a section
of the portfolio: approach a world and its content opens as a diegetic panel.
Five courier missions thread the system and end at a contact CTA. On devices
that can't run the flight, a static fallback still delivers every section.

<!-- screenshot: add public/assets capture here -->

## Stack

- **React 19 + TypeScript + Vite**
- **three.js / React Three Fiber** — rendering
- **@react-three/rapier** — flight physics
- **zustand** — state, **GSAP** — cinematics
- Custom shader work, quality-tier system (WebGL2 fallback via `?forceTier=webgl2`), reduced-motion and mobile paths

## Run

```bash
npm install
npm run dev      # local flight
npm run build    # tsc -b && vite build
npm test         # vitest — 177 tests
```

## Design discipline

One blinding blue-white source, near-black vacuum, instrumentation-grey UI —
photographic restraint over neon sci-fi. The full art direction, lore, and
build plan live in [`docs/`](docs/): [art-direction.md](docs/art-direction.md),
[lore.md](docs/lore.md).

## Author

Praneesh R V — [github.com/PraneeshRV](https://github.com/PraneeshRV) ·
[praneeshrv404@gmail.com](mailto:praneeshrv404@gmail.com)
