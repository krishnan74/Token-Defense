use starknet::ContractAddress;

// GameState – keyed by EGS token_id (felt252)
// token_id is minted by Denshokan; player is the wallet that initialised the session.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct GameState {
    #[key]
    pub token_id: felt252,
    pub player: ContractAddress,   // wallet that called new_game
    pub wave_number: u32,
    pub gold: u32,
    pub game_over: bool,
    pub victory: bool,
    pub next_tower_id: u32,
    pub next_factory_id: u32,
    pub input_tokens: u32,
    pub image_tokens: u32,
    pub code_tokens: u32,
    pub base_health: u32,
    pub difficulty: u32,       // 0=Easy, 1=Normal, 2=Hard
    pub overclock_used: bool,  // active ability: halves all tower cooldowns for one wave
}

// Tower – keyed by (token_id, tower_id)
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct Tower {
    #[key]
    pub token_id: felt252,
    #[key]
    pub tower_id: u32,
    pub tower_type: u8, // 0=GPT, 1=Vision, 2=Code
    pub x: u32,
    pub y: u32,
    pub health: u32,
    pub max_health: u32,
    pub is_alive: bool,
    pub level: u32,     // 1-3; affects damage output
}

// Factory – keyed by (token_id, factory_id)
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct Factory {
    #[key]
    pub token_id: felt252,
    #[key]
    pub factory_id: u32,
    pub factory_type: u8, // 0=Input, 1=Image, 2=Code
    pub x: u32,
    pub y: u32,
    pub level: u32,
    pub is_active: bool,
}
