// PostProcessing stack — Nabhasa W3 (spec 2026-07-14-nabhasa-elevation.md, W3 row).
// Authority: docs/art-direction.md §Post-processing intent + §Imperfection layer.
//
// Mount-ready component, NOT mounted here — the conductor wires it into
// <NabhasaCanvas> inside MainExperience at merge (one line, see bottom of file).
//
// What it does (per art-direction):
//  • Bloom — threshold 1.0 ⇒ strictly >1.0 emissive-only (diffuse ≤1 never
//    crosses; INVARIANT). radius+strength modulate by region (arrival small/low
//    for the distant star only; nearStar wider for beam cores + limb; swarm
//    nearly off). Tone mapping (AgX) + SRGB out are owned by the renderer
//    (renderer.tsx); PostProcessing applies them to outputNode by default, so we
//    do NOT re-tonemap here.
//  • Film grain — luminance-only ~0.03 (equal delta to r,g,b ⇒ chroma unchanged),
//    per-pixel film grain via a uv·resolution+time hash (NOT a screen flash; the
//    <3Hz photosensitivity lock governs flash EVENTS — grain is dithering,
//    sanctioned by §Imperfection layer). webgpu-high ONLY (off on webgpu-low).
//  • Chromatic aberration — radial channel split on the scene; ZERO at cruise,
//    ramps with kill-radius proximity OR boost (art-direction: "ONLY at high-G
//    moments"). Slew-capped (τ=0.1s) so it never pops.
//  • Vignette — ≤0.15, static; deepens to 0.15 near-star with the exposure drop.
//
// Tier gating (matches quality.ts `post` flag — the source of truth, NOT the
// spec's line 44 which is superseded by the dispatch + art-direction "webgl2:
// post off"): webgpu-high = full stack; webgpu-low = no grain; webgl2/static =
// component returns null and does NOT take over rendering (R3F auto-renders).
//
// Render takeover: PostFxInner registers a useFrame at renderPriority 1. R3F
// disables its default gl.render() the moment ANY priority>0 subscriber exists,
// and runs priority-0 subscribers (PulsarBeams, RegionAtmosphere, HudSampler …)
// first, so all per-frame scene mutation lands before post.render(). The camera
// object captured by pass() is the live R3F camera (mutated in place by
// CameraRig), so moving the rig is reflected.
//
// ── API assumptions to confirm at the conductor's tsc gate ──────────────────
// These are the canonical three r185 webgpu PostProcessing paths. They were NOT
// runtime-verified in this worktree (node/grep are approval-gated here); tsc is
// the confirmation. If a path differs it is a one-line import swap:
//   • PostProcessing      from 'three/webgpu'
//   • pass                from 'three/tsl'
//   • bloom               from 'three/examples/jsm/tsl/display/BloomNode.js'
//     (tsconfig has no 'three/addons/*' path map; the real disk file is BloomNode.js)
//   • texture-at-offset idiom: `passNode.getTextureNode().uv( coordNode )` for CA re-sampling
//   • PostProcessing auto-applies renderer.toneMapping + outputColorSpace to
//     outputNode (no explicit tonemap pass needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PostProcessing } from 'three/webgpu';
import { pass, uniform, float, vec2, vec3, uv, time, fract, sin, dot, length, smoothstep, max } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { QUALITY } from './quality';
import type { Tier } from './tiers';
import { useRegionStore } from '../world/regions';
import { craftState } from '../flight/craftState';
import { input } from '../flight/input';
import { KILL_RADIUS } from '../world/scale';

// ── bloom profile per region (art-direction §Post-processing intent) ─────────
// threshold is CONSTANT (>1 ⇒ emissive-only; diffuse never blooms). Only radius
// + strength move with region.
const BLOOM_THRESHOLD = 1.0; // color must EXCEED this to bloom ⇒ strictly >1.0
const REGION_BLOOM: Record<string, { strength: number; radius: number }> = {
  arrival: { strength: 0.6, radius: 0.4 }, // distant star only: small radius, low strength
  nearStar: { strength: 1.1, radius: 0.8 }, // beam cores + star limb: wider radius
  swarm: { strength: 0.4, radius: 0.3 }, // nearly off — swarm reads by geometry, not glow
};

// ── imperfection layer (art-direction §Imperfection layer) ───────────────────
const VIGNETTE_BASE = 0.1; // faint, static (≤0.15)
const VIGNETTE_NEAR = 0.15; // deepens slightly near-star with the exposure drop
const CA_MAX = 0.004; // uv-offset at full g-load/boost (subtle)
const CA_RAMP_START = 60; // wu: CA begins ramping inward toward kill radius (25)
const CA_TAU = 0.1; // s: slew toward target — never a hard pop (photosensitivity)
const GRAIN_AMP = 0.03; // luminance-only amplitude, webgpu-high only

// GLSL-style smoothstep on a plain JS number (CA ramp on r = craft radius).
function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function PostFxInner({ tier }: { tier: Tier }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  // Grain is the only effect that differs webgpu-high vs webgpu-low (off on
  // low). Everything else (bloom/CA/vignette) runs on both webgpu tiers.
  const grainAmp = tier === 'webgpu-high' ? GRAIN_AMP : 0;

  const pp = useMemo(() => {
    const post = new PostProcessing(gl as any); // gl = WebGPURenderer (R3F types it loosely)

    // scenePass = the rendered scene as a texture node (sampled at uv()).
    const scenePass = pass(scene, camera);

    // ── per-frame uniforms (mutated from region + g-load signals) ──
    const uStrength = uniform(REGION_BLOOM.arrival.strength);
    const uRadius = uniform(REGION_BLOOM.arrival.radius);
    const uVignette = uniform(VIGNETTE_BASE);
    const uCA = uniform(0.0); // 0 at cruise
    const uGrain = uniform(grainAmp);

    // Bloom: emissive-only. threshold is a fixed uniform (never region-moved);
    // strength/radius are the region-modulated knobs.
    const bloomPass = bloom(scenePass, uniform(BLOOM_THRESHOLD), uStrength, uRadius);

    // ── chromatic aberration: radial R/B split on the SCENE (pre-bloom) ──
    // `.uv(coord)` resamples the scene texture at an offset uv (three TSL
    // idiom). uCA is driven to 0 at cruise, so this collapses to a no-op sample
    // except near the kill radius / under boost. Bloom is added to the CA'd
    // colour (you don't chromatically split the glow halo).
    const c = uv().sub(0.5);
    const dist = length(c);
    const caDir = c.div(max(dist, float(1e-4))); // outward unit dir
    const caOff = caDir.mul(dist.mul(dist).mul(uCA)); // grows with radius² · amount
    const sceneTex = scenePass.getTextureNode(); // TextureNode — resample at offset uv
    const caR = sceneTex.sample(uv().add(caOff)).r;
    const caB = sceneTex.sample(uv().sub(caOff)).b;
    const caCol = vec3(caR, scenePass.g, caB); // G sampled at the center uv

    let out = caCol.add(bloomPass);

    // ── film grain: luminance-only (equal delta ⇒ chroma unchanged) ──
    // Per-pixel hash over uv·resolution + time ⇒ moving film grain, not a fixed
    // veil. uGrain=0 on webgpu-low ⇒ the whole term vanishes.
    const gp = uv().mul(vec2(2048.0, 1280.0)).add(vec2(time.mul(60.0), time.mul(40.0)));
    const gn = fract(sin(dot(gp, vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5); // −0.5..0.5
    out = out.add(gn.mul(uGrain));

    // ── vignette: multiply by a radial darkening (≤0.15) ──
    const vd = length(uv().sub(0.5)); // 0 at center .. ~0.7 at corner
    const vig = float(1.0).sub(uVignette.mul(smoothstep(0.3, 0.8, vd)));
    out = out.mul(vig);

    post.outputNode = out;
    return { post, uStrength, uRadius, uVignette, uCA };
  }, [gl, scene, camera, grainAmp]);

  useEffect(() => () => pp.post.dispose(), [pp]);

  useFrame(
    (_, rawDt) => {
      // region → bloom profile + vignette depth (read live; no React re-render)
      const region = useRegionStore.getState().region;
      const rp = REGION_BLOOM[region];
      pp.uStrength.value = rp.strength;
      pp.uRadius.value = rp.radius;
      pp.uVignette.value = region === 'nearStar' ? VIGNETTE_NEAR : VIGNETTE_BASE;

      // CA: kill-radius proximity OR boost. Zero at cruise (r large, no boost).
      const r = craftState.pos.length();
      const killProx = smoothstepJS(CA_RAMP_START, KILL_RADIUS, r); // 0 beyond 60wu, 1 at kill radius
      const caTarget = Math.max(killProx, input.boost ? 1 : 0) * CA_MAX;
      const dt = Math.min(rawDt, 1 / 30); // clamp per Global Constraints
      pp.uCA.value += (caTarget - pp.uCA.value) * (1 - Math.exp(-dt / CA_TAU)); // slew

      pp.post.render();
    },
    1, // priority>0 ⇒ R3F skips its default gl.render(); this owns the frame.
  );

  return null;
}

// Tier gate. On webgl2/static (QUALITY[tier].post === false) this returns null
// BEFORE mounting PostFxInner, so no priority-1 useFrame registers and R3F keeps
// its default auto-render (webgl2 must not mount post — quality.ts + art-direction).
// PostFx has no hooks, so the early return is hooks-safe.
export function PostFx({ tier }: { tier: Tier }) {
  if (!QUALITY[tier].post) return null;
  return <PostFxInner tier={tier} />;
}

// ── conductor mount (one line) ───────────────────────────────────────────────
// Inside MainExperience's <NabhasaCanvas>, alongside the signature/world children:
//   <PostFx tier={tier} />
// Place it as a direct child of <NabhasaCanvas> (not in <Suspense> — it has no
// async deps). It no-ops on webgl2/static.
