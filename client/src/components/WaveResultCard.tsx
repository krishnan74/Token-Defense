import { WAVE_COMPOSITIONS } from '../constants';
import type { WaveResultSummary, GameStats } from '../types';

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

interface WaveResultCardProps {
  result: WaveResultSummary;
  gameStats: GameStats;
  onDismiss: () => void;
}

export default function WaveResultCard({ result, gameStats, onDismiss }: WaveResultCardProps) {
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
        <div className="app-result-divider" />
        <div className="app-result-stats">
          <span>Run totals — Kills: {gameStats.totalKills} | Gold: {gameStats.totalGoldEarned}</span>
        </div>
        <button className="app-result-dismiss" onClick={onDismiss}>CONTINUE</button>
      </div>
    </div>
  );
}
