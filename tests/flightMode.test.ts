// Flight mode store (re-fly gate 2026-07-15): explorer (assist, DEFAULT) vs
// pilot (full sim). The physics consequences live in Craft's Rapier hook (not
// node-testable); this pins the contract the hook keys off: the default that
// every visitor lands in, and the toggle the V key / HUD row dispatch.
import { describe, it, expect, afterEach } from 'vitest';
import { useFlightModeStore } from '../src/flight/flightMode';

describe('flightMode store', () => {
  // Reset AFTER each test (never before): the first test must see the untouched
  // module default — a beforeEach set('explorer') would mask a broken default.
  afterEach(() => useFlightModeStore.getState().set('explorer'));

  it('defaults to explorer — portfolio visitors get assisted flight, not orbital mechanics', () => {
    // First test in the file, no prior mutation: this IS the create() default.
    // If the default ever flips to 'pilot' this fails.
    expect(useFlightModeStore.getState().mode).toBe('explorer');
  });

  it('toggle flips explorer → pilot → explorer', () => {
    useFlightModeStore.getState().toggle();
    expect(useFlightModeStore.getState().mode).toBe('pilot');
    useFlightModeStore.getState().toggle();
    expect(useFlightModeStore.getState().mode).toBe('explorer');
  });

  it('set() forces a specific mode', () => {
    useFlightModeStore.getState().set('pilot');
    expect(useFlightModeStore.getState().mode).toBe('pilot');
  });
});
