// Type declarations for WaveSimulator.js (kept as JS due to complexity).

export interface TokenMap {
  input_tokens: number;
  image_tokens: number;
  code_tokens: number;
}

export interface LiveEnemy {
  id: number;
  type: string;
  alive: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
}

export interface LiveTower {
  tower_id: string | number;
  tower_type: number;
  x: number;
  y: number;
  health: number;
  level: number;
  is_alive: boolean;
  attackFlash: number;
}

export interface Projectile {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  color: string;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  age: number;
  maxAge: number;
  color: string;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  maxAge: number;
}

export interface WaveSnapshot {
  done: boolean;
  enemies: LiveEnemy[];
  towers: LiveTower[];
  tokens: TokenMap;
  maxTokens: TokenMap;
  projectiles: Projectile[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  screenShakePulse: number;
  baseHealth: number;
}

export interface TowerDamageEntry {
  tower_id: string | number;
  damage: number;
}

export interface WaveResult {
  towerDamages: TowerDamageEntry[];
  goldEarned: number;
  killGold: number;
  enemiesKilled: number;
  tokensConsumed: TokenMap;
  baseDamage: number;
}

export interface WaveSimulatorOpts {
  towers: unknown[];
  factories: unknown[];
  gameState: unknown;
  waveNumber: number;
}

export class WaveSimulator {
  waveNumber: number;
  baseHealth: number;
  tokens: TokenMap;
  maxTokens: TokenMap;
  towers: LiveTower[];
  done: boolean;

  constructor(opts: WaveSimulatorOpts);
  step(dt: number): WaveSnapshot;
  getResult(): WaveResult;
}
