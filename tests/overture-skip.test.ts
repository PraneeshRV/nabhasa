// Overture skip — accelerated scrub to handover + prefers-reduced-motion bypass
// (spec §Architecture / §Error-handling). Pure: no three, no R3F. The scrub math
// is the "≤2 s to handover, not a hard cut" contract; the reduced-motion check is
// the "no overture at all" branch. Both are decision inputs the R3F component / App
// consume — this module owns no DOM listeners here (those live in Overture.tsx so
// they attach only in a real browser, not under node tests).
import { describe, it, expect, afterEach } from 'vitest';
import {
  SKIP_DURATION_S,
  scrubRate,
  scrubAdvance,
  prefersReducedMotion,
} from '../src/overture/skip';

const ORIGINAL = (globalThis as { matchMedia?: unknown }).matchMedia;
afterEach(() => {
  // Restore / remove the matchMedia stub between reduced-motion cases.
  if (ORIGINAL === undefined) delete (globalThis as { matchMedia?: unknown }).matchMedia;
  else (globalThis as { matchMedia?: unknown }).matchMedia = ORIGINAL;
});

function stubMatchMedia(matches: boolean): void {
  (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia = (_q: string) => ({
    matches,
  });
}

describe('SKIP_DURATION_S — the ≤2 s handover budget', () => {
  it('is at most 2 s (spec: accelerated scrub ≤2 s to handover)', () => {
    expect(SKIP_DURATION_S).toBeLessThanOrEqual(2);
  });
});

describe('scrubRate — finishes the remaining rail in SKIP_DURATION_S', () => {
  it('rate = (1 − skipStartT) / SKIP_DURATION_S', () => {
    expect(scrubRate(0)).toBeCloseTo(1 / SKIP_DURATION_S, 6);
    expect(scrubRate(0.5)).toBeCloseTo(0.5 / SKIP_DURATION_S, 6);
    expect(scrubRate(0.9)).toBeCloseTo(0.1 / SKIP_DURATION_S, 6);
  });

  it('rate is positive for any in-progress t and never negative (no backwards scrub)', () => {
    for (let i = 0; i <= 99; i++) {
      const r = scrubRate(i / 100);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('scrubAdvance — skip-from-any-t reaches handover within budget, no hard cut', () => {
  it('from any start t, SKIP_DURATION_S of real dt lands exactly on 1', () => {
    for (let i = 0; i <= 9; i++) {
      const t0 = i / 10;
      const tEnd = scrubAdvance(t0, SKIP_DURATION_S, t0);
      expect(tEnd).toBeCloseTo(1, 6);
    }
  });

  it('is monotonic and clamps to [0,1] (a huge dt never overshoots past 1)', () => {
    const t0 = 0.5;
    const a = scrubAdvance(t0, 0.01, t0);
    const b = scrubAdvance(t0, 0.1, t0);
    expect(b).toBeGreaterThan(a);
    expect(scrubAdvance(t0, 1e9, t0)).toBe(1); // clamped, never > 1
  });

  it('is NOT a hard cut — a single small dt advances a little, not to the end', () => {
    const t = scrubAdvance(0.5, 1 / 60, 0.5); // one frame at 60fps
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(1);
  });

  it('already-at-handover stays at 1 (idempotent at the end)', () => {
    expect(scrubAdvance(1, 0.5, 1)).toBe(1);
  });
});

describe('prefersReducedMotion — the bypass branch (no overture → straight to flight/static)', () => {
  it('returns true when the OS pref requests reduce', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when the OS pref does not request reduce', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns false (never throws) when matchMedia is absent — e.g. node / old SSR', () => {
    delete (globalThis as { matchMedia?: unknown }).matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns false (never throws) when matchMedia itself throws — the bound-call guard', () => {
    // Browser constraint (NOT reproducible under node): calling matchMedia detached
    // from its globalThis — `const mm = g.matchMedia; mm(q)` — throws
    // `TypeError: Illegal invocation` because the host method requires `this` to be
    // the window. skip.ts calls `g.matchMedia(q)` (read + call on the SAME reference)
    // so the throw never fires in a real browser; this stub simulates a throwing
    // matchMedia and asserts the catch returns false instead of propagating.
    (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia = () => {
      throw new TypeError('Illegal invocation');
    };
    expect(prefersReducedMotion()).toBe(false);
  });
});
