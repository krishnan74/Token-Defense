import type { ConveyorTile } from './constants';
import type { GameState } from './dojo/models';

export interface WaveResultSummary {
  waveNumber: number;
  goldEarned: number;
  baseDamage: number;
  baseHealthRemaining: number;
  baseMaxHp: number;
  killedTJ: boolean;
  killedCO: boolean;
  killedHS: boolean;
  killedBoss: boolean;
  killCount: number;
  groupKills: Record<string, { killed: number; total: number }>;
}

export interface GameOver {
  victory: boolean;
  waveNumber: number;
  baseHealthRemaining: number;
}

export interface GameStats {
  totalKills: number;
  totalGoldEarned: number;
  totalBaseDamage: number;
  wavesCompleted: number;
}

export const EMPTY_STATS: GameStats = {
  totalKills: 0, totalGoldEarned: 0, totalBaseDamage: 0, wavesCompleted: 0,
};

export interface Conveyor {
  id: string;
  factoryId: string | number;
  towerId: string | number;
  fx: number; fy: number;
  tx: number; ty: number;
  tiles: ConveyorTile[];
  revealedCount: number;
  color: string;
  tokenCount: number;
}

export interface PendingReplay {
  towers: unknown[];
  factories: unknown[];
  preState: GameState;
  waveNumber: number;
  enemyOutcomes: number;
  baseDamageTaken: number;
  resultSummary: WaveResultSummary;
}
