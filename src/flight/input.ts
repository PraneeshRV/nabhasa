// Unified input (spec Task 3). One shared state object polled once per frame —
// zero per-event React work. Keyboard + gamepad + touch merge per-axis with
// last-writer-wins; input.lastSource names the most recent active source for
// control-hint UI.
//
// Key map (spec Step 2): WASD + RF = translate, arrows + QE = rotate,
// Shift = boost, Space = brake, E = interact. E is listed for BOTH roll and
// interact in the spec — implemented verbatim: holding E drives roll=+1 AND
// interact=true. (Flagged for Praneesh; likely one of the two should move.)

export type InputSource = 'kbd' | 'pad' | 'touch';

export const input = {
  thrust: 0, // -1..1 (W/S)
  strafe: 0, // -1..1 (A/D)
  lift: 0, // -1..1 (R/F)
  pitch: 0, // -1..1 (↑/↓)
  yaw: 0, // -1..1 (←/→)
  roll: 0, // -1..1 (Q/E)
  boost: false, // Shift
  brake: false, // Space
  interact: false, // E
  lastSource: 'kbd' as InputSource,
};

const clamp1 = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

// ---- keyboard ----------------------------------------------------------------
const pressed = new Set<string>();

function recompute() {
  const has = (c: string) => pressed.has(c);
  input.thrust = (has('KeyW') ? 1 : 0) + (has('KeyS') ? -1 : 0);
  input.strafe = (has('KeyD') ? 1 : 0) + (has('KeyA') ? -1 : 0);
  input.lift = (has('KeyR') ? 1 : 0) + (has('KeyF') ? -1 : 0);
  input.pitch = (has('ArrowUp') ? 1 : 0) + (has('ArrowDown') ? -1 : 0);
  input.yaw = (has('ArrowRight') ? 1 : 0) + (has('ArrowLeft') ? -1 : 0);
  input.roll = (has('KeyE') ? 1 : 0) + (has('KeyQ') ? -1 : 0);
  input.boost = has('ShiftLeft') || has('ShiftRight');
  input.brake = has('Space');
  input.interact = has('KeyC'); // KeyE = roll; interact moved off the dual-bind (spec deviation #4, 2026-07-06)
  input.lastSource = 'kbd';
}

// ---- touch (two-zone: left = thrust/strafe stick, right = pitch/yaw drag) ----
type TouchState = { zone: 'l' | 'r'; sx: number; sy: number; cx: number; cy: number };
const touches = new Map<number, TouchState>();

function applyTouch(width: number) {
  const left = [...touches.values()].find((s) => s.zone === 'l');
  const right = [...touches.values()].find((s) => s.zone === 'r');
  const dz = 24; // px deadzone
  if (left) {
    const dx = left.cx - left.sx;
    const dy = left.cy - left.sy;
    input.strafe = Math.abs(dx) > dz ? clamp1(dx / 120) : 0;
    input.thrust = Math.abs(dy) > dz ? clamp1(-dy / 120) : 0; // drag up ⇒ forward
    input.lastSource = 'touch';
  } else {
    input.thrust = 0;
    input.strafe = 0;
  }
  if (right) {
    const dx = right.cx - right.sx;
    const dy = right.cy - right.sy;
    input.yaw = Math.abs(dx) > dz ? clamp1(dx / 160) : 0;
    input.pitch = Math.abs(dy) > dz ? clamp1(dy / 160) : 0;
    input.lastSource = 'touch';
  } else {
    input.pitch = 0;
    input.yaw = 0;
  }
}

export function attachInput(el: HTMLElement): () => void {
  el.style.touchAction = 'none';

  const onKeyDown = (e: KeyboardEvent) => {
    pressed.add(e.code);
    recompute();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    pressed.delete(e.code);
    recompute();
  };

  const width = () => (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const onTouchStart = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const zone = t.clientX < width() / 2 ? 'l' : 'r';
      touches.set(t.identifier, { zone, sx: t.clientX, sy: t.clientY, cx: t.clientX, cy: t.clientY });
    }
    applyTouch(width());
  };
  const onTouchMove = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const s = touches.get(t.identifier);
      if (s) {
        s.cx = t.clientX;
        s.cy = t.clientY;
      }
    }
    applyTouch(width());
  };
  const onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) touches.delete(t.identifier);
    applyTouch(width());
  };

  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('keyup', onKeyUp);
  el.addEventListener('touchstart', onTouchStart);
  el.addEventListener('touchmove', onTouchMove);
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);

  return () => {
    pressed.clear();
    touches.clear();
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('keyup', onKeyUp);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
  };
}

// ---- gamepad (standard mapping, polled each frame) ---------------------------
export function pollGamepad(): void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
  const pad = (navigator.getGamepads() ?? []).find(
    (p): p is Gamepad => !!p && p.mapping === 'standard',
  );
  if (!pad) return;

  const dz = 0.15;
  const ax = (i: number) => {
    const v = pad.axes[i] ?? 0;
    return Math.abs(v) < dz ? 0 : v;
  };
  const btn = (i: number) => pad.buttons[i]?.pressed ?? false;

  const thrust = clamp1(-ax(1)); // left stick Y (up = forward)
  const strafe = clamp1(ax(0)); // left stick X
  const pitch = clamp1(ax(3)); // right stick Y
  const yaw = clamp1(ax(2)); // right stick X
  const boost = btn(5) || btn(7); // RB / RT
  const brake = btn(4) || btn(6); // LB / LT
  const interact = btn(0); // A

  // last-writer-wins at the source level: only write when the pad is active,
  // so an idle pad never clobbers keyboard state.
  if (thrust || strafe || pitch || yaw || boost || brake || interact) {
    input.thrust = thrust;
    input.strafe = strafe;
    input.pitch = pitch;
    input.yaw = yaw;
    input.boost = boost;
    input.brake = brake;
    input.interact = interact;
    input.lastSource = 'pad';
  }
}
