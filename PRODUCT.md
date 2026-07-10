# Product

## Register

brand

## Users

Recruiters, hiring managers, and security-industry peers evaluating Praneesh R V
(cybersecurity student → AI red-teaming path). They arrive from a resume link or
social post, on desktop or mobile, with 1–5 minutes of attention. Secondary:
fellow devs/CTF players who will actually fly the whole thing.

The job: judge in minutes whether Praneesh is worth a call. The experience must
prove craft (real-time graphics, physics, attention to detail) while still
delivering the portfolio facts (About / Research / Projects / Experience /
Contact) without friction — including on devices that can't run the flight.

## Product Purpose

Nabhasa is the flagship portfolio: a flyable neutron-star system (PSR B1257+12
"Lich") where eight fictional worlds carry the portfolio content — approach a
world and its section opens as a diegetic panel; five courier missions end at a
Contact CTA. Success = a visitor remembers it, reaches the content, and gets in
touch. It is a demonstration of the standard of work being sold.

## Brand Personality

Disciplined, cinematic, quietly dangerous. "A dead star that is still
dangerous" — photographic restraint, one blinding blue-white source, near-black
vacuum, instrumentation-grey UI. Gargantua's discipline. The fantasy layer
(the Kindled, the Reach) adds myth and warmth without adding a second sun.

## Anti-references

- Synthwave / neon sci-fi posters — explicitly banned by art direction.
- Template portfolio sites (hero + card grid + skill bars).
- Game-y HUD clutter; the HUD is instrumentation, not decoration.
- Anything that competes with the star for luminance (one hot accent:
  `--star-hot #AFE3FF`).

## Design Principles

1. **The star is the only sun.** One hot accent; everything else is lit by it.
   Applies to UI states as much as shaders.
2. **Diegetic over chrome.** Content lives in the world (approach panels,
   mission CTA), not in overlaid website furniture. Panels never modal, never
   lock flight.
3. **Content parity is non-negotiable.** The static tier (reduced motion / no
   GPU) delivers every fact as readable text. Nobody is locked out of the
   portfolio by hardware.
4. **Physics honesty.** Telemetry values are real formulas; facts stay true even
   inside the fiction. Craft is the sales pitch.
5. **Restraint reads as confidence.** Photographic discipline over decoration;
   if an element wants attention, it must earn it in the lore or the physics.

## Accessibility & Inclusion

- Full `prefers-reduced-motion` route: static text experience with complete
  content parity (already built, tier `static`).
- WCAG AA contrast on all reading copy (approach panels documented ≥6.6:1).
- Keyboard: ESC dismisses panels/dialogs; result dialog traps and restores
  focus; skip-link on static page. aria-live on dynamic panel titles.
- Flight itself is mouse/keyboard; the static route is the accessible
  equivalent, not an apology.
