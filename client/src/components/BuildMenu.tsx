import { useState } from 'react';
import { FACTORIES, TOKEN_NAMES, TOWERS, TOKEN_TIERS, TIER_DMG_MULT_X100, TIER_COOLDOWN_X100, VISION_RANGE_SQ, TOWER_RANGE } from '../constants';
import type { BuildSelection } from '../App';

interface BuildMenuProps {
  selected: BuildSelection | null;
  onSelect: (sel: BuildSelection | null) => void;
  gameState: { gold: number; is_wave_active?: boolean } | null;
  isMuted: boolean;
  toggleMute: () => void;
  onShowTour: () => void;
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

const TOKEN_COLOR: Record<string, string> = {
  input_tokens: '#63B3ED',
  image_tokens: '#68D391',
  code_tokens:  '#FC8181',
};

const TOKEN_ICON: Record<string, string> = {
  input_tokens: '▲',
  image_tokens: '■',
  code_tokens:  '●',
};

const TOKEN_SHORT: Record<string, string> = {
  input_tokens: 'INPUT',
  image_tokens: 'IMAGE',
  code_tokens:  'CODE',
};

// ── Tier reference overlay ──────────────────────────────────────────────────
function TierReference({ onClose }: { onClose: () => void }) {
  return (
    <div style={ref.overlay} onClick={onClose}>
      <div style={ref.panel} onClick={(e) => e.stopPropagation()}>
        <div style={ref.header}>
          <span style={ref.title}>GAME REFERENCE</span>
          <button style={ref.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Token mechanic explanation */}
        <div style={ref.section}>HOW TOKENS POWER TOWERS</div>
        <div style={ref.explain}>
          Each wave, your factories produce tokens. As towers fire they consume 1 token per shot.
          When a token type runs low, those towers slow down and deal less damage — so later enemies
          face weaker defenses. <span style={{ color: '#FFD700' }}>Build more factories to keep towers powered throughout the wave.</span>
        </div>

        {/* Token tier table */}
        <div style={ref.section}>TOKEN TIERS</div>
        <table style={ref.table}>
          <thead>
            <tr>
              <th style={ref.th}>Tier</th>
              <th style={ref.th}>Min %</th>
              <th style={ref.th}>DMG</th>
              <th style={ref.th}>Cooldown</th>
            </tr>
          </thead>
          <tbody>
            {TOKEN_TIERS.map((tier, i) => (
              <tr key={tier.label}>
                <td style={{ ...ref.td, color: tier.color }}>{tier.label}</td>
                <td style={ref.td}>{tier.minRatio > 0 ? `≥${Math.round(tier.minRatio * 100)}%` : '0%'}</td>
                <td style={{ ...ref.td, color: '#A8D8A8' }}>{(TIER_DMG_MULT_X100[i] / 100).toFixed(2)}×</td>
                <td style={{ ...ref.td, color: '#FED7AA' }}>{(TIER_COOLDOWN_X100[i] / 100).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Tower health section */}
        <div style={ref.section}>TOWER HEALTH &amp; REPAIR</div>
        <div style={ref.explain}>
          Enemies that survive deal HP damage to every tower in their range. Damaged towers deal reduced damage.
          Use the <span style={{ color: '#80FF80' }}>🔧 Repair</span> button in the sidebar (30g) to restore a tower to full HP between waves.
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 6 }}>
          <table style={ref.table}>
            <thead>
              <tr>
                <th style={ref.th}>Tower HP %</th>
                <th style={ref.th}>Damage output</th>
              </tr>
            </thead>
            <tbody>
              {[['≥75%', '100% (full)', '#5CB85C'], ['≥50%', '90%', '#F0AD4E'], ['≥25%', '75%', '#FF8C00'], ['<25%', '55%', '#D9534F']].map(([hp, dmg, color]) => (
                <tr key={hp}>
                  <td style={{ ...ref.td, color: color as string }}>{hp}</td>
                  <td style={{ ...ref.td, color: color as string }}>{dmg}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table style={ref.table}>
            <thead>
              <tr>
                <th style={ref.th}>Enemy type</th>
                <th style={ref.th}>Tower dmg/pass</th>
              </tr>
            </thead>
            <tbody>
              {[['TextJailbreak', '1 HP'], ['ContextOverflow', '1 HP'], ['HalluSwarm', '0 HP'], ['Boss ☠', '3 HP']].map(([name, dmg]) => (
                <tr key={name}>
                  <td style={ref.td}>{name}</td>
                  <td style={{ ...ref.td, color: '#FC8181' }}>{dmg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={ref.columns}>
          {/* Tower stats table */}
          <div style={{ flex: 1 }}>
            <div style={ref.section}>TOWERS (free to place)</div>
            <table style={ref.table}>
              <thead>
                <tr>
                  <th style={ref.th}>Name</th>
                  <th style={ref.th}>HP</th>
                  <th style={ref.th}>DMG</th>
                  <th style={ref.th}>RNG</th>
                  <th style={ref.th}>Token</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(TOWERS).map(([id, t]) => {
                  const tokenKey = TOKEN_NAMES[t.tokenType];
                  const tRange = Number(id) === 1 ? Math.sqrt(VISION_RANGE_SQ) : TOWER_RANGE;
                  return (
                    <tr key={id}>
                      <td style={ref.td}>{t.name}</td>
                      <td style={ref.td}>{t.hp}</td>
                      <td style={{ ...ref.td, color: '#A8D8A8' }}>{t.damage}{Number(id) === 2 && <span style={{ color: '#FC8181', fontSize: 13 }}> AoE</span>}</td>
                      <td style={{ ...ref.td, color: tRange < TOWER_RANGE ? '#FC8181' : '#F5E6C8' }}>{tRange}</td>
                      <td style={{ ...ref.td, color: TOKEN_COLOR[tokenKey] }}>
                        {TOKEN_ICON[tokenKey]} {TOKEN_SHORT[tokenKey]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ ...ref.explain, marginTop: 6, fontSize: 15 }}>
              AoE = Code tower deals 1.5× damage vs HalluSwarm.
            </div>
          </div>

          {/* Factory stats table */}
          <div style={{ flex: 1 }}>
            <div style={ref.section}>FACTORIES (cost gold)</div>
            <table style={ref.table}>
              <thead>
                <tr>
                  <th style={ref.th}>Name</th>
                  <th style={ref.th}>Cost</th>
                  <th style={ref.th}>Output</th>
                  <th style={ref.th}>Upgr</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(FACTORIES).map(([id, f]) => {
                  const tokenKey = f.tokenType;
                  return (
                    <tr key={id}>
                      <td style={{ ...ref.td, color: TOKEN_COLOR[tokenKey] }}>{f.name}</td>
                      <td style={ref.td}>{f.cost}g</td>
                      <td style={{ ...ref.td, color: TOKEN_COLOR[tokenKey] }}>{f.baseOutput}/wave</td>
                      <td style={ref.td}>50g</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ ...ref.explain, marginTop: 6 }}>
              Each upgrade adds +50% output per level. Cap: 150 tokens.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ref = {
  overlay: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.75)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    background: '#1A0D05', border: '3px solid #4A2510',
    padding: '16px 20px', maxWidth: 640, width: '95vw',
    maxHeight: '85vh', overflowY: 'auto' as const,
    boxShadow: '6px 6px 0 #0A0500',
    fontFamily: "'VT323', monospace",
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title:  { fontSize: 26, color: '#F5E6C8', letterSpacing: 2 },
  closeBtn: {
    background: 'transparent', border: '2px solid #4A2510',
    color: '#6B3A1E', fontFamily: "'VT323', monospace", fontSize: 22,
    cursor: 'pointer', padding: '0 10px',
  },
  section: { fontSize: 18, color: '#6B3A1E', letterSpacing: 2, marginTop: 14, marginBottom: 5 },
  explain: { fontSize: 17, color: '#A08060', lineHeight: 1.5, marginBottom: 8 },
  columns: { display: 'flex', gap: 20, marginTop: 4, flexWrap: 'wrap' as const },
  table: { borderCollapse: 'collapse' as const, width: '100%' },
  th: { fontSize: 16, color: '#6B3A1E', letterSpacing: 1, textAlign: 'left' as const, padding: '3px 12px 3px 0' },
  td: { fontSize: 18, color: '#F5E6C8', padding: '3px 12px 3px 0', borderTop: '1px solid #2A1005' },
};

// ── Main component ──────────────────────────────────────────────────────────
export default function BuildMenu({ selected, onSelect, gameState, isMuted, toggleMute, onShowTour }: BuildMenuProps) {
  const [showRef, setShowRef] = useState(false);
  const gold     = gameState?.gold ?? 0;
  const disabled = !!gameState?.is_wave_active;

  const isActive = (type: 'tower' | 'factory', id: number) =>
    selected?.type === type && selected?.id === id;

  return (
    <>
      {showRef && <TierReference onClose={() => setShowRef(false)} />}
      <div style={styles.menu}>
        <span style={styles.sectionLabel}>TOWERS</span>
        {Object.entries(TOWERS).map(([id, t]) => {
          const numId   = Number(id);
          const active  = isActive('tower', numId);
          const cfg     = TOWER_COLORS[numId] ?? TOWER_COLORS[0];
          const tokenKey = TOKEN_NAMES[t.tokenType];
          const tokColor = TOKEN_COLOR[tokenKey];
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
              <span style={styles.cardStat}>
                DMG {t.damage} · HP {t.hp} · RNG {numId === 1 ? Math.sqrt(VISION_RANGE_SQ) : TOWER_RANGE}
              </span>
              <span style={{ ...styles.cardStat, color: tokColor }}>
                {TOKEN_ICON[tokenKey]} {TOKEN_SHORT[tokenKey]} · Free
                {numId === 2 && <span style={{ color: '#FC8181', marginLeft: 4 }}>AoE vs swarms</span>}
              </span>
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
          const tokColor = TOKEN_COLOR[f.tokenType];
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
              <span style={{ ...styles.cardStat, color: tokColor }}>
                {TOKEN_ICON[f.tokenType]} {f.baseOutput} tok/wave
              </span>
              <span style={styles.cardStat}>{f.cost}g · upg 50g</span>
            </button>
          );
        })}

        <div style={styles.divider} />
        <button style={styles.clearBtn} onClick={() => onSelect(null)}>✕ CLEAR</button>

        <div style={styles.rightBtns}>
          <button
            style={styles.iconBtn}
            title={isMuted ? 'Unmute music' : 'Mute music'}
            onClick={toggleMute}
          >{isMuted ? '🔇' : '🔊'}</button>
          <button
            style={styles.iconBtn}
            title="Replay guided tour"
            onClick={onShowTour}
          >TOUR</button>
          <button
            style={styles.iconBtn}
            title="Game reference: token tiers, tower & factory stats"
            onClick={() => setShowRef(true)}
          >?</button>
        </div>
      </div>
    </>
  );
}

const styles = {
  menu: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 16px',
    background: '#2C1507',
    borderTop: '3px solid #4A2510',
    flexWrap: 'wrap' as const, flexShrink: 0,
  },
  sectionLabel: {
    fontFamily: "'VT323', monospace",
    fontSize: 16, color: '#C8905A', letterSpacing: 1,
  },
  card: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start',
    padding: '5px 12px',
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: "'VT323', monospace",
    transition: 'background 0.1s',
    minWidth: 88,
  },
  cardName: { fontSize: 18, lineHeight: 1.2 },
  cardStat: { fontSize: 15, color: '#C8A070', lineHeight: 1.3 },
  divider: { width: 2, height: 36, background: '#4A2510', margin: '0 6px' },
  clearBtn: {
    padding: '5px 14px',
    background: 'transparent', color: '#C8905A',
    border: '2px solid #6B3A1E',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 16,
    transition: 'color 0.1s',
  },
  rightBtns: {
    marginLeft: 'auto' as const,
    display: 'flex', gap: 4,
  },
  iconBtn: {
    padding: '4px 10px',
    background: '#2A1A08', color: '#A08060',
    border: '2px solid #4A2510',
    borderRadius: 0, cursor: 'pointer',
    fontFamily: "'VT323', monospace", fontSize: 18,
    boxShadow: '2px 2px 0 #0A0500',
  },
};
