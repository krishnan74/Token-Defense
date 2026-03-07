import type { TokenMap, WaveSnapshot } from '../simulation/WaveSimulator';

interface GameStateDisplay {
  gold: number;
  input_tokens?: number;
  image_tokens?: number;
  code_tokens?: number;
  wave_number: number;
}

interface ResourceBarProps {
  gameState: GameStateDisplay | null;
  waveSnapshot: WaveSnapshot | null;
}

export default function ResourceBar({ gameState, waveSnapshot }: ResourceBarProps) {
  if (!gameState) return null;
  const { gold, input_tokens, image_tokens, code_tokens, wave_number } = gameState;
  const isWave = !!waveSnapshot;
  const maxT: TokenMap | undefined = waveSnapshot?.maxTokens;

  const renderToken = (label: string, val: number | undefined, color: string, max: number | undefined) => {
    const v = val ?? 0;
    const pct = max != null && max > 0 ? v / max : 1;
    const isLow = isWave && pct < 0.3;
    return (
      <span style={styles.tokenGroup}>
        <span style={styles.item}>
          {label}:{' '}
          <b style={{ color: isLow ? '#D32F2F' : color }}>{v}</b>
          {isWave && max != null && (
            <span style={{ color: '#9E9E9E', fontSize: 10 }}>/{max}</span>
          )}
        </span>
        {isWave && max != null && max > 0 && (
          <div style={styles.tokenBar}>
            <div style={{
              ...styles.tokenFill,
              width: `${Math.max(0, pct * 100)}%`,
              background: isLow ? '#EF5350' : color,
            }} />
          </div>
        )}
      </span>
    );
  };

  return (
    <div style={styles.bar}>
      <span style={styles.waveTag}>Wave <b style={{ color: '#1B5E20' }}>{wave_number}</b>/10</span>
      <div style={styles.divider} />
      <span style={styles.item}>Gold: <b style={{ color: '#E65100' }}>{gold}</b></span>
      <div style={styles.divider} />
      {renderToken('Input', input_tokens, '#0288D1', maxT?.input_tokens)}
      {renderToken('Image', image_tokens, '#2E7D32', maxT?.image_tokens)}
      {renderToken('Code',  code_tokens,  '#BF360C', maxT?.code_tokens)}
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
  tokenBar: { height: 3, background: 'rgba(0,0,0,0.1)', borderRadius: 2, overflow: 'hidden', width: 64 },
  tokenFill: { height: '100%', transition: 'width 0.1s', borderRadius: 2 },
};
