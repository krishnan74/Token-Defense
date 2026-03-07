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
        UPGRADE_COST, INPUT_FACTORY_COST, GPT_MAX_HP, WAVE_GOLD_BASE, WAVE_GOLD_PER_WAVE,
        TJ_GOLD, TJ_BASE_DAMAGE, INPUT_TOKENS_BASE,
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
    // Wave 1 composition: 6 TJ, 0 CO, 0 HS
    // Wave 1 bonus gold: 50 + 1×10 = 60
    // TJ: hp=20, gold=2, base_damage=1, speed_x100=150
    // GPT tower at (9,1): covers 8 path cells
    //   shots_vs_TJ = round(8 * 1_000_000 / (150 * 100)) = round(533) = 5
    //   damage_vs_TJ = 5 * 10 = 50 ≥ 20 → kills all TJ

    #[test]
    fn test_start_wave_no_towers_applies_base_damage() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();
        // No towers: all 6 TJ reach base → base_damage = 6×1 = 6
        wave.start_wave();

        let state: GameState = world.read_model(player);
        assert(state.wave_number == 1, 'wave should advance');
        assert(state.base_health == BASE_MAX_HP - 6, 'wrong base health');
        // kill_gold=0, wave_bonus=60 → gold = 200 + 60 = 260
        assert(state.gold == INIT_GOLD + 60, 'wrong gold no kills');
        assert(!state.game_over, 'should not be game over');
    }

    #[test]
    fn test_start_wave_tower_kills_all_tj() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, wave) = setup();
        game.new_game();
        // GPT tower at (9,1) kills all 6 TJ
        building.place_tower(0, 9, 1);
        wave.start_wave();

        let state: GameState = world.read_model(player);
        assert(state.base_health == BASE_MAX_HP, 'base should be full');
        // kill_gold = 6×2 = 12, wave_bonus = 60 → gold = 200 + 12 + 60 = 272
        assert(state.gold == INIT_GOLD + 12 + 60, 'wrong gold with kills');
        // Tokens consumed: 5 shots/enemy × 6 enemies × 2 = 60 > max_input(50) → capped at 50
        assert(state.input_tokens == 0, 'input tokens should be empty');
    }

    #[test]
    fn test_start_wave_advances_wave_number() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();
        wave.start_wave();

        let state: GameState = world.read_model(player);
        assert(state.wave_number == 1, 'wave_number should be 1');
        assert(!state.victory, 'should not be victory yet');
    }

    #[test]
    fn test_start_wave_game_over_when_base_destroyed() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        // Set base_health to exactly wave-1 max damage (6) so it's destroyed
        let mut state: GameState = world.read_model(player);
        state.base_health = 6;
        world.write_model_test(@state);

        wave.start_wave(); // no towers → all 6 TJ reach base → 6 damage

        let state: GameState = world.read_model(player);
        assert(state.base_health == 0, 'base should be 0');
        assert(state.game_over, 'game_over should be set');
        assert(!state.victory, 'should not be victory');
    }

    #[test]
    fn test_start_wave_victory_at_wave_10() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        // Fast-forward to wave 9 with very high base_health so base survives wave 10
        let mut state: GameState = world.read_model(player);
        state.wave_number = 9;
        state.base_health = 200; // survive wave 10 max damage (40)
        world.write_model_test(@state);

        wave.start_wave();

        let state: GameState = world.read_model(player);
        assert(state.wave_number == 10, 'should be wave 10');
        assert(state.victory, 'should be victory');
        assert(!state.game_over, 'should not be game over');
    }

    #[test]
    fn test_start_wave_token_production_from_factory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, building, wave) = setup();
        game.new_game();
        // Input factory level 1: +30 tokens/wave → max_input = 50 + 30 = 80
        building.place_factory(0, 4, 4);
        // No towers → no consumption
        wave.start_wave();

        let state: GameState = world.read_model(player);
        // input_tokens = 50 (carry) + 30 (prod) - 0 (consumed) = 80
        assert(state.input_tokens == INIT_INPUT_TOKENS + INPUT_TOKENS_BASE, 'wrong input tokens');
    }

    #[test]
    fn test_start_wave_wave_bonus_computed_onchain() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        // Fast-forward to wave 4 to test non-trivial bonus
        let mut state: GameState = world.read_model(player);
        state.wave_number = 4;
        world.write_model_test(@state);

        wave.start_wave(); // wave 5 bonus = 50 + 5×10 = 100

        let state: GameState = world.read_model(player);
        // wave 5: (7 TJ, 3 CO, 0 HS), no towers → all reach base
        // wave bonus = 50 + 5*10 = 100
        // kill_gold = 0
        assert(state.gold == INIT_GOLD + 100, 'wave bonus should be 100');
    }

    // ── Guard tests ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected: ('Game over', 'ENTRYPOINT_FAILED',))]
    fn test_start_wave_guards_game_over() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        let mut state: GameState = world.read_model(player);
        state.game_over = true;
        world.write_model_test(@state);

        wave.start_wave();
    }

    #[test]
    #[should_panic(expected: ('Already won', 'ENTRYPOINT_FAILED',))]
    fn test_start_wave_guards_victory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        let mut state: GameState = world.read_model(player);
        state.victory = true;
        world.write_model_test(@state);

        wave.start_wave();
    }

    #[test]
    #[should_panic(expected: ('Max waves reached', 'ENTRYPOINT_FAILED',))]
    fn test_start_wave_guards_max_waves() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let (mut world, game, _, wave) = setup();
        game.new_game();

        let mut state: GameState = world.read_model(player);
        state.wave_number = 10;
        world.write_model_test(@state);

        wave.start_wave();
    }
}
