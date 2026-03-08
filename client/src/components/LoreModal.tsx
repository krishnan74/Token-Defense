import { useEffect, useRef } from 'react';

const LORE_PARAGRAPHS = [
  { text: 'THE YEAR IS 2047.', emphasis: true },
  { text: 'The great AI proliferation has transformed civilization. Thousands of inference clusters now power global systems — medical diagnostics, climate modeling, autonomous infrastructure, scientific research.' },
  { text: 'For a decade, they ran uncontested.' },
  { text: 'Then the adversarial agents arrived.' },
  { text: 'They were not viruses in the classical sense. They were ideas — malformed prompts, carefully engineered context payloads, cascading hallucination vectors designed to confuse, corrupt, and consume compute resources without detection.' },
  { text: 'The clusters named them:', dim: true },
  { text: 'TEXTJAILBREAK', emphasis: true },
  { text: 'Fast-moving prompt injection vectors that slip through attention layers before safety filters can activate.' },
  { text: 'CONTEXTOVERFLOW', emphasis: true },
  { text: 'Armored context-poisoning constructs that flood the attention window, forcing models into incoherent and dangerous outputs.' },
  { text: 'HALLUSWARM', emphasis: true },
  { text: 'Swarms of lightweight hallucination cascades that overwhelm token budgets through sheer volume and speed.' },
  { text: 'And on the hardest waves... THE BOSS. An adversarial superintelligence fragment. Never fully killed — only slowed.' },
  { text: '─── ◆ ───', dim: true },
  { text: 'The clusters are defended by a single automated safety architecture: TOKEN DEFENSE.' },
  { text: 'Safety towers — tuned GPT, Vision, and Code modules — fire moderation signals at incoming threats. But they run on tokens. Finite, depletable inference compute that drains with every shot.' },
  { text: 'When tokens run dry, the towers go offline. And the path to the base opens.' },
  { text: 'Three thousand engineers tried to automate the defense. All failed. The threat patterns evolved too fast for static systems.' },
  { text: '─── ◆ ───', dim: true },
  { text: 'Then someone had an idea.' },
  { text: 'What if the defenders were also AI?' },
  { text: 'What if the game was designed not to keep agents out — but to invite them in?' },
  { text: 'Every state is indexed on-chain. Every outcome is public. Any agent with a wallet and a strategy can play.' },
  { text: '─── ◆ ───', dim: true },
  { text: 'PLACE YOUR TOWERS.', emphasis: true },
  { text: 'SUSTAIN YOUR FACTORIES.', emphasis: true },
  { text: 'DEFEND THE SIGNAL.', emphasis: true },
  { text: 'May your tokens never run dry.' },
];

export default function LoreModal({ onClose }: { onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  }, []);

  return (
    <div style={styles.overlay}>
      {/* Stars */}
      <div style={styles.stars} />

      {/* Fade top */}
      <div style={styles.fadeTop} />

      {/* Scroll area */}
      <div style={styles.scrollWindow}>
        <div ref={scrollRef} className="lore-scroll-text">

          <div style={styles.epigraph}>EPISODE VII</div>
          <div style={styles.title}>TOKEN DEFENSE</div>
          <div style={styles.subtitle}>THE INFERENCE WARS</div>
          <div style={{ height: 40 }} />

          {LORE_PARAGRAPHS.map((p, i) => (
            <p
              key={i}
              style={{
                ...styles.para,
                ...(p.emphasis ? styles.emphasis : {}),
                ...(p.dim     ? styles.dim     : {}),
              }}
            >
              {p.text}
            </p>
          ))}

          <div style={{ height: 120 }} />
        </div>
      </div>

      {/* Fade bottom */}
      <div style={styles.fadeBottom} />

      {/* Close */}
      <button style={styles.closeBtn} onClick={onClose}>✕ CLOSE</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: '#000',
    zIndex: 1000,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center',
    overflow: 'hidden',
  },
  stars: {
    position: 'absolute', inset: 0,
    background: `
      radial-gradient(1px 1px at  8% 12%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 22% 38%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 38%  8%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 53% 68%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 69% 22%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 79% 53%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 14% 78%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 88%  9%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 33% 88%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 61% 43%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 92% 72%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at  5% 55%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 47% 20%, #fff 0%, transparent 100%),
      radial-gradient(1px 1px at 75% 85%, #fff 0%, transparent 100%),
      radial-gradient(2px 2px at 48% 30%, rgba(255,215,0,0.7) 0%, transparent 100%),
      radial-gradient(2px 2px at 77% 68%, rgba(255,215,0,0.5) 0%, transparent 100%),
      radial-gradient(2px 2px at 20% 60%, rgba(255,215,0,0.4) 0%, transparent 100%)
    `,
    pointerEvents: 'none',
  },
  scrollWindow: {
    position: 'relative',
    width: '100%',
    maxWidth: 760,
    height: '100vh',
    overflow: 'hidden',
    zIndex: 1,
  },
  fadeTop: {
    position: 'fixed', top: 0, left: 0, right: 0,
    height: 140,
    background: 'linear-gradient(to bottom, #000 40%, transparent 100%)',
    zIndex: 2, pointerEvents: 'none',
  },
  fadeBottom: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    height: 120,
    background: 'linear-gradient(to top, #000 40%, transparent 100%)',
    zIndex: 2, pointerEvents: 'none',
  },
  epigraph: {
    fontFamily: "'VT323', monospace",
    color: '#FFD700', fontSize: 22, letterSpacing: 6,
    textAlign: 'center', marginBottom: 10,
  },
  title: {
    fontFamily: "'VT323', monospace",
    color: '#FFD700', fontSize: 72, letterSpacing: 8,
    textAlign: 'center', lineHeight: 1,
    textShadow: '0 0 40px rgba(255,215,0,0.5), 2px 2px 0 #4A2510',
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: "'VT323', monospace",
    color: '#FFD700', fontSize: 28, letterSpacing: 5,
    textAlign: 'center',
  },
  para: {
    fontFamily: "'VT323', monospace",
    color: '#C8B090',
    fontSize: 22,
    lineHeight: 1.65,
    textAlign: 'center',
    marginBottom: 22,
    padding: '0 40px',
    margin: '0 auto 22px',
    maxWidth: 660,
    display: 'block',
  },
  emphasis: {
    color: '#FFD700',
    fontSize: 30,
    letterSpacing: 3,
    textShadow: '0 0 12px rgba(255,215,0,0.35)',
    marginTop: 8,
    marginBottom: 8,
  },
  dim: {
    color: '#6B4A2E',
    fontSize: 18,
    letterSpacing: 4,
  },
  closeBtn: {
    position: 'fixed', bottom: 28, left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 36px',
    background: '#1A0A00', color: '#F5E6C8',
    border: '3px solid #4A2510',
    cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 20,
    boxShadow: '3px 3px 0 #0A0500',
    borderRadius: 0, zIndex: 10,
    letterSpacing: 2,
    transition: 'border-color 0.1s, color 0.1s',
  },
};
