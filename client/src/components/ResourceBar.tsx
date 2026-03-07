interface GameStateDisplay {
  gold: number;
  input_tokens?: number;
  image_tokens?: number;
  code_tokens?: number;
  wave_number: number;
  base_health?: number;
}

export default function ResourceBar({ gameState }: { gameState: GameStateDisplay | null }) {
  if (!gameState) return null;
  const { gold, input_tokens, image_tokens, code_tokens } = gameState;

  return (
    <div style={styles.bar}>
      {/* Gold */}
      <div style={styles.resource}>
        <span style={styles.icon}>◆</span>
        <span style={styles.label}>GOLD</span>
        <span style={{ ...styles.value, color: '#FFD700' }}>{gold}</span>
      </div>

      <div style={styles.divider} />

      {/* Tokens */}
      <div style={styles.resource}>
        <span style={styles.icon}>▲</span>
        <span style={styles.label}>INPUT</span>
        <span style={{ ...styles.value, color: '#63B3ED' }}>{input_tokens ?? 0}</span>
      </div>
      <div style={styles.resource}>
        <span style={styles.icon}>■</span>
        <span style={styles.label}>IMAGE</span>
        <span style={{ ...styles.value, color: '#68D391' }}>{image_tokens ?? 0}</span>
      </div>
      <div style={styles.resource}>
        <span style={styles.icon}>●</span>
        <span style={styles.label}>CODE</span>
        <span style={{ ...styles.value, color: '#FC8181' }}>{code_tokens ?? 0}</span>
      </div>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 0,
    padding: '5px 14px',
    background: '#2C1507',
    borderBottom: '3px solid #4A2510',
    flexShrink: 0, flexWrap: 'wrap' as const,
  },
  resource: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '0 14px',
  },
  icon: {
    fontFamily: "'VT323', monospace", fontSize: 14, color: '#6B3A1E',
  },
  label: {
    fontFamily: "'VT323', monospace", fontSize: 14, color: '#A08060', letterSpacing: 1,
  },
  value: {
    fontFamily: "'VT323', monospace", fontSize: 20, fontWeight: 'normal',
    textShadow: '1px 1px 0 rgba(0,0,0,0.5)',
  },
  divider: { width: 2, height: 24, background: '#4A2510', margin: '0 6px' },
};
