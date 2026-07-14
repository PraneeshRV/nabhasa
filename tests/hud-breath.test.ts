import { describe, it, expect } from 'vitest';
import {
  hudBreathState,
  dilationEmphasis,
  TRAN_THRESHOLD,
  DILATION_EMPHASIS_THRESHOLD,
} from '../src/hud/breath';

describe('hudBreathState — 3-state truth table', () => {
  it('rest when not approaching and no beam transit', () => {
    expect(hudBreathState(false, 0)).toBe('rest');
    expect(hudBreathState(false, 0.39)).toBe('rest');
  });

  it('approach when an approach target is active and no beam transit', () => {
    expect(hudBreathState(true, 0)).toBe('approach');
    expect(hudBreathState(true, 0.39)).toBe('approach');
  });

  it('danger when beam transit crosses the threshold', () => {
    expect(hudBreathState(false, 0.5)).toBe('danger');
    expect(hudBreathState(true, 0.5)).toBe('danger');
  });

  it('danger outranks approach (a radiation sweep is the louder hazard)', () => {
    expect(hudBreathState(true, 0.41)).toBe('danger');
  });

  it('threshold edge: 0.4 exactly is NOT danger (strict >)', () => {
    expect(hudBreathState(false, TRAN_THRESHOLD)).toBe('rest');
    expect(hudBreathState(true, TRAN_THRESHOLD)).toBe('approach');
  });

  it('just-above threshold IS danger', () => {
    expect(hudBreathState(false, TRAN_THRESHOLD + 1e-9)).toBe('danger');
  });
});

describe('dilationEmphasis — threshold mapping', () => {
  it('no emphasis at / above the floor (cruise, far from the star)', () => {
    expect(dilationEmphasis(1)).toBe(false);
    expect(dilationEmphasis(0.95)).toBe(false);
  });

  it('emphasis below the floor (near the star, time dilated)', () => {
    expect(dilationEmphasis(0.89)).toBe(true);
    expect(dilationEmphasis(0.766)).toBe(true); // ≈ surface clock rate
    expect(dilationEmphasis(0)).toBe(true);
  });

  it('threshold edge: 0.9 exactly is NOT emphasized (strict <)', () => {
    expect(dilationEmphasis(DILATION_EMPHASIS_THRESHOLD)).toBe(false);
  });

  it('just-below threshold IS emphasized', () => {
    expect(dilationEmphasis(DILATION_EMPHASIS_THRESHOLD - 1e-9)).toBe(true);
  });
});
