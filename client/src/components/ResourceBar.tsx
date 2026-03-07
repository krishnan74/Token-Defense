interface GameStateDisplay {
  gold: number;
  input_tokens?: number;
  image_tokens?: number;
  code_tokens?: number;
  wave_number: number;
}

interface ResourceBarProps {
  gameState: GameStateDisplay | null;
}

export default function ResourceBar({ gameState }: ResourceBarProps) {
  if (!gameState) return null;
  const { gold, input_tokens, image_tokens, code_tokens, wave_number } = gameState;

  const renderToken = (label: string, val: number | undefined, color: string) => (
    <span style={styles.tokenGroup}>
      <span style={styles.item}>
        {label}: <b style={{ color }}>{val ?? 0}</b>
      </span>
    </span>
  );

  return (
    <div style={styles.bar}>
      <span style={styles.waveTag}>Wave <b style={{ color: '#1B5E20' }}>{wave_number}</b>/10</span>
      <div style={styles.divider} />
      <span style={styles.item}>Gold: <b style={{ color: '#E65100' }}>{gold}</b></span>
      <div style={styles.divider} />
      {renderToken('Input', input_tokens, '#0288D1')}
      {renderToken('Image', image_tokens, '#2E7D32')}
      {renderToken('Code',  code_tokens,  '#BF360C')}
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 18,
    padding: '7px 18px',
    background: '#F1F8E9',
    borderBottom: '1px solid rgba(76,175,80,0.25)',
    fontSize: 13, flexShrink: 0,
  },
  waveTag: { color: '#388E3C', fontFamily: 'monospace', fontSize: 13 },
  item: { color: '#555' },
  divider: { width: 1, height: 16, background: 'rgba(76,175,80,0.2)' },
  tokenGroup: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
};
