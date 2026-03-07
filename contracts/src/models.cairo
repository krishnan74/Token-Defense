use starknet::ContractAddress;

// GameState – keyed by player address
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct GameState {
    #[key]
    pub player: ContractAddress,
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
}

// Tower – keyed by (player, tower_id)
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct Tower {
    #[key]
    pub player: ContractAddress,
    #[key]
    pub tower_id: u32,
    pub tower_type: u8, // 0=GPT, 1=Vision, 2=Code
    pub x: u32,
    pub y: u32,
    pub health: u32,
    pub max_health: u32,
    pub is_alive: bool,
}

// Factory – keyed by (player, factory_id)
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct Factory {
    #[key]
    pub player: ContractAddress,
    #[key]
    pub factory_id: u32,
    pub factory_type: u8, // 0=Input, 1=Image, 2=Code
    pub x: u32,
    pub y: u32,
    pub level: u32,
    pub is_active: bool,
}
