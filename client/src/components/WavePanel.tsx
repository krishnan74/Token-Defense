interface WavePanelProps {
  gameState: {
    wave_number: number;
    is_wave_active?: boolean;
    game_over?: boolean;
    victory?: boolean;
  } | null;
  isWaveActive: boolean;
  isCountingDown: boolean;
  onStartWave: () => void;
}

export default function WavePanel({ gameState, isWaveActive, isCountingDown, onStartWave }: WavePanelProps) {
  if (!gameState) return null;
  const { wave_number, is_wave_active, game_over, victory } = gameState;
  const busy = is_wave_active || isWaveActive || isCountingDown;

  if (victory) {
    return (
      <div style={styles.panel}>
        <span style={{ color: '#2E7D32', fontWeight: 'bold', fontSize: 14 }}>
          ✓ VICTORY — All 10 waves cleared!
        </span>
      </div>
    );
  }
  if (game_over) {
    return (
      <div style={styles.panel}>
        <span style={{ color: '#C62828', fontWeight: 'bold', fontSize: 14 }}>✗ GAME OVER</span>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <span style={styles.label}>
        Wave <b style={{ color: '#1B5E20' }}>{wave_number + 1}</b> / 10
      </span>
      {wave_number > 0 && (
        <span style={styles.pips}>
          {Array.from({ length: wave_number }, (_, i) => (
            <span key={i} style={styles.pip} />
          ))}
        </span>
      )}
      <button
        style={{ ...styles.btn, ...(busy ? styles.btnBusy : {}) }}
        disabled={busy}
        onClick={onStartWave}
      >
        {isCountingDown ? 'Starting…' : busy ? 'Wave in progress…' : `▶  Start Wave ${wave_number + 1}`}
      </button>
    </div>
  );
}

const styles = {
  panel: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '7px 18px',
    background: '#F9FBE7',
    borderBottom: '1px solid rgba(76,175,80,0.2)',
    flexShrink: 0,
  },
  label: { fontSize: 13, color: '#558B2F', fontFamily: 'monospace' },
  pips: { display: 'flex', gap: 3, alignItems: 'center' },
  pip: {
    display: 'inline-block', width: 8, height: 8,
    borderRadius: '50%', background: '#4CAF50',
    boxShadow: '0 0 4px #4CAF5088',
  },
  btn: {
    padding: '6px 20px',
    background: 'linear-gradient(135deg, #388E3C, #2E7D32)',
    color: '#fff', border: 'none', borderRadius: 6,
    cursor: 'pointer', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold',
    boxShadow: '0 2px 6px rgba(46,125,50,0.35)',
    transition: 'opacity 0.2s', letterSpacing: 0.3,
  },
  btnBusy: {
    background: '#BDBDBD', boxShadow: 'none', cursor: 'default', opacity: 0.75,
  },
};
