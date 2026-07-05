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
import { SWARM_CENTER } from '../world/scale';

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

// ---- 5 authored missions, escalating (straight → single assist → tight
// periapsis → beam-transit → swarm-threading finale) -------------------------
// from/to CHAIN: each mission's `to` is the next mission's `from`, and m1.from
// is the spawn point — so delivering one mission auto-offers the next in place.
// m5 threads into the Dyson swarm region (signature 4). Budgets tighten to
// reward assist flying over brute thrust.
export const MISSIONS: readonly Mission[] = [
  {
    id: 'm1-straight',
    name: 'Outbound Relay',
    from: [600, 80, 0], // == RESPAWN_POS (Craft.tsx): offered on first step
    to: [400, 60, 200],
    fuelBudget: 0.7,
    par: 45,
  },
  {
    id: 'm2-assist',
    name: 'Gravity Handoff',
    from: [400, 60, 200],
    to: [-300, 40, 0], // across the star — a single assist pays off
    fuelBudget: 0.55,
    par: 70,
  },
  {
    id: 'm3-periapsis',
    name: 'Close Pass',
    from: [-300, 40, 0],
    to: [120, 200, -120], // steep dive + tight periapsis slingshot
    fuelBudget: 0.4,
    par: 80,
  },
  {
    id: 'm4-beam',
    name: 'Beam Transit Run',
    from: [120, 200, -120],
    to: [700, -120, 300], // crosses the pulsar beam azimuth (radiation transit)
    fuelBudget: 0.45,
    par: 90,
  },
  {
    id: 'm5-swarm',
    name: 'Swarm Thread',
    from: [700, -120, 300],
    to: [SWARM_CENTER[0] + 20, SWARM_CENTER[1], SWARM_CENTER[2] + 100], // into the Dyson swarm
    fuelBudget: 0.5,
    par: 110,
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
