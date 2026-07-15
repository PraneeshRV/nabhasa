// StaticExperience — reduced-motion / no-WebGPU fallback (spec Task 15).
// No canvas, no rAF, no Rapier, no autoplaying motion. This IS the site's
// content for anyone who can't or won't run the live flight: every telemetry
// fact the diegetic HUD would show is readable here as text, sourced from the
// SAME real-astrophysics module (hud/physics-data.ts) so the two can never
// disagree. Palette-bound: --void #030407, --star-hot #AFE3FF (lone accent),
// --ui-cold #8A93A6. --ui-dim #3A4150 is decorative rules/borders only — it
// fails AA as text (~2:1 on void), so no readable copy uses it.
//
// Typography per docs/art-direction.md: Space Grotesk (display) / Inter (body)
// / JetBrains Mono (telemetry), with system fallbacks while the woff2 subset
// (Task 13/16) is not yet loaded.

import {
  PULSAR,
  timeDilation,
  tidalAccel,
  orbitalV,
  surfaceGravity,
} from '../hud/physics-data';
import { LICH_SYSTEM } from '../world/planetData';
import PORTFOLIO from '../content/portfolio.json';

// The portfolio archive — SAME single source as the live approach panels
// (content parity is the point of this page, and it was missing: UX P0).
const ARCHIVE_ORDER = ['About', 'Research', 'Projects', 'Experience', 'Contact'] as const;
interface ArchiveSection {
  slot: string;
  world: string;
  headline: string;
  myth: string;
  blocks: { heading: string; body: string }[];
  links?: { label: string; href: string }[];
}
const ARCHIVE = PORTFOLIO as unknown as Record<string, ArchiveSection>;

// ── Real values, derived from the live module so the page never drifts ──────
const C_MPS = 2.998e8; // speed of light, m/s (matches physics-data.ts)
const periodMs = PULSAR.periodS * 1000; // 6.219 ms
const spinHz = 1 / PULSAR.periodS; // ~160.8 Hz
const radiusKm = PULSAR.radiusM / 1000; // 10 km
const rSchKm = PULSAR.schwarzschildM / 1000; // ~4.13 km
const gSurf = surfaceGravity(); // ~1.86e12 m/s²
const dilSurf = timeDilation(radiusKm); // ~0.766 (surface)
const dil300 = timeDilation(300); // ~0.9931 (r = 300 km)
const tidal300 = tidalAccel(300, 2); // ~2.76e4 m/s² across 2 m at 300 km
const vorb300 = orbitalV(300); // ~2.49e7 m/s
const vorb300C = vorb300 / C_MPS; // fraction of c

// m × 10^e renderer (mantissa keeps `sig` significant figures).
function sci(x: number, sig = 3): { m: string; e: number } | null {
  if (x === 0 || !isFinite(x)) return null;
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  return { m: m.toFixed(sig - 1), e };
}

function Sci({ x, sig, unit }: { x: number; sig?: number; unit?: string }) {
  const s = sci(x, sig);
  if (!s) return <>0{unit ? ` ${unit}` : ''}</>;
  return (
    <>
      {s.m} × 10<sup>{s.e}</sup>
      {unit ? ` ${unit}` : ''}
    </>
  );
}

// ── Palette + type (art-direction committed values) ────────────────────────
const C = {
  void: '#030407',
  starHot: '#AFE3FF',
  cold: '#8A93A6',
  dim: '#3A4150', // decorative only — NOT text (fails AA ~2:1)
};
const F = {
  display: '"Space Grotesk", system-ui, sans-serif',
  body: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

// Tiny presentational helpers keep the JSX readable without an abstraction layer.
function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: F.mono,
        fontSize: '11px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: C.cold,
      }}
    >
      {children}
    </span>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: F.mono,
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums',
        color: C.cold,
      }}
    >
      {children}
    </span>
  );
}

// Property row of the pulsar fact table: th(scope=row) + td, so axe sees real
// headers and no cell is orphaned.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th
        scope="row"
        style={{ textAlign: 'left', fontWeight: 400, padding: '0.5rem 1rem 0.5rem 0', width: '14em' }}
      >
        <MicroLabel>{label}</MicroLabel>
      </th>
      <td style={{ padding: '0.5rem 0' }}>
        <Value>{children}</Value>
      </td>
    </tr>
  );
}

// ── The four signature moments (set-piece order per Task 14 film) ───────────
const MOMENTS: { id: string; title: string; body: string }[] = [
  {
    id: 'collapse',
    title: 'Collapse',
    body: 'A giant star ends. Its core, no longer held aloft by fusion, falls through itself in milliseconds — a sphere 10 km across, denser than an atomic nucleus, spinning 160 times a second. The preloader is this death, in real time.',
  },
  {
    id: 'lensing',
    title: 'Lensing',
    body: 'Approach the star and the sky bends. Light from stars behind it curves around the dark; a thin bright ring marks where photons orbit the corpse. This is gravitational lensing — the geometry general relativity predicts, rendered live into the skybox.',
  },
  {
    id: 'beam-transit',
    title: 'Beam transit',
    body: 'Magnetic fields a trillion times Earth’s funnel radiation off the poles into two opposed beams. The spin sweeps them across space like a lighthouse. Cross a beam and the hull reads a radiation transit; the star’s pulse becomes sound.',
  },
  {
    id: 'swarm',
    title: 'Swarm assembly',
    body: 'At the system’s edge a partial Dyson swarm takes shape — mirror-tiles catching the pulsar’s light as they slide into orbit, a glitter wave of assembly. Human industry among the dead.',
  },
];

export function StaticExperience() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto', // body is overflow:hidden (canvas app); this pane scrolls.
        background: C.void,
        color: C.cold,
        fontFamily: F.body,
        scrollbarColor: `${C.dim} ${C.void}`,
      }}
    >
      {/* Skip link — first focusable element; axe best practice for a long page. */}
      <a
        href="#main"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '0.5rem',
          zIndex: 1,
          padding: '0.5rem 1rem',
          background: C.starHot,
          color: C.void,
          fontFamily: F.mono,
          fontSize: '13px',
          textDecoration: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.left = '0.5rem';
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = '-9999px';
        }}
      >
        Skip to main content
      </a>

      <main id="main" tabIndex={-1} style={{ outline: 'none', maxWidth: '46em', margin: '0 auto', padding: '6rem 1.5rem 4rem' }}>
        {/* Hero — the neutron star is the lone hot accent, a static emissive dot. */}
        <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div
            aria-hidden="true"
            style={{
              width: '12px',
              height: '12px',
              margin: '0 auto 2rem',
              borderRadius: '50%',
              background: C.starHot,
              boxShadow: `0 0 18px 6px rgba(175,227,255,0.55), 0 0 48px 16px rgba(175,227,255,0.22)`,
            }}
          />
          <h1
            style={{
              margin: '0 0 1rem',
              fontFamily: F.display,
              fontWeight: 500,
              fontSize: 'clamp(2.5rem, 7vw, 5rem)',
              lineHeight: 1,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              color: C.cold,
            }}
          >
            Nabhasa
          </h1>
          {/* Identity first (direction review): the visitor learns WHOSE site this
              is before any astrophysics. */}
          <p
            style={{
              margin: '0 0 0.5rem',
              fontFamily: F.mono,
              fontSize: '13px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: C.starHot,
            }}
          >
            Praneesh R V · AI red teamer
          </p>
          <p style={{ margin: '0 0 1.25rem', fontFamily: F.display, fontSize: '1.2rem', color: C.cold }}>
            I break AI agents.
          </p>
          <p style={{ margin: 0, fontSize: '1rem', maxWidth: '32em', marginInline: 'auto' }}>
            A neutron-star system that is also my portfolio. This is the reduced-motion
            experience — the live flight needs animation and a WebGPU-capable browser. Everything
            the flight carries is below: the archive first, then the real astrophysics.
          </p>
        </header>

        {/* ── The archive: all five portfolio sections, same source as the live
            approach panels (src/content/portfolio.json). ── */}
        {ARCHIVE_ORDER.map((slot) => {
          const sec = ARCHIVE[slot];
          if (!sec) return null;
          return (
            <section key={slot} aria-labelledby={`archive-${slot}`} style={{ marginBottom: '3.5rem' }}>
              <h2 id={`archive-${slot}`} style={sectionHeading}>
                {sec.headline}
              </h2>
              <p style={{ margin: '0 0 1rem' }}>
                <MicroLabel>
                  {slot} · {sec.world}
                </MicroLabel>
              </p>
              {sec.blocks.map((b) => (
                <div key={b.heading} style={{ margin: '0 0 1.1rem' }}>
                  <h3
                    style={{
                      margin: '0 0 0.35rem',
                      fontFamily: F.display,
                      fontWeight: 500,
                      fontSize: '1.05rem',
                      color: C.cold,
                    }}
                  >
                    {b.heading}
                  </h3>
                  <p style={{ ...body, margin: 0 }}>{b.body}</p>
                </div>
              ))}
              {sec.links && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '1.25rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sec.links.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        target={l.href.startsWith('http') ? '_blank' : undefined}
                        rel="noreferrer"
                        style={{ fontFamily: F.mono, fontSize: '13px', letterSpacing: '0.06em', color: C.starHot }}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {/* Static system-status summary (spec Task 15 step 2). A labeled region,
            not a live-updating HUD: nothing here changes, so it needs no aria-live. */}
        <section aria-labelledby="status-heading" style={{ marginBottom: '3.5rem' }}>
          <h2 id="status-heading" style={sectionHeading}>
            System status
          </h2>
          <p style={{ ...body, margin: 0 }}>
            <MicroLabel>Tier:</MicroLabel> <Value>static</Value>
            <br />
            <MicroLabel>Reason:</MicroLabel>{' '}
            <Value>reduced-motion preference, or no WebGPU/WebGL2</Value>
            <br />
            <MicroLabel>Content parity:</MicroLabel>{' '}
            <Value>full telemetry readable as text — no information lost</Value>
          </p>
        </section>

        {/* The star — full fact table, single-sourced from physics-data.ts. */}
        <section aria-labelledby="star-heading" style={{ marginBottom: '3.5rem' }}>
          <h2 id="star-heading" style={sectionHeading}>
            The star
          </h2>
          <p style={{ ...body, marginTop: 0 }}>
            PSR B1257+12 — <em>“Lich.”</em> A millisecond pulsar 2,300 light-years away in Virgo,
            and the host of the first planets humanity ever found beyond the Sun.
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
            <caption style={{ textAlign: 'left', padding: '0 0 0.75rem', ...{ color: C.cold, fontFamily: F.body, fontSize: '0.9rem' } }}>
              Real SI values for PSR B1257+12. Computed from <code>hud/physics-data.ts</code>.
            </caption>
            <tbody>
              <Row label="Designation">PSR B1257+12 (“Lich”)</Row>
              <Row label="Class">Neutron star · millisecond pulsar</Row>
              <Row label="Spin period">{periodMs.toFixed(3)} ms</Row>
              <Row label="Spin frequency">{spinHz.toFixed(1)} Hz</Row>
              <Row label="Mass">1.4 M☉ (<Sci x={PULSAR.massKg} unit="kg" />)</Row>
              <Row label="Radius">{radiusKm.toFixed(0)} km</Row>
              <Row label="Schwarzschild radius">{rSchKm.toFixed(2)} km</Row>
              <Row label="Surface gravity">
                <Sci x={gSurf} unit="m/s²" />
              </Row>
            </tbody>
          </table>
        </section>

        {/* The live formulas, evaluated — proves the module is the source. */}
        <section aria-labelledby="formulas-heading" style={{ marginBottom: '3.5rem' }}>
          <h2 id="formulas-heading" style={sectionHeading}>
            Live physics
          </h2>
          <p style={{ ...body, marginTop: 0 }}>
            The same formulas the HUD runs every frame, with sample distances. The pulsar is
            compact enough that relativity and tides stop being academic.
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
            <caption style={visuallyHidden}>Computed examples from the real formulas.</caption>
            <thead>
              <tr>
                <th scope="col" style={thCol}>
                  <MicroLabel>Quantity (formula)</MicroLabel>
                </th>
                <th scope="col" style={thCol}>
                  <MicroLabel>Value</MicroLabel>
                </th>
              </tr>
            </thead>
            <tbody>
              <Row label="Time dilation at surface √(1 − rₛ/r)">
                {dilSurf.toFixed(4)} <span style={unitNote}>t_surface / t_∞</span>
              </Row>
              <Row label="Time dilation at r = 300 km">{dil300.toFixed(4)}</Row>
              <Row label="Tidal Δa across 2 m at 300 km (2GM·span/r³)">
                <Sci x={tidal300} unit="m/s²" />
              </Row>
              <Row label="Circular orbit at 300 km (√(GM/r))">
                <Sci x={vorb300} unit="m/s" /> ({vorb300C.toFixed(3)} c)
              </Row>
            </tbody>
          </table>
        </section>

        {/* The four signature set-pieces as mission-log prose. */}
        <section aria-labelledby="moments-heading" style={{ marginBottom: '3.5rem' }}>
          <h2 id="moments-heading" style={sectionHeading}>
            Four moments
          </h2>
          <p style={{ ...body, marginTop: 0 }}>
            In the live experience you discover these by flying to them — no scroll, no timeline.
            Here they are as a log.
          </p>
          <ol style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0 0' }}>
            {MOMENTS.map((m, i) => (
              <li key={m.id} style={{ display: 'flex', gap: '1.25rem', padding: '1.25rem 0', borderTop: `1px solid ${C.dim}` }}>
                <span aria-hidden="true" style={{ fontFamily: F.mono, fontSize: '13px', color: C.starHot, minWidth: '2em' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem', fontFamily: F.display, fontWeight: 500, fontSize: '1.4rem', letterSpacing: '0.01em', color: C.cold }}>
                    {m.title}
                  </h3>
                  <p style={{ ...body, margin: 0 }}>{m.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* The planets — sourced from world/planets.ts LICH_SYSTEM (real data). */}
        <section aria-labelledby="planets-heading" style={{ marginBottom: '3.5rem' }}>
          <h2 id="planets-heading" style={sectionHeading}>
            The planets
          </h2>
          <p style={{ ...body, marginTop: 0 }}>
            Draugr, Poltergeist, Phobetor — the first exoplanets ever discovered (Wolszczan &amp;
            Frail, 1992), found orbiting a pulsar. Undead worlds around an undead star.
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
            <caption style={visuallyHidden}>Real masses, orbits and periods for the three Lich planets.</caption>
            <thead>
              <tr>
                <th scope="col" style={thCol}>
                  <MicroLabel>Body</MicroLabel>
                </th>
                <th scope="col" style={thCol}>
                  <MicroLabel>Mass (M⊕)</MicroLabel>
                </th>
                <th scope="col" style={thCol}>
                  <MicroLabel>Orbit (AU)</MicroLabel>
                </th>
                <th scope="col" style={thCol}>
                  <MicroLabel>Period (days)</MicroLabel>
                </th>
              </tr>
            </thead>
            <tbody>
              {LICH_SYSTEM.map((p) => (
                <tr key={p.name}>
                  <th scope="row" style={{ ...thRow, color: C.starHot, fontFamily: F.display, fontWeight: 500, fontSize: '0.95rem' }}>
                    {p.name}
                  </th>
                  <td style={tdCell}>
                    <Value>{p.realMassEarths.toFixed(2)}</Value>
                  </td>
                  <td style={tdCell}>
                    <Value>{p.realSemiMajorAU.toFixed(2)}</Value>
                  </td>
                  <td style={tdCell}>
                    <Value>{p.realPeriodDays.toFixed(2)}</Value>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <footer
        style={{
          maxWidth: '46em',
          margin: '0 auto',
          padding: '2rem 1.5rem 4rem',
          borderTop: `1px solid ${C.dim}`,
        }}
      >
        <MicroLabel>Sources</MicroLabel>
        <p style={{ ...body, fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
          All astrophysics computed from real SI constants for PSR B1257+12 —{' '}
          <code>src/hud/physics-data.ts</code> (formulas) and <code>src/world/planets.ts</code>{' '}
          (Lich system). Planet data to be verified against the NASA Exoplanet Archive at physics
          review. Live flight requires WebGPU; this static page loses no content.
        </p>
      </footer>
    </div>
  );
}

// ── Shared style fragments (not components — just objects) ──────────────────
const sectionHeading: React.CSSProperties = {
  fontFamily: F.display,
  fontWeight: 500,
  fontSize: 'clamp(1.5rem, 3vw, 2rem)',
  lineHeight: 1.1,
  letterSpacing: '0.01em',
  margin: '0 0 0.75rem',
  color: C.cold,
};

const body: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: '1rem',
  lineHeight: 1.6,
  color: C.cold,
};

const thCol: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 400,
  padding: '0.5rem 1rem 0.5rem 0',
  borderBottom: `1px solid ${C.dim}`,
};

const thRow: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 400,
  padding: '0.5rem 1rem 0.5rem 0',
};

const tdCell: React.CSSProperties = {
  padding: '0.5rem 1rem 0.5rem 0',
};

// ponytail: kept as cold (not --ui-dim) — dim fails AA as text (~2:1 on void).
const unitNote: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: '0.8rem',
  color: C.cold,
};

// Visually hidden but available to AT (caption text needs to reach screen readers).
const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};
