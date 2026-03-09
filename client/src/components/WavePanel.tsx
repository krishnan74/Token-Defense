import { ENEMIES, OVERCLOCK_COST, WAVE_COMPOSITIONS, WAVE_MODIFIER_INFO, getWaveModifier } from '../constants';

interface WavePanelProps {
  gameState: { wave_number: number; is_wave_active?: boolean; overclock_used?: boolean } | null;
  isWaveActive: boolean;
  isCountingDown: boolean;
  overclockAvailable: boolean;
  onStartWave: () => void;
  onOverclock: () => void;
  onQuit: () => void;
}

const ENEMY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  TextJailbreak:   { bg: '#CC1111', border: '#660000', text: '#FFB8B8' },
  ContextOverflow: { bg: '#8B4513', border: '#4A1A00', text: '#FFD4A8' },
  HalluSwarm:      { bg: '#8800CC', border: '#440066', text: '#E8B8FF' },
  Boss:            { bg: '#1A1A2E', border: '#7B00FF', text: '#D4B8FF' },
};

const ENEMY_SHORT: Record<string, string> = {
  TextJailbreak: 'TJ', ContextOverflow: 'CO', HalluSwarm: 'HS', Boss: 'BOSS',
};

export default function WavePanel({
  gameState, isWaveActive, isCountingDown, overclockAvailable, onStartWave, onOverclock, onQuit,
}: WavePanelProps) {
  if (!gameState) return null;
  const { wave_number, is_wave_active } = gameState;
  const busy     = is_wave_active || isWaveActive || isCountingDown;
  const nextWave = wave_number + 1;
  const composition = WAVE_COMPOSITIONS[nextWave] ?? [];
  const modifier    = getWaveModifier(nextWave);
  const modInfo     = WAVE_MODIFIER_INFO[modifier];

  return (
    <div style={styles.panel}>
      {/* Wave counter + progress pips */}
      <div style={styles.left}>
        <span style={styles.waveLabel}>
          WAVE <span style={styles.waveNum}>{nextWave}</span>/10
        </span>
        {wave_number > 0 && (
          <div style={styles.pips}>
            {Array.from({ length: Math.min(wave_number, 10) }, (_, i) => (
              <div key={i} style={styles.pip} />
            ))}
          </div>
        )}
      </div>

      {/* Wave modifier banner */}
      {modifier > 0 && !busy && (
        <div style={{ ...styles.modifierBadge, color: modInfo.color, borderColor: modInfo.color }}>
          {modInfo.label}
        </div>
      )}

      {/* Wave preview — show next wave composition */}
      {composition.length > 0 && !busy && modifier === 0 && (
        <div style={styles.preview}>
          <span style={styles.previewLabel}>NEXT:</span>
          {composition.map((group) => {
            const cfg = ENEMY_COLORS[group.type] ?? { bg: '#555', border: '#333', text: '#fff' };
            const gold = ENEMIES[group.type]?.gold ?? 0;
            return (
              <div key={group.type} style={{ ...styles.enemyBadge, background: cfg.bg, border: `2px solid ${cfg.border}` }}>
                <span style={{ color: cfg.text, fontFamily: "'VT323', monospace", fontSize: 14 }}>
                  {ENEMY_SHORT[group.type] ?? group.type} ×{group.count}
                </span>
                <span style={{ color: '#FFD700', fontFamily: "'VT323', monospace", fontSize: 11, marginLeft: 4 }}>
                  {group.count * gold}g
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Overclock button */}
      {!busy && nextWave <= 10 && (
        <button
          style={{ ...styles.overclockBtn, ...(overclockAvailable ? {} : styles.overclockUsed) }}
          disabled={!overclockAvailable}
          onClick={onOverclock}
          title={`Doubles all tower fire rates for this wave (costs ${OVERCLOCK_COST}g)`}
        >
          {overclockAvailable ? `⚡ OVERCLOCK (${OVERCLOCK_COST}g)` : '⚡ USED'}
        </button>
      )}

      {/* Quit button — only available between waves */}
      {!busy && (
        <button style={styles.quitBtn} onClick={onQuit} title="Forfeit this game session">
          ✕ QUIT
        </button>
      )}

      {/* Start button */}
      <button
        style={{ ...styles.btn, ...(busy ? styles.btnBusy : {}) }}
        disabled={busy}
        onClick={onStartWave}
      >
        {isCountingDown ? 'STARTING...' : busy ? 'IN PROGRESS...' : `▶  START WAVE ${nextWave}`}
      </button>
    </div>
  );
}

const styles = {
  panel: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const,
    padding: '6px 14px',
    background: '#2C1507',
    borderBottom: '3px solid #4A2510',
    flexShrink: 0,
  },
  left: { display: 'flex', alignItems: 'center', gap: 10 },
  waveLabel: {
    fontFamily: "'VT323', monospace", fontSize: 23, color: '#A08060',
    letterSpacing: 1,
  },
  waveNum: { color: '#FFD700', textShadow: '1px 1px 0 #4A2510' },
  pips: { display: 'flex', gap: 3, alignItems: 'center' },
  pip: {
    width: 8, height: 8,
    background: '#5A9E2F',
    border: '1px solid #2E5010',
    boxShadow: '1px 1px 0 #1A2E08',
  },
  modifierBadge: {
    fontFamily: "'VT323', monospace", fontSize: 16,
    border: '1px solid', padding: '1px 8px',
    letterSpacing: 0.5,
  },
  preview: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 },
  previewLabel: {
    fontFamily: "'VT323', monospace", fontSize: 17, color: '#A08060', letterSpacing: 1,
  },
  enemyBadge: {
    display: 'flex', alignItems: 'center', gap: 2,
    padding: '1px 7px',
    borderRadius: 0,
    boxShadow: '2px 2px 0 rgba(0,0,0,0.4)',
  },
  overclockBtn: {
    padding: '4px 12px',
    background: '#3A2A6A',
    color: '#C8B8FF',
    border: '2px solid #5A3A9A',
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 17,
    boxShadow: '2px 2px 0 #1A0A3A',
    letterSpacing: 0.5,
    transition: 'background 0.1s',
  },
  overclockUsed: {
    background: '#2A1A3A', color: '#604880', border: '2px solid #3A2A5A',
    cursor: 'default', boxShadow: 'none',
  },
  quitBtn: {
    padding: '4px 10px',
    background: '#3A0A0A', color: '#D9534F',
    border: '2px solid #7A1A1A',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 16,
    letterSpacing: 0.5,
    boxShadow: '2px 2px 0 #1A0000',
  },
  btn: {
    marginLeft: 'auto' as const,
    padding: '6px 22px',
    background: '#4A7A20',
    color: '#F5E6C8',
    border: '3px solid #2E5010',
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 21,
    boxShadow: '3px 3px 0 #1A2E08',
    letterSpacing: 1,
    transition: 'background 0.1s',
  },
  btnBusy: {
    background: '#4A2510', color: '#8B6040', boxShadow: 'none',
    cursor: 'default', border: '3px solid #2C1507',
  },
};
