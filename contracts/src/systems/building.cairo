#[starknet::interface]
pub trait IBuildingSystem<T> {
    fn place_tower(ref self: T, token_id: felt252, tower_type: u8, x: u32, y: u32);
    fn place_factory(ref self: T, token_id: felt252, factory_type: u8, x: u32, y: u32);
    fn upgrade_factory(ref self: T, token_id: felt252, factory_id: u32);
    fn upgrade_tower(ref self: T, token_id: felt252, tower_id: u32);
    fn sell_tower(ref self: T, token_id: felt252, tower_id: u32);
    fn sell_factory(ref self: T, token_id: felt252, factory_id: u32);
    fn repair_tower(ref self: T, token_id: felt252, tower_id: u32);
}

#[dojo::contract]
pub mod building_system {
    use super::IBuildingSystem;
    use starknet::get_caller_address;
    use dojo::model::ModelStorage;
    use crate::models::{GameState, Tower, Factory};
    use crate::constants::{
        UPGRADE_COST, MAX_TOWERS, GRID_W, GRID_H, TOWER_REPAIR_COST,
        tower_max_hp, factory_cost, tower_upgrade_cost,
        is_blocked_tile, DENSHOKAN_ADDRESS,
    };
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
            assert(game.active_tower_count < MAX_TOWERS, 'Tower cap reached');
            assert(x < GRID_W && y < GRID_H, 'Out of bounds');
            assert(!is_blocked_tile(x, y), 'Cannot build on path/base');

            // Ensure no alive tower already occupies this cell
            let mut t_idx: u32 = 0;
            loop {
                if t_idx >= game.next_tower_id { break; }
                let existing: Tower = world.read_model((token_id, t_idx));
                assert(
                    !(existing.is_alive && existing.x == x && existing.y == y),
                    'Cell occupied',
                );
                t_idx += 1;
            };

            // Ensure no active factory already occupies this cell
            let mut f_idx: u32 = 0;
            loop {
                if f_idx >= game.next_factory_id { break; }
                let existing: Factory = world.read_model((token_id, f_idx));
                assert(
                    !(existing.is_active && existing.x == x && existing.y == y),
                    'Cell occupied',
                );
                f_idx += 1;
            };

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
            game.active_tower_count += 1;
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
            assert(x < GRID_W && y < GRID_H, 'Out of bounds');
            assert(!is_blocked_tile(x, y), 'Cannot build on path/base');

            // Ensure no alive tower already occupies this cell
            let mut t_idx: u32 = 0;
            loop {
                if t_idx >= game.next_tower_id { break; }
                let existing: Tower = world.read_model((token_id, t_idx));
                assert(
                    !(existing.is_alive && existing.x == x && existing.y == y),
                    'Cell occupied',
                );
                t_idx += 1;
            };

            // Ensure no active factory already occupies this cell
            let mut f_idx: u32 = 0;
            loop {
                if f_idx >= game.next_factory_id { break; }
                let existing: Factory = world.read_model((token_id, f_idx));
                assert(
                    !(existing.is_active && existing.x == x && existing.y == y),
                    'Cell occupied',
                );
                f_idx += 1;
            };

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

        fn sell_tower(ref self: ContractState, token_id: felt252, tower_id: u32) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');

            let mut tower: Tower = world.read_model((token_id, tower_id));
            assert(tower.is_alive, 'Tower not alive');

            tower.is_alive = false;
            if game.active_tower_count > 0 {
                game.active_tower_count -= 1;
            }

            world.write_model(@tower);
            world.write_model(@game);
            post_action(denshokan, token_id);
        }

        fn repair_tower(ref self: ContractState, token_id: felt252, tower_id: u32) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');

            let mut tower: Tower = world.read_model((token_id, tower_id));
            assert(tower.is_alive, 'Tower not alive');
            assert(tower.health < tower.max_health, 'Tower already at full HP');
            assert(game.gold >= TOWER_REPAIR_COST, 'Not enough gold');

            game.gold -= TOWER_REPAIR_COST;
            tower.health = tower.max_health;

            world.write_model(@tower);
            world.write_model(@game);
            post_action(denshokan, token_id);
        }

        fn sell_factory(ref self: ContractState, token_id: felt252, factory_id: u32) {
            let denshokan = starknet::contract_address_const::<DENSHOKAN_ADDRESS>();
            pre_action(denshokan, token_id);

            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut game: GameState = world.read_model(token_id);
            assert(game.player == caller, 'Not your session');
            assert(!game.game_over, 'Game over');

            let mut factory: Factory = world.read_model((token_id, factory_id));
            assert(factory.is_active, 'Factory not active');

            // Refund 50% of base cost (ignores upgrade levels)
            let refund = factory_cost(factory.factory_type) / 2;
            game.gold += refund;
            factory.is_active = false;

            world.write_model(@factory);
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
