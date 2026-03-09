import { useState } from 'react';
import { BASE_MAX_HP, FACTORIES, MAX_TOWERS, TOWER_REPAIR_COST, TOWERS, TOWER_UPGRADE_COST, getDifficultyBaseHp, getTowerHealthMult, getTowerLevelMultiplier } from '../constants';
import type { Factory, Tower } from '../dojo/models';

interface TowerStatusProps {
  towers: unknown[];
  factories: unknown[];
  gameState: { gold?: number; is_wave_active?: boolean; base_health?: number; difficulty?: number } | null;
  onUpgrade: (factoryId: number | string) => void;
  onUpgradeTower: (towerId: number | string) => void;
  onSellTower: (towerId: number | string) => void;
  onSellFactory: (factoryId: number | string) => void;
  onRepairTower: (towerId: number | string) => void;
  onRepairAll?: (towerIds: (number | string)[]) => void;
  highlightedEntityId?: string | null;
  onHighlight?: (id: string | null) => void;
}

type SidebarTab = 'active' | 'sold';

export default function TowerStatus({ towers, factories, onUpgrade, onUpgradeTower, onSellTower, onSellFactory, onRepairTower, onRepairAll, gameState, highlightedEntityId, onHighlight }: TowerStatusProps) {
  const [tab, setTab] = useState<SidebarTab>('active');

  const aliveTowerCount = (towers as Array<{ is_alive?: boolean }>).filter((t) => t.is_alive !== false).length;
  const maxHp     = getDifficultyBaseHp(gameState?.difficulty ?? 1);
  const baseHealth = gameState?.base_health ?? maxHp;
  const basePct    = maxHp > 0 ? baseHealth / maxHp : 0;
  const hpColor    = basePct > 0.6 ? '#5CB85C' : basePct > 0.3 ? '#F0AD4E' : '#D9534F';

  const activeTowers    = (towers    as Tower[]).filter((t) => t.is_alive !== false);
  const soldTowers      = (towers    as Tower[]).filter((t) => t.is_alive === false);
  const activeFactories = (factories as Factory[]).filter((f) => f.is_active !== false);
  const soldFactories   = (factories as Factory[]).filter((f) => f.is_active === false);
  const soldCount       = soldTowers.length + soldFactories.length;

  return (
    <div style={styles.sidebar}>

      {/* Base health */}
      <div style={styles.sectionTitle}>BASE</div>
      <div style={styles.card}>
        <div style={styles.cardRow}>
          <span style={styles.cardName}>STRONGHOLD</span>
          <span style={{ ...styles.badge, background: hpColor, color: '#1A0D05' }}>
            {baseHealth}/{maxHp}
          </span>
        </div>
        <div style={styles.hpTrack}>
          <div style={{ ...styles.hpFill, width: `${basePct * 100}%`, background: hpColor }} />
        </div>
      </div>

      {/* Tab switcher */}
      <div style={styles.tabRow}>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'active' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('active')}
        >ACTIVE</button>
        <button
          style={{ ...styles.tabBtn, ...(tab === 'sold' ? styles.tabBtnActive : {}) }}
          onClick={() => setTab('sold')}
        >
          SOLD{soldCount > 0 ? ` (${soldCount})` : ''}
        </button>
      </div>

      {tab === 'active' && (
        <>
          {/* Towers */}
          <div style={{ ...styles.sectionTitle, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>TOWERS</span>
            <span style={{ color: aliveTowerCount >= MAX_TOWERS ? '#D9534F' : '#6B3A1E' }}>{aliveTowerCount}/{MAX_TOWERS}</span>
          </div>
          {/* Repair-All button: shown when 2+ towers need repair */}
          {(() => {
            const damagedIds = activeTowers
              .filter((t) => Number(t.health) < Number(t.max_health))
              .map((t) => t.tower_id);
            const repairAllCost = damagedIds.length * TOWER_REPAIR_COST;
            const canRepairAll = damagedIds.length >= 2 && !gameState?.is_wave_active && (gameState?.gold ?? 0) >= repairAllCost;
            if (damagedIds.length < 2 || gameState?.is_wave_active) return null;
            return (
              <button
                style={{ ...styles.repairAllBtn, opacity: canRepairAll ? 1 : 0.4 }}
                disabled={!canRepairAll}
                onClick={() => onRepairAll?.(damagedIds)}
                title={`Repair all ${damagedIds.length} damaged towers (${repairAllCost}g)`}
              >
                🔧 REPAIR ALL ({repairAllCost}g)
              </button>
            );
          })()}
          {activeTowers.length === 0 && <div style={styles.empty}>NONE PLACED</div>}
          {activeTowers.map((t) => <TowerCard key={String(t.tower_id)} t={t} gameState={gameState} highlightedEntityId={highlightedEntityId} onHighlight={onHighlight} onUpgradeTower={onUpgradeTower} onSellTower={onSellTower} onRepairTower={onRepairTower} />)}

          {/* Factories */}
          <div style={{ ...styles.sectionTitle, marginTop: 10 }}>FACTORIES</div>
          {activeFactories.length === 0 && <div style={styles.empty}>NONE PLACED</div>}
          {activeFactories.map((f) => <FactoryCard key={String(f.factory_id)} f={f} gameState={gameState} highlightedEntityId={highlightedEntityId} onHighlight={onHighlight} onUpgrade={onUpgrade} onSellFactory={onSellFactory} />)}
        </>
      )}

      {tab === 'sold' && (
        <>
          {soldCount === 0 && <div style={styles.empty}>NOTHING SOLD</div>}

          {soldTowers.length > 0 && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: 6 }}>TOWERS</div>
              {soldTowers.map((t) => <TowerCard key={String(t.tower_id)} t={t} gameState={gameState} highlightedEntityId={null} onHighlight={undefined} onUpgradeTower={onUpgradeTower} onSellTower={onSellTower} onRepairTower={onRepairTower} sold />)}
            </>
          )}

          {soldFactories.length > 0 && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: soldTowers.length > 0 ? 10 : 6 }}>FACTORIES</div>
              {soldFactories.map((f) => <FactoryCard key={String(f.factory_id)} f={f} gameState={gameState} highlightedEntityId={null} onHighlight={undefined} onUpgrade={onUpgrade} onSellFactory={onSellFactory} sold />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Tower card ──────────────────────────────────────────────────────────────
function TowerCard({ t, gameState, highlightedEntityId, onHighlight, onUpgradeTower, onSellTower, onRepairTower, sold }: {
  t: Tower;
  gameState: { gold?: number; is_wave_active?: boolean } | null;
  highlightedEntityId?: string | null;
  onHighlight?: (id: string | null) => void;
  onUpgradeTower: (id: number | string) => void;
  onSellTower: (id: number | string) => void;
  onRepairTower: (id: number | string) => void;
  sold?: boolean;
}) {
  const hp    = Number(t.health);
  const maxHp = Number(t.max_health);
  const pct   = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  const def   = TOWERS[Number(t.tower_type)];
  const alive = t.is_alive !== false;
  const level = Number(t.level) || 1;
  const fillColor = pct > 55 ? '#5CB85C' : pct > 22 ? '#F0AD4E' : '#D9534F';
  const upgCost   = TOWER_UPGRADE_COST[level];
  const hpMult    = getTowerHealthMult(hp, maxHp);
  const needsRepair = alive && hp < maxHp;
  const canRepair  = needsRepair && !gameState?.is_wave_active && (gameState?.gold ?? 0) >= TOWER_REPAIR_COST;
  const canUpgradeTower = alive && level < 3 && !gameState?.is_wave_active && (gameState?.gold ?? 0) >= (upgCost ?? 9999);
  const idStr = String(t.tower_id);
  const isHighlighted = highlightedEntityId === `tower-${idStr}`;
  const perfColor = hpMult >= 1.0 ? '#5CB85C' : hpMult >= 0.90 ? '#F0AD4E' : hpMult >= 0.75 ? '#FF8C00' : '#D9534F';

  return (
    <div
      key={idStr}
      style={{
        ...styles.card,
        opacity: sold ? 0.45 : 1,
        cursor: sold ? 'default' : 'pointer',
        outline: isHighlighted ? '2px solid #00E5FF' : 'none',
        boxShadow: isHighlighted ? '0 0 8px #00E5FF, 2px 2px 0 #0A0500' : styles.card.boxShadow,
      }}
      onClick={() => !sold && onHighlight?.(isHighlighted ? null : `tower-${idStr}`)}
    >
      <div style={styles.cardRow}>
        <span style={styles.cardName}>{def?.name}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ ...styles.badge, background: '#4A5A8A', color: '#B8C8FF' }}>Lv{level}</span>
          <span style={styles.idTag}>#{idStr}</span>
        </div>
      </div>
      {sold ? (
        <div style={{ ...styles.sub, color: '#6B3A1E' }}>SOLD</div>
      ) : (
        <>
          <div style={styles.hpTrack}>
            <div style={{ ...styles.hpFill, width: `${pct}%`, background: fillColor }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={styles.sub}>{hp}/{maxHp} HP</span>
            <span style={{ ...styles.sub, color: hpMult < 1.0 ? perfColor : '#7A8A6A', fontSize: 12 }}>
              ~{Math.round((def?.damage ?? 0) * getTowerLevelMultiplier(level) * hpMult)}dmg
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' as const }}>
            {level < 3 && (
              <button
                style={{ ...styles.upgradeBtn, flex: 1, opacity: canUpgradeTower ? 1 : 0.4 }}
                disabled={!canUpgradeTower}
                onClick={(e) => { e.stopPropagation(); onUpgradeTower(t.tower_id); }}
              >
                ↑ ({upgCost}g)
              </button>
            )}
            {needsRepair && !gameState?.is_wave_active && (
              <button
                style={{ ...styles.repairBtn, opacity: canRepair ? 1 : 0.4 }}
                disabled={!canRepair}
                onClick={(e) => { e.stopPropagation(); onRepairTower(t.tower_id); }}
                title={`Repair tower to full HP (${TOWER_REPAIR_COST}g)`}
              >
                🔧{TOWER_REPAIR_COST}g
              </button>
            )}
            {!gameState?.is_wave_active && (
              <button
                style={{ ...styles.sellBtn, flex: '0 0 auto' }}
                onClick={(e) => { e.stopPropagation(); onSellTower(t.tower_id); }}
                title="Remove tower (free)"
              >
                ✕
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Factory card ────────────────────────────────────────────────────────────
function FactoryCard({ f, gameState, highlightedEntityId, onHighlight, onUpgrade, onSellFactory, sold }: {
  f: Factory;
  gameState: { gold?: number; is_wave_active?: boolean } | null;
  highlightedEntityId?: string | null;
  onHighlight?: (id: string | null) => void;
  onUpgrade: (id: number | string) => void;
  onSellFactory: (id: number | string) => void;
  sold?: boolean;
}) {
  const def  = FACTORIES[Number(f.factory_type)];
  const fLevel = Number(f.level) || 1;
  const prod = Math.floor(def.baseOutput * (1 + 0.5 * (fLevel - 1)));
  const atMaxLevel = fLevel >= 3;
  const canUpgrade = !sold && !atMaxLevel && !gameState?.is_wave_active && (gameState?.gold ?? 0) >= 50;
  const upgradeGold = 50 * (fLevel - 1);
  const sellRefund = Math.floor((def.cost + upgradeGold) / 2);
  const fIdStr = String(f.factory_id);
  const isFHighlighted = highlightedEntityId === `factory-${fIdStr}`;

  return (
    <div
      key={fIdStr}
      style={{
        ...styles.card,
        opacity: sold ? 0.45 : 1,
        cursor: sold ? 'default' : 'pointer',
        outline: isFHighlighted ? '2px solid #00E5FF' : 'none',
        boxShadow: isFHighlighted ? '0 0 8px #00E5FF, 2px 2px 0 #0A0500' : styles.card.boxShadow,
      }}
      onClick={() => !sold && onHighlight?.(isFHighlighted ? null : `factory-${fIdStr}`)}
    >
      <div style={styles.cardRow}>
        <span style={styles.cardName}>{def?.name}</span>
        <span style={{ ...styles.badge, background: '#4A7A20', color: '#C6F6C6' }}>Lv{f.level}</span>
      </div>
      {sold ? (
        <div style={{ ...styles.sub, color: '#6B3A1E' }}>SOLD</div>
      ) : (
        <>
          <div style={styles.sub}>{prod} tok/wave</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 0 }}>
            {atMaxLevel ? (
              <span style={{ ...styles.sub, fontSize: 12, color: '#FFD700', border: '1px solid #8B6900', padding: '2px 6px', marginTop: 5 }}>MAX LV</span>
            ) : (
              <button
                style={{ ...styles.upgradeBtn, flex: 1, opacity: canUpgrade ? 1 : 0.4 }}
                disabled={!canUpgrade}
                onClick={(e) => { e.stopPropagation(); onUpgrade(f.factory_id); }}
              >
                ↑ (50g)
              </button>
            )}
            {!gameState?.is_wave_active && (
              <button
                style={{ ...styles.sellBtn, flex: '0 0 auto' }}
                onClick={(e) => { e.stopPropagation(); onSellFactory(f.factory_id); }}
                title={`Sell factory (refund ${sellRefund}g incl. upgrades)`}
              >
                ✕ {sellRefund}g
              </button>
            )}
          </div>
        </>
      )}
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
    color: '#C8905A', fontSize: 15, letterSpacing: 2, marginBottom: 5,
  },
  empty: {
    fontFamily: "'VT323', monospace",
    color: '#8A5A3A', fontSize: 15, marginBottom: 6, letterSpacing: 1,
  },
  tabRow: {
    display: 'flex', gap: 4, marginTop: 10, marginBottom: 6,
  },
  tabBtn: {
    flex: 1, padding: '3px 0',
    background: 'transparent', color: '#6B3A1E',
    border: '2px solid #4A2510',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 13, letterSpacing: 1,
  },
  tabBtnActive: {
    background: '#4A2510', color: '#C8905A',
    border: '2px solid #C8905A',
  },
  card: {
    background: '#3A1A0A',
    border: '2px solid #4A2510',
    padding: '6px 8px', marginBottom: 5,
    boxShadow: '2px 2px 0 #0A0500',
  },
  cardRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardName: {
    fontFamily: "'VT323', monospace", color: '#F5E6C8', fontSize: 17, letterSpacing: 0.5,
  },
  idTag: { fontFamily: "'VT323', monospace", color: '#9A6A4A', fontSize: 14 },
  badge: {
    fontFamily: "'VT323', monospace",
    fontSize: 13, padding: '0 5px',
    border: 'none', boxShadow: '1px 1px 0 #0A0500',
  },
  hpTrack: { height: 5, background: '#1A0D05', border: '1px solid #4A2510', marginBottom: 3 },
  hpFill:  { height: '100%', transition: 'width 0.3s' },
  sub: { fontFamily: "'VT323', monospace", color: '#9A6A4A', fontSize: 14 },
  upgradeBtn: {
    marginTop: 5, padding: '3px 0',
    background: '#2A4A10', color: '#A8D8A8',
    border: '2px solid #3A6A18',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 15, letterSpacing: 0.5,
    boxShadow: '2px 2px 0 #0A1A00',
    transition: 'background 0.1s',
  },
  sellBtn: {
    marginTop: 5, padding: '3px 6px',
    background: '#4A1A0A', color: '#FF8080',
    border: '2px solid #6A2A1A',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 14,
    boxShadow: '2px 2px 0 #1A0500',
    transition: 'background 0.1s',
  },
  repairBtn: {
    marginTop: 5, padding: '3px 6px',
    background: '#1A3A10', color: '#80FF80',
    border: '2px solid #2A6A1A',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 13,
    boxShadow: '2px 2px 0 #0A1500',
    transition: 'background 0.1s',
    flex: '0 0 auto',
  },
  repairAllBtn: {
    width: '100%', padding: '4px 0',
    background: '#0D2808', color: '#80FF80',
    border: '2px solid #2A6A1A',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 13,
    boxShadow: '2px 2px 0 #0A1500',
    letterSpacing: 0.5, marginBottom: 4,
  },
};
