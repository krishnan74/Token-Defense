import { BASE_MAX_HP, FACTORIES, TOWERS } from '../constants';
import type { Factory, Tower } from '../dojo/models';

interface TowerStatusProps {
  towers: unknown[];
  factories: unknown[];
  gameState: { gold?: number; is_wave_active?: boolean; base_health?: number } | null;
  onUpgrade: (factoryId: number | string) => void;
}

export default function TowerStatus({ towers, factories, onUpgrade, gameState }: TowerStatusProps) {
  const baseHealth = gameState?.base_health ?? BASE_MAX_HP;
  const basePct    = BASE_MAX_HP > 0 ? baseHealth / BASE_MAX_HP : 0;
  const hpColor    = basePct > 0.6 ? '#5CB85C' : basePct > 0.3 ? '#F0AD4E' : '#D9534F';

  return (
    <div style={styles.sidebar}>

      {/* Base health */}
      <div style={styles.sectionTitle}>BASE</div>
      <div style={styles.card}>
        <div style={styles.cardRow}>
          <span style={styles.cardName}>STRONGHOLD</span>
          <span style={{ ...styles.badge, background: hpColor, color: '#1A0D05' }}>
            {baseHealth}/{BASE_MAX_HP}
          </span>
        </div>
        <div style={styles.hpTrack}>
          <div style={{ ...styles.hpFill, width: `${basePct * 100}%`, background: hpColor }} />
        </div>
      </div>

      {/* Towers */}
      <div style={{ ...styles.sectionTitle, marginTop: 10 }}>TOWERS</div>
      {towers.length === 0 && <div style={styles.empty}>NONE PLACED</div>}
      {(towers as Tower[]).map((t) => {
        const hp    = Number(t.health);
        const maxHp = Number(t.max_health);
        const pct   = maxHp > 0 ? (hp / maxHp) * 100 : 0;
        const def   = TOWERS[Number(t.tower_type)];
        const alive = t.is_alive !== false;
        const fillColor = pct > 55 ? '#5CB85C' : pct > 22 ? '#F0AD4E' : '#D9534F';
        return (
          <div key={String(t.tower_id)} style={{ ...styles.card, opacity: alive ? 1 : 0.35 }}>
            <div style={styles.cardRow}>
              <span style={styles.cardName}>{def?.name}</span>
              <span style={styles.idTag}>#{String(t.tower_id)}</span>
            </div>
            <div style={styles.hpTrack}>
              <div style={{ ...styles.hpFill, width: `${pct}%`, background: fillColor }} />
            </div>
            <div style={styles.sub}>{hp}/{maxHp} HP</div>
          </div>
        );
      })}

      {/* Factories */}
      <div style={{ ...styles.sectionTitle, marginTop: 10 }}>FACTORIES</div>
      {factories.length === 0 && <div style={styles.empty}>NONE PLACED</div>}
      {(factories as Factory[]).map((f) => {
        const def  = FACTORIES[Number(f.factory_type)];
        const prod = Math.floor(def.baseOutput * (1 + 0.5 * (Number(f.level) - 1)));
        const canUpgrade = !gameState?.is_wave_active && (gameState?.gold ?? 0) >= 50;
        return (
          <div key={String(f.factory_id)} style={styles.card}>
            <div style={styles.cardRow}>
              <span style={styles.cardName}>{def?.name}</span>
              <span style={{ ...styles.badge, background: '#4A7A20', color: '#C6F6C6' }}>Lv{f.level}</span>
            </div>
            <div style={styles.sub}>{prod} tok/wave</div>
            <button
              style={{ ...styles.upgradeBtn, opacity: canUpgrade ? 1 : 0.4 }}
              disabled={!canUpgrade}
              onClick={() => onUpgrade(f.factory_id)}
            >
              ↑ UPGRADE (50g)
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  sidebar: {
    width: 170, flexShrink: 0,
    background: '#2C1507',
    borderLeft: '3px solid #4A2510',
    padding: '8px 7px',
    overflowY: 'auto' as const,
  },
  sectionTitle: {
    fontFamily: "'VT323', monospace",
    color: '#6B3A1E', fontSize: 13, letterSpacing: 2, marginBottom: 5,
  },
  empty: {
    fontFamily: "'VT323', monospace",
    color: '#4A2510', fontSize: 13, marginBottom: 6, letterSpacing: 1,
  },
  card: {
    background: '#3A1A0A',
    border: '2px solid #4A2510',
    padding: '6px 8px', marginBottom: 5,
    boxShadow: '2px 2px 0 #0A0500',
  },
  cardRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardName: {
    fontFamily: "'VT323', monospace", color: '#F5E6C8', fontSize: 15, letterSpacing: 0.5,
  },
  idTag: { fontFamily: "'VT323', monospace", color: '#6B3A1E', fontSize: 12 },
  badge: {
    fontFamily: "'VT323', monospace",
    fontSize: 11, padding: '0 5px',
    border: 'none', boxShadow: '1px 1px 0 #0A0500',
  },
  hpTrack: { height: 5, background: '#1A0D05', border: '1px solid #4A2510', marginBottom: 3 },
  hpFill:  { height: '100%', transition: 'width 0.3s' },
  sub: { fontFamily: "'VT323', monospace", color: '#6B3A1E', fontSize: 12 },
  upgradeBtn: {
    marginTop: 5, padding: '3px 0', width: '100%',
    background: '#2A4A10', color: '#A8D8A8',
    border: '2px solid #3A6A18',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 13, letterSpacing: 0.5,
    boxShadow: '2px 2px 0 #0A1A00',
    transition: 'background 0.1s',
  },
};
