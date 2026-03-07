#[starknet::interface]
pub trait IGameSystem<T> {
    fn new_game(ref self: T);
}

#[dojo::contract]
pub mod game_system {
    use super::IGameSystem;
    use starknet::get_caller_address;
    use dojo::model::ModelStorage;
    use crate::models::GameState;
    use crate::constants::{
        INIT_GOLD, INIT_INPUT_TOKENS, INIT_IMAGE_TOKENS, INIT_CODE_TOKENS, BASE_MAX_HP,
    };

    #[abi(embed_v0)]
    impl GameSystemImpl of IGameSystem<ContractState> {
        fn new_game(ref self: ContractState) {
            let mut world = self.world_default();
            let player = get_caller_address();

            let game_state = GameState {
                player,
                wave_number: 0,
                gold: INIT_GOLD,
                game_over: false,
                victory: false,
                next_tower_id: 0,
                next_factory_id: 0,
                input_tokens: INIT_INPUT_TOKENS,
                image_tokens: INIT_IMAGE_TOKENS,
                code_tokens: INIT_CODE_TOKENS,
                base_health: BASE_MAX_HP,
            };

            world.write_model(@game_state);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"di")
        }
    }
}
