import { FACTORIES, TOKEN_NAMES, TOWERS } from '../constants';
import type { BuildSelection } from '../App';

interface BuildMenuProps {
  selected: BuildSelection | null;
  onSelect: (sel: BuildSelection | null) => void;
  gameState: { gold: number; is_wave_active?: boolean } | null;
}

const TOWER_COLORS: Record<number, { bg: string; border: string; active: string }> = {
  0: { bg: '#1A3D70', border: '#2B6CB0', active: '#3A8AE0' },
  1: { bg: '#4A1A7A', border: '#7B3FAD', active: '#9B5FCF' },
  2: { bg: '#7A3400', border: '#C05800', active: '#E07820' },
};

const FACTORY_COLORS: Record<number, { bg: string; border: string; active: string }> = {
  0: { bg: '#0D3A6A', border: '#1A6FAF', active: '#2A8FCF' },
  1: { bg: '#144014', border: '#2A7A2A', active: '#3A9A3A' },
  2: { bg: '#6A1D0A', border: '#AF3A1A', active: '#CF5A3A' },
};

const TOKEN_LABEL: Record<string, string> = {
  input_tokens: 'Input', image_tokens: 'Image', code_tokens: 'Code',
};

export default function BuildMenu({ selected, onSelect, gameState }: BuildMenuProps) {
  const gold     = gameState?.gold ?? 0;
  const disabled = !!gameState?.is_wave_active;

  const isActive = (type: 'tower' | 'factory', id: number) =>
    selected?.type === type && selected?.id === id;

  return (
    <div style={styles.menu}>
      <span style={styles.sectionLabel}>TOWERS</span>
      {Object.entries(TOWERS).map(([id, t]) => {
        const numId  = Number(id);
        const active = isActive('tower', numId);
        const cfg    = TOWER_COLORS[numId] ?? TOWER_COLORS[0];
        return (
          <button
            key={`tw-${id}`}
            disabled={disabled}
            onClick={() => onSelect(active ? null : { type: 'tower', id: numId })}
            style={{
              ...styles.card,
              background: active ? cfg.active : cfg.bg,
              border: `3px solid ${active ? '#FFD700' : cfg.border}`,
              boxShadow: active ? '0 0 0 2px #FFD700, 3px 3px 0 #0A0500' : '3px 3px 0 #0A0500',
            }}
          >
            <span style={{ ...styles.cardName, color: active ? '#FFD700' : '#F5E6C8' }}>{t.name}</span>
            <span style={styles.cardStat}>Free · {TOKEN_LABEL[TOKEN_NAMES[t.tokenType]]}</span>
          </button>
        );
      })}

      <div style={styles.divider} />

      <span style={styles.sectionLabel}>FACTORIES</span>
      {Object.entries(FACTORIES).map(([id, f]) => {
        const numId    = Number(id);
        const active   = isActive('factory', numId);
        const cfg      = FACTORY_COLORS[numId] ?? FACTORY_COLORS[0];
        const canAfford = gold >= f.cost;
        return (
          <button
            key={`fc-${id}`}
            disabled={disabled || !canAfford}
            onClick={() => onSelect(active ? null : { type: 'factory', id: numId })}
            style={{
              ...styles.card,
              background: active ? cfg.active : cfg.bg,
              border: `3px solid ${active ? '#FFD700' : cfg.border}`,
              boxShadow: active ? '0 0 0 2px #FFD700, 3px 3px 0 #0A0500' : '3px 3px 0 #0A0500',
              opacity: canAfford ? 1 : 0.4,
            }}
          >
            <span style={{ ...styles.cardName, color: active ? '#FFD700' : '#F5E6C8' }}>{f.name}</span>
            <span style={styles.cardStat}>{f.cost}g · {f.baseOutput} tok/wave</span>
          </button>
        );
      })}

      <div style={styles.divider} />
      <button style={styles.clearBtn} onClick={() => onSelect(null)}>✕ CLEAR</button>
    </div>
  );
}

const styles = {
  menu: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px',
    background: '#2C1507',
    borderTop: '3px solid #4A2510',
    flexWrap: 'wrap' as const, flexShrink: 0,
  },
  sectionLabel: {
    fontFamily: "'VT323', monospace",
    fontSize: 14, color: '#6B3A1E', letterSpacing: 1,
  },
  card: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start',
    padding: '5px 12px',
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: "'VT323', monospace",
    transition: 'background 0.1s',
    minWidth: 72,
  },
  cardName: { fontSize: 18, lineHeight: 1.2 },
  cardStat: { fontSize: 12, color: '#A08060', lineHeight: 1.2 },
  divider: { width: 2, height: 36, background: '#4A2510', margin: '0 4px' },
  clearBtn: {
    padding: '5px 14px',
    background: 'transparent', color: '#6B3A1E',
    border: '2px solid #4A2510',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 16,
    transition: 'color 0.1s',
  },
};
