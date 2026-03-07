// ── Tower constants ───────────────────────────────────────────────────────────
pub const GPT_MAX_HP: u32 = 100;
pub const VISION_MAX_HP: u32 = 80;
pub const CODE_MAX_HP: u32 = 90;

// Tower combat
pub const GPT_DAMAGE: u32 = 10;
pub const VISION_DAMAGE: u32 = 14;
pub const CODE_DAMAGE: u32 = 12;
pub const TOKEN_COST_PER_SHOT: u32 = 2;
pub const TOWER_RANGE_SQ: u32 = 9; // range 3 tiles → 3² = 9

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

// ── Enemy constants ───────────────────────────────────────────────────────────
// Types: 0=TextJailbreak, 1=ContextOverflow, 2=HalluSwarm
pub const TJ_HP: u32 = 20;
pub const TJ_SPEED_X100: u32 = 150; // 1.5 tiles/s × 100
pub const TJ_GOLD: u32 = 2;
pub const TJ_BASE_DAMAGE: u32 = 1;

pub const CO_HP: u32 = 35;
pub const CO_SPEED_X100: u32 = 90;  // 0.9 tiles/s × 100
pub const CO_GOLD: u32 = 4;
pub const CO_BASE_DAMAGE: u32 = 3;

pub const HS_HP: u32 = 5;
pub const HS_SPEED_X100: u32 = 300; // 3.0 tiles/s × 100
pub const HS_GOLD: u32 = 1;
pub const HS_BASE_DAMAGE: u32 = 1;

// ── Wave enemy counts (tj_count, co_count, hs_count) ─────────────────────────
pub fn wave_enemy_counts(wave: u32) -> (u32, u32, u32) {
    match wave {
        1  => (6,  0,  0),
        2  => (7,  0,  0),
        3  => (8,  0,  0),
        4  => (6,  2,  0),
        5  => (7,  3,  0),
        6  => (8,  4,  0),
        7  => (6,  3,  9),
        8  => (7,  3, 12),
        9  => (8,  4, 15),
        10 => (10, 5, 15),
        _  => (10, 5, 15),
    }
}

// ── Wave composition bounds (kept for reference; no longer used for validation) ─
// Enemy gold values:  TJ=2, CO=4, HS=1
// Enemy base damage:  TJ=1, CO=3, HS=1
pub fn wave_max_kill_gold(wave: u32) -> u32 {
    match wave {
        1 => 12, 2 => 14, 3 => 16, 4 => 20, 5 => 26,
        6 => 32, 7 => 33, 8 => 38, 9 => 47, 10 => 55,
        _ => 55,
    }
}

pub fn wave_max_base_damage(wave: u32) -> u32 {
    match wave {
        1 => 6,  2 => 7,  3 => 8,  4 => 12, 5 => 16,
        6 => 20, 7 => 24, 8 => 28, 9 => 35, 10 => 40,
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

pub fn tower_base_damage(tower_type: u8) -> u32 {
    match tower_type {
        0 => GPT_DAMAGE,
        1 => VISION_DAMAGE,
        2 => CODE_DAMAGE,
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

// ── Token tier index ──────────────────────────────────────────────────────────
// 0=Powered(≥60%), 1=Good(≥35%), 2=Low(≥15%), 3=Critical(≥1%), 4=Offline(0%)
pub fn get_token_tier_index(current: u32, max_tokens: u32) -> u32 {
    if max_tokens == 0 || current == 0 { return 4; }
    if current * 100 >= max_tokens * 60 { return 0; }
    if current * 100 >= max_tokens * 35 { return 1; }
    if current * 100 >= max_tokens * 15 { return 2; }
    3
}

// Damage multiplier × 100 for each tier
pub fn tier_dmg_mult_x100(tier: u32) -> u32 {
    match tier {
        0 => 100, // Powered
        1 => 80,  // Good
        2 => 55,  // Low
        3 => 30,  // Critical
        _ => 15,  // Offline
    }
}

// Cooldown × 100 (seconds × 100) for each tier
pub fn tier_cooldown_x100(tier: u32) -> u32 {
    match tier {
        0 => 100, // 1.0s
        1 => 130, // 1.3s
        2 => 200, // 2.0s
        3 => 350, // 3.5s
        _ => 450, // 4.5s Offline
    }
}

// ── Shot computation ──────────────────────────────────────────────────────────
// shots = round(covered_cells / (speed_tiles_per_sec * cooldown_sec))
//       = round(covered_cells * 1_000_000 / (speed_x100 * cooldown_x100))
pub fn compute_shots(covered_cells: u32, speed_x100: u32, cooldown_x100: u32) -> u32 {
    if speed_x100 == 0 || cooldown_x100 == 0 || covered_cells == 0 {
        return 0;
    }
    let shots_x100 = covered_cells * 1000000 / (speed_x100 * cooldown_x100);
    (shots_x100 + 50) / 100
}

// ── Path cell coverage ────────────────────────────────────────────────────────
// Path: (13,1)→(9,1)→(9,3)→(5,3)→(5,6)→(0,6)  — 19 integer cells
// Tower covers a cell if Euclidean² dist ≤ 9 (range 3)
fn dist_sq_u32(ax: u32, ay: u32, bx: u32, by: u32) -> u32 {
    let dx = if ax >= bx { ax - bx } else { bx - ax };
    let dy = if ay >= by { ay - by } else { by - ay };
    dx * dx + dy * dy
}

pub fn count_path_cells_covered(tx: u32, ty: u32) -> u32 {
    let mut n: u32 = 0;
    // Segment 1: y=1, x from 13 to 9
    if dist_sq_u32(tx, ty, 13, 1) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty, 12, 1) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty, 11, 1) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty, 10, 1) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  9, 1) <= TOWER_RANGE_SQ { n += 1; }
    // Segment 2: x=9, y from 2 to 3
    if dist_sq_u32(tx, ty,  9, 2) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  9, 3) <= TOWER_RANGE_SQ { n += 1; }
    // Segment 3: y=3, x from 8 to 5
    if dist_sq_u32(tx, ty,  8, 3) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  7, 3) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  6, 3) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  5, 3) <= TOWER_RANGE_SQ { n += 1; }
    // Segment 4: x=5, y from 4 to 6
    if dist_sq_u32(tx, ty,  5, 4) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  5, 5) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  5, 6) <= TOWER_RANGE_SQ { n += 1; }
    // Segment 5: y=6, x from 4 to 0
    if dist_sq_u32(tx, ty,  4, 6) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  3, 6) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  2, 6) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  1, 6) <= TOWER_RANGE_SQ { n += 1; }
    if dist_sq_u32(tx, ty,  0, 6) <= TOWER_RANGE_SQ { n += 1; }
    n
}
