// Approach-triggered portfolio panel (A2 P3b). DOM overlay — NOT canvas — so copy
// is crisp + a11y-readable (mirrors Telemetry.tsx's overlay idiom). Reads
// useApproachStore (open/slot/world) and binds the matching portfolio.json
// section; <ApproachSampler/> (approachStore.ts) opens/clears the store at 5Hz as
// the craft enters/leaves APPROACH_RADIUS of a content world.
//
// Behavior (plan §P3): approach within 60 wu → panel slides in (300ms CSS,
// reduced-motion ⇒ instant); ESC or fly-away dismisses. Brace/Riven/Corona never
// open (no slot). Never modal, never locks free flight: overlay root is
// pointer-events:none so the canvas keeps every click; dismiss is ESC/fly-away
// only. aria-live="polite" on the title (low update rate ⇒ polite is correct,
// unlike telemetry's 10Hz values).

import { useEffect } from 'react';
import { useApproachStore, type Slot } from './approachStore';
import PORTFOLIO from '../content/portfolio.json';
import './approach.css';

interface Block {
  heading: string;
  body: string;
}
interface SectionLink {
  label: string;
  href: string;
}
interface PortfolioSection {
  slot: Slot;
  world: string;
  headline: string;
  myth: string;
  blocks: Block[];
  links?: SectionLink[]; // Contact only — the diegetic CTA channels
}

const SECTIONS = PORTFOLIO as unknown as Record<Slot, PortfolioSection>;

export function ApproachPanel() {
  const open = useApproachStore((s) => s.open);
  const slot = useApproachStore((s) => s.slot);

  // ESC dismisses (active only while a panel is open). Fly-away clear is handled
  // by the sampler; both end at the same store.set.
  useEffect(() => {
    if (!slot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = useApproachStore.getState();
        // record the dismissed world so the sampler doesn't re-open it while the
        // craft is still in range; unpin so proximity logic resumes.
        s.set({ open: false, slot: null, world: null, dismissed: s.world, pinned: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slot]);

  if (!slot) return null;
  const section = SECTIONS[slot];

  return (
    <div className="approach-root" aria-hidden={!open}>
      <aside
        className={`approach-panel${open ? ' is-open' : ''}`}
        role="region"
        aria-label={`${section.world} — ${section.slot}`}
        tabIndex={0} /* panel is overflow-y:auto — focusable so keyboard users can scroll it */
      >
        <header className="approach-head">
          <span className="approach-kicker">{section.world.toUpperCase()}</span>
          <h2 className="approach-title" aria-live="polite">
            {section.headline}
          </h2>
          <p className="approach-myth">{section.myth}</p>
        </header>

        <div className="approach-blocks">
          {section.blocks.map((b) => (
            <section className="approach-block" key={b.heading}>
              <h3 className="approach-heading">{b.heading}</h3>
              <p className="approach-body">{b.body}</p>
            </section>
          ))}
        </div>

        {section.links && (
          <nav className="approach-links" aria-label="Contact channels">
            {section.links.map((l) => (
              <a
                key={l.href}
                className="approach-link"
                href={l.href}
                target={l.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}

        <footer className="approach-foot">ESC · FLY AWAY TO DISMISS</footer>
      </aside>
    </div>
  );
}
