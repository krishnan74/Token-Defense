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
