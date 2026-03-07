// ── Tower constants ───────────────────────────────────────────────────────────
pub const GPT_MAX_HP: u32 = 100;
pub const VISION_MAX_HP: u32 = 80;
pub const CODE_MAX_HP: u32 = 90;

// ── Factory constants ─────────────────────────────────────────────────────────
pub const INPUT_FACTORY_COST: u32 = 100;
pub const IMAGE_FACTORY_COST: u32 = 200;
pub const CODE_FACTORY_COST: u32 = 180;
pub const UPGRADE_COST: u32 = 50;

// ── Token base production per wave per factory ────────────────────────────────
pub const INPUT_TOKENS_BASE: u32 = 30;
pub const IMAGE_TOKENS_BASE: u32 = 10;
pub const CODE_TOKENS_BASE: u32 = 12;

// ── Initial values ────────────────────────────────────────────────────────────
pub const INIT_GOLD: u32 = 200;
pub const INIT_INPUT_TOKENS: u32 = 50;
pub const INIT_IMAGE_TOKENS: u32 = 15;
pub const INIT_CODE_TOKENS: u32 = 20;

// ── Game config ───────────────────────────────────────────────────────────────
pub const MAX_WAVES: u32 = 10;
pub const BASE_MAX_HP: u32 = 20;
pub const WAVE_GOLD_BASE: u32 = 50;
pub const WAVE_GOLD_PER_WAVE: u32 = 10;

// ── Wave composition bounds ───────────────────────────────────────────────────
// Enemy gold values:  TextJailbreak=2, ContextOverflow=4, HalluSwarm=1
// Enemy base damage:  TextJailbreak=1, ContextOverflow=3, HalluSwarm=1
//
// Wave  1: 6 TJ                           → kill_gold=12,  base_dmg=6
// Wave  2: 7 TJ                           → kill_gold=14,  base_dmg=7
// Wave  3: 8 TJ                           → kill_gold=16,  base_dmg=8
// Wave  4: 6 TJ + 2 CO                    → kill_gold=20,  base_dmg=12
// Wave  5: 7 TJ + 3 CO                    → kill_gold=26,  base_dmg=16
// Wave  6: 8 TJ + 4 CO                    → kill_gold=32,  base_dmg=20
// Wave  7: 6 TJ + 3 CO + 9 HS            → kill_gold=33,  base_dmg=24
// Wave  8: 7 TJ + 3 CO + 12 HS           → kill_gold=38,  base_dmg=28
// Wave  9: 8 TJ + 4 CO + 15 HS           → kill_gold=47,  base_dmg=35
// Wave 10: 10 TJ + 5 CO + 15 HS          → kill_gold=55,  base_dmg=40

pub fn wave_max_kill_gold(wave: u32) -> u32 {
    match wave {
        1 => 12,
        2 => 14,
        3 => 16,
        4 => 20,
        5 => 26,
        6 => 32,
        7 => 33,
        8 => 38,
        9 => 47,
        10 => 55,
        _ => 55,
    }
}

pub fn wave_max_base_damage(wave: u32) -> u32 {
    match wave {
        1 => 6,
        2 => 7,
        3 => 8,
        4 => 12,
        5 => 16,
        6 => 20,
        7 => 24,
        8 => 28,
        9 => 35,
        10 => 40,
        _ => 40,
    }
}

// ── Helper lookups ────────────────────────────────────────────────────────────

pub fn tower_max_hp(tower_type: u8) -> u32 {
    match tower_type {
        0 => GPT_MAX_HP,
        1 => VISION_MAX_HP,
        2 => CODE_MAX_HP,
        _ => 0,
    }
}

pub fn factory_cost(factory_type: u8) -> u32 {
    match factory_type {
        0 => INPUT_FACTORY_COST,
        1 => IMAGE_FACTORY_COST,
        2 => CODE_FACTORY_COST,
        _ => panic!("Invalid factory type"),
    }
}

pub fn factory_base_output(factory_type: u8) -> u32 {
    match factory_type {
        0 => INPUT_TOKENS_BASE,
        1 => IMAGE_TOKENS_BASE,
        2 => CODE_TOKENS_BASE,
        _ => 0,
    }
}
