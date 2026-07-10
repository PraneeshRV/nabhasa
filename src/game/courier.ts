// Slingshot-courier missions (spec Task 12). Pure logic — no three/Rapier — so
// the FSM unit-tests in node and the game loop drives it. Game IS navigation:
// no separate mode, the craft's existing flight (Task 6) IS the courier flight.
//
// Vec3 = readonly [x,y,z] tuple (wu). Wiring converts craftState.pos (three
// Vector3) to a tuple at the step() call site. The craft's physics step calls
// useCourierStore.getState().step({pos, thrust, dt}) once per FIXED_DT; player
// intent (accept/decline/abandon/reset) is dispatched from input.interact.
//
// Fuel: ONLY the main forward engine drains, and only while a mission is
// active. Strafe/lift/reverse (RCS) and boost are free; gravity assists
// (thrust-free Δv) are the score lever — that divergence IS the game.
// Missions never lock free flight: idle = untouched tank (fuel stays 1).

import { create } from 'zustand';

export type Vec3 = readonly [number, number, number];

export type CourierStatus = 'idle' | 'offered' | 'active' | 'delivered' | 'failed';
export type FailReason = 'fuel' | 'destroyed';
export type CourierEvent = 'offered' | 'delivered' | 'failed';

export interface Mission {
  id: string;
  name: string;
  from: Vec3; // source beacon
  to: Vec3; // destination beacon
  fuelBudget: number; // 0..1 fuel allowance for this mission
  par: number; // par time (s) — beat it for a score bonus
}

export interface CourierState {
  status: CourierStatus;
  unlockedIndex: number; // next mission to offer (escalation pointer)
  missionId: string | null;
  fuel: number; // remaining budget while active; 1 when idle (synced to craftState.fuel by wiring)
  budget: number; // active mission's fuelBudget (denominator for fuelFraction)
  timeS: number; // elapsed active time
  failReason: FailReason | null;
}

export const initialCourierState: CourierState = {
  status: 'idle',
  unlockedIndex: 0,
  missionId: null,
  fuel: 1,
  budget: 1,
  timeS: 0,
  failReason: null,
};

// Fuel drain rate: full forward thrust (1.0) drains 1.0 of budget in 100s.
// Tunable — budgets below are sized so a naive full-burn exhausts the tank and
// a clean assist run leaves fuel to bank.
export const FUEL_DRAIN_RATE = 0.01;

// Beacon proximity radii (wu). Offer zone loose (beacons have a light pillar,
// visible from afar); delivery tight (must actually arrive).
export const OFFER_RADIUS = 40;
export const DELIVER_RADIUS = 25;

// ---- world-anchored waypoints (Amendment A2) --------------------------------
// Beacons sit ON the Reach worlds' orbit shells at fixed azimuths — Kindled
// deliveries route Praesidium → Aletheia → Kiln → Vesper → Threshold (the canon
// content-world sentence, skipping eye-candy Brace/Riven/Corona). SNAPSHOT
// constants (not live positions): the FSM stays pure + node-testable, the
// orbiting body is decorative, the beacon marks the orbit. Radii mirror
// planets.ts REACH_SYSTEM orbitWu (Praesidium 260 / Aletheia 400 / Kiln 560 /
// Vesper 1250 / Threshold 2700), duplicated here because courier is a
// three-free pure module (planets.ts pulls three/tsl). m1.from stays the spawn
// point (test-locked). m4's azimuth threads the Kiln→Vesper leg through the
// Dyson-swarm gap (centered (900,0,0), r=250) — the signature-4 payoff.
const shell = (r: number, az: number, y = 0): Vec3 => [
  Math.round(r * Math.cos(az)),
  y,
  Math.round(r * Math.sin(az)),
];
const W_PRAESIDIUM = shell(260, 0.4, 40); // ≈ [239,40,101] — the garden
const W_ALETHEIA = shell(400, Math.PI + 0.2, 0); // ≈ [-392,0,-79] — far side, across the star
const W_KILN = shell(560, 0.2, 80); // ≈ [549,80,111] — the forge
const W_VESPER = shell(1250, -0.2, 0); // ≈ [1225,0,-248] — the ruins (m4 threads the swarm)
const W_THRESHOLD = shell(2700, 0.3, 0); // ≈ [2579,0,798] — the gate

// ---- 5 Kindled deliveries, escalating (straight → single assist → tight
// periapsis → swarm-threading dark → outer gate run) -------------------------
// from/to CHAIN: each mission's `to` is the next mission's `from`, and m1.from
// is the spawn point — so delivering one mission auto-offers the next in place.
// m4 threads the swarm gap (forge→ruins); m5 lands on Threshold = the Contact
// gate (P3). Budgets tighten to reward assist flying over brute thrust.
export const MISSIONS: readonly Mission[] = [
  {
    id: 'm1-emberlight',
    name: 'Emberlight Outbound',
    from: [600, 80, 0], // == RESPAWN_POS (Craft.tsx): offered on first step
    to: W_PRAESIDIUM, // onto the garden's shell
    fuelBudget: 0.7,
    par: 50,
  },
  {
    id: 'm2-archive',
    name: 'The Archive Run',
    from: W_PRAESIDIUM,
    to: W_ALETHEIA, // across the star — a single assist pays off
    fuelBudget: 0.55,
    par: 80,
  },
  {
    id: 'm3-forge',
    name: 'Forge Handoff',
    from: W_ALETHEIA,
    to: W_KILN, // steep dive + tight periapsis slingshot en route
    fuelBudget: 0.4,
    par: 90,
  },
  {
    id: 'm4-ruins',
    name: 'The Long Dark',
    from: W_KILN,
    to: W_VESPER, // threads the Dyson-swarm gap (forge→ruins)
    fuelBudget: 0.45,
    par: 130,
  },
  {
    id: 'm5-gate',
    name: 'To the Door',
    from: W_VESPER,
    to: W_THRESHOLD, // the gate station (Contact) — finale
    fuelBudget: 0.5,
    par: 160,
  },
];

// ---- pure helpers (all unit-tested) -----------------------------------------
const dist = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function missionById(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

// Idle + within OFFER_RADIUS of the next mission's source beacon → that mission.
export function missionToOffer(state: CourierState, pos: Vec3): Mission | null {
  if (state.status !== 'idle') return null;
  const m = MISSIONS[state.unlockedIndex];
  if (!m) return null;
  return dist(m.from, pos) <= OFFER_RADIUS ? m : null;
}

export function reachedDestination(mission: Mission, pos: Vec3): boolean {
  return dist(mission.to, pos) <= DELIVER_RADIUS;
}

// fuel -= max(0,thrust)·dt·rate, clamped ≥ 0. Reverse thrust (negative) is free.
export function drainFuel(
  fuel: number,
  thrust: number,
  dt: number,
  rate: number = FUEL_DRAIN_RATE,
): number {
  return Math.max(0, fuel - Math.max(0, thrust) * dt * rate);
}

// Fraction of the active budget remaining (0..1), used for scoring + HUD.
export function fuelFraction(state: CourierState): number {
  return state.budget > 0 ? Math.min(1, state.fuel / state.budget) : 0;
}

// score = max(0, round(1000·fuelFrac + 500·max(0, par/time))). time>0 guard:
// a degenerate 0s delivery yields no time bonus (par/time would be +∞).
export function computeScore(mission: Mission, fuelFrac: number, timeS: number): number {
  const f = Math.max(0, Math.min(1, fuelFrac));
  const timeBonus = timeS > 0 ? Math.max(0, mission.par / timeS) : 0;
  return Math.max(0, Math.round(1000 * f + 500 * timeBonus));
}

// ---- FSM reducer (pure) ------------------------------------------------------
// Illegal transitions are no-ops (return prev). Legal map:
//   idle    --offer-->   offered
//   offered --accept-->  active      (fuel topped to budget, time reset)
//   offered --decline--> idle
//   offered|active --abandon--> idle
//   active  --deliver--> delivered   (fuel preserved for scoring)
//   active  --fail-->    failed
//   delivered|failed --reset--> idle (delivered advances unlockedIndex)
export type CourierAction =
  | { type: 'offer'; mission: Mission }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'abandon' }
  | { type: 'deliver' }
  | { type: 'fail'; reason: FailReason }
  | { type: 'reset' }
  | { type: 'drain'; dt: number; thrust: number };

export function reduce(prev: CourierState, action: CourierAction): CourierState {
  switch (action.type) {
    case 'offer': {
      if (prev.status !== 'idle') return prev;
      return {
        ...prev,
        status: 'offered',
        missionId: action.mission.id,
        budget: action.mission.fuelBudget,
        failReason: null,
      };
    }
    case 'accept': {
      if (prev.status !== 'offered' || !prev.missionId) return prev;
      const m = missionById(prev.missionId);
      if (!m) return prev;
      return {
        ...prev,
        status: 'active',
        fuel: m.fuelBudget,
        budget: m.fuelBudget,
        timeS: 0,
        failReason: null,
      };
    }
    case 'decline': {
      if (prev.status !== 'offered') return prev;
      return { ...prev, status: 'idle', missionId: null };
    }
    case 'abandon': {
      if (prev.status !== 'offered' && prev.status !== 'active') return prev;
      return { ...prev, status: 'idle', missionId: null, fuel: 1, budget: 1, timeS: 0, failReason: null };
    }
    case 'deliver': {
      if (prev.status !== 'active') return prev;
      return { ...prev, status: 'delivered' };
    }
    case 'fail': {
      if (prev.status !== 'active') return prev;
      return { ...prev, status: 'failed', failReason: action.reason };
    }
    case 'reset': {
      if (prev.status !== 'delivered' && prev.status !== 'failed') return prev;
      const advance = prev.status === 'delivered' ? 1 : 0; // delivered unlocks next; failed retries same
      return {
        ...initialCourierState,
        unlockedIndex: Math.min(MISSIONS.length, prev.unlockedIndex + advance),
      };
    }
    case 'drain': {
      if (prev.status !== 'active') return prev;
      const fuel = drainFuel(prev.fuel, action.thrust, action.dt);
      const timeS = prev.timeS + action.dt;
      if (fuel <= 0) return { ...prev, fuel: 0, timeS, status: 'failed', failReason: 'fuel' };
      return { ...prev, fuel, timeS };
    }
    default:
      return prev;
  }
}

// ---- per-step integration (sensing + drain, pure) ---------------------------
// Called once per physics step. Senses offer/delivery, drains fuel, auto-fails
// on fuel exhaustion. Does NOT sense destruction (kill) — Craft respawns before
// pos reflects it, so wiring dispatches {type:'fail',reason:'destroyed'} from
// the onKill callback instead.
export interface TickCtx {
  pos: Vec3;
  thrust: number;
  dt: number;
}

export function tick(prev: CourierState, ctx: TickCtx): { state: CourierState; events: CourierEvent[] } {
  const events: CourierEvent[] = [];
  let s = prev;

  const offer = missionToOffer(s, ctx.pos);
  if (offer) {
    s = reduce(s, { type: 'offer', mission: offer });
    if (s.status === 'offered') events.push('offered');
  }

  // An offer expires when the craft leaves the offer zone — otherwise `offered`
  // sticks forever and C "accepts" a mission whose beacon is out of sight
  // (UX finding). Re-entering the zone re-offers via missionToOffer above.
  if (s.status === 'offered' && s.missionId) {
    const m = missionById(s.missionId);
    if (m && dist(m.from, ctx.pos) > OFFER_RADIUS) s = reduce(s, { type: 'decline' });
  }

  if (s.status === 'active') {
    s = reduce(s, { type: 'drain', dt: ctx.dt, thrust: ctx.thrust });
    if (s.status === 'failed') {
      events.push('failed');
    } else {
      const m = s.missionId ? missionById(s.missionId) : null;
      if (m && reachedDestination(m, ctx.pos)) {
        s = reduce(s, { type: 'deliver' });
        if (s.status === 'delivered') events.push('delivered');
      }
    }
  }

  return { state: s, events };
}

// ---- observable store (wiring sugar — matches world/regions.ts idiom) --------
// The craft's physics step calls step(); intent UI calls reduce(); HUD/ResultCard
// select status/mission/fuel. getState() + set() is external-store mutation
// (same pattern Craft.tsx uses for useRegionStore), NOT React setState — safe
// inside useBeforePhysicsStep.
interface CourierStore extends CourierState {
  reduce: (a: CourierAction) => void;
  step: (ctx: TickCtx) => CourierEvent[];
}

export const useCourierStore = create<CourierStore>((set, get) => ({
  ...initialCourierState,
  reduce: (a) => set(reduce(get(), a)),
  step: (ctx) => {
    const { state, events } = tick(get(), ctx);
    set(state);
    return events;
  },
}));
