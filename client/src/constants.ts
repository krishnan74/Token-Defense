export const GRID_W = 12;
export const GRID_H = 8;

export const BASE_X = 0;
export const BASE_Y = 6;
export const BASE_MAX_HP = 25;  // Normal difficulty reference value
export const MAX_TOWERS  = 14;  // max simultaneously placed towers (mirrors contract)

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

export const TOWER_UPGRADE_COST: Record<number, number> = {
  1: 80,   // level 1 → 2
  2: 120,  // level 2 → 3
};

/** Damage multiplier per tower level (mirrors contract tower_damage_multiplier_x100). */
export function getTowerLevelMultiplier(level: number): number {
  if (level >= 3) return 1.65;
  if (level >= 2) return 1.30;
  return 1.00;
}

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

/** Token balance cap — excess production is discarded on-chain. */
export const MAX_TOKEN_BALANCE = 150;

/** Gold cost to activate Overclock for one wave. */
export const OVERCLOCK_COST = 50;

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
  TextJailbreak:   { hp: 20,  speed: 1.5, gold: 2,  damage: 1 },
  ContextOverflow: { hp: 28,  speed: 0.9, gold: 4,  damage: 3 },
  HalluSwarm:      { hp: 5,   speed: 3.0, gold: 1,  damage: 1 },
  Boss:            { hp: 120, speed: 0.5, gold: 15, damage: 5 },
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
  5:  [{ type: 'TextJailbreak', count: 7 }, { type: 'ContextOverflow', count: 3 }, { type: 'Boss', count: 1 }],
  6:  [{ type: 'TextJailbreak', count: 8 }, { type: 'ContextOverflow', count: 4 }],
  7:  [{ type: 'TextJailbreak', count: 6 }, { type: 'ContextOverflow', count: 3 }, { type: 'HalluSwarm', count: 7 }],
  8:  [{ type: 'TextJailbreak', count: 7 }, { type: 'ContextOverflow', count: 3 }, { type: 'HalluSwarm', count: 9 }],
  9:  [{ type: 'TextJailbreak', count: 8 }, { type: 'ContextOverflow', count: 4 }, { type: 'HalluSwarm', count: 15 }],
  10: [{ type: 'TextJailbreak', count: 10 }, { type: 'ContextOverflow', count: 5 }, { type: 'HalluSwarm', count: 15 }, { type: 'Boss', count: 1 }],
};

export const GOLD_PER_WAVE = (wave: number): number => 60 + wave * 15;

export const TOWER_RANGE = 3;
export const TICKS_PER_SEC = 60;

// ── Wave modifiers ─────────────────────────────────────────────────────────
// Mirrors contract wave_modifier(wave) — MUST stay in sync.
// 0=None, 1=Fast(speed×1.5), 2=Armored(HP×1.5)
const WAVE_MODIFIER_TABLE: Record<number, number> = { 2: 1, 4: 2, 6: 1, 8: 2, 10: 1 };

export function getWaveModifier(wave: number): number {
  return WAVE_MODIFIER_TABLE[wave] ?? 0;
}

export const WAVE_MODIFIER_INFO: Record<number, { label: string; color: string }> = {
  0: { label: '',                                    color: '' },
  1: { label: '⚡ FAST WAVE — enemies move 50% faster', color: '#FFD700' },
  2: { label: '🛡 ARMORED WAVE — enemies have 50% more HP', color: '#63B3ED' },
};

// ── Enemy traits ──────────────────────────────────────────────────────────
// Mirrors contract get_enemy_trait(wave, group, index) — MUST stay in sync.
// 0=None, 1=Armored(HP×1.5), 2=Fast(speed×1.5)
// group: 0=TJ, 1=CO, 2=HS, 3=Boss
export function getEnemyTrait(wave: number, group: number, index: number): number {
  if (wave < 5) return 0;
  if (group === 0 && index % 3 === 2) return 1; // TJ Armored
  if (group === 2 && wave >= 7 && index % 4 === 0) return 2; // HS Fast
  return 0;
}

// ── Difficulty settings ───────────────────────────────────────────────────
export interface DifficultySetting {
  label: string;
  gold: number;
  baseHp: number;
  initTokens: [number, number, number];
  color: string;
  darkColor: string;
}

export const DIFFICULTY_SETTINGS: DifficultySetting[] = [
  { label: 'EASY',   gold: 300, baseHp: 35, initTokens: [80, 25, 30], color: '#4A7A20', darkColor: '#2E5010' },
  { label: 'NORMAL', gold: 200, baseHp: 25, initTokens: [50, 15, 20], color: '#4A5A8A', darkColor: '#2C3860' },
  { label: 'HARD',   gold: 120, baseHp: 12, initTokens: [30,  8, 12], color: '#8A2A2A', darkColor: '#5A1010' },
];

export function getDifficultyBaseHp(difficulty: number): number {
  return DIFFICULTY_SETTINGS[difficulty]?.baseHp ?? BASE_MAX_HP;
}

// ── Path tiles ─────────────────────────────────────────────────────────────
/** Returns true if the cell is part of the enemy walk path (cannot build here). */
export function isPathTile(col: number, row: number): boolean {
  if (row === 1 && col >= 9 && col <= GRID_W - 1) return true;
  if (col === 9 && row >= 1 && row <= 3) return true;
  if (row === 3 && col >= 5 && col <= 9) return true;
  if (col === 5 && row >= 3 && row <= 6) return true;
  if (row === 6 && col >= 0 && col <= 5) return true;
  return false;
}

// ── Contract-exact simulation helpers (used by WaveReplay pre-computation) ──
// These are direct ports of the Cairo contract functions and MUST stay in sync.

/** All 19 integer path cells the contract checks for tower coverage. */
const PATH_CELLS: [number, number][] = [
  [13,1],[12,1],[11,1],[10,1],[9,1],  // segment 1: y=1, x 13→9
  [9,2],[9,3],                          // segment 2: x=9, y 2→3
  [8,3],[7,3],[6,3],[5,3],              // segment 3: y=3, x 8→5
  [5,4],[5,5],[5,6],                    // segment 4: x=5, y 4→6
  [4,6],[3,6],[2,6],[1,6],[0,6],        // segment 5: y=6, x 4→0
];

/** Port of contract count_path_cells_covered — exact integer cell coverage. */
export function countPathCellsCovered(tx: number, ty: number): number {
  let n = 0;
  for (const [px, py] of PATH_CELLS) {
    const dx = px - tx, dy = py - ty;
    if (dx * dx + dy * dy <= 9) n++; // TOWER_RANGE_SQ = 9
  }
  return n;
}

/** Port of contract compute_shots — discrete integer shot count. */
export function computeShots(covered: number, speedX100: number, cooldownX100: number): number {
  if (speedX100 === 0 || cooldownX100 === 0 || covered === 0) return 0;
  const shotsX100 = Math.floor(covered * 1_000_000 / (speedX100 * cooldownX100));
  return Math.floor((shotsX100 + 50) / 100);
}

/** Port of contract get_token_tier_index. Returns 0–4 (Powered→Offline). */
export function getTokenTierIndex(current: number, max: number): number {
  if (max === 0 || current === 0) return 4;
  if (current * 100 >= max * 60) return 0;
  if (current * 100 >= max * 35) return 1;
  if (current * 100 >= max * 15) return 2;
  return 3;
}

/** Damage multiplier × 100 per tier index (mirrors tier_dmg_mult_x100). */
export const TIER_DMG_MULT_X100 = [100, 80, 55, 30, 15] as const;

/** Cooldown × 100 (seconds × 100) per tier index (mirrors tier_cooldown_x100). */
export const TIER_COOLDOWN_X100 = [100, 130, 200, 350, 450] as const;

/** Port of contract tower_damage_multiplier_x100. */
export function towerDamageMultX100(level: number): number {
  if (level >= 3) return 165;
  if (level >= 2) return 130;
  return 100;
}

// ── Conveyor helpers ───────────────────────────────────────────────────────
export const CONVEYOR_COLORS: Record<number, string> = {
  0: '#63B3ED',
  1: '#68D391',
  2: '#FC8181',
};

export interface ConveyorTile {
  x: number;
  y: number;
  dir: 'H' | 'V' | 'C';
}

/**
 * Compute the L-shaped conveyor path from factory (fx,fy) to tower (tx,ty).
 * Goes horizontal first, then vertical.  Excludes factory and tower cells.
 */
export function computeConveyorTiles(
  fx: number, fy: number,
  tx: number, ty: number,
): ConveyorTile[] {
  const tiles: ConveyorTile[] = [];
  const xs = Math.sign(tx - fx);
  const ys = Math.sign(ty - fy);
  if (xs !== 0) {
    for (let x = fx + xs; x !== tx; x += xs) tiles.push({ x, y: fy, dir: 'H' });
    if (ys !== 0) tiles.push({ x: tx, y: fy, dir: 'C' });
  }
  if (ys !== 0) {
    for (let y = fy + ys; y !== ty + ys; y += ys) tiles.push({ x: tx, y, dir: 'V' });
  }
  return tiles.filter(
    (t) => !(t.x === fx && t.y === fy) && !(t.x === tx && t.y === ty) && !isPathTile(t.x, t.y),
  );
}
