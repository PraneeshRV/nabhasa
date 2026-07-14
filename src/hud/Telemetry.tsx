// Diegetic HUD overlay (spec Task 13). DOM (not in-canvas sprites) — crisp text,
// a11y-readable, WCAG AA. JetBrains Mono 13px values / 11px labels (art-direction
// typography table). Every value is real SI from physics-data.ts via hudStore;
// none of the tuned sim constants leak in.
//
// Layout = four corner clusters + top-center RADIATION TRANSIT banner + full-screen
// respawn veil + crafted cursor. aria-live="off": values update too frequently for
// polite announcements (spec Task 15 a11y floor — a static summary region lives
// there, not here).
//
// Reads hudStore (10Hz); the cursor + veil mutate DOM directly so cursor motion
// stays smooth independent of the 10Hz store cadence.

import { useEffect, useRef, useState } from 'react';
import { useHudStore, DISPLAY_RATE } from './hudStore';
import { useApproachStore } from './approachStore';
import { hudBreathState, dilationEmphasis, TRAN_THRESHOLD } from './breath';
import { input, type InputSource } from '../flight/input';
import { PULSAR } from './physics-data';
import './hud.css';

const HINTS: Record<InputSource, string> = {
  kbd: 'WASD THRUST · ↑↓ PITCH · ←→ YAW · Q/E ROLL · SHIFT BOOST · SPACE BRAKE · C ACCEPT',
  pad: 'STICKS MOVE/LOOK · RB BOOST · LB BRAKE · A ACCEPT',
  touch: 'LEFT HALF THRUST/STRAFE · RIGHT HALF LOOK',
};

// finding 7: NaN/Infinity guard + clamp. sci(NaN) would render the literal "NaN";
// pct(<0|>1) would render a nonsense %. Currently unreachable (rKm≥rs, fuel
// clamped upstream) but the formatter is the wrong layer to discover that from —
// guard here so a future caller change can't surface it as "NaN" on the HUD.
const sci = (x: number) => (!isFinite(x) ? '—' : x === 0 ? '0' : x.toExponential(2));
const pct = (f: number) => `${Math.round((f < 0 ? 0 : f > 1 ? 1 : f) * 100)}`;

export function Telemetry() {
  const s = useHudStore();
  const approaching = useApproachStore((a) => a.open); // approach target active (5 Hz store)
  const transit = s.beamTransit > TRAN_THRESHOLD;
  // W5: HUD breathing (rest/approach/danger) + time-dilation emphasis drive two
  // data-attrs on the root; both computed from existing 10 Hz store values.
  const breath = hudBreathState(approaching, s.beamTransit);
  const dilated = dilationEmphasis(s.dilation);
  const spinHz = 1 / PULSAR.periodS; // ≈160.8 Hz — real sonification tone

  return (
    <div
      className="hud-root"
      aria-live="off"
      aria-atomic="false"
      data-breath={breath}
      data-dilated={dilated || undefined}
    >
      {/* TL — pulsar identity (static content) */}
      <div className="hud-cluster hud-tl">
        <div className="hud-row">
          <span className="hud-label">Pulsar</span>
          <span className="hud-val">THE EMBER · {PULSAR.name}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Spin</span>
          <span className="hud-val">
            {(PULSAR.periodS * 1000).toFixed(2)} ms · {spinHz.toFixed(1)} Hz
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Display</span>
          <span className="hud-val">1 : {DISPLAY_RATE}</span>
        </div>
      </div>

      {/* TR — region + surface gravity */}
      <div className="hud-cluster hud-tr">
        <div className="hud-row">
          <span className="hud-label">Region</span>
          <span className="hud-val">{s.region.toUpperCase()}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">g_surface</span>
          <span className="hud-val">{sci(s.surfaceG)} m/s²</span>
        </div>
        {s.mission && (
          <div className="hud-row">
            <span className="hud-label">Mission</span>
            <span className="hud-val">{s.mission}</span>
          </div>
        )}
      </div>

      {/* BL — craft kinematics */}
      <div className="hud-cluster hud-bl">
        <div className="hud-row">
          <span className="hud-label">R</span>
          <span className="hud-val">{s.rKm.toFixed(0)} km</span>
          <span className="hud-label" style={{ marginLeft: 12 }}>
            v
          </span>
          <span className="hud-val">{s.speed.toFixed(1)} km/s</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Tidal Δa</span>
          <span className="hud-val">{sci(s.tidalG)} m/s²</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Fuel</span>
          <span className={`hud-val${s.lowFuel ? ' hud-pulse' : ''}`}>{pct(s.fuel)}%</span>
        </div>
      </div>

      {/* BR — time dilation + transit value + control hints */}
      <div className="hud-cluster hud-br">
        <div className="hud-row">
          <span className="hud-label">t_surface</span>
          <span className="hud-val">{s.dilationSurface.toFixed(4)}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">t_you</span>
          <span className={`hud-val${dilated ? ' hud-dilation' : ''}`}>
            {s.dilation.toFixed(4)}
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Beam</span>
          <span className={`hud-val${transit ? ' hud-pulse' : ''}`}>
            {transit ? 'TRANSIT' : 'clear'}
          </span>
        </div>
        <div className="hud-row" style={{ marginTop: 6, color: 'var(--ui-dim)' }}>
          {HINTS[input.lastSource]}
        </div>
      </div>

      {transit && <div className="hud-transit">▲ Radiation Transit</div>}

      {/* Mission offer banner (UX P0): the offered state was invisible — the whole
          courier chain was undiscoverable. Suppressed during a beam transit so the
          two top-center banners never stack. */}
      {!transit && s.offer && <div className="hud-offer">◆ {s.offer}</div>}

      <KillVeil opacity={s.killFlash} />
      <CraftCursor />
    </div>
  );
}

// Respawn white-in veil — opacity driven by killFlash (sampled 10Hz in the store).
// A 600ms ramp has ~6 samples; opacity steps are invisible on a fade.
function KillVeil({ opacity }: { opacity: number }) {
  return <div className="hud-veil" style={{ opacity }} />;
}

// Crafted cursor (dot + soft ring). Position + thrust scale mutate DOM directly
// (rAF) — never React state — so motion is per-frame smooth, not 10Hz-stepped.
// Disabled on touch (CSS) and reduced-motion (no thrust scaling).
function CraftCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (reduce || coarse) return; // keep native cursor

    setEnabled(true);
    document.body.classList.add('hud-cursor-active');

    let x = -100,
      y = -100;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
    };
    const loop = () => {
      // Read the ref each tick: the element mounts only after setEnabled(true)
      // re-renders, so dotRef.current is null on the first loop pass.
      const el = dotRef.current;
      if (el) {
        const sc = 1 + Math.max(0, input.thrust) * 1.4; // ring swells with forward thrust
        el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${sc})`;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
      document.body.classList.remove('hud-cursor-active');
    };
  }, []);

  if (!enabled) return null;
  return <div ref={dotRef} className="hud-cursor" />;
}
