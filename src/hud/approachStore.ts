// Approach-triggered panel store (A2 P3b). Mirrors hudStore.ts: a throttled
// zustand sink driven by a null-rendering <useFrame> leaf (<ApproachSampler/>)
// mounted inside <NabhasaCanvas>. The leaf samples craftState.pos at ~5Hz
// (approach is a slow proximity check — 5Hz is plenty, half the HUD's 10Hz),
// asks nearestContentWorld() which content world is nearest, and opens/clears
// the store as the craft enters/leaves APPROACH_RADIUS.
//
// Single source of copy = src/content/portfolio.json; ApproachPanel reads THIS
// store (open/slot/world) and binds the JSON section. No per-frame React state —
// same invariant as hudStore. Sampler is null-safe: nearestContentWorld returns
// null when no content world is in range (or positions are absent — static tier
// never mounts this leaf anyway) ⇒ store stays closed, no crash.

import { create } from 'zustand';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { craftState } from '../flight/craftState';
import { nearestContentWorld, APPROACH_RADIUS } from '../world/LichPlanets';

// Content slot keys — the five portfolio sections (planets.ts contentSlot union,
// portfolio.json keys). Brace/Riven/Corona have no slot ⇒ never open.
export type Slot = 'About' | 'Research' | 'Projects' | 'Experience' | 'Contact';

export interface ApproachState {
  open: boolean;
  slot: Slot | null;
  world: string | null;
  // ESC-dismissed world name: the sampler must not re-open this world while the
  // craft is still inside APPROACH_RADIUS; cleared once the craft leaves range.
  dismissed: string | null;
  // Event-opened panel (m5 finale Contact): the live Threshold drifts far from
  // the fixed delivery beacon, so proximity can neither open nor close it — the
  // sampler skips entirely while pinned; ESC is the only dismiss.
  pinned: boolean;
  set: (s: Partial<ApproachState>) => void;
}

export const useApproachStore = create<ApproachState>((set) => ({
  open: false,
  slot: null,
  world: null,
  dismissed: null,
  pinned: false,
  set: (s) => set(s),
}));

// ~5Hz cadence (half the HUD's 10Hz — proximity changes slowly).
const APPROACH_DT = 1 / 5;

// Null-rendering sampler leaf. Mounted in <NabhasaCanvas> next to <HudSampler/>.
// Reads craftState.pos (the same leaf hudStore's sampler reads), calls
// nearestContentWorld, and writes the store only on a real change so the DOM
// panel does not rerender every tick while hovering at fixed range.
export function ApproachSampler() {
  const acc = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // clamp per Global Constraints (mirrors HudSampler)
    acc.current += dt;
    if (acc.current < APPROACH_DT) return;
    acc.current -= APPROACH_DT;

    const near = nearestContentWorld(craftState.pos);
    const store = useApproachStore.getState();
    if (store.pinned) return; // event-opened finale panel: proximity hands off, ESC owns dismiss
    if (near && near.dist < APPROACH_RADIUS) {
      if (store.dismissed === near.name) return; // ESC'd this world; stays shut until out of range
      // nearestContentWorld.slot is widened to string; only content-bearing worlds
      // (contentSlot union) reach here, so the cast is sound.
      const slot = near.slot as Slot;
      if (!(store.open && store.slot === slot && store.world === near.name)) {
        // opening a different world also clears any stale dismissal
        store.set({ open: true, slot, world: near.name, dismissed: null });
      }
    } else if (store.open || store.dismissed) {
      store.set({ open: false, slot: null, world: null, dismissed: null });
    }
  });
  return null;
}
