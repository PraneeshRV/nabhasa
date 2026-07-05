// Hardware tier detection (spec Task 2). One of four tiers drives every
// per-tier number in quality.ts. detectTier is async because the WebGPU
// adapter probe (`requestAdapter`) is async and may resolve null on a
// blocklisted GPU.

export type Tier = 'webgpu-high' | 'webgpu-low' | 'webgl2' | 'static';

const VALID_TIERS: readonly Tier[] = ['webgpu-high', 'webgpu-low', 'webgl2', 'static'];

// `?forceTier=` override — every later gate exercises fallbacks through it.
// Unknown/garbage values are ignored (never silently map to a real tier).
function readForceTier(): Tier | undefined {
  if (typeof location === 'undefined') return undefined;
  const raw = new URLSearchParams(location.search).get('forceTier');
  return raw && (VALID_TIERS as readonly string[]).includes(raw) ? (raw as Tier) : undefined;
}

export async function detectTier(): Promise<Tier> {
  const forced = readForceTier();
  if (forced) return forced;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'static';
  if (!('gpu' in navigator)) return 'webgl2';

  const adapter = await (navigator as any).gpu.requestAdapter();
  if (!adapter) return 'webgl2'; // navigator.gpu present but blocklisted

  const coarse = matchMedia('(pointer: coarse)').matches;
  const big = adapter.limits.maxBufferSize >= 1 << 30; // 1 GiB+ ⇒ desktop-class
  return !coarse && big ? 'webgpu-high' : 'webgpu-low';
}
