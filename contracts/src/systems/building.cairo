#[starknet::interface]
pub trait IBuildingSystem<T> {
    fn place_tower(ref self: T, token_id: felt252, tower_type: u8, x: u32, y: u32);
    fn place_factory(ref self: T, token_id: felt252, factory_type: u8, x: u32, y: u32);
    fn upgrade_factory(ref self: T, token_id: felt252, factory_id: u32);
    fn upgrade_tower(ref self: T, token_id: felt252, tower_id: u32);
}

#[dojo::contract]
pub mod building_system {
    use super::IBuildingSystem;
    use starknet::get_caller_address;
    use dojo::model::ModelStorage;
    use crate::models::{GameState, Tower, Factory};
    use crate::constants::{UPGRADE_COST, tower_max_hp, factory_cost, tower_upgrade_cost, DENSHOKAN_ADDRESS};
    use game_components_embeddable_game_standard::minigame::minigame::{pre_action, post_action};

    #[abi(embed_v0)]
    impl BuildingSystemImpl of IBuildingSystem<ContractState> {
        fn place_tower(ref self: ContractState, token_id: felt252, tower_type: u8, x: u32, y: u32) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');
            assert(tower_type <= 2, 'Invalid tower type');

            let max_health = tower_max_hp(tower_type);

            let tower = Tower {
                token_id,
                tower_id: game.next_tower_id,
                tower_type,
                x,
                y,
                health: max_health,
                max_health,
                is_alive: true,
                level: 1,
            };

            game.next_tower_id += 1;
            world.write_model(@tower);
            world.write_model(@game);
            post_action(denshokan, token_id);
        }

        fn place_factory(ref self: ContractState, token_id: felt252, factory_type: u8, x: u32, y: u32) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');
            assert(factory_type <= 2, 'Invalid factory type');

            let cost = factory_cost(factory_type);
            assert(game.gold >= cost, 'Not enough gold');

            game.gold -= cost;

            let factory = Factory {
                token_id,
                factory_id: game.next_factory_id,
                factory_type,
                x,
                y,
                level: 1,
                is_active: true,
            };

            game.next_factory_id += 1;
            world.write_model(@factory);
            world.write_model(@game);
            post_action(denshokan, token_id);
        }

        fn upgrade_factory(ref self: ContractState, token_id: felt252, factory_id: u32) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');
            assert(game.gold >= UPGRADE_COST, 'Not enough gold');

            let mut factory: Factory = world.read_model((token_id, factory_id));
            assert(factory.is_active, 'Factory not active');

            game.gold -= UPGRADE_COST;
            factory.level += 1;

            world.write_model(@factory);
            world.write_model(@game);
            post_action(denshokan, token_id);
        }

        fn upgrade_tower(ref self: ContractState, token_id: felt252, tower_id: u32) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');

            let mut tower: Tower = world.read_model((token_id, tower_id));
            assert(tower.is_alive, 'Tower not alive');
            assert(tower.level < 3, 'Tower at max level');

            let cost = tower_upgrade_cost(tower.level);
            assert(game.gold >= cost, 'Not enough gold');

            game.gold -= cost;
            tower.level += 1;

            world.write_model(@tower);
            world.write_model(@game);
            post_action(denshokan, token_id);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"td")
        }
    }
}
