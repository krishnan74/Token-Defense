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

    // ── Event emitted when a wave resolves ────────────────────────────────────
    // enemy_outcomes: bitmask — bit i = 1 if the i-th spawned enemy was killed.
    // Spawn order: TJ group (indices 0..tj_count-1), then CO, then HS.
    // Clients decode this to drive a faithful per-enemy replay animation.
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        WaveResolved: WaveResolved,
    }

    #[derive(Drop, starknet::Event)]
    pub struct WaveResolved {
        #[key]
        pub player: ContractAddress,
        pub wave_number: u32,
        pub enemy_outcomes: u32,
        pub kill_gold: u32,
        pub base_damage: u32,
        pub new_base_health: u32,
        pub new_gold: u32,
        pub input_consumed: u32,
        pub image_consumed: u32,
        pub code_consumed: u32,
    }

    #[abi(embed_v0)]
    impl WaveSystemImpl of IWaveSystem<ContractState> {
        fn start_wave(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();

            let mut game: GameState = world.read_model(player);
            assert(!game.game_over, 'Game over');
            assert(!game.victory, 'Already won');
            assert(game.wave_number < MAX_WAVES, 'Max waves reached');

            let (enemy_outcomes, kill_gold, base_damage, ic, imc, cc) =
                resolve_wave(ref world, ref game, player);

            world.write_model(@game);

            self.emit(Event::WaveResolved(WaveResolved {
                player,
                wave_number: game.wave_number,
                enemy_outcomes,
                kill_gold,
                base_damage,
                new_base_health: game.base_health,
                new_gold: game.gold,
                input_consumed: ic,
                image_consumed: imc,
                code_consumed: cc,
            }));
        }
    }

    // ── Wave resolution ───────────────────────────────────────────────────────
    // Simulates each enemy individually in spawn order.
    // Token balances drain as towers fire, so later enemies face a weaker defence.
    // Returns: (enemy_outcomes, kill_gold, base_damage, input_consumed, image_consumed, code_consumed)

    fn resolve_wave(
        ref world: dojo::world::WorldStorage,
        ref game: GameState,
        player: ContractAddress,
    ) -> (u32, u32, u32, u32, u32, u32) {
        let wave = game.wave_number + 1;
        let (tj_count, co_count, hs_count) = wave_enemy_counts(wave);

        // Compute token production and starting balances for this wave.
        let (input_prod, image_prod, code_prod) =
            compute_token_production(ref world, player, game.next_factory_id);
        let max_input = game.input_tokens + input_prod;
        let max_image = game.image_tokens + image_prod;
        let max_code  = game.code_tokens  + code_prod;

        // Mutable balances — drain as each enemy is processed.
        let mut cur_input = max_input;
        let mut cur_image = max_image;
        let mut cur_code  = max_code;

        let mut kill_gold: u32 = 0;
        let mut base_damage: u32 = 0;
        let mut enemy_outcomes: u32 = 0;
        let mut bit_pos: u32 = 0;

        // ── TextJailbreak group ───────────────────────────────────────────────
        let mut i: u32 = 0;
        loop {
            if i >= tj_count { break; }
            let (killed, ni, nim, nc) = process_enemy(
                ref world, player, game.next_tower_id,
                TJ_HP, TJ_SPEED_X100,
                cur_input, cur_image, cur_code,
                max_input, max_image, max_code,
            );
            if killed {
                kill_gold += TJ_GOLD;
                enemy_outcomes = enemy_outcomes | pow2_u32(bit_pos);
            } else {
                base_damage += TJ_BASE_DAMAGE;
            }
            cur_input = ni; cur_image = nim; cur_code = nc;
            bit_pos += 1;
            i += 1;
        };

        // ── ContextOverflow group ─────────────────────────────────────────────
        let mut i: u32 = 0;
        loop {
            if i >= co_count { break; }
            let (killed, ni, nim, nc) = process_enemy(
                ref world, player, game.next_tower_id,
                CO_HP, CO_SPEED_X100,
                cur_input, cur_image, cur_code,
                max_input, max_image, max_code,
            );
            if killed {
                kill_gold += CO_GOLD;
                enemy_outcomes = enemy_outcomes | pow2_u32(bit_pos);
            } else {
                base_damage += CO_BASE_DAMAGE;
            }
            cur_input = ni; cur_image = nim; cur_code = nc;
            bit_pos += 1;
            i += 1;
        };

        // ── HalluSwarm group ──────────────────────────────────────────────────
        let mut i: u32 = 0;
        loop {
            if i >= hs_count { break; }
            let (killed, ni, nim, nc) = process_enemy(
                ref world, player, game.next_tower_id,
                HS_HP, HS_SPEED_X100,
                cur_input, cur_image, cur_code,
                max_input, max_image, max_code,
            );
            if killed {
                kill_gold += HS_GOLD;
                enemy_outcomes = enemy_outcomes | pow2_u32(bit_pos);
            } else {
                base_damage += HS_BASE_DAMAGE;
            }
            cur_input = ni; cur_image = nim; cur_code = nc;
            bit_pos += 1;
            i += 1;
        };

        // ── Apply results ─────────────────────────────────────────────────────
        let wave_bonus = WAVE_GOLD_BASE + wave * WAVE_GOLD_PER_WAVE;
        game.gold += kill_gold + wave_bonus;

        let input_consumed = max_input.saturating_sub(cur_input);
        let image_consumed = max_image.saturating_sub(cur_image);
        let code_consumed  = max_code.saturating_sub(cur_code);

        game.input_tokens = cur_input;
        game.image_tokens = cur_image;
        game.code_tokens  = cur_code;

        game.wave_number = wave;
        game.base_health = game.base_health.saturating_sub(base_damage);

        if game.base_health == 0 { game.game_over = true; }
        if !game.game_over && game.wave_number >= MAX_WAVES { game.victory = true; }

        (enemy_outcomes, kill_gold, base_damage, input_consumed, image_consumed, code_consumed)
    }

    // ── Per-enemy simulation ──────────────────────────────────────────────────
    // Each alive tower fires `compute_shots` times at this enemy using the
    // current token tier.  Tokens for that tower type are drained before the
    // next enemy is processed, so the defence weakens as the wave progresses.

    fn process_enemy(
        ref world: dojo::world::WorldStorage,
        player: ContractAddress,
        next_tower_id: u32,
        enemy_hp: u32,
        speed_x100: u32,
        cur_input: u32, cur_image: u32, cur_code: u32,
        max_input: u32, max_image: u32, max_code: u32,
    ) -> (bool, u32, u32, u32) {
        let mut total_dmg: u32 = 0;
        let mut consume_input: u32 = 0;
        let mut consume_image: u32 = 0;
        let mut consume_code: u32 = 0;

        let mut tid: u32 = 0;
        loop {
            if tid >= next_tower_id { break; }
            let tower: Tower = world.read_model((player, tid));
            if tower.is_alive {
                let covered = count_path_cells_covered(tower.x, tower.y);
                if covered > 0 {
                    let (cur_tok, max_tok) = if tower.tower_type == 0 {
                        (cur_input, max_input)
                    } else if tower.tower_type == 1 {
                        (cur_image, max_image)
                    } else {
                        (cur_code, max_code)
                    };

                    let tier     = get_token_tier_index(cur_tok, max_tok);
                    let dmg_mult = tier_dmg_mult_x100(tier);
                    let cooldown = tier_cooldown_x100(tier);
                    let base_dmg = tower_base_damage(tower.tower_type);

                    let shots    = compute_shots(covered, speed_x100, cooldown);
                    total_dmg   += shots * base_dmg * dmg_mult / 100;

                    let consumed = shots * TOKEN_COST_PER_SHOT;
                    if tower.tower_type == 0 {
                        consume_input += consumed;
                    } else if tower.tower_type == 1 {
                        consume_image += consumed;
                    } else {
                        consume_code += consumed;
                    }
                }
            }
            tid += 1;
        };

        let new_input = cur_input.saturating_sub(consume_input);
        let new_image = cur_image.saturating_sub(consume_image);
        let new_code  = cur_code.saturating_sub(consume_code);

        (total_dmg >= enemy_hp, new_input, new_image, new_code)
    }

    // ── Bit helpers ───────────────────────────────────────────────────────────
    // Cairo 2.16 / Scarb 2.16.0 does not expose the << token; use explicit pow2.

    fn pow2_u32(n: u32) -> u32 {
        let mut result: u32 = 1;
        let mut i: u32 = 0;
        loop {
            if i >= n { break; }
            result *= 2;
            i += 1;
        };
        result
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
