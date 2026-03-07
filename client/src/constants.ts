export const GRID_W = 12;
export const GRID_H = 8;

export const BASE_X = 0;
export const BASE_Y = 6;
export const BASE_MAX_HP = 20;

export interface Waypoint {
  x: number;
  y: number;
}

export const PATH_WAYPOINTS: Waypoint[] = [
  { x: 13, y: 1 },
  { x: 9,  y: 1 },
  { x: 9,  y: 3 },
  { x: 5,  y: 3 },
  { x: 5,  y: 6 },
  { x: 0,  y: 6 },
];

export interface TowerDef {
  name: string;
  hp: number;
  damage: number;
  tokenType: number;
  tokenCost: number;
}

export const TOWERS: Record<number, TowerDef> = {
  0: { name: 'GPT',    hp: 100, damage: 10, tokenType: 0, tokenCost: 2 },
  1: { name: 'Vision', hp: 80,  damage: 14, tokenType: 1, tokenCost: 2 },
  2: { name: 'Code',   hp: 90,  damage: 12, tokenType: 2, tokenCost: 2 },
};

export interface FactoryDef {
  name: string;
  cost: number;
  baseOutput: number;
  tokenType: string;
}

export const FACTORIES: Record<number, FactoryDef> = {
  0: { name: 'Input', cost: 100, baseOutput: 30, tokenType: 'input_tokens' },
  1: { name: 'Image', cost: 200, baseOutput: 10, tokenType: 'image_tokens' },
  2: { name: 'Code',  cost: 180, baseOutput: 12, tokenType: 'code_tokens' },
};

export const TOKEN_NAMES: string[] = ['input_tokens', 'image_tokens', 'code_tokens'];

export interface TokenTier {
  minRatio: number;
  dmgMultiplier: number;
  cooldown: number;
  label: string;
  color: string;
}

export const TOKEN_TIERS: TokenTier[] = [
  { minRatio: 0.60, dmgMultiplier: 1.00, cooldown: 1.0, label: 'Powered',  color: '#4caf50' },
  { minRatio: 0.35, dmgMultiplier: 0.80, cooldown: 1.3, label: 'Good',     color: '#8bc34a' },
  { minRatio: 0.15, dmgMultiplier: 0.55, cooldown: 2.0, label: 'Low',      color: '#ff9800' },
  { minRatio: 0.01, dmgMultiplier: 0.30, cooldown: 3.5, label: 'Critical', color: '#f44336' },
  { minRatio: 0,    dmgMultiplier: 0.15, cooldown: 4.5, label: 'Offline',  color: '#555555' },
];

export function getTokenTier(tokens: number, maxTokens: number): TokenTier {
  const ratio = maxTokens > 0 ? tokens / maxTokens : 0;
  for (const tier of TOKEN_TIERS) {
    if (ratio >= tier.minRatio) return tier;
  }
  return TOKEN_TIERS[TOKEN_TIERS.length - 1];
}

export interface EnemyDef {
  hp: number;
  speed: number;
  gold: number;
  damage: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  TextJailbreak:   { hp: 20, speed: 1.5, gold: 2, damage: 1 },
  ContextOverflow: { hp: 35, speed: 0.9, gold: 4, damage: 3 },
  HalluSwarm:      { hp: 5,  speed: 3.0, gold: 1, damage: 1 },
};

export interface WaveGroup {
  type: string;
  count: number;
}

export const WAVE_COMPOSITIONS: Record<number, WaveGroup[]> = {
  1:  [{ type: 'TextJailbreak', count: 6 }],
  2:  [{ type: 'TextJailbreak', count: 7 }],
  3:  [{ type: 'TextJailbreak', count: 8 }],
  4:  [{ type: 'TextJailbreak', count: 6 }, { type: 'ContextOverflow', count: 2 }],
  5:  [{ type: 'TextJailbreak', count: 7 }, { type: 'ContextOverflow', count: 3 }],
  6:  [{ type: 'TextJailbreak', count: 8 }, { type: 'ContextOverflow', count: 4 }],
  7:  [{ type: 'TextJailbreak', count: 6 }, { type: 'ContextOverflow', count: 3 }, { type: 'HalluSwarm', count: 9 }],
  8:  [{ type: 'TextJailbreak', count: 7 }, { type: 'ContextOverflow', count: 3 }, { type: 'HalluSwarm', count: 12 }],
  9:  [{ type: 'TextJailbreak', count: 8 }, { type: 'ContextOverflow', count: 4 }, { type: 'HalluSwarm', count: 15 }],
  10: [{ type: 'TextJailbreak', count: 10 }, { type: 'ContextOverflow', count: 5 }, { type: 'HalluSwarm', count: 15 }],
};

export const GOLD_PER_WAVE = (wave: number): number => 50 + wave * 10;

export const TOWER_RANGE = 3;
export const TICKS_PER_SEC = 60;
