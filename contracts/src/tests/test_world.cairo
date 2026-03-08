#[cfg(test)]
mod tests {
    use dojo::model::{ModelStorage, ModelStorageTest};
    use dojo::world::{WorldStorageTrait, world};
    use dojo_cairo_test::{
        spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
        WorldStorageTestTrait,
    };

    use token_defense::models::{GameState, Tower, Factory, m_GameState, m_Tower, m_Factory};
    use token_defense::systems::game::{game_system, IGameSystemDispatcher, IGameSystemDispatcherTrait};
    use token_defense::systems::building::{
        building_system, IBuildingSystemDispatcher, IBuildingSystemDispatcherTrait,
    };
    use token_defense::systems::wave::{
        wave_system, IWaveSystemDispatcher, IWaveSystemDispatcherTrait,
    };
    use token_defense::constants::{
        INIT_GOLD, INIT_INPUT_TOKENS, INIT_IMAGE_TOKENS, INIT_CODE_TOKENS, BASE_MAX_HP,
        UPGRADE_COST, INPUT_FACTORY_COST, GPT_MAX_HP, WAVE_GOLD_BASE, WAVE_GOLD_PER_WAVE,
        TJ_GOLD, TJ_BASE_DAMAGE, INPUT_TOKENS_BASE, MAX_TOKEN_BALANCE, tower_upgrade_cost,
        OVERCLOCK_COST,
    };

    // ── World setup ───────────────────────────────────────────────────────────

    fn namespace_def() -> NamespaceDef {
        NamespaceDef {
            namespace: "td",
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
            ContractDefTrait::new(@"td", @"game_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"td")].span()),
            ContractDefTrait::new(@"td", @"building_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"td")].span()),
            ContractDefTrait::new(@"td", @"wave_system")
                .with_writer_of([dojo::utils::bytearray_hash(@"td")].span()),
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

        let token_id: felt252 = 1;
        let (mut world, game, _, _) = setup();
        game.new_game(token_id, 1);

        let state: GameState = world.read_model(token_id);
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

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_tower(token_id, 0, 3, 3);

        game.new_game(token_id, 1);

        let state: GameState = world.read_model(token_id);
        assert(state.next_tower_id == 0, 'tower id should reset');
        assert(state.gold == INIT_GOLD, 'gold should reset');
    }

    // ── Building system tests ─────────────────────────────────────────────────

    #[test]
    fn test_place_tower_creates_tower() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_tower(token_id, 0, 3, 2);

        let tower: Tower = world.read_model((token_id, 0_u32));
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

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_tower(token_id, 0, 1, 1);
        building.place_tower(token_id, 1, 2, 2);

        let state: GameState = world.read_model(token_id);
        assert(state.next_tower_id == 2, 'should have 2 towers');

        let t1: Tower = world.read_model((token_id, 0_u32));
        let t2: Tower = world.read_model((token_id, 1_u32));
        assert(t1.tower_type == 0, 'wrong type tower 0');
        assert(t2.tower_type == 1, 'wrong type tower 1');
    }

    #[test]
    fn test_place_factory_deducts_gold() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_factory(token_id, 0, 4, 4);

        let state: GameState = world.read_model(token_id);
        assert(state.gold == INIT_GOLD - INPUT_FACTORY_COST, 'wrong gold after factory');
    }

    #[test]
    fn test_place_factory_creates_factory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_factory(token_id, 1, 5, 5);

        let factory: Factory = world.read_model((token_id, 0_u32));
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

        let token_id: felt252 = 1;
        let (_, game, building, _) = setup();
        game.new_game(token_id, 1);
        // Image factory costs 200g; starts with 200g
        building.place_factory(token_id, 1, 1, 1);
        building.place_factory(token_id, 1, 2, 2); // 0g left → panic
    }

    #[test]
    fn test_upgrade_factory_increments_level() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_factory(token_id, 0, 3, 3);
        building.upgrade_factory(token_id, 0);

        let factory: Factory = world.read_model((token_id, 0_u32));
        assert(factory.level == 2, 'level should be 2');

        let state: GameState = world.read_model(token_id);
        assert(state.gold == INIT_GOLD - INPUT_FACTORY_COST - UPGRADE_COST, 'wrong gold');
    }

    #[test]
    #[should_panic(expected: ('Not enough gold', 'ENTRYPOINT_FAILED',))]
    fn test_upgrade_factory_insufficient_gold() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_factory(token_id, 0, 3, 3);

        let mut state: GameState = world.read_model(token_id);
        state.gold = 0;
        world.write_model_test(@state);

        building.upgrade_factory(token_id, 0);
    }

    // ── Wave system tests ─────────────────────────────────────────────────────
    // Wave 1 composition: 6 TJ, 0 CO, 0 HS
    // Wave 1 bonus gold: 50 + 1×10 = 60
    // TJ: hp=20, gold=2, base_damage=1, speed_x100=150
    //
    // Per-enemy simulation with token drain (GPT tower at (9,1), 8 path cells):
    //   max_input = INIT_INPUT_TOKENS = 50 (no factory), cur starts at 50.
    //   Enemy 0: tier=Powered(50/50),  shots=5, dmg=50≥20 → killed, cur=40
    //   Enemy 1: tier=Powered(40/50),  shots=5, dmg=50≥20 → killed, cur=30
    //   Enemy 2: tier=Powered(30/50),  shots=5, dmg=50≥20 → killed, cur=20
    //   Enemy 3: tier=Good(20/50=40%), shots=4, dmg=32≥20 → killed, cur=12
    //   Enemy 4: tier=Low(12/50=24%),  shots=3, dmg=16<20 → survived, cur=6
    //   Enemy 5: tier=Critical(6/50),  shots=2, dmg=6<20  → survived, cur=2
    //   kill_gold=4×2=8, base_damage=2, gold=268, base_health=18, input_tokens=2
    //
    // With an Input factory (prod=30, max=80, cur starts at 80):
    //   Enemy 0-3: Powered (dmg≥50), Enemy 4-5: Good (dmg=32≥20) → all 6 killed
    //   kill_gold=12, base_damage=0, gold=172, base_health=20

    #[test]
    fn test_start_wave_no_towers_applies_base_damage() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);
        // No towers: all 6 TJ reach base → base_damage = 6×1 = 6
        wave.start_wave(token_id);

        let state: GameState = world.read_model(token_id);
        assert(state.wave_number == 1, 'wave should advance');
        assert(state.base_health == BASE_MAX_HP - 6, 'wrong base health');
        // kill_gold=0, wave_bonus=60 → gold = 200 + 60 = 260
        assert(state.gold == INIT_GOLD + 60, 'wrong gold no kills');
        assert(!state.game_over, 'should not be game over');
    }

    // Token drain causes later enemies to face weaker towers.
    // GPT tower at (9,1) kills enemies 0-3 (Powered/Good tier) but enemies 4-5 escape
    // once tokens drain to Low/Critical tier.
    #[test]
    fn test_start_wave_token_drain_partial_kills() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, wave) = setup();
        game.new_game(token_id, 1);
        building.place_tower(token_id, 0, 9, 1);
        wave.start_wave(token_id);

        let state: GameState = world.read_model(token_id);
        // 4 killed, 2 survived → base takes 2 damage
        assert(state.base_health == BASE_MAX_HP - 2, 'wrong base health');
        // kill_gold=8, wave_bonus=60 → 200+8+60=268
        assert(state.gold == INIT_GOLD + 8 + 60, 'wrong gold partial kills');
        // 48 tokens consumed across 6 enemies → 50-48=2 remaining
        assert(state.input_tokens == 2, 'wrong remaining tokens');
    }

    // With enough token production, all enemies are killed even accounting for drain.
    #[test]
    fn test_start_wave_tower_kills_all_with_factory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, wave) = setup();
        game.new_game(token_id, 1);
        building.place_tower(token_id, 0, 9, 1);
        building.place_factory(token_id, 0, 4, 4); // +30 input/wave → max=80
        wave.start_wave(token_id);

        let state: GameState = world.read_model(token_id);
        // All 6 TJ killed → no base damage
        assert(state.base_health == BASE_MAX_HP, 'base should be full');
        // kill_gold=12, wave_bonus=60, factory_cost=100 → 200-100+12+60=172
        assert(state.gold == INIT_GOLD - INPUT_FACTORY_COST + 12 + 60, 'wrong gold all kills');
        assert(!state.game_over, 'should not be game over');
    }

    #[test]
    fn test_start_wave_advances_wave_number() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);
        wave.start_wave(token_id);

        let state: GameState = world.read_model(token_id);
        assert(state.wave_number == 1, 'wave_number should be 1');
        assert(!state.victory, 'should not be victory yet');
    }

    #[test]
    fn test_start_wave_game_over_when_base_destroyed() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        // Set base_health to exactly wave-1 max damage (6) so it's destroyed
        let mut state: GameState = world.read_model(token_id);
        state.base_health = 6;
        world.write_model_test(@state);

        wave.start_wave(token_id); // no towers → all 6 TJ reach base → 6 damage

        let state: GameState = world.read_model(token_id);
        assert(state.base_health == 0, 'base should be 0');
        assert(state.game_over, 'game_over should be set');
        assert(!state.victory, 'should not be victory');
    }

    #[test]
    fn test_start_wave_victory_at_wave_10() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        // Fast-forward to wave 9 with very high base_health so base survives wave 10
        let mut state: GameState = world.read_model(token_id);
        state.wave_number = 9;
        state.base_health = 200; // survive wave 10 max damage (40)
        world.write_model_test(@state);

        wave.start_wave(token_id);

        let state: GameState = world.read_model(token_id);
        assert(state.wave_number == 10, 'should be wave 10');
        assert(state.victory, 'should be victory');
        assert(!state.game_over, 'should not be game over');
    }

    #[test]
    fn test_start_wave_token_production_from_factory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, wave) = setup();
        game.new_game(token_id, 1);
        // Input factory level 1: +30 tokens/wave → max_input = 50 + 30 = 80
        building.place_factory(token_id, 0, 4, 4);
        // No towers → no consumption
        wave.start_wave(token_id);

        let state: GameState = world.read_model(token_id);
        // input_tokens = 50 (carry) + 30 (prod) - 0 (consumed) = 80
        assert(state.input_tokens == INIT_INPUT_TOKENS + INPUT_TOKENS_BASE, 'wrong input tokens');
    }

    #[test]
    fn test_start_wave_wave_bonus_computed_onchain() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        // Fast-forward to wave 4 to test non-trivial bonus
        let mut state: GameState = world.read_model(token_id);
        state.wave_number = 4;
        world.write_model_test(@state);

        wave.start_wave(token_id); // wave 5 bonus = 50 + 5×10 = 100

        let state: GameState = world.read_model(token_id);
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

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        let mut state: GameState = world.read_model(token_id);
        state.game_over = true;
        world.write_model_test(@state);

        wave.start_wave(token_id);
    }

    #[test]
    #[should_panic(expected: ('Already won', 'ENTRYPOINT_FAILED',))]
    fn test_start_wave_guards_victory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        let mut state: GameState = world.read_model(token_id);
        state.victory = true;
        world.write_model_test(@state);

        wave.start_wave(token_id);
    }

    #[test]
    #[should_panic(expected: ('Max waves reached', 'ENTRYPOINT_FAILED',))]
    fn test_start_wave_guards_max_waves() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        let mut state: GameState = world.read_model(token_id);
        state.wave_number = 10;
        world.write_model_test(@state);

        wave.start_wave(token_id);
    }

    // ── New feature tests ─────────────────────────────────────────────────────

    #[test]
    fn test_difficulty_easy_gives_more_gold_and_hp() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, _) = setup();
        game.new_game(token_id, 0); // Easy

        let state: GameState = world.read_model(token_id);
        assert(state.gold == 300, 'easy gold should be 300');
        assert(state.base_health == 30, 'easy hp should be 30');
        assert(state.difficulty == 0, 'difficulty should be 0');
        assert(!state.overclock_used, 'overclock should be false');
    }

    #[test]
    fn test_difficulty_hard_gives_less_gold_and_hp() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, _) = setup();
        game.new_game(token_id, 2); // Hard

        let state: GameState = world.read_model(token_id);
        assert(state.gold == 120, 'hard gold should be 120');
        assert(state.base_health == 10, 'hard hp should be 10');
    }

    #[test]
    #[should_panic(expected: ('Invalid difficulty', 'ENTRYPOINT_FAILED',))]
    fn test_difficulty_invalid_panics() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (_, game, _, _) = setup();
        game.new_game(token_id, 5); // invalid
    }

    #[test]
    fn test_token_overflow_cap() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, wave) = setup();
        game.new_game(token_id, 1);

        // Give enough factories to overflow the 150 cap.
        // Manually set input_tokens near cap, add factory production.
        let mut state: GameState = world.read_model(token_id);
        state.input_tokens = 140;
        world.write_model_test(@state);

        building.place_factory(token_id, 0, 4, 4); // +30/wave → 140+30 = 170 > 150 cap
        wave.start_wave(token_id); // no towers → all enemies through

        let state: GameState = world.read_model(token_id);
        // Tokens capped at 150, no towers consumed any, so still 150.
        assert(state.input_tokens == MAX_TOKEN_BALANCE, 'tokens should be capped');
    }

    #[test]
    fn test_upgrade_tower_increases_level() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 0); // Easy: 300g

        building.place_tower(token_id, 0, 3, 2);
        building.upgrade_tower(token_id, 0); // costs 80g → 300-80 = 220

        let tower: Tower = world.read_model((token_id, 0_u32));
        assert(tower.level == 2, 'level should be 2');

        let state: GameState = world.read_model(token_id);
        assert(state.gold == 300 - tower_upgrade_cost(1), 'wrong gold after upgrade');
    }

    #[test]
    #[should_panic(expected: ('Tower at max level', 'ENTRYPOINT_FAILED',))]
    fn test_upgrade_tower_max_level_panics() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 0); // Easy: 300g
        building.place_tower(token_id, 0, 3, 2);

        // Set tower to level 3 directly.
        let mut tower: Tower = world.read_model((token_id, 0_u32));
        tower.level = 3;
        world.write_model_test(@tower);

        building.upgrade_tower(token_id, 0); // should panic
    }

    #[test]
    fn test_overclock_resets_after_wave() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);
        game.activate_overclock(token_id);

        let state: GameState = world.read_model(token_id);
        assert(state.overclock_used, 'overclock should be set');

        wave.start_wave(token_id);

        let state: GameState = world.read_model(token_id);
        assert(!state.overclock_used, 'overclock should reset');
    }

    #[test]
    #[should_panic(expected: ('Overclock already used', 'ENTRYPOINT_FAILED',))]
    fn test_overclock_double_use_panics() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (_, game, _, _) = setup();
        game.new_game(token_id, 1);
        game.activate_overclock(token_id);
        game.activate_overclock(token_id); // should panic
    }

    #[test]
    fn test_overclock_costs_gold() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, _) = setup();
        game.new_game(token_id, 1);
        game.activate_overclock(token_id);

        let state: GameState = world.read_model(token_id);
        // Normal difficulty starts at 200 gold; overclock costs OVERCLOCK_COST
        assert(state.gold == 200 - OVERCLOCK_COST, 'overclock should cost gold');
    }

    #[test]
    #[should_panic(expected: ('Not enough gold', 'ENTRYPOINT_FAILED',))]
    fn test_overclock_no_gold_panics() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, _) = setup();
        game.new_game(token_id, 1);

        // Drain gold below OVERCLOCK_COST via direct model write
        let mut state: GameState = world.read_model(token_id);
        state.gold = 10;
        world.write_model_test(@state);

        game.activate_overclock(token_id); // should panic: Not enough gold
    }

    #[test]
    fn test_place_tower_has_level_1() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, building, _) = setup();
        game.new_game(token_id, 1);
        building.place_tower(token_id, 0, 3, 2);

        let tower: Tower = world.read_model((token_id, 0_u32));
        assert(tower.level == 1, 'new tower should be level 1');
    }

    // ── EGS IMinigameTokenData tests ──────────────────────────────────────────

    #[test]
    fn test_egs_score_increases_with_wave() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        let score_0 = game.score(token_id);
        assert(score_0 == BASE_MAX_HP.into(), 'score at wave 0 wrong');

        wave.start_wave(token_id);

        let score_1 = game.score(token_id);
        // wave_number=1, base_health=BASE_MAX_HP-6 (6 TJ reach base, no towers)
        let state: GameState = world.read_model(token_id);
        let expected: u64 = (state.wave_number * 1000 + state.base_health).into();
        assert(score_1 == expected, 'score after wave 1 wrong');
        assert(score_1 > score_0, 'score should increase');
    }

    #[test]
    fn test_egs_game_over_false_during_play() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (_, game, _, _) = setup();
        game.new_game(token_id, 1);

        assert(!game.game_over(token_id), 'game_over should be false');
    }

    #[test]
    fn test_egs_game_over_true_on_defeat() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        let mut state: GameState = world.read_model(token_id);
        state.base_health = 6; // exactly destroyed by wave 1 TJ
        world.write_model_test(@state);

        wave.start_wave(token_id);
        assert(game.game_over(token_id), 'game_over should be true');
    }

    #[test]
    fn test_egs_game_over_true_on_victory() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_id: felt252 = 1;
        let (mut world, game, _, wave) = setup();
        game.new_game(token_id, 1);

        let mut state: GameState = world.read_model(token_id);
        state.wave_number = 9;
        state.base_health = 200;
        world.write_model_test(@state);

        wave.start_wave(token_id);
        assert(game.game_over(token_id), 'victory should set game_over');
    }

    #[test]
    fn test_egs_score_batch() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_a: felt252 = 100;
        let token_b: felt252 = 200;
        let (mut world, game, _, wave) = setup();

        game.new_game(token_a, 1);
        game.new_game(token_b, 1);

        // Advance token_a one wave
        let mut state_a: GameState = world.read_model(token_a);
        state_a.wave_number = 3;
        world.write_model_test(@state_a);

        let ids: Span<felt252> = [token_a, token_b].span();
        let scores = game.score_batch(ids);

        // token_a: wave_number=3 * 1000 + base_health=20 = 3020
        assert(*scores.at(0) == 3020_u64, 'batch score token_a wrong');
        // token_b: wave_number=0 * 1000 + base_health=20 = 20
        assert(*scores.at(1) == 20_u64, 'batch score token_b wrong');
    }

    #[test]
    fn test_egs_game_over_batch() {
        let player = starknet::contract_address_const::<0x1>();
        starknet::testing::set_contract_address(player);

        let token_a: felt252 = 100;
        let token_b: felt252 = 200;
        let (mut world, game, _, _) = setup();

        game.new_game(token_a, 1);
        game.new_game(token_b, 1);

        // Mark token_a as game over
        let mut state_a: GameState = world.read_model(token_a);
        state_a.game_over = true;
        world.write_model_test(@state_a);

        let ids: Span<felt252> = [token_a, token_b].span();
        let results = game.game_over_batch(ids);

        assert(*results.at(0), 'token_a should be game over');
        assert(!*results.at(1), 'token_b should not be over');
    }
}
