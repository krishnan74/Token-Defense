#[starknet::interface]
pub trait IWaveSystem<T> {
    fn start_wave(ref self: T);
    fn commit_wave_result(
        ref self: T,
        tower_ids: Array<u32>,
        tower_damages: Array<u32>,
        gold_from_kills: u32,
        input_tokens_consumed: u32,
        image_tokens_consumed: u32,
        code_tokens_consumed: u32,
        base_damage: u32,
    );
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
        tower_max_hp, factory_base_output,
        wave_max_kill_gold, wave_max_base_damage,
    };

    #[abi(embed_v0)]
    impl WaveSystemImpl of IWaveSystem<ContractState> {
        fn start_wave(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();

            let mut game: GameState = world.read_model(player);
            assert(!game.is_wave_active, 'Wave already active');
            assert(!game.game_over, 'Game over');
            assert(!game.victory, 'Already won');
            assert(game.wave_number < MAX_WAVES, 'Max waves reached');

            game.is_wave_active = true;
            world.write_model(@game);
        }

        fn commit_wave_result(
            ref self: ContractState,
            tower_ids: Array<u32>,
            tower_damages: Array<u32>,
            gold_from_kills: u32,
            input_tokens_consumed: u32,
            image_tokens_consumed: u32,
            code_tokens_consumed: u32,
            base_damage: u32,
        ) {
            let mut world = self.world_default();
            let player = get_caller_address();

            let mut game: GameState = world.read_model(player);
            assert(game.is_wave_active, 'No active wave');
            assert(tower_ids.len() == tower_damages.len(), 'Array length mismatch');

            let next_wave = game.wave_number + 1;

            // ── Bound checks ──────────────────────────────────────────────────
            // Kill gold cannot exceed what this wave's enemies could possibly yield
            assert(gold_from_kills <= wave_max_kill_gold(next_wave), 'Gold overclaim');

            // Base damage cannot exceed total enemy damage if every enemy reaches base
            assert(base_damage <= wave_max_base_damage(next_wave), 'Base damage overclaim');

            // Compute max tokens available = carryover + production from all factories
            let (input_prod, image_prod, code_prod) =
                compute_token_production(ref world, player, game.next_factory_id);

            let max_input = game.input_tokens + input_prod;
            let max_image = game.image_tokens + image_prod;
            let max_code = game.code_tokens + code_prod;

            assert(input_tokens_consumed <= max_input, 'Input tokens overclaim');
            assert(image_tokens_consumed <= max_image, 'Image tokens overclaim');
            assert(code_tokens_consumed <= max_code, 'Code tokens overclaim');

            // ── Apply tower damages ───────────────────────────────────────────
            let mut i: u32 = 0;
            loop {
                if i >= tower_ids.len() {
                    break;
                }
                let tower_id = *tower_ids.at(i);
                let damage = *tower_damages.at(i);

                let mut tower: Tower = world.read_model((player, tower_id));
                if tower.is_alive {
                    // A tower cannot take more than its full HP in a single wave
                    assert(damage <= tower_max_hp(tower.tower_type), 'Tower damage overclaim');

                    tower.health = tower.health.saturating_sub(damage);
                    if tower.health == 0 {
                        tower.is_alive = false;
                    }
                    world.write_model(@tower);
                }
                i += 1;
            };

            // ── Gold: kills + wave completion bonus (computed on-chain) ───────
            let wave_bonus = WAVE_GOLD_BASE + next_wave * WAVE_GOLD_PER_WAVE;
            game.gold += gold_from_kills + wave_bonus;

            // ── Token balances: carryover + production - consumed ─────────────
            game.input_tokens = max_input.saturating_sub(input_tokens_consumed);
            game.image_tokens = max_image.saturating_sub(image_tokens_consumed);
            game.code_tokens = max_code.saturating_sub(code_tokens_consumed);

            // ── Advance wave state ────────────────────────────────────────────
            game.wave_number = next_wave;
            game.is_wave_active = false;

            // ── Base health and game-over check ───────────────────────────────
            game.base_health = game.base_health.saturating_sub(base_damage);
            if game.base_health == 0 {
                game.game_over = true;
            }

            // ── Victory: survive all waves ────────────────────────────────────
            if !game.game_over && game.wave_number >= MAX_WAVES {
                game.victory = true;
            }

            world.write_model(@game);
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Iterates all factories for `player` and returns (input_prod, image_prod, code_prod).
    /// Production per factory: base + base * (level - 1) / 2  (+50% per level above 1)
    fn compute_token_production(
        ref world: dojo::world::WorldStorage,
        player: ContractAddress,
        next_factory_id: u32,
    ) -> (u32, u32, u32) {
        let mut fid: u32 = 0;
        let mut input_prod: u32 = 0;
        let mut image_prod: u32 = 0;
        let mut code_prod: u32 = 0;

        loop {
            if fid >= next_factory_id {
                break;
            }
            let factory: Factory = world.read_model((player, fid));
            if factory.is_active {
                let base = factory_base_output(factory.factory_type);
                let prod = base + base * (factory.level - 1) / 2;
                match factory.factory_type {
                    0 => { input_prod += prod; },
                    1 => { image_prod += prod; },
                    2 => { code_prod += prod; },
                    _ => {},
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
