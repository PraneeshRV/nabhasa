import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFixedLoop } from '../src/core/loop';
import { input, attachInput } from '../src/flight/input';

describe('createFixedLoop', () => {
  it('accumulates: tick(0.05) at 60Hz ⇒ 3 steps', () => {
    const step = vi.fn();
    createFixedLoop(step, 60).tick(0.05);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('clamps huge dt: tick(2.0) ⇒ ≤2 steps (accumulator reset)', () => {
    const step = vi.fn();
    createFixedLoop(step, 60).tick(2.0);
    expect(step.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('returns an interpolation alpha in [0,1)', () => {
    const alpha = createFixedLoop(() => {}, 60).tick(0.05);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  });
});

describe('input (keyboard)', () => {
  // input is a module singleton — reset between tests.
  beforeEach(() => {
    Object.assign(input, {
      thrust: 0,
      strafe: 0,
      lift: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      boost: false,
      brake: false,
      interact: false,
      lastSource: 'kbd',
    });
  });

  function fakeEl() {
    const handlers: Record<string, (e: { code: string }) => void> = {};
    return {
      style: {},
      handlers,
      addEventListener: (t: string, h: (e: { code: string }) => void) => {
        handlers[t] = h;
      },
      removeEventListener: () => {},
    } as unknown as HTMLElement & { handlers: Record<string, (e: { code: string }) => void> };
  }

  it('KeyW keydown ⇒ thrust=1, keyup ⇒ resets to 0', () => {
    const el = fakeEl();
    attachInput(el);
    el.handlers.keydown({ code: 'KeyW' });
    expect(input.thrust).toBe(1);
    el.handlers.keyup({ code: 'KeyW' });
    expect(input.thrust).toBe(0);
  });

  it('KeyS ⇒ thrust=-1 (reverse)', () => {
    const el = fakeEl();
    attachInput(el);
    el.handlers.keydown({ code: 'KeyS' });
    expect(input.thrust).toBe(-1);
  });

  it('Shift ⇒ boost, Space ⇒ brake', () => {
    const el = fakeEl();
    attachInput(el);
    el.handlers.keydown({ code: 'ShiftLeft' });
    expect(input.boost).toBe(true);
    el.handlers.keydown({ code: 'Space' });
    expect(input.brake).toBe(true);
  });
});
