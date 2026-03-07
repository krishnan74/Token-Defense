import { FACTORIES, TOKEN_NAMES, TOWERS } from '../constants';
import type { BuildSelection } from '../App';

interface BuildMenuProps {
  selected: BuildSelection | null;
  onSelect: (sel: BuildSelection | null) => void;
  gameState: { gold: number; is_wave_active?: boolean } | null;
}

const TOWER_ACCENT: Record<number, string>   = { 0: '#1565C0', 1: '#6A1B9A', 2: '#E65100' };
const FACTORY_ACCENT: Record<number, string> = { 0: '#0277BD', 1: '#2E7D32', 2: '#BF360C' };
const TOKEN_LABEL: Record<string, string>    = { input_tokens: 'Input', image_tokens: 'Image', code_tokens: 'Code' };

export default function BuildMenu({ selected, onSelect, gameState }: BuildMenuProps) {
  const gold = gameState?.gold ?? 0;
  const disabled = gameState?.is_wave_active;

  const isActive = (type: 'tower' | 'factory', id: number) =>
    selected?.type === type && selected?.id === id;

  return (
    <div style={styles.menu}>
      <span style={styles.sectionLabel}>Towers</span>
      {Object.entries(TOWERS).map(([id, t]) => {
        const numId = Number(id);
        const active = isActive('tower', numId);
        const accent = TOWER_ACCENT[numId];
        return (
          <button
            key={`tw-${id}`}
            disabled={disabled}
            onClick={() => onSelect(active ? null : { type: 'tower', id: numId })}
            style={{
              ...styles.card,
              borderColor: active ? accent : 'rgba(0,0,0,0.12)',
              background: active ? `${accent}18` : '#fff',
              outline: active ? `2px solid ${accent}` : 'none',
              outlineOffset: -1,
            }}
          >
            <span style={{ ...styles.cardName, color: accent }}>{t.name}</span>
            <span style={styles.cardStat}>Free · {TOKEN_LABEL[TOKEN_NAMES[t.tokenType]]} token</span>
          </button>
        );
      })}

      <div style={styles.divider} />

      <span style={styles.sectionLabel}>Factories</span>
      {Object.entries(FACTORIES).map(([id, f]) => {
        const numId = Number(id);
        const active = isActive('factory', numId);
        const accent = FACTORY_ACCENT[numId];
        const canAfford = gold >= f.cost;
        return (
          <button
            key={`fc-${id}`}
            disabled={disabled || !canAfford}
            onClick={() => onSelect(active ? null : { type: 'factory', id: numId })}
            style={{
              ...styles.card,
              borderColor: active ? accent : 'rgba(0,0,0,0.12)',
              background: active ? `${accent}18` : '#fff',
              outline: active ? `2px solid ${accent}` : 'none',
              outlineOffset: -1,
              opacity: canAfford ? 1 : 0.4,
            }}
          >
            <span style={{ ...styles.cardName, color: accent }}>{f.name}</span>
            <span style={styles.cardStat}>{f.cost}g · {f.baseOutput} tok/wave</span>
          </button>
        );
      })}

      <div style={styles.divider} />
      <button style={styles.clearBtn} onClick={() => onSelect(null)}>✕ Clear</button>
    </div>
  );
}

const styles = {
  menu: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px',
    background: '#F1F8E9',
    borderTop: '1px solid rgba(76,175,80,0.25)',
    flexWrap: 'wrap' as const, flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 10, color: '#888', textTransform: 'uppercase' as const,
    letterSpacing: 0.8, marginRight: 2,
  },
  card: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start' as const,
    padding: '5px 10px',
    border: '1.5px solid rgba(0,0,0,0.12)',
    borderRadius: 6, cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'background 0.15s, border-color 0.15s',
    background: '#fff',
  },
  cardName: { fontSize: 12, fontWeight: 'bold', lineHeight: 1.4 },
  cardStat: { fontSize: 10, color: '#888', lineHeight: 1.3 },
  divider: { width: 1, height: 32, background: 'rgba(0,0,0,0.1)', margin: '0 4px' },
  clearBtn: {
    padding: '5px 12px',
    background: 'transparent', color: '#9E9E9E',
    border: '1.5px solid rgba(0,0,0,0.1)',
    borderRadius: 6, cursor: 'pointer',
    fontFamily: 'monospace', fontSize: 11,
  },
};
