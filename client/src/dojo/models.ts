// On-chain model types — mirrors contracts/src/models.cairo exactly.

export interface GameState {
  player: string;
  wave_number: number;
  gold: number;
  game_over: boolean;
  victory: boolean;
  next_tower_id: number;
  next_factory_id: number;
  input_tokens: number;
  image_tokens: number;
  code_tokens: number;
  base_health: number;
  difficulty: number;      // 0=Easy, 1=Normal, 2=Hard
  overclock_used: boolean; // active ability flag
}

export interface Tower {
  player: string;
  tower_id: number;
  tower_type: number; // 0=GPT, 1=Vision, 2=Code
  x: number;
  y: number;
  health: number;
  max_health: number;
  is_alive: boolean;
  level: number;     // 1-3
}

export interface Factory {
  player: string;
  factory_id: number;
  factory_type: number; // 0=Input, 1=Image, 2=Code
  x: number;
  y: number;
  level: number;
  is_active: boolean;
}

/** Decoded WaveResolved starknet event — emitted by wave_system.start_wave(). */
export interface WaveResolvedEvent {
  wave_number: number;
  /** Bitmask: bit i = 1 if the i-th spawned enemy was killed.
   *  Spawn order: TJ group first, then CO, then HS, then Boss (matching WAVE_COMPOSITIONS). */
  enemy_outcomes: number;
  kill_gold: number;
  base_damage: number;
  new_base_health: number;
  new_gold: number;
  input_consumed: number;
  image_consumed: number;
  code_consumed: number;
}

/** Manifest contract entry shape. */
export interface ManifestContract {
  tag: string;
  address: string;
}

export interface ContractAddresses {
  game: string;
  building: string;
  wave: string;
}
