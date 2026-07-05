// StaticExperience — honest reduced-motion fallback for the 'static' tier
// (spec Task 15 stub). No canvas, no rAF, no Rapier: void background, the neutron
// star as a single static emissive dot (plain DOM/CSS), the title, one line.
// Full Task 15 content lands later; this is the no-motion floor that never lies
// about what it is. Palette-bound: --void #030407, --star-hot #AFE3FF (the lone
// accent), --ui-cold #8A93A6.

export function StaticExperience() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#030407',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        color: '#8A93A6',
      }}
    >
      {/* Neutron star — the sole hot accent, as a static emissive dot. */}
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#AFE3FF',
          boxShadow:
            '0 0 18px 6px rgba(175,227,255,0.55), 0 0 48px 16px rgba(175,227,255,0.22)',
        }}
      />
      <h1
        style={{
          margin: 0,
          fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
          letterSpacing: '0.34em',
          fontWeight: 500,
          color: '#8A93A6',
        }}
      >
        NABHASA
      </h1>
      <p style={{ margin: 0, fontSize: '0.9rem', letterSpacing: '0.04em', maxWidth: '32em' }}>
        Reduced-motion mode — the full flight experience requires animation and WebGPU.
      </p>
    </div>
  );
}
