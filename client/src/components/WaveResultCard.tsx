import { TOWERS, TOKEN_NAMES, WAVE_COMPOSITIONS } from '../constants';
import type { WaveResultSummary, GameStats } from '../types';

const TOKEN_COLOR: Record<string, string> = {
  input_tokens: '#63B3ED',
  image_tokens: '#68D391',
  code_tokens:  '#FC8181',
};

function KillBreakdown({ result }: { result: WaveResultSummary }) {
  const composition = WAVE_COMPOSITIONS[result.waveNumber] ?? [];
  const rows: { label: string; killed: boolean }[] = [];
  if (composition.some((g) => g.type === 'TextJailbreak'))
    rows.push({ label: 'TextJailbreak',   killed: result.killedTJ });
  if (composition.some((g) => g.type === 'ContextOverflow'))
    rows.push({ label: 'ContextOverflow', killed: result.killedCO });
  if (composition.some((g) => g.type === 'HalluSwarm'))
    rows.push({ label: 'HalluSwarm',      killed: result.killedHS });
  if (composition.some((g) => g.type === 'Boss'))
    rows.push({ label: 'BOSS',            killed: result.killedBoss });
  if (!rows.length) return null;
  return (
    <div className="app-kill-breakdown">
      {rows.map(({ label, killed }) => (
        <div key={label} className="app-kill-row">
          <span className="app-kill-label">{label}</span>
          <span className={`app-kill-status ${killed ? 'app-kill-status--dead' : 'app-kill-status--alive'}`}>
            {killed ? 'ELIMINATED' : 'SURVIVED'}
          </span>
        </div>
      ))}
    </div>
  );
}

function TowerDamageList({ towers }: { towers: unknown[] }) {
  const damaged = (towers as Array<{
    tower_id: string | number;
    tower_type: number;
    health: number;
    max_health: number;
    is_alive?: boolean;
  }>).filter((t) => t.is_alive !== false && Number(t.health) < Number(t.max_health));

  if (!damaged.length) return null;

  return (
    <div className="app-kill-breakdown" style={{ marginTop: 6 }}>
      <div style={{ fontFamily: "'VT323', monospace", color: '#D9534F', fontSize: 15, letterSpacing: 1, marginBottom: 4 }}>
        TOWERS DAMAGED ({damaged.length})
      </div>
      {damaged.map((t) => {
        const def = TOWERS[Number(t.tower_type)];
        const hp = Number(t.health);
        const maxHp = Number(t.max_health);
        const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
        const tokenKey = TOKEN_NAMES[def?.tokenType ?? 0];
        const tokColor = TOKEN_COLOR[tokenKey] ?? '#F5E6C8';
        const hpColor = pct > 55 ? '#5CB85C' : pct > 22 ? '#F0AD4E' : '#D9534F';
        return (
          <div key={String(t.tower_id)} className="app-kill-row">
            <span className="app-kill-label" style={{ color: tokColor }}>{def?.name ?? '?'} #{String(t.tower_id)}</span>
            <span style={{ fontFamily: "'VT323', monospace", color: hpColor, fontSize: 15 }}>
              {hp}/{maxHp} HP
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface WaveResultCardProps {
  result: WaveResultSummary;
  gameStats: GameStats;
  towers?: unknown[];
  onDismiss: () => void;
}

export default function WaveResultCard({ result, gameStats, towers, onDismiss }: WaveResultCardProps) {
  return (
    <div className="app-result-overlay">
      <div className="app-result-card">
        <div className="app-result-title">WAVE {result.waveNumber} CLEAR!</div>
        <div className="app-result-row">
          Gold: <b className="app-gold-text">+{result.goldEarned}</b>
        </div>
        {result.killCount > 0 && (
          <div className="app-result-row">
            Kills: <b style={{ color: '#5CB85C' }}>{result.killCount}</b>
          </div>
        )}
        {result.baseDamage > 0 && (
          <div className="app-result-row app-result-row--danger">
            Base damage: <b>-{result.baseDamage} HP</b>
          </div>
        )}
        <div className="app-result-row">
          Base HP: <b style={{ color: result.baseHealthRemaining > 0 ? '#5CB85C' : '#D9534F' }}>
            {result.baseHealthRemaining}/{result.baseMaxHp}
          </b>
        </div>
        <KillBreakdown result={result} />
        {towers && <TowerDamageList towers={towers} />}
        <div className="app-result-divider" />
        <div className="app-result-stats">
          <span>Run totals — Kills: {gameStats.totalKills} | Gold: {gameStats.totalGoldEarned}</span>
        </div>
        <button className="app-result-dismiss" onClick={onDismiss}>CONTINUE</button>
      </div>
    </div>
  );
}
