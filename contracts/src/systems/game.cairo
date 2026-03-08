/// IGameSystem — game lifecycle + EGS IMinigameTokenData interface.
///
/// EGS (Embeddable Game Standard) compatibility:
///   score(token_id)    → u64   — wave_number * 1000 + base_health
///   game_over(token_id) → bool  — true when game_over OR victory
///   + batch variants for efficient leaderboard queries
#[starknet::interface]
pub trait IGameSystem<T> {
    fn new_game(ref self: T, token_id: felt252, difficulty: u32);
    fn activate_overclock(ref self: T, token_id: felt252);
    // IMinigameTokenData (EGS)
    fn score(self: @T, token_id: felt252) -> u64;
    fn game_over(self: @T, token_id: felt252) -> bool;
    fn score_batch(self: @T, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @T, token_ids: Span<felt252>) -> Array<bool>;
}

#[dojo::contract]
pub mod game_system {
    use super::IGameSystem;
    use starknet::get_caller_address;
    use dojo::model::ModelStorage;
    use crate::models::GameState;
    use crate::constants::{
        difficulty_init_gold, difficulty_base_hp, difficulty_init_tokens, OVERCLOCK_COST,
    };

    #[abi(embed_v0)]
    impl GameSystemImpl of IGameSystem<ContractState> {
        /// Initialise a new game session keyed by token_id.
        /// In a full EGS flow, token_id is minted by Denshokan before this call.
        /// Calling again with the same token_id resets the session.
        fn new_game(ref self: ContractState, token_id: felt252, difficulty: u32) {
            let mut world = self.world_default();
            let player = get_caller_address();

            assert(difficulty <= 2, 'Invalid difficulty');

            let (init_input, init_image, init_code) = difficulty_init_tokens(difficulty);

            let game_state = GameState {
                token_id,
                player,
                wave_number: 0,
                gold: difficulty_init_gold(difficulty),
                game_over: false,
                victory: false,
                next_tower_id: 0,
                next_factory_id: 0,
                input_tokens: init_input,
                image_tokens: init_image,
                code_tokens: init_code,
                base_health: difficulty_base_hp(difficulty),
                difficulty,
                overclock_used: false,
            };

            world.write_model(@game_state);
        }

        /// Activates the Overclock ability for the upcoming wave.
        /// Halves all tower cooldowns during wave resolution (doubles fire rate).
        /// Resets automatically after the wave resolves.
        fn activate_overclock(ref self: ContractState, token_id: felt252) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');
            assert(!game.victory, 'Already won');
            assert(!game.overclock_used, 'Overclock already used');
            assert(game.gold >= OVERCLOCK_COST, 'Not enough gold');

            game.gold -= OVERCLOCK_COST;
            game.overclock_used = true;
            world.write_model(@game);
        }

        // ── IMinigameTokenData (EGS) ──────────────────────────────────────────
        // Score formula: wave_number * 1000 + base_health
        // Higher waves and more remaining HP yield a higher score.

        fn score(self: @ContractState, token_id: felt252) -> u64 {
            let mut world = self.world_default();
            let state: GameState = world.read_model(token_id);
            (state.wave_number * 1000 + state.base_health).into()
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            let mut world = self.world_default();
            let state: GameState = world.read_model(token_id);
            state.game_over || state.victory
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let mut world = self.world_default();
            let mut results = array![];
            for token_id in token_ids {
                let state: GameState = world.read_model(*token_id);
                results.append((state.wave_number * 1000 + state.base_health).into());
            };
            results
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let mut world = self.world_default();
            let mut results = array![];
            for token_id in token_ids {
                let state: GameState = world.read_model(*token_id);
                results.append(state.game_over || state.victory);
            };
            results
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"td")
        }
    }
}
