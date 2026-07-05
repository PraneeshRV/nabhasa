// Shareable result card (spec Task 12). Shown on mission delivery. Renders a
// DOM overlay on the void palette, then on Share draws the same composition to
// an offscreen <canvas> → PNG → navigator.share (mobile) or download fallback.
// Pure DOM + canvas 2D — no three — so it ships on every tier incl. webgl2.
//
// Palette (art-direction): void #030407, star-hot accent #AFE3FF, ui-cold #8A93A6.
// Type: Space Grotesk (display) + JetBrains Mono (telemetry), self-hosted Task 13.

import { useState, useCallback, type CSSProperties } from 'react';
import type { Mission, Vec3 } from './courier';

const VOID = '#030407';
const ACCENT = '#AFE3FF';
const COLD = '#8A93A6';

export interface ResultCardProps {
  mission: Mission;
  fuelFrac: number; // 0..1 remaining
  timeS: number;
  score: number;
  best: boolean; // new personal best?
  trajectory?: readonly Vec3[]; // optional craft trace (xz-plane projection)
  onDismiss: () => void;
}

// ---- offscreen card renderer (1200×675 social size) -------------------------
export function drawResultCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    mission: Mission;
    fuelFrac: number;
    timeS: number;
    score: number;
    best: boolean;
    trajectory?: readonly Vec3[];
  },
): void {
  const W = 1200;
  const H = 675;

  // void fill
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, W, H);

  // star glow, lower-left
  const gx = 300;
  const gy = H - 180;
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 460);
  grad.addColorStop(0, 'rgba(175,227,255,0.55)');
  grad.addColorStop(0.25, 'rgba(175,227,255,0.12)');
  grad.addColorStop(1, 'rgba(175,227,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // star core
  ctx.beginPath();
  ctx.arc(gx, gy, 14, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();

  // trajectory trace
  drawTrajectory(ctx, W, H, opts.trajectory);

  // text block, right side
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLD;
  ctx.font = '500 22px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('NABHASA · COURIER', 720, 96);
  if (opts.best) {
    ctx.fillStyle = ACCENT;
    ctx.fillText('★ NEW BEST', 720, 128);
  }

  ctx.fillStyle = '#fff';
  ctx.font = '600 40px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(opts.mission.name.toUpperCase(), 720, 168);

  ctx.fillStyle = COLD;
  ctx.font = '400 18px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`FUEL ${Math.round(opts.fuelFrac * 100)}%   ·   TIME ${opts.timeS.toFixed(1)}s   ·   PAR ${opts.mission.par}s`, 720, 224);

  ctx.fillStyle = ACCENT;
  ctx.font = '700 120px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(String(opts.score), 720, 300);

  ctx.fillStyle = COLD;
  ctx.font = '400 16px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('nabhasa · neutron-star courier', 720, H - 60);
}

function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  trajectory: readonly Vec3[] | undefined,
): void {
  // trace panel: left half, leaving the star glow visible
  const pad = 80;
  const left = pad;
  const top = pad;
  const right = 640;
  const bottom = H - pad;

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(175,227,255,0.55)';

  if (trajectory && trajectory.length >= 2) {
    // project x→px, z→py into the panel from the trace's own bounds
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of trajectory) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
    const sx = (right - left) / Math.max(1e-6, maxX - minX);
    const sz = (bottom - top) / Math.max(1e-6, maxZ - minZ);
    const px = (p: Vec3) => left + (p[0] - minX) * sx;
    const py = (p: Vec3) => top + (p[2] - minZ) * sz;

    ctx.beginPath();
    ctx.moveTo(px(trajectory[0]), py(trajectory[0]));
    for (let i = 1; i < trajectory.length; i++) ctx.lineTo(px(trajectory[i]), py(trajectory[i]));
    ctx.stroke();

    // destination dot
    const last = trajectory[trajectory.length - 1];
    ctx.beginPath();
    ctx.arc(px(last), py(last), 5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
  } else {
    // stylized slingshot arc: shallow dive toward the star then climb out
    ctx.beginPath();
    ctx.moveTo(left, top + 60);
    ctx.quadraticCurveTo((left + right) / 2, bottom - 40, right, top + 120);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(right, top + 120, 5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
  }
}

async function toPNG(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function ResultCard({ mission, fuelFrac, timeS, score, best, trajectory, onDismiss }: ResultCardProps) {
  const [status, setStatus] = useState<'idle' | 'sharing' | 'shared' | 'unsupported'>('idle');

  const share = useCallback(async () => {
    setStatus('sharing');
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setStatus('unsupported');
      return;
    }
    // best-effort: wait for the display fonts so canvas text matches the page
    try {
      await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    } catch {
      /* fonts optional */
    }
    drawResultCard(ctx, { mission, fuelFrac, timeS, score, best, trajectory });
    const blob = await toPNG(canvas);
    if (!blob) {
      setStatus('unsupported');
      return;
    }

    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
      share?: (d: ShareData) => Promise<void>;
    };
    const file = new File([blob], `nabhasa-${mission.id}.png`, { type: 'image/png' });
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title: 'Nabhasa', text: `${mission.name} — ${score} pts` });
        setStatus('shared');
        return;
      } catch {
        // user cancelled or share failed → fall through to download
      }
    }
    // download fallback. Firefox requires the anchor be connected to the DOM to
    // trigger the download (Chrome tolerates a detached node); append → click → remove.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nabhasa-${mission.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('shared');
  }, [mission, fuelFrac, timeS, score, best, trajectory]);

  const vsPar = timeS <= mission.par ? `${(mission.par - timeS).toFixed(1)}s under par` : `${(timeS - mission.par).toFixed(1)}s over par`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mission complete: ${mission.name}`}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(3,4,7,0.92)',
        zIndex: 50,
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        color: '#fff',
      }}
    >
      <div
        style={{
          width: 'min(560px, 92vw)',
          padding: '40px 36px',
          borderRadius: 4,
          border: `1px solid ${ACCENT}`,
          background: VOID,
          boxShadow: '0 0 80px rgba(175,227,255,0.12)',
        }}
      >
        <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, letterSpacing: '0.18em', color: COLD }}>
          MISSION COMPLETE
        </div>
        <h2 style={{ margin: '12px 0 4px', fontSize: 34, fontWeight: 600 }}>{mission.name}</h2>
        {best && (
          <div style={{ color: ACCENT, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, letterSpacing: '0.1em' }}>
            ★ NEW BEST
          </div>
        )}
        <div style={{ fontSize: 84, fontWeight: 700, color: ACCENT, lineHeight: 1, margin: '24px 0 8px' }}>
          {score}
        </div>
        <div style={{ display: 'flex', gap: 24, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, color: COLD, marginBottom: 32 }}>
          <span>FUEL {Math.round(fuelFrac * 100)}%</span>
          <span>TIME {timeS.toFixed(1)}s</span>
          <span>{vsPar}</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={share}
            disabled={status === 'sharing'}
            style={btn(ACCENT, VOID)}
          >
            {status === 'sharing' ? '…' : status === 'shared' ? 'Saved ✓' : 'Share result'}
          </button>
          <button onClick={onDismiss} style={btn('transparent', COLD)}>
            Continue flight
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(fg: string, text: string): CSSProperties {
  return {
    flex: 1,
    padding: '14px 16px',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: 13,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: text,
    background: fg,
    border: `1px solid ${fg === 'transparent' ? COLD : fg}`,
    borderRadius: 3,
    cursor: 'pointer',
  };
}
