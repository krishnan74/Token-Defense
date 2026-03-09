import { useState } from 'react';

const TOUR_KEY = 'td:tourCompleted';

interface Step {
  title: string;
  body: string;
  // Where on screen to anchor the tooltip card
  anchor: 'center' | 'top-center' | 'bottom-center' | 'mid-left' | 'mid-right';
  // Direction of the arrow on the tooltip pointing toward UI element
  arrow?: 'up' | 'down' | 'left' | 'right';
  // Dims the rest of the screen
  dim?: boolean;
}

const STEPS: Step[] = [
  {
    title: 'WELCOME TO TOKEN DEFENSE',
    body: 'An AI inference cluster is under attack. You are the last line of defense.\n\nThis quick tour shows you the basics. Press NEXT or SKIP anytime.',
    anchor: 'center',
    dim: true,
  },
  {
    title: 'RESOURCE BAR',
    body: 'Gold funds your factories. The three token types (INPUT / IMAGE / CODE) power your towers.\n\nEach token shows its current tier — POWERED, GOOD, LOW, CRITICAL, or OFFLINE — which tells you the damage multiplier and fire rate of towers using that token.\n\nYour Session ID is shown on the right — click ⧉ to copy it. Use it to resume this game from any device via the Resume Game panel or the /?id= URL.',
    anchor: 'top-center',
    arrow: 'up',
    dim: true,
  },
  {
    title: 'THE BATTLEFIELD',
    body: 'Enemies enter from the right and travel the path toward your base (bottom-left).\nPlace towers on any green tile to shoot them down.\nTowers are FREE — you can place up to 14.',
    anchor: 'mid-left',
    arrow: 'left',
    dim: true,
  },
  {
    title: 'BUILD MENU',
    body: 'Each tower card shows its DMG, HP, and which token type it consumes (colored icon).\nFactories produce that same token type every wave — match them to your towers.\n\nTap ? (bottom-right) anytime for the full token tier table and stats reference.\nTap 🔊 to toggle music.',
    anchor: 'bottom-center',
    arrow: 'down',
    dim: true,
  },
  {
    title: 'HOW TOKENS WORK',
    body: 'At wave start, factories produce tokens. Towers consume 1 token per shot.\n\nAs tokens deplete mid-wave, the tier drops — towers slow down and deal less damage. So early enemies face full-power towers; late enemies may face weakened ones.\n\nMore factories = more tokens = towers stay powerful longer.',
    anchor: 'center',
    dim: true,
  },
  {
    title: 'TOWER SIDEBAR',
    body: 'Track towers and factories here.\n◆ Click a card to highlight that tower/factory on the board.\n◆ Upgrade towers (↑) to boost damage up to +65%.\n◆ Upgrade factories for +50% token output per level.\n◆ Sell (✕) to reposition.\n\nTowers that enemies survive through take HP damage and show a PWR% badge. Use the 🔧 Repair button (30g) to restore them to full power between waves.',
    anchor: 'mid-right',
    arrow: 'right',
    dim: true,
  },
  {
    title: 'WAVE PANEL',
    body: 'Preview incoming enemies, then click START WAVE.\nThe entire wave is simulated on-chain — the client replays exactly what happened.\n\nActivate ⚡ OVERCLOCK (50g) before a wave to double tower fire rates for one wave.',
    anchor: 'top-center',
    arrow: 'up',
    dim: true,
  },
  {
    title: 'PRO TIPS',
    body: '◆ Adjacent towers of DIFFERENT types share a +20% synergy bonus (gold glow).\n◆ Tokens are capped at 150 — overbuild factories early, not late.\n◆ Vision towers deal the most damage (14) but have SHORT range (2 tiles) and use rare IMAGE tokens — place them near path bends.\n◆ Code towers deal 1.5× AoE damage vs HalluSwarm — great for wave 7+.\n◆ Bosses appear on waves 5 and 10 — large, slow, and deal 3 HP damage to every tower they pass.\n◆ Watch the PWR% badge in the sidebar — a tower below 75% HP deals reduced damage. Repair (30g) before tough waves.',
    anchor: 'center',
    dim: true,
  },
];

const ANCHOR_STYLES: Record<Step['anchor'], React.CSSProperties> = {
  'center':        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'top-center':    { top: 90,    left: '50%', transform: 'translateX(-50%)' },
  'bottom-center': { bottom: 90, left: '50%', transform: 'translateX(-50%)' },
  'mid-left':      { top: '50%', left: 260,   transform: 'translateY(-50%)' },
  'mid-right':     { top: '50%', right: 200,  transform: 'translateY(-50%)' },
};

const ARROW_STYLES: Record<string, React.CSSProperties> = {
  up:    { borderBottom: '10px solid #FFD700', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', marginBottom: 0, marginTop: -10, alignSelf: 'center' },
  down:  { borderTop: '10px solid #FFD700',    borderLeft: '8px solid transparent', borderRight: '8px solid transparent', alignSelf: 'center' },
  left:  { borderRight: '10px solid #FFD700',  borderTop: '8px solid transparent',  borderBottom: '8px solid transparent', marginRight: 0 },
  right: { borderLeft: '10px solid #FFD700',   borderTop: '8px solid transparent',  borderBottom: '8px solid transparent', marginLeft: 0 },
};

export function shouldShowTour(): boolean {
  return !localStorage.getItem(TOUR_KEY);
}

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  function skip() {
    localStorage.setItem(TOUR_KEY, 'true');
    onComplete();
  }

  function next() {
    if (isLast) { skip(); return; }
    setStep((s) => s + 1);
  }

  return (
    <>
      {/* Dim overlay */}
      {current.dim && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 900,
          pointerEvents: 'none',
        }} />
      )}

      {/* Tooltip card */}
      <div style={{
        position: 'fixed',
        zIndex: 901,
        width: 320,
        ...ANCHOR_STYLES[current.anchor],
      }}>
        {/* Arrow above card */}
        {current.arrow === 'up' && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <div style={{ width: 0, height: 0, ...ARROW_STYLES.up }} />
          </div>
        )}
        {current.arrow === 'left' && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 0, height: 0, ...ARROW_STYLES.left, marginRight: 4 }} />
            <CardBody current={current} step={step} total={STEPS.length} isLast={isLast} onNext={next} onSkip={skip} />
          </div>
        )}
        {current.arrow === 'right' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <CardBody current={current} step={step} total={STEPS.length} isLast={isLast} onNext={next} onSkip={skip} />
            <div style={{ width: 0, height: 0, ...ARROW_STYLES.right, marginLeft: 4 }} />
          </div>
        )}
        {(!current.arrow || current.arrow === 'up' || current.arrow === 'down') && current.arrow !== 'left' && current.arrow !== 'right' && (
          <CardBody current={current} step={step} total={STEPS.length} isLast={isLast} onNext={next} onSkip={skip} />
        )}
        {current.arrow === 'down' && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
            <div style={{ width: 0, height: 0, ...ARROW_STYLES.down }} />
          </div>
        )}
      </div>
    </>
  );
}

function CardBody({
  current, step, total, isLast, onNext, onSkip,
}: {
  current: Step; step: number; total: number; isLast: boolean;
  onNext: () => void; onSkip: () => void;
}) {
  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>{current.title}</span>
        <span style={styles.counter}>{step + 1}/{total}</span>
      </div>

      {/* Pip progress */}
      <div style={styles.pips}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ ...styles.pip, background: i <= step ? '#FFD700' : '#4A2510' }} />
        ))}
      </div>

      {/* Body */}
      <div style={styles.body}>
        {current.body.split('\n').map((line, i) => (
          <p key={i} style={{ margin: '3px 0' }}>{line}</p>
        ))}
      </div>

      {/* Buttons */}
      <div style={styles.buttons}>
        <button style={styles.skipBtn} onClick={onSkip}>SKIP TOUR</button>
        <button style={styles.nextBtn} onClick={onNext}>
          {isLast ? 'PLAY NOW ▶' : 'NEXT ▶'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#2C1507',
    border: '3px solid #FFD700',
    boxShadow: '4px 4px 0 #4A2510, 0 0 20px rgba(255,215,0,0.3)',
    padding: '14px 16px',
    fontFamily: "'VT323', monospace",
    flex: 1,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    color: '#FFD700', fontSize: 17, letterSpacing: 1,
    textShadow: '1px 1px 0 #4A2510',
  },
  counter: { color: '#6B3A1E', fontSize: 15 },
  pips: { display: 'flex', gap: 4, marginBottom: 10 },
  pip: { width: 10, height: 4, border: '1px solid #4A2510' },
  body: {
    color: '#F5E6C8', fontSize: 17, lineHeight: 1.5,
    marginBottom: 12, whiteSpace: 'pre-line' as const,
  },
  buttons: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  skipBtn: {
    padding: '4px 10px',
    background: 'transparent', color: '#6B3A1E',
    border: '2px solid #4A2510',
    cursor: 'pointer', fontFamily: "'VT323', monospace", fontSize: 15,
    borderRadius: 0,
  },
  nextBtn: {
    padding: '4px 14px',
    background: '#4A7A20', color: '#F5E6C8',
    border: '2px solid #2E5010',
    cursor: 'pointer', fontFamily: "'VT323', monospace", fontSize: 16,
    boxShadow: '2px 2px 0 #1A2E08',
    borderRadius: 0,
  },
};
