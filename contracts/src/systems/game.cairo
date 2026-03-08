#[starknet::interface]
pub trait IGameSystem<T> {
    fn new_game(ref self: T, difficulty: u32);
    fn activate_overclock(ref self: T);
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
        fn new_game(ref self: ContractState, difficulty: u32) {
            let mut world = self.world_default();
            let player = get_caller_address();

            assert(difficulty <= 2, 'Invalid difficulty');

            let (init_input, init_image, init_code) = difficulty_init_tokens(difficulty);

            let game_state = GameState {
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
        /// This halves all tower cooldowns during wave resolution, doubling fire rate.
        /// Resets automatically after the wave resolves.
        fn activate_overclock(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();

            let mut game: GameState = world.read_model(player);
            assert(!game.game_over, 'Game over');
            assert(!game.victory, 'Already won');
            assert(!game.overclock_used, 'Overclock already used');
            assert(game.gold >= OVERCLOCK_COST, 'Not enough gold');

            game.gold -= OVERCLOCK_COST;
            game.overclock_used = true;
            world.write_model(@game);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"di")
        }
    }
}
