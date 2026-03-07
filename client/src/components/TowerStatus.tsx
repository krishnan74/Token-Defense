import { BASE_MAX_HP, FACTORIES, getTokenTier, TOKEN_NAMES, TOWERS } from '../constants';
import type { Factory, Tower } from '../dojo/models';
import type { WaveSnapshot } from '../simulation/WaveSimulator';

interface TowerStatusProps {
  towers: unknown[];
  factories: unknown[];
  liveSnapshot: WaveSnapshot | null;
  gameState: { gold?: number; is_wave_active?: boolean; base_health?: number } | null;
  onUpgrade: (factoryId: number | string) => void;
}

export default function TowerStatus({ towers, factories, liveSnapshot, onUpgrade, gameState }: TowerStatusProps) {
  const isWave = !!liveSnapshot;
  const baseHealth = gameState?.base_health ?? BASE_MAX_HP;
  const basePct = BASE_MAX_HP > 0 ? baseHealth / BASE_MAX_HP : 0;
  const baseHpColor = basePct > 0.6 ? '#4CAF50' : basePct > 0.3 ? '#FFA726' : '#EF5350';

  return (
    <div style={styles.sidebar}>
      <div style={styles.sectionTitle}>Base</div>
      <div style={{ ...styles.card, marginBottom: 10 }}>
        <div style={styles.cardRow}>
          <span style={styles.cardName}>Stronghold</span>
          <span style={{ ...styles.lvBadge, background: baseHpColor }}>{baseHealth}/{BASE_MAX_HP}</span>
        </div>
        <div style={styles.hpTrack}>
          <div style={{ ...styles.hpFill, width: `${basePct * 100}%`, background: baseHpColor }} />
        </div>
        <div style={styles.sub}>Base health</div>
      </div>

      <div style={styles.sectionTitle}>Towers</div>
      {towers.length === 0 && <div style={styles.empty}>None placed</div>}
      {(towers as Tower[]).map((t) => {
        const live = liveSnapshot?.towers?.find((lt) => lt.tower_id === t.tower_id) ?? t;
        const hp    = live.health ?? Number(t.health);
        const maxHp = Number(t.max_health);
        const pct   = maxHp > 0 ? (hp / maxHp) * 100 : 0;
        const def   = TOWERS[Number(t.tower_type)];
        const alive = (live as { is_alive?: boolean }).is_alive !== false;

        const tier = isWave && liveSnapshot?.tokens && liveSnapshot.maxTokens && def
          ? getTokenTier(
              liveSnapshot.tokens[TOKEN_NAMES[def.tokenType] as keyof typeof liveSnapshot.tokens] ?? 0,
              liveSnapshot.maxTokens[TOKEN_NAMES[def.tokenType] as keyof typeof liveSnapshot.maxTokens] ?? 0,
            )
          : null;

        return (
          <div key={String(t.tower_id)} style={{ ...styles.card, opacity: alive ? 1 : 0.35 }}>
            <div style={styles.cardRow}>
              <span style={styles.cardName}>{def?.name} <span style={styles.idTag}>#{String(t.tower_id)}</span></span>
              {tier && <span style={{ ...styles.tierBadge, background: tier.color }}>{tier.label}</span>}
            </div>
            <div style={styles.hpTrack}>
              <div style={{
                ...styles.hpFill,
                width: `${pct}%`,
                background: pct > 55 ? '#66BB6A' : pct > 22 ? '#FFA726' : '#EF5350',
              }} />
            </div>
            <div style={styles.sub}>{hp}/{maxHp} HP</div>
            {tier && (
              <div style={{ ...styles.sub, color: tier.color, marginTop: 2 }}>
                {tier.label === 'Powered'
                  ? `Full power · ${tier.cooldown}s`
                  : `${Math.round(tier.dmgMultiplier * 100)}% dmg · ${tier.cooldown}s cd`}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ ...styles.sectionTitle, marginTop: 14 }}>Factories</div>
      {factories.length === 0 && <div style={styles.empty}>None placed</div>}
      {(factories as Factory[]).map((f) => {
        const def  = FACTORIES[Number(f.factory_type)];
        const prod = Math.floor(def.baseOutput * (1 + 0.5 * (Number(f.level) - 1)));
        return (
          <div key={String(f.factory_id)} style={styles.card}>
            <div style={styles.cardRow}>
              <span style={styles.cardName}>{def?.name} <span style={styles.idTag}>#{String(f.factory_id)}</span></span>
              <span style={styles.lvBadge}>Lv{f.level}</span>
            </div>
            <div style={styles.sub}>{prod} tokens/wave</div>
            <button
              style={styles.upgradeBtn}
              disabled={gameState?.is_wave_active || (gameState?.gold ?? 0) < 50}
              onClick={() => onUpgrade(f.factory_id)}
            >
              ↑ Upgrade (50g)
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  sidebar: {
    width: 188, flexShrink: 0,
    background: '#FAFAFA',
    borderLeft: '1px solid rgba(0,0,0,0.08)',
    padding: '10px 8px',
    overflowY: 'auto' as const, fontSize: 12,
  },
  sectionTitle: {
    color: '#9E9E9E', textTransform: 'uppercase' as const,
    fontSize: 10, letterSpacing: 1, marginBottom: 7, fontWeight: 'bold',
  },
  empty: { color: '#BDBDBD', fontSize: 11, marginBottom: 8, fontStyle: 'italic' as const },
  card: {
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 6, padding: '7px 9px', marginBottom: 7,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  cardRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardName: { color: '#424242', fontFamily: 'monospace', fontSize: 11 },
  idTag: { color: '#BDBDBD', fontSize: 10 },
  tierBadge: {
    fontSize: 9, fontWeight: 'bold', color: '#fff',
    padding: '1px 5px', borderRadius: 3,
    textTransform: 'uppercase' as const, letterSpacing: 0.3, flexShrink: 0,
  },
  lvBadge: {
    fontSize: 9, fontWeight: 'bold', color: '#fff',
    padding: '1px 5px', borderRadius: 3, background: '#78909C',
  },
  hpTrack: { height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 3 },
  hpFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  sub: { color: '#9E9E9E', fontSize: 10 },
  upgradeBtn: {
    marginTop: 5, padding: '3px 9px', width: '100%',
    background: '#E8F5E9', color: '#388E3C',
    border: '1px solid rgba(56,142,60,0.35)',
    borderRadius: 4, cursor: 'pointer',
    fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold',
    transition: 'background 0.15s',
  },
};
