#[starknet::interface]
pub trait IWaveSystem<T> {
    fn start_wave(ref self: T, token_id: felt252);
}

#[dojo::contract]
pub mod wave_system {
    use super::IWaveSystem;
    use starknet::get_caller_address;
    use dojo::model::ModelStorage;
    use core::num::traits::SaturatingSub;
    use crate::models::{GameState, Tower, Factory};
    use crate::constants::{
        DENSHOKAN_ADDRESS,
        MAX_WAVES, WAVE_GOLD_BASE, WAVE_GOLD_PER_WAVE,
        TOKEN_COST_PER_SHOT, MAX_TOKEN_BALANCE,
        TJ_HP, TJ_SPEED_X100, TJ_GOLD, TJ_BASE_DAMAGE,
        CO_HP, CO_SPEED_X100, CO_GOLD, CO_BASE_DAMAGE,
        HS_HP, HS_SPEED_X100, HS_GOLD, HS_BASE_DAMAGE,
        BOSS_HP, BOSS_SPEED_X100, BOSS_GOLD, BOSS_BASE_DAMAGE,
        wave_enemy_counts, wave_modifier, get_enemy_trait,
        factory_base_output, get_token_tier_index,
        tier_dmg_mult_x100, tier_cooldown_x100,
        tower_base_damage, tower_damage_multiplier_x100,
        compute_shots, count_path_cells_covered,
    };
    use game_components_embeddable_game_standard::minigame::minigame::{pre_action, post_action};

    // ── Event emitted when a wave resolves ────────────────────────────────────
    // enemy_outcomes: bitmask — bit i = 1 if the i-th spawned enemy was killed.
    // Spawn order: TJ group (indices 0..tj_count-1), then CO, then HS, then Boss.
    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        WaveResolved: WaveResolved,
    }

    #[derive(Drop, starknet::Event)]
    pub struct WaveResolved {
        #[key]
        pub token_id: felt252,
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
        fn start_wave(ref self: ContractState, token_id: felt252) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');
            assert(!game.victory, 'Already won');
            assert(game.wave_number < MAX_WAVES, 'Max waves reached');

            let (enemy_outcomes, kill_gold, base_damage, ic, imc, cc) =
                resolve_wave(ref world, ref game, token_id);

            world.write_model(@game);

            self.emit(Event::WaveResolved(WaveResolved {
                token_id,
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

            post_action(denshokan, token_id);
        }
    }

    // ── Wave resolution ───────────────────────────────────────────────────────
    // Simulates each enemy individually in spawn order with all strategic mechanics:
    //   - Token drain across enemies (weaker towers for later enemies)
    //   - Token overflow cap (excess production is discarded)
    //   - Wave modifier (Fast / Armored) applied to all enemies
    //   - Per-enemy traits (Armored / Fast) on selected indices from wave 5
    //   - Tower level damage multiplier (levels 1-3)
    //   - Tower synergy bonus (+20% damage if adjacent tower of different type)
    //   - Overclock ability (halves all cooldowns if game.overclock_used)
    //   - Boss enemy group (waves 5 and 10)
    // Returns: (enemy_outcomes, kill_gold, base_damage, input_consumed, image_consumed, code_consumed)

    fn resolve_wave(
        ref world: dojo::world::WorldStorage,
        ref game: GameState,
        token_id: felt252,
    ) -> (u32, u32, u32, u32, u32, u32) {
        let wave = game.wave_number + 1;
        let (tj_count, co_count, hs_count, boss_count) = wave_enemy_counts(wave);

        // Wave modifier: 0=None, 1=Fast(speed×1.5), 2=Armored(HP×1.5)
        let modifier = wave_modifier(wave);

        // Compute token production and apply overflow cap.
        let (input_prod, image_prod, code_prod) =
            compute_token_production(ref world, token_id, game.next_factory_id);

        let raw_input = game.input_tokens + input_prod;
        let raw_image = game.image_tokens + image_prod;
        let raw_code  = game.code_tokens  + code_prod;

        // Cap token balances — excess is discarded.
        let max_input = if raw_input > MAX_TOKEN_BALANCE { MAX_TOKEN_BALANCE } else { raw_input };
        let max_image = if raw_image > MAX_TOKEN_BALANCE { MAX_TOKEN_BALANCE } else { raw_image };
        let max_code  = if raw_code  > MAX_TOKEN_BALANCE { MAX_TOKEN_BALANCE } else { raw_code  };

        // Overclock: halve all tower cooldowns for this wave.
        let overclock = game.overclock_used;

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
            let trait_ = get_enemy_trait(wave, 0, i);
            let hp  = apply_modifier_hp(TJ_HP, modifier, trait_);
            let spd = apply_modifier_spd(TJ_SPEED_X100, modifier, trait_);
            let (killed, ni, nim, nc) = process_enemy(
                ref world, token_id, game.next_tower_id,
                hp, spd,
                cur_input, cur_image, cur_code,
                max_input, max_image, max_code,
                overclock,
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
            let trait_ = get_enemy_trait(wave, 1, i);
            let hp  = apply_modifier_hp(CO_HP, modifier, trait_);
            let spd = apply_modifier_spd(CO_SPEED_X100, modifier, trait_);
            let (killed, ni, nim, nc) = process_enemy(
                ref world, token_id, game.next_tower_id,
                hp, spd,
                cur_input, cur_image, cur_code,
                max_input, max_image, max_code,
                overclock,
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
            let trait_ = get_enemy_trait(wave, 2, i);
            let hp  = apply_modifier_hp(HS_HP, modifier, trait_);
            let spd = apply_modifier_spd(HS_SPEED_X100, modifier, trait_);
            let (killed, ni, nim, nc) = process_enemy(
                ref world, token_id, game.next_tower_id,
                hp, spd,
                cur_input, cur_image, cur_code,
                max_input, max_image, max_code,
                overclock,
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

        // ── Boss group ────────────────────────────────────────────────────────
        let mut i: u32 = 0;
        loop {
            if i >= boss_count { break; }
            let hp  = apply_modifier_hp(BOSS_HP, modifier, 0);  // no trait for boss
            let spd = apply_modifier_spd(BOSS_SPEED_X100, modifier, 0);
            let (killed, ni, nim, nc) = process_enemy(
                ref world, token_id, game.next_tower_id,
                hp, spd,
                cur_input, cur_image, cur_code,
                max_input, max_image, max_code,
                overclock,
            );
            if killed {
                kill_gold += BOSS_GOLD;
                enemy_outcomes = enemy_outcomes | pow2_u32(bit_pos);
            } else {
                base_damage += BOSS_BASE_DAMAGE;
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

        // Reset overclock ability for next wave.
        game.overclock_used = false;

        if game.base_health == 0 { game.game_over = true; }
        if !game.game_over && game.wave_number >= MAX_WAVES { game.victory = true; }

        (enemy_outcomes, kill_gold, base_damage, input_consumed, image_consumed, code_consumed)
    }

    // ── Per-enemy simulation ──────────────────────────────────────────────────
    // Each alive tower fires at this enemy using the current token tier.
    // Applies: tower level damage multiplier, synergy bonus, overclock cooldown halving.

    fn process_enemy(
        ref world: dojo::world::WorldStorage,
        token_id: felt252,
        next_tower_id: u32,
        enemy_hp: u32,
        speed_x100: u32,
        cur_input: u32, cur_image: u32, cur_code: u32,
        max_input: u32, max_image: u32, max_code: u32,
        overclock: bool,
    ) -> (bool, u32, u32, u32) {
        let mut total_dmg: u32 = 0;
        let mut consume_input: u32 = 0;
        let mut consume_image: u32 = 0;
        let mut consume_code: u32 = 0;

        let mut tid: u32 = 0;
        loop {
            if tid >= next_tower_id { break; }
            let tower: Tower = world.read_model((token_id, tid));
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

                    // Overclock: halve cooldown (more shots).
                    let eff_cooldown = if overclock { (cooldown + 1) / 2 } else { cooldown };

                    // Synergy: +20 dmg_mult if adjacent tower of different type exists.
                    let synergy = has_synergy_neighbor(
                        ref world, token_id, tower.x, tower.y, tower.tower_type, next_tower_id, tid,
                    );
                    let eff_dmg_mult = if synergy { dmg_mult + 20 } else { dmg_mult };

                    let base_dmg  = tower_base_damage(tower.tower_type);
                    let level_mult = tower_damage_multiplier_x100(tower.level);

                    let shots = compute_shots(covered, speed_x100, eff_cooldown);
                    // Damage = shots × base_dmg × tier_mult/100 × level_mult/100
                    total_dmg += shots * base_dmg * eff_dmg_mult * level_mult / 10000;

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

    // ── Synergy check ─────────────────────────────────────────────────────────
    // Returns true if the given tower has an adjacent (Manhattan dist = 1) alive
    // tower of a DIFFERENT type — enabling the +20% damage bonus.

    fn has_synergy_neighbor(
        ref world: dojo::world::WorldStorage,
        token_id: felt252,
        tx: u32, ty: u32,
        ttype: u8,
        next_tower_id: u32,
        self_id: u32,
    ) -> bool {
        let mut found: bool = false;
        let mut tid: u32 = 0;
        loop {
            if tid >= next_tower_id || found { break; }
            if tid != self_id {
                let other: Tower = world.read_model((token_id, tid));
                if other.is_alive && other.tower_type != ttype {
                    let dx = if other.x >= tx { other.x - tx } else { tx - other.x };
                    let dy = if other.y >= ty { other.y - ty } else { ty - other.y };
                    if dx + dy == 1 { found = true; }
                }
            }
            tid += 1;
        };
        found
    }

    // ── Modifier helpers ──────────────────────────────────────────────────────
    // modifier: 0=None, 1=Fast(speed×1.5), 2=Armored(HP×1.5)
    // trait_:   0=None, 1=Armored(HP×1.5), 2=Fast(speed×1.5)

    fn apply_modifier_hp(base_hp: u32, modifier: u32, trait_: u32) -> u32 {
        let after_modifier = if modifier == 2 { base_hp + base_hp / 2 } else { base_hp };
        if trait_ == 1 { after_modifier + after_modifier / 2 } else { after_modifier }
    }

    fn apply_modifier_spd(base_spd: u32, modifier: u32, trait_: u32) -> u32 {
        let after_modifier = if modifier == 1 { base_spd + base_spd / 2 } else { base_spd };
        if trait_ == 2 { after_modifier + after_modifier / 2 } else { after_modifier }
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
        token_id: felt252,
        next_factory_id: u32,
    ) -> (u32, u32, u32) {
        let mut fid: u32 = 0;
        let mut input_prod: u32 = 0;
        let mut image_prod: u32 = 0;
        let mut code_prod:  u32 = 0;

        loop {
            if fid >= next_factory_id { break; }
            let factory: Factory = world.read_model((token_id, fid));
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
            self.world(@"td")
        }
    }
}
