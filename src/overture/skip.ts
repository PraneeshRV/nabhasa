// Overture skip — accelerated scrub to handover + the prefers-reduced-motion bypass
// (spec §Architecture / §Error-handling). PURE decision math: no three, no R3F, no
// DOM listeners. The R3F component (Overture.tsx) attaches the any-input listener
// in a real browser and calls scrubAdvance() each frame; App reads
// prefersReducedMotion() to route reduced-motion users straight to flight/static
// with no overture at all. Keeping the math here makes the "≤2 s, not a hard cut"
// and the bypass branch unit-testable under node (tests/overture-skip).
//
// Semantics: a skip triggered at skipStartT scrubs the REMAINING rail
// (1 − skipStartT) across SKIP_DURATION_S of real time — so handover always lands
// within the budget regardless of where the skip began, and the scrub is a fast
// glide, not an instant cut (spec: "≤2 s, not a hard cut").

// Maximum real seconds a skip takes to reach handover. Spec caps this at 2 s.
export const SKIP_DURATION_S = 2;

// Timeline advance per real second while skipping. Depends only on where the skip
// began (skipStartT): the rest of the rail is spread evenly across the budget.
export function scrubRate(skipStartT: number): number {
  const remaining = 1 - skipStartT;
  return remaining <= 0 ? 0 : remaining / SKIP_DURATION_S;
}

// Advance the timeline by realDt seconds of an accelerated skip that began at
// skipStartT. Monotonic, clamped to [0,1] — a frame's dt can never overshoot past
// handover, and a skip already at the end stays put. NOT a hard cut: a single
// frame advances a small slice, the rail glides to handover over the budget.
export function scrubAdvance(t: number, realDt: number, skipStartT: number): number {
  const next = t + realDt * scrubRate(skipStartT);
  return next < 0 ? 0 : next > 1 ? 1 : next;
}

// The prefers-reduced-motion bypass. True ⇒ the user opts out of motion: App routes
// them straight to flight (or the static tier), the overture never mounts. Guarded
// so it is safe where matchMedia is absent (node, SSR, old browsers) — it returns
// false rather than throwing, matching Craft.tsx's reduced-motion check but with
// the node-safe guard the overture's earlier mount point needs.
//
// Finding 2: the call must be `g.matchMedia(query)` — property access + call on the
// SAME reference — so matchMedia runs bound to globalThis. Detaching it into a
// variable first (`const mm = g.matchMedia; mm(...)`) throws `TypeError: Illegal
// invocation` in real browsers (matchMedia is a host method that requires its
// `this` to be the window); the catch then swallowed that and the bypass was dead.
// Node's matchMedia-less env can't reproduce the binding throw, so the unit test
// covers the true/false/absent/throws branches and the binding is enforced by
// reading + calling the same `g.matchMedia` expression here.
export function prefersReducedMotion(): boolean {
  const g = globalThis as { matchMedia?: (q: string) => { matches: boolean } };
  if (typeof g.matchMedia !== 'function') return false;
  try {
    return g.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
