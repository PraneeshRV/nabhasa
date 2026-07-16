import { describe, it, expect } from 'vitest';
import { detectTier } from '../src/core/tiers';

// node test env: navigator/matchMedia/location don't exist — install per case.
type Opts = {
  reducedMotion?: boolean;
  coarse?: boolean;
  // gpu === null ⇒ no navigator.gpu; object ⇒ present; omitted ⇒ present-but-empty.
  gpu?: null | { requestAdapter: () => Promise<any> };
  forceTier?: string;
};

function install(o: Opts) {
  // navigator/location are getter-only on globalThis in Node — defineProperty, not assignment
  const def = (k: string, v: unknown) =>
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const g = { set matchMedia(v: any) { def('matchMedia', v); }, set navigator(v: any) { def('navigator', v); }, set location(v: any) { def('location', v); } };
  g.matchMedia = (q: string) => ({
    matches: q.includes('reduced-motion') ? !!o.reducedMotion : q.includes('coarse') ? !!o.coarse : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  g.navigator = o.gpu === null ? {} : o.gpu ? { gpu: o.gpu } : {};
  g.location = { search: o.forceTier ? `?forceTier=${o.forceTier}` : '' };
}

const goodAdapter = (maxBufferSize: number) => ({ limits: { maxBufferSize } });

describe('detectTier', () => {
  it('no navigator.gpu ⇒ webgl2', async () => {
    install({ gpu: null });
    expect(await detectTier()).toBe('webgl2');
  });

  it('gpu present but requestAdapter() ⇒ null (blocklist) ⇒ webgl2', async () => {
    install({ gpu: { requestAdapter: async () => null } });
    expect(await detectTier()).toBe('webgl2');
  });

  it('prefers-reduced-motion ⇒ static (even with a good adapter)', async () => {
    install({ reducedMotion: true, gpu: { requestAdapter: async () => goodAdapter(1 << 30) } });
    expect(await detectTier()).toBe('static');
  });

  // DEMOTION PIN (2026-07-15, prod re-fly gate): a good WebGPU adapter still
  // lands on the APPROVED webgl2 presentation — the webgpu look never passed a
  // gate. When the webgpu look passes, restore the original expectations
  // (big+fine ⇒ webgpu-high, low limit or coarse ⇒ webgpu-low).
  it('adapter ≥ 1GiB maxBufferSize + fine pointer ⇒ webgl2 (webgpu demoted until look-gated)', async () => {
    install({ coarse: false, gpu: { requestAdapter: async () => goodAdapter(1 << 30) } });
    expect(await detectTier()).toBe('webgl2');
  });

  it('adapter with low limit ⇒ webgl2 (demotion)', async () => {
    install({ coarse: false, gpu: { requestAdapter: async () => goodAdapter((1 << 30) - 1) } });
    expect(await detectTier()).toBe('webgl2');
  });

  it('coarse pointer (mobile) ⇒ webgl2 (demotion)', async () => {
    install({ coarse: true, gpu: { requestAdapter: async () => goodAdapter(1 << 30) } });
    expect(await detectTier()).toBe('webgl2');
  });

  it('?forceTier=webgpu-high still exposes the demoted path for tuning', async () => {
    install({ gpu: { requestAdapter: async () => goodAdapter(1 << 30) }, forceTier: 'webgpu-high' });
    expect(await detectTier()).toBe('webgpu-high');
  });

  it('?forceTier= override wins (even with no gpu)', async () => {
    install({ gpu: null, forceTier: 'webgl2' });
    expect(await detectTier()).toBe('webgl2');
  });

  it('garbage forceTier value is ignored, falls through to detection', async () => {
    install({ gpu: null, forceTier: 'rtx-4090-ultra' });
    expect(await detectTier()).toBe('webgl2');
  });
});
