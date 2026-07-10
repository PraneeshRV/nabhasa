// Mission-result DOM overlay controller (spec Task 12 wiring). Mounts the pure
// <ResultCard> (game/ResultCard.tsx — a presentational module we do NOT edit)
// when the courier FSM reaches 'delivered', scores the run via game/score.ts,
// and wires dismiss (Escape + button) with a focus-visible ring — the a11y floor
// ResultCard itself doesn't carry. Also surfaces a brief non-modal failure banner
// (finding 7) so a fuel/destroyed failure isn't silent.
//
// a11y (finding 5): the delivered dialog traps Tab within itself and restores
// focus to the previously-focused element on dismiss; ResultCard carries
// aria-modal="true".
//
// Subscription discipline: we read ONLY status + missionId + failReason
// (transition-only slices). The 60Hz step() set() mutates fuel/timeS every tick,
// so subscribing to those would re-render this 60×/s; instead they're read via
// getState() at render time, which is safe because fuel/timeS are frozen once
// 'delivered' is reached and this only re-renders on a status/missionId transition.
//
// Desktop-only mount (App ExperienceShell). Mobile never imports this → the
// courier/score chunks stay unfetched on the mobile route (Task 14 invariant).

import { useEffect, useRef, useState } from 'react';
import { useCourierStore, missionById, computeScore, type FailReason } from '../game/courier';
import { loadScores, saveScore } from '../game/score';
import { ResultCard } from '../game/ResultCard';
import { useApproachStore } from './approachStore';

const ACCENT = '#AFE3FF';
// ResultCard's buttons have no className + no focus style; scope a ring to this
// overlay so keyboard users see focus. Injected once via a <style> element.
const FOCUS_CSS = `.nabhasa-result button:focus-visible{outline:2px solid ${ACCENT};outline-offset:3px;}`;

const FAIL_MSG: Record<FailReason, string> = {
  fuel: 'FUEL DEPLETED',
  destroyed: 'TIDAL DESTRUCTION',
};
const FAIL_HOLD_MS = 1800; // banner visible before the FSM reset returns to idle

export function MissionResult() {
  const status = useCourierStore((s) => s.status);
  const missionId = useCourierStore((s) => s.missionId);
  const failReason = useCourierStore((s) => s.failReason);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const [best, setBest] = useState(false);
  const [showFail, setShowFail] = useState(false);
  const scoredFor = useRef<string | null>(null);

  // Failure feedback (finding 7): the spec scopes the result card to delivery, so
  // a fuel/destroyed failure was silent — the FSM reset immediately with no UI.
  // Show a brief non-modal banner with the reason, THEN reset (returns to idle
  // retrying the SAME mission; unlockedIndex unchanged). Destruction still fires
  // the white veil via Craft; this adds the fuel-out case + the reason line.
  useEffect(() => {
    if (status !== 'failed') return;
    setShowFail(true);
    const t = window.setTimeout(() => {
      setShowFail(false);
      useCourierStore.getState().reduce({ type: 'reset' });
    }, FAIL_HOLD_MS);
    return () => window.clearTimeout(t);
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

  // Finale (m5-gate): open the Contact panel event-driven — the live Threshold
  // drifts far from the fixed delivery beacon, so proximity can never trigger it.
  // Opens when the m5 result card is DISMISSED (not while it shows): both dialogs
  // listen for ESC on window, so opening alongside the card would let one ESC kill
  // both. pinned keeps the 5Hz sampler from closing it; ESC then dismisses it.
  const finaleArmed = useRef(false);
  useEffect(() => {
    if (delivered && mission?.id === 'm5-gate') {
      finaleArmed.current = true;
    } else if (!delivered && finaleArmed.current) {
      finaleArmed.current = false;
      useApproachStore
        .getState()
        .set({ open: true, slot: 'Contact', world: 'Threshold', pinned: true });
    }
  }, [delivered, mission]);

  // Dismiss (Escape) + Tab focus trap (finding 5). Move focus into the dialog on
  // open, keep Tab inside it (wrap first↔last), and restore focus to the element
  // that had it before on dismiss. Preserves the existing Escape-to-dismiss path.
  useEffect(() => {
    if (!delivered) return;
    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    const root = rootRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useCourierStore.getState().reduce({ type: 'reset' });
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    // Focus the dismiss button ("Continue flight" = last button) so Enter dismisses
    // immediately; Share is reachable via Tab.
    const t = window.setTimeout(
      () => (root?.querySelector('button:last-of-type') as HTMLButtonElement | null)?.focus(),
      0,
    );
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      // Hand focus back to whatever had it before the dialog opened.
      prevFocus.current?.focus?.();
    };
  }, [delivered]);

  return (
    <>
      {showFail && failReason && (
        <div
          role="status"
          aria-live="assertive"
          style={{
            position: 'fixed',
            top: '18vh',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: ACCENT, // --star-hot — the one accent
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 18,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            zIndex: 60,
            textShadow: '0 0 18px rgba(175,227,255,0.5)',
          }}
        >
          {FAIL_MSG[failReason]} — MISSION FAILED
        </div>
      )}
      {!delivered || !mission ? null : (
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
      )}
    </>
  );
}
