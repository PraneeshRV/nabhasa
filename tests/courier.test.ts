import { describe, it, expect } from 'vitest';
import {
  reduce,
  tick,
  computeScore,
  drainFuel,
  fuelFraction,
  reachedDestination,
  missionToOffer,
  missionById,
  MISSIONS,
  initialCourierState,
  DELIVER_RADIUS,
  type CourierState,
  type Mission,
} from '../src/game/courier';
import { REACH_SYSTEM } from '../src/world/planets';

const T: Mission = { id: 't', name: 'T', from: [0, 0, 0], to: [0, 0, 0], fuelBudget: 1, par: 60 };

describe('courier FSM — legal transitions', () => {
  it('idle --offer--> offered', () => {
    const s = reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] });
    expect(s.status).toBe('offered');
    expect(s.missionId).toBe(MISSIONS[0].id);
    expect(s.budget).toBe(MISSIONS[0].fuelBudget);
  });

  it('offered --accept--> active (fuel topped to budget, time reset)', () => {
    const offered = reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] });
    const active = reduce(offered, { type: 'accept' });
    expect(active.status).toBe('active');
    expect(active.fuel).toBe(MISSIONS[0].fuelBudget);
    expect(active.budget).toBe(MISSIONS[0].fuelBudget);
    expect(active.timeS).toBe(0);
  });

  it('offered --decline--> idle', () => {
    const offered = reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] });
    expect(reduce(offered, { type: 'decline' }).status).toBe('idle');
  });

  it('abandon lands idle from both offered and active', () => {
    const offered = reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] });
    const active = reduce(offered, { type: 'accept' });
    expect(reduce(offered, { type: 'abandon' }).status).toBe('idle');
    expect(reduce(active, { type: 'abandon' }).status).toBe('idle');
    // abandon from active also restores the free-flight tank
    expect(reduce(active, { type: 'abandon' }).fuel).toBe(1);
  });

  it('delivered only from active', () => {
    const offered = reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] });
    const active = reduce(offered, { type: 'accept' });
    expect(reduce(active, { type: 'deliver' }).status).toBe('delivered');
    // illegal sources are no-ops
    expect(reduce(initialCourierState, { type: 'deliver' }).status).toBe('idle');
    expect(reduce(offered, { type: 'deliver' }).status).toBe('offered');
  });

  it('fail only from active, records reason', () => {
    expect(reduce(initialCourierState, { type: 'fail', reason: 'fuel' }).status).toBe('idle');
    const active = reduce(reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] }), { type: 'accept' });
    const failed = reduce(active, { type: 'fail', reason: 'destroyed' });
    expect(failed.status).toBe('failed');
    expect(failed.failReason).toBe('destroyed');
  });

  it('reset lands idle; delivered advances the unlock pointer, failed retries same', () => {
    const delivered = reduce(
      reduce(reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] }), { type: 'accept' }),
      { type: 'deliver' },
    );
    const afterDeliver = reduce(delivered, { type: 'reset' });
    expect(afterDeliver.status).toBe('idle');
    expect(afterDeliver.unlockedIndex).toBe(1);

    const failed = reduce(
      reduce(reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] }), { type: 'accept' }),
      { type: 'fail', reason: 'fuel' },
    );
    const afterFail = reduce(failed, { type: 'reset' });
    expect(afterFail.status).toBe('idle');
    expect(afterFail.unlockedIndex).toBe(0); // retry the same mission
  });
});

describe('courier FSM — illegal transitions are no-ops', () => {
  it('accept/decline/deliver/fail/reset from idle leave state unchanged', () => {
    for (const a of [
      { type: 'accept' },
      { type: 'decline' },
      { type: 'deliver' },
      { type: 'fail', reason: 'fuel' as const },
      { type: 'reset' },
    ]) {
      expect(reduce(initialCourierState, a as any)).toEqual(initialCourierState);
    }
  });

  it('offer from a non-idle state is rejected', () => {
    const offered = reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] });
    const second = reduce(offered, { type: 'offer', mission: MISSIONS[1] });
    expect(second.missionId).toBe(MISSIONS[0].id); // first offer kept
  });
});

describe('score formula', () => {
  it('fuelFrac=0.5, time=par → 1000 (spec fixture)', () => {
    expect(computeScore({ ...T, par: 60 }, 0.5, 60)).toBe(1000);
  });

  it('faster than par adds bonus; slower subtracts; clamp + time>0 guard', () => {
    expect(computeScore({ ...T, par: 60 }, 1, 30)).toBe(1000 + 500 * 2); // par/time = 2
    expect(computeScore({ ...T, par: 60 }, 1, 120)).toBe(1000 + 250); // par/time = 0.5
    expect(computeScore({ ...T, par: 60 }, 0, 60)).toBe(500); // no fuel, but time bonus stands (no fuel-gate in formula)
    expect(computeScore({ ...T, par: 60 }, 1, 0)).toBe(1000); // degenerate 0s → no time bonus
    expect(computeScore({ ...T, par: 60 }, -1, 60)).toBe(500); // fuelFrac clamped to 0; time bonus stands
  });
});

describe('fuel drain + fraction', () => {
  it('drains on forward thrust only, clamps at 0', () => {
    expect(drainFuel(0.5, 1, 10)).toBe(0.4); // 0.5 - 1·10·0.01
    expect(drainFuel(0.5, 2, 10)).toBe(0.3); // thrust scales linearly
    expect(drainFuel(0.5, -1, 10)).toBe(0.5); // reverse thrust is free
    expect(drainFuel(0.05, 1, 10)).toBe(0); // clamped
  });

  it('fuelFraction = remaining / budget, clamped 0..1', () => {
    expect(fuelFraction({ ...initialCourierState, fuel: 0.35, budget: 0.7, status: 'active' })).toBeCloseTo(0.5);
    expect(fuelFraction({ ...initialCourierState, fuel: 1, budget: 0.7, status: 'active' })).toBe(1);
  });

  it('drain action advances time and auto-fails at 0 fuel', () => {
    const active = reduce(
      reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] }),
      { type: 'accept' },
    );
    const after = reduce(active, { type: 'drain', dt: 1, thrust: 1 });
    expect(after.timeS).toBe(1);
    expect(after.fuel).toBeLessThan(active.fuel);
    expect(after.status).toBe('active');

    const nearEmpty = { ...active, fuel: 0.005 };
    const failed = reduce(nearEmpty, { type: 'drain', dt: 1, thrust: 1 });
    expect(failed.status).toBe('failed');
    expect(failed.failReason).toBe('fuel');
  });
});

describe('proximity sensing', () => {
  it('reachedDestination within DELIVER_RADIUS', () => {
    const m = MISSIONS[0];
    expect(reachedDestination(m, m.to)).toBe(true);
    expect(reachedDestination(m, [m.to[0] + DELIVER_RADIUS, m.to[1], m.to[2]])).toBe(true);
    expect(reachedDestination(m, [m.to[0] + DELIVER_RADIUS + 1, m.to[1], m.to[2]])).toBe(false);
  });

  it('missionToOffer: idle near source beacon offers next mission; else null', () => {
    const m1 = MISSIONS[0];
    expect(missionToOffer(initialCourierState, m1.from)?.id).toBe(m1.id);
    expect(missionToOffer(initialCourierState, [0, 0, 0])).toBeNull();
    // not idle → no offer
    const offered = reduce(initialCourierState, { type: 'offer', mission: m1 });
    expect(missionToOffer(offered, m1.from)).toBeNull();
  });

  it('delivering m1 unlocks m2, offered in place at its chained source', () => {
    const delivered = reduce(
      reduce(reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] }), { type: 'accept' }),
      { type: 'deliver' },
    );
    const idle2 = reduce(delivered, { type: 'reset' });
    expect(idle2.unlockedIndex).toBe(1);
    // m2.from == m1.to (chained) → standing at the delivery point offers m2
    expect(missionToOffer(idle2, MISSIONS[1].from)?.id).toBe(MISSIONS[1].id);
  });

  it('all 5 missions chain from→to and m1.from is the spawn point', () => {
    expect(MISSIONS[0].from).toEqual([600, 80, 0]); // == Craft RESPAWN_POS
    for (let i = 0; i < MISSIONS.length - 1; i++) {
      expect(MISSIONS[i].to).toEqual(MISSIONS[i + 1].from);
    }
    expect(missionById(MISSIONS[4].id)?.name).toBe('To the Door');
  });
});

describe('tick — per-step integration', () => {
  const active = (): CourierState =>
    reduce(reduce(initialCourierState, { type: 'offer', mission: MISSIONS[0] }), { type: 'accept' });

  it('drains fuel + advances time while active, emits nothing mid-flight', () => {
    const before = active();
    const { state, events } = tick(before, { pos: [0, 0, 0], thrust: 1, dt: 2 });
    expect(state.fuel).toBeLessThan(before.fuel);
    expect(state.timeS).toBe(2);
    expect(events).toEqual([]);
  });

  it('emits offered when idle at a source beacon', () => {
    const { state, events } = tick(initialCourierState, {
      pos: MISSIONS[0].from,
      thrust: 0,
      dt: 1,
    });
    expect(events).toEqual(['offered']);
    expect(state.status).toBe('offered');
  });

  it('emits delivered when active and reaching destination', () => {
    const { state, events } = tick(active(), { pos: MISSIONS[0].to, thrust: 0, dt: 1 });
    expect(events).toEqual(['delivered']);
    expect(state.status).toBe('delivered');
  });

  it('emits failed on fuel exhaustion', () => {
    const low = { ...active(), fuel: 0.005 };
    const { state, events } = tick(low, { pos: [0, 0, 0], thrust: 1, dt: 1 });
    expect(events).toEqual(['failed']);
    expect(state.status).toBe('failed');
    expect(state.failReason).toBe('fuel');
  });
});

describe('MISSIONS — Kindled delivery contract (A2 P4)', () => {
  it('has exactly 5 missions with pinned ids', () => {
    expect(MISSIONS).toHaveLength(5);
    expect(MISSIONS.map((m) => m.id)).toEqual([
      'm1-emberlight',
      'm2-archive',
      'm3-forge',
      'm4-ruins',
      'm5-gate',
    ]);
  });

  it('each destination sits on its named world\'s orbit shell (xz radius ≈ REACH_SYSTEM orbitWu, ±1 wu)', () => {
    // Beacons are placed via shell(orbitWu, az, y): x,z encode the orbital
    // radius in the orbital plane; y is a gameplay ELEVATION above the plane
    // (Praesidium y=40, Kiln y=80 — beacon/spawn height), NOT part of the
    // orbital radius. So the contract check is the xz-plane radius
    // Math.hypot(x,z) ≈ orbitWu; full-3D hypot(x,y,z) would falsely flag the
    // elevated beacons. Destinations chain the canon content-world sentence:
    // Praesidium → Aletheia → Kiln → Vesper → Threshold.
    const dest: Array<{ id: string; world: string }> = [
      { id: 'm1-emberlight', world: 'Praesidium' },
      { id: 'm2-archive', world: 'Aletheia' },
      { id: 'm3-forge', world: 'Kiln' },
      { id: 'm4-ruins', world: 'Vesper' },
      { id: 'm5-gate', world: 'Threshold' },
    ];
    for (const { id, world } of dest) {
      const m = missionById(id);
      expect(m, `mission ${id} exists`).toBeDefined();
      const spec = REACH_SYSTEM.find((w) => w.name === world);
      expect(spec, `REACH_SYSTEM world ${world}`).toBeDefined();
      const [x, , z] = m!.to;
      const orbitalRadius = Math.hypot(x, z);
      expect(orbitalRadius).toBeGreaterThan(spec!.orbitWu - 1);
      expect(orbitalRadius).toBeLessThan(spec!.orbitWu + 1);
    }
  });
});
