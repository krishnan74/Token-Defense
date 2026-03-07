#[starknet::interface]
pub trait IWaveSystem<T> {
    fn start_wave(ref self: T);
}

#[dojo::contract]
pub mod wave_system {
    use super::IWaveSystem;
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use core::num::traits::SaturatingSub;
    use crate::models::{GameState, Tower, Factory};
    use crate::constants::{
        MAX_WAVES, WAVE_GOLD_BASE, WAVE_GOLD_PER_WAVE,
        TOKEN_COST_PER_SHOT,
        TJ_HP, TJ_SPEED_X100, TJ_GOLD, TJ_BASE_DAMAGE,
        CO_HP, CO_SPEED_X100, CO_GOLD, CO_BASE_DAMAGE,
        HS_HP, HS_SPEED_X100, HS_GOLD, HS_BASE_DAMAGE,
        wave_enemy_counts, factory_base_output,
        get_token_tier_index, tier_dmg_mult_x100, tier_cooldown_x100,
        tower_base_damage, compute_shots, count_path_cells_covered,
    };

    #[abi(embed_v0)]
    impl WaveSystemImpl of IWaveSystem<ContractState> {
        fn start_wave(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();

            let mut game: GameState = world.read_model(player);
            assert(!game.game_over, 'Game over');
            assert(!game.victory, 'Already won');
            assert(game.wave_number < MAX_WAVES, 'Max waves reached');

            resolve_wave(ref world, ref game, player);

            world.write_model(@game);
        }
    }

    // ── Wave resolution ───────────────────────────────────────────────────────

    fn resolve_wave(
        ref world: dojo::world::WorldStorage,
        ref game: GameState,
        player: ContractAddress,
    ) {
        let wave = game.wave_number + 1;
        let (tj_count, co_count, hs_count) = wave_enemy_counts(wave);

        // Token production from factories
        let (input_prod, image_prod, code_prod) =
            compute_token_production(ref world, player, game.next_factory_id);
        let max_input = game.input_tokens + input_prod;
        let max_image = game.image_tokens + image_prod;
        let max_code  = game.code_tokens  + code_prod;

        // Token tiers at wave start (snapshot before consumption)
        let input_tier = get_token_tier_index(game.input_tokens, max_input);
        let image_tier = get_token_tier_index(game.image_tokens, max_image);
        let code_tier  = get_token_tier_index(game.code_tokens,  max_code);

        // Accumulated damage dealt per enemy type by all towers combined
        let mut dmg_vs_tj: u32 = 0;
        let mut dmg_vs_co: u32 = 0;
        let mut dmg_vs_hs: u32 = 0;

        // Token consumption per type
        let mut input_consumed: u32 = 0;
        let mut image_consumed: u32 = 0;
        let mut code_consumed:  u32 = 0;

        // Iterate all alive towers, accumulate damage and token consumption
        let mut tid: u32 = 0;
        loop {
            if tid >= game.next_tower_id { break; }
            let tower: Tower = world.read_model((player, tid));
            if tower.is_alive {
                let covered = count_path_cells_covered(tower.x, tower.y);
                if covered > 0 {
                    let tier: u32 = if tower.tower_type == 0 {
                        input_tier
                    } else if tower.tower_type == 1 {
                        image_tier
                    } else {
                        code_tier
                    };

                    let dmg_mult  = tier_dmg_mult_x100(tier);
                    let cooldown  = tier_cooldown_x100(tier);
                    let base_dmg  = tower_base_damage(tower.tower_type);

                    let shots_tj = compute_shots(covered, TJ_SPEED_X100, cooldown);
                    let shots_co = compute_shots(covered, CO_SPEED_X100, cooldown);
                    let shots_hs = compute_shots(covered, HS_SPEED_X100, cooldown);

                    // Damage contribution per enemy of each type
                    dmg_vs_tj += shots_tj * base_dmg * dmg_mult / 100;
                    dmg_vs_co += shots_co * base_dmg * dmg_mult / 100;
                    dmg_vs_hs += shots_hs * base_dmg * dmg_mult / 100;

                    // Total shots fired by this tower across all enemies this wave
                    let total_shots =
                        shots_tj * tj_count +
                        shots_co * co_count +
                        shots_hs * hs_count;
                    let consumed = total_shots * TOKEN_COST_PER_SHOT;

                    if tower.tower_type == 0 {
                        input_consumed += consumed;
                    } else if tower.tower_type == 1 {
                        image_consumed += consumed;
                    } else {
                        code_consumed += consumed;
                    }
                }
            }
            tid += 1;
        };

        // Cap consumption at what was available
        if input_consumed > max_input { input_consumed = max_input; }
        if image_consumed > max_image { image_consumed = max_image; }
        if code_consumed  > max_code  { code_consumed  = max_code;  }

        // Process each enemy group: killed or reaches base
        let mut kill_gold:   u32 = 0;
        let mut base_damage: u32 = 0;

        // TextJailbreak
        let mut i: u32 = 0;
        loop {
            if i >= tj_count { break; }
            if dmg_vs_tj >= TJ_HP {
                kill_gold += TJ_GOLD;
            } else {
                base_damage += TJ_BASE_DAMAGE;
            }
            i += 1;
        };

        // ContextOverflow
        let mut i: u32 = 0;
        loop {
            if i >= co_count { break; }
            if dmg_vs_co >= CO_HP {
                kill_gold += CO_GOLD;
            } else {
                base_damage += CO_BASE_DAMAGE;
            }
            i += 1;
        };

        // HalluSwarm
        let mut i: u32 = 0;
        loop {
            if i >= hs_count { break; }
            if dmg_vs_hs >= HS_HP {
                kill_gold += HS_GOLD;
            } else {
                base_damage += HS_BASE_DAMAGE;
            }
            i += 1;
        };

        // Wave bonus gold (computed on-chain, not trusted from client)
        let wave_bonus = WAVE_GOLD_BASE + wave * WAVE_GOLD_PER_WAVE;
        game.gold += kill_gold + wave_bonus;

        // Update token balances
        game.input_tokens = max_input.saturating_sub(input_consumed);
        game.image_tokens = max_image.saturating_sub(image_consumed);
        game.code_tokens  = max_code.saturating_sub(code_consumed);

        // Advance wave
        game.wave_number = wave;
        game.base_health = game.base_health.saturating_sub(base_damage);

        if game.base_health == 0 {
            game.game_over = true;
        }
        if !game.game_over && game.wave_number >= MAX_WAVES {
            game.victory = true;
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn compute_token_production(
        ref world: dojo::world::WorldStorage,
        player: ContractAddress,
        next_factory_id: u32,
    ) -> (u32, u32, u32) {
        let mut fid: u32 = 0;
        let mut input_prod: u32 = 0;
        let mut image_prod: u32 = 0;
        let mut code_prod:  u32 = 0;

        loop {
            if fid >= next_factory_id { break; }
            let factory: Factory = world.read_model((player, fid));
            if factory.is_active {
                let base = factory_base_output(factory.factory_type);
                let prod = base + base * (factory.level - 1) / 2;
                if factory.factory_type == 0 {
                    input_prod += prod;
                } else if factory.factory_type == 1 {
                    image_prod += prod;
                } else {
                    code_prod += prod;
                }
            }
            fid += 1;
        };

        (input_prod, image_prod, code_prod)
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"di")
        }
    }
}
