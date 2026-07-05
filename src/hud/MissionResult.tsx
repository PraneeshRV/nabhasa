// Mission-result DOM overlay controller (spec Task 12 wiring). Mounts the pure
// <ResultCard> (game/ResultCard.tsx — a presentational module we do NOT edit)
// when the courier FSM reaches 'delivered', scores the run via game/score.ts,
// and wires dismiss (Escape + button) with a focus-visible ring — the a11y floor
// ResultCard itself doesn't carry.
//
// Subscription discipline: we read ONLY status + missionId (transition-only
// slices). The 60Hz step() set() mutates fuel/timeS every tick, so subscribing to
// those would re-render this 60×/s; instead they're read via getState() at render
// time, which is safe because fuel/timeS are frozen once 'delivered' is reached
// and this only re-renders on a status/missionId transition.
//
// Desktop-only mount (App ExperienceShell). Mobile never imports this → the
// courier/score chunks stay unfetched on the mobile route (Task 14 invariant).

import { useEffect, useRef, useState } from 'react';
import { useCourierStore, missionById, computeScore } from '../game/courier';
import { loadScores, saveScore } from '../game/score';
import { ResultCard } from '../game/ResultCard';

const ACCENT = '#AFE3FF';
// ResultCard's buttons have no className + no focus style; scope a ring to this
// overlay so keyboard users see focus. Injected once via a <style> element.
const FOCUS_CSS = `.nabhasa-result button:focus-visible{outline:2px solid ${ACCENT};outline-offset:3px;}`;

export function MissionResult() {
  const status = useCourierStore((s) => s.status);
  const missionId = useCourierStore((s) => s.missionId);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [best, setBest] = useState(false);
  const scoredFor = useRef<string | null>(null);

  // Recover from a fuel/destroyed failure so the courier loop can't soft-lock:
  // FSM reset from 'failed' returns to idle and retries the SAME mission
  // (unlockedIndex unchanged). No result card — the spec scopes the card to
  // delivery. (DEVIATION — see wiring notes.)
  useEffect(() => {
    if (status === 'failed') useCourierStore.getState().reduce({ type: 'reset' });
  }, [status]);

  const mission = missionId ? missionById(missionId) : undefined;
  const delivered = status === 'delivered' && !!mission;

  // Read frozen-at-delivery values via getState() (see subscription note above).
  const c = useCourierStore.getState();
  const fuelFrac = c.budget > 0 ? Math.min(1, c.fuel / c.budget) : 0;
  const score = mission ? computeScore(mission, fuelFrac, c.timeS) : 0;

  // Persist best + flag new-best exactly once per delivery. saveScore keeps the
  // max, so it is idempotent under React strict-mode double-invoke; the guard
  // captures the pre-save best before the first write.
  useEffect(() => {
    if (!delivered || !mission) return;
    if (scoredFor.current === mission.id) return;
    const prev = loadScores()[mission.id] ?? 0;
    setBest(score > prev);
    saveScore(mission.id, score);
    scoredFor.current = mission.id;
  }, [delivered, mission, score]);

  // Clear the guard when leaving delivered so a later delivery re-scores.
  useEffect(() => {
    if (!delivered) scoredFor.current = null;
  }, [delivered]);

  // Dismiss (Escape + button) and move focus into the dialog for keyboard users.
  useEffect(() => {
    if (!delivered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useCourierStore.getState().reduce({ type: 'reset' });
    };
    window.addEventListener('keydown', onKey);
    // Focus the dismiss button ("Continue flight" = last button) so Enter dismisses
    // immediately; Share is reachable via Tab.
    const t = window.setTimeout(
      () => (rootRef.current?.querySelector('button:last-of-type') as HTMLButtonElement | null)?.focus(),
      0,
    );
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [delivered]);

  if (!delivered || !mission) return null;

  return (
    <div className="nabhasa-result" ref={rootRef}>
      <style>{FOCUS_CSS}</style>
      <ResultCard
        mission={mission}
        fuelFrac={fuelFrac}
        timeS={c.timeS}
        score={score}
        best={best}
        onDismiss={() => useCourierStore.getState().reduce({ type: 'reset' })}
      />
    </div>
  );
}
