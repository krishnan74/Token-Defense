#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };

    use dojo_intro::models::{GameState, Tower, Factory, m_GameState, m_Tower, m_Factory};
    use dojo_intro::systems::game::{game_system, IGameSystemDispatcher, IGameSystemDispatcherTrait};
    use dojo_intro::systems::building::{
        building_system, IBuildingSystemDispatcher, IBuildingSystemDispatcherTrait,
    };
    use dojo_intro::systems::wave::{
        wave_system, IWaveSystemDispatcher, IWaveSystemDispatcherTrait,
    };
    use dojo_intro::constants::{
        INIT_GOLD, INIT_INPUT_TOKENS, INIT_IMAGE_TOKENS, INIT_CODE_TOKENS, BASE_MAX_HP,
        UPGRADE_COST, INPUT_FACTORY_COST, GPT_MAX_HP,
    };

    // ── World setup ───────────────────────────────────────────────────────────

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "di",
            resources: [
                TestResource::Model(m_GameState::TEST_CLASS_HASH),
                TestResource::Model(m_Tower::TEST_CLASS_HASH),
                TestResource::Model(m_Factory::TEST_CLASS_HASH),
                TestResource::Contract(game_system::TEST_CLASS_HASH),
                TestResource::Contract(building_system::TEST_CLASS_HASH),
                TestResource::Contract(wave_system::TEST_CLASS_HASH),
            ]
                .span(),
        }
    }

    fn contract_defs() -> Span<ContractDef> {
        [
            ContractDefTrait::new(@"di", @"game_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"di")].span()),
            ContractDefTrait::new(@"di", @"building_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"di")].span()),
            ContractDefTrait::new(@"di", @"wave_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"di")].span()),
        ]
            .span()
    }

    fn setup() -> (
        dojo::world::WorldStorage,
        IGameSystemDispatcher,
        IBuildingSystemDispatcher,
        IWaveSystemDispatcher,
    ) {
        let ndef = namespace_def();
        let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
        world.sync_perms_and_inits(contract_defs());

        let (game_addr, _) = world.dns(@"game_system").unwrap();
        let (building_addr, _) = world.dns(@"building_system").unwrap();
        let (wave_addr, _) = world.dns(@"wave_system").unwrap();

        (
            world,
            IGameSystemDispatcher { contract_address: game_addr },
            IBuildingSystemDispatcher { contract_address: building_addr },
            IWaveSystemDispatcher { contract_address: wave_addr },
        )
    }

    // ── Game system tests ─────────────────────────────────────────────────────

    #[test]
    fn test_new_game_initialises_state() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, _) = setup();
        game.new_game();

        let state: GameState = world.read_model(player);
        assert(state.gold == INIT_GOLD, 'wrong initial gold');
        assert(state.base_health == BASE_MAX_HP, 'wrong base health');
        assert(state.wave_number == 0, 'wrong wave number');
        assert(state.input_tokens == INIT_INPUT_TOKENS, 'wrong input tokens');
        assert(state.image_tokens == INIT_IMAGE_TOKENS, 'wrong image tokens');
        assert(state.code_tokens == INIT_CODE_TOKENS, 'wrong code tokens');
        assert(!state.is_wave_active, 'should not be active');
        assert(!state.game_over, 'should not be game over');
        assert(!state.victory, 'should not be victory');
    }

    #[test]
    fn test_new_game_resets_existing_state() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, _) = setup();
        game.new_game();
        building.place_tower(0, 3, 3);

        game.new_game();

        let state: GameState = world.read_model(player);
        assert(state.next_tower_id == 0, 'tower id should reset');
        assert(state.gold == INIT_GOLD, 'gold should reset');
    }

    // ── Building system tests ─────────────────────────────────────────────────

    #[test]
    fn test_place_tower_creates_tower() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, _) = setup();
        game.new_game();
        building.place_tower(0, 3, 2);

        let tower: Tower = world.read_model((player, 0_u32));
        assert(tower.tower_type == 0, 'wrong tower type');
        assert(tower.x == 3, 'wrong x');
        assert(tower.y == 2, 'wrong y');
        assert(tower.health == GPT_MAX_HP, 'wrong health');
        assert(tower.max_health == GPT_MAX_HP, 'wrong max_health');
        assert(tower.is_alive, 'should be alive');
    }

    #[test]
    fn test_place_tower_increments_id() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, _) = setup();
        game.new_game();
        building.place_tower(0, 1, 1);
        building.place_tower(1, 2, 2);

        let state: GameState = world.read_model(player);
        assert(state.next_tower_id == 2, 'should have 2 towers');

        let t1: Tower = world.read_model((player, 0_u32));
        let t2: Tower = world.read_model((player, 1_u32));
        assert(t1.tower_type == 0, 'wrong type tower 0');
        assert(t2.tower_type == 1, 'wrong type tower 1');
    }

    #[test]
    fn test_place_factory_deducts_gold() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, _) = setup();
        game.new_game();
        building.place_factory(0, 4, 4);

        let state: GameState = world.read_model(player);
        assert(state.gold == INIT_GOLD - INPUT_FACTORY_COST, 'wrong gold after factory');
    }

    #[test]
    fn test_place_factory_creates_factory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, _) = setup();
        game.new_game();
        building.place_factory(1, 5, 5);

        let factory: Factory = world.read_model((player, 0_u32));
        assert(factory.factory_type == 1, 'wrong factory type');
        assert(factory.level == 1, 'wrong initial level');
        assert(factory.is_active, 'should be active');
        assert(factory.x == 5, 'wrong x');
        assert(factory.y == 5, 'wrong y');
    }

    #[test]
    #[should_panic(expected: ('Not enough gold', 'ENTRYPOINT_FAILED',))]
    fn test_place_factory_insufficient_gold() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, building, _) = setup();
        game.new_game();
        // Image factory costs 200g; starts with 200g
        building.place_factory(1, 1, 1);
        building.place_factory(1, 2, 2); // 0g left → panic
    }

    #[test]
    fn test_upgrade_factory_increments_level() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, _) = setup();
        game.new_game();
        building.place_factory(0, 3, 3);
        building.upgrade_factory(0);

        let factory: Factory = world.read_model((player, 0_u32));
        assert(factory.level == 2, 'level should be 2');

        let state: GameState = world.read_model(player);
        assert(state.gold == INIT_GOLD - INPUT_FACTORY_COST - UPGRADE_COST, 'wrong gold');
    }

    #[test]
    #[should_panic(expected: ('Not enough gold', 'ENTRYPOINT_FAILED',))]
    fn test_upgrade_factory_insufficient_gold() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, _) = setup();
        game.new_game();
        building.place_factory(0, 3, 3);

        let mut state: GameState = world.read_model(player);
        state.gold = 0;
        world.write_model_test(@state);

        building.upgrade_factory(0);
    }

    // ── Wave system tests ─────────────────────────────────────────────────────

    #[test]
    fn test_start_wave_sets_active() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        let state: GameState = world.read_model(player);
        assert(state.is_wave_active, 'wave should be active');
    }

    #[test]
    #[should_panic(expected: ('Wave already active', 'ENTRYPOINT_FAILED',))]
    fn test_start_wave_twice_panics() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();
        wave.start_wave();
    }

    #[test]
    fn test_commit_wave_result_happy_path() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, wave) = setup();
        game.new_game();
        building.place_tower(0, 3, 2);
        wave.start_wave();

        wave.commit_wave_result(
            array![0],
            array![10],
            8,  // kill gold (≤ wave 1 max of 12)
            10, // input consumed
            5,  // image consumed
            5,  // code consumed
            2,  // base damage (≤ wave 1 max of 6)
        );

        let state: GameState = world.read_model(player);
        assert(state.wave_number == 1, 'wave should advance');
        assert(!state.is_wave_active, 'wave should be inactive');
        // Gold = 200 (init) + 8 (kills) + 60 (wave bonus: 50 + 1*10)
        assert(state.gold == 200 + 8 + 60, 'wrong gold');
        assert(state.base_health == BASE_MAX_HP - 2, 'wrong base health');

        let tower: Tower = world.read_model((player, 0_u32));
        assert(tower.health == GPT_MAX_HP - 10, 'wrong tower health');
        assert(tower.is_alive, 'tower should be alive');
    }

    #[test]
    fn test_commit_wave_bonus_computed_onchain() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        // Wave 1 bonus = 50 + 1*10 = 60; client sends 0 kill gold
        wave.commit_wave_result(array![], array![], 0, 0, 0, 0, 0);

        let state: GameState = world.read_model(player);
        assert(state.gold == INIT_GOLD + 60, 'wave bonus should be added');
    }

    #[test]
    fn test_commit_wave_token_production_from_factory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, wave) = setup();
        game.new_game();
        building.place_factory(0, 4, 4); // Input factory level 1: +30

        wave.start_wave();
        // max_input = 50 (init) + 30 (factory) = 80; consume 20
        wave.commit_wave_result(array![], array![], 0, 20, 0, 0, 0);

        let state: GameState = world.read_model(player);
        assert(state.input_tokens == 60, 'wrong input tokens'); // 80 - 20 = 60
    }

    #[test]
    fn test_commit_wave_kills_tower_at_zero_health() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, wave) = setup();
        game.new_game();
        building.place_tower(0, 3, 2); // GPT: 100 HP
        wave.start_wave();

        wave.commit_wave_result(array![0], array![100], 0, 0, 0, 0, 0);

        let tower: Tower = world.read_model((player, 0_u32));
        assert(tower.health == 0, 'health should be 0');
        assert(!tower.is_alive, 'tower should be dead');
    }

    #[test]
    fn test_commit_wave_game_over_when_base_destroyed() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        // Set base_health to 6 so wave-1 max damage (6) destroys it
        let mut state: GameState = world.read_model(player);
        state.base_health = 6;
        world.write_model_test(@state);

        wave.start_wave();
        wave.commit_wave_result(array![], array![], 0, 0, 0, 0, 6);

        let state: GameState = world.read_model(player);
        assert(state.base_health == 0, 'base should be destroyed');
        assert(state.game_over, 'game_over should be set');
        assert(!state.victory, 'should not be victory');
    }

    #[test]
    fn test_commit_wave_victory_at_wave_10() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        // Fast-forward to wave 9
        let mut state: GameState = world.read_model(player);
        state.wave_number = 9;
        world.write_model_test(@state);

        wave.start_wave();
        wave.commit_wave_result(array![], array![], 0, 0, 0, 0, 0);

        let state: GameState = world.read_model(player);
        assert(state.wave_number == 10, 'should be wave 10');
        assert(state.victory, 'should be victory');
        assert(!state.game_over, 'should not be game over');
    }

    // ── Bound check tests ─────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected: ('Gold overclaim', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_gold_overclaim() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        // Wave 1 max kill gold = 12; send 13
        wave.commit_wave_result(array![], array![], 13, 0, 0, 0, 0);
    }

    #[test]
    #[should_panic(expected: ('Base damage overclaim', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_base_damage_overclaim() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        // Wave 1 max base damage = 6; send 7
        wave.commit_wave_result(array![], array![], 0, 0, 0, 0, 7);
    }

    #[test]
    #[should_panic(expected: ('Input tokens overclaim', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_input_tokens_overclaim() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        // Max input = 50 (init, no factory); send 51
        wave.commit_wave_result(array![], array![], 0, 51, 0, 0, 0);
    }

    #[test]
    #[should_panic(expected: ('Image tokens overclaim', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_image_tokens_overclaim() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        // Max image = 15 (init); send 16
        wave.commit_wave_result(array![], array![], 0, 0, 16, 0, 0);
    }

    #[test]
    #[should_panic(expected: ('Code tokens overclaim', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_code_tokens_overclaim() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        // Max code = 20 (init); send 21
        wave.commit_wave_result(array![], array![], 0, 0, 0, 21, 0);
    }

    #[test]
    #[should_panic(expected: ('Tower damage overclaim', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_tower_damage_overclaim() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, building, wave) = setup();
        game.new_game();
        building.place_tower(0, 3, 2); // GPT max HP = 100
        wave.start_wave();

        // Send 101 damage to GPT tower
        wave.commit_wave_result(array![0], array![101], 0, 0, 0, 0, 0);
    }

    #[test]
    #[should_panic(expected: ('No active wave', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_without_start() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();

        wave.commit_wave_result(array![], array![], 0, 0, 0, 0, 0);
    }

    #[test]
    #[should_panic(expected: ('Array length mismatch', 'ENTRYPOINT_FAILED',))]
    fn test_commit_wave_mismatched_arrays() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (_, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        // 2 IDs, 1 damage value
        wave.commit_wave_result(array![0, 1], array![10], 0, 0, 0, 0, 0);
    }
}
