import { useMemo } from 'react';

const TIPS = [
  'Towers share a token pool — keep your factories running to maintain fire rate.',
  'Place factories close to towers of the same type for efficient token supply.',
  'Mix tower types side-by-side to trigger the adjacency synergy bonus.',
  'Later enemies face weaker towers — upgrade before wave 7 or they will break through.',
  'Sell idle factories and reinvest gold in upgrades before a hard wave.',
  'Overclock halves all tower cooldowns for one wave — save it for a boss wave.',
  'Hard mode starts with only 120 gold — prioritize one strong tower over three weak ones.',
  'Token tiers: ≥60% = Powered (1×), ≥35% = Good (0.8×), below 15% = critical.',
  'Gold per wave scales with time: wave 10 pays 210 gold. Hold out early.',
  'Towers fire in placement order — put long-range towers at the front of the path.',
  'You can sell towers and factories for a refund if you need to reposition.',
  'Base HP is shared — one leaked enemy can swing the whole game on Hard.',
  'Factory upgrades stack: level 3 produces 2× the tokens of level 1.',
  'Enemies that reach the base still give you the kill gold — play aggressively.',
  'The path is fixed — build your defense around the chokepoints, not the open tiles.',
];

interface LoadingScreenProps {
  mode?: 'deploy' | 'resume';
}

export default function LoadingScreen({ mode = 'deploy' }: LoadingScreenProps) {
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);

  return (
    <div className="menu-loader-root">
      <div className="menu-loader-card">
        <div className="menu-loader-spinner" />
        <div className="menu-loader-title">
          {mode === 'resume' ? 'RESUMING SESSION' : 'DEPLOYING GAME'}
        </div>
        <div className="menu-loader-sub">
          {mode === 'resume' ? 'Loading your session...' : 'Waiting for chain confirmation...'}
        </div>
        <div className="menu-loader-dots">
          <span>▮</span><span>▮</span><span>▮</span>
        </div>
      </div>

      <div className="menu-loader-tip-footer">
        <span className="menu-loader-tip-label">TIP</span>
        {tip}
      </div>
    </div>
  );
}
