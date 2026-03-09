import { getDifficultyBaseHp } from '../constants';
import type { GameOver, GameStats } from '../types';

interface GameOverCardProps {
  gameOver: GameOver;
  gameStats: GameStats;
  difficulty: number;
  onPlayAgain: () => void;
  onEndless?: () => void;
  endlessPending?: boolean;
}

export default function GameOverCard({ gameOver, gameStats, difficulty, onPlayAgain, onEndless, endlessPending }: GameOverCardProps) {
  const maxHp = getDifficultyBaseHp(difficulty);
  return (
    <div className="app-gameover-overlay">
      <div className={`app-gameover-card ${gameOver.victory ? 'app-gameover-card--victory' : 'app-gameover-card--defeat'}`}>
        <div className="app-gameover-icon">{gameOver.victory ? '★' : '✗'}</div>
        <div className="app-gameover-title">
          {gameOver.victory ? 'VICTORY!' : 'DEFEATED'}
        </div>
        <div className="app-gameover-sub">
          {gameOver.victory
            ? `All 10 waves cleared! Base: ${gameOver.baseHealthRemaining}/${maxHp} HP`
            : `Base fell on wave ${gameOver.waveNumber}.`}
        </div>
        <div className="app-gameover-stats">
          Kills: {gameStats.totalKills} | Gold: {gameStats.totalGoldEarned} | Waves: {gameStats.wavesCompleted}
        </div>

        {gameOver.victory && onEndless && (
          <button
            className="app-gameover-play-again-btn"
            style={{ background: '#3A2A6A', borderColor: '#5A3A9A', color: '#C8B8FF', marginBottom: 6 }}
            disabled={endlessPending}
            onClick={onEndless}
          >
            {endlessPending ? 'ACTIVATING...' : '⚡ ENDLESS MODE'}
          </button>
        )}

        <button className="app-gameover-play-again-btn" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>

        <button className="app-gameover-exit-btn" onClick={() => window.location.reload()}>
          EXIT
        </button>
      </div>
    </div>
  );
}
