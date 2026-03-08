/// IGameSystem — game lifecycle + full EGS interface suite.
///
/// EGS interfaces implemented:
///   IMinigameTokenData    — score / game_over
///   IMinigameDetails      — token name, description, per-token game state
///   IMinigameSettings     — named difficulty configs (Easy / Normal / Hard)
///   IMinigameSettingsDetails
///   IMinigameObjectives   — 5 trackable achievements
///   IMinigameObjectivesDetails
#[starknet::interface]
pub trait IGameSystem<T> {
    fn new_game(ref self: T, token_id: felt252, difficulty: u32);
    fn activate_overclock(ref self: T, token_id: felt252);
    /// Re-registers EGS metadata after contract upgrades (dojo_init is not re-run).
    fn initialize_egs(ref self: T);
    // IMinigameTokenData (EGS)
    fn score(self: @T, token_id: felt252) -> u64;
    fn game_over(self: @T, token_id: felt252) -> bool;
    fn score_batch(self: @T, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @T, token_ids: Span<felt252>) -> Array<bool>;
}

#[dojo::contract]
pub mod game_system {
    use super::IGameSystem;
    use starknet::{get_caller_address, get_contract_address, contract_address_const};
    use dojo::model::ModelStorage;
    use crate::models::GameState;
    use crate::constants::{
        difficulty_init_gold, difficulty_base_hp, difficulty_init_tokens, OVERCLOCK_COST,
    };

    // ── EGS components ─────────────────────────────────────────────────────
    use game_components_embeddable_game_standard::minigame::minigame_component::MinigameComponent;
    use game_components_embeddable_game_standard::minigame::interface::{
        IMinigameTokenData, IMinigameDetails,
    };
    use game_components_embeddable_game_standard::minigame::structs::GameDetail;
    use game_components_embeddable_game_standard::minigame::extensions::settings::settings::SettingsComponent;
    use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
        IMinigameSettings, IMinigameSettingsDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::structs::{
        GameSetting, GameSettingDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::objectives::objectives::ObjectivesComponent;
    use game_components_embeddable_game_standard::minigame::extensions::objectives::interface::{
        IMinigameObjectives, IMinigameObjectivesDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::{
        GameObjective, GameObjectiveDetails,
    };
    use game_components_utilities::utils::encoding::u128_to_ascii_felt;
    use openzeppelin_introspection::src5::SRC5Component;

    component!(path: MinigameComponent,  storage: minigame,   event: MinigameEvent);
    component!(path: SettingsComponent,  storage: settings,   event: SettingsEvent);
    component!(path: ObjectivesComponent, storage: objectives, event: ObjectivesEvent);
    component!(path: SRC5Component,      storage: src5,       event: SRC5Event);

    #[abi(embed_v0)]
    impl MinigameImpl    = MinigameComponent::MinigameImpl<ContractState>;
    impl MinigameInternal  = MinigameComponent::InternalImpl<ContractState>;
    impl SettingsInternal  = SettingsComponent::InternalImpl<ContractState>;
    impl ObjectivesInternal = ObjectivesComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        minigame:   MinigameComponent::Storage,
        #[substorage(v0)]
        settings:   SettingsComponent::Storage,
        #[substorage(v0)]
        objectives: ObjectivesComponent::Storage,
        #[substorage(v0)]
        src5:       SRC5Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        MinigameEvent:   MinigameComponent::Event,
        #[flat]
        SettingsEvent:   SettingsComponent::Event,
        #[flat]
        ObjectivesEvent: ObjectivesComponent::Event,
        #[flat]
        SRC5Event:       SRC5Component::Event,
    }

    fn dojo_init(ref self: ContractState) {
        self.register_with_denshokan();
    }

    // ── IMinigameTokenData ────────────────────────────────────────────────
    // score formula: wave_number * 1000 + base_health
    // Higher waves + more remaining HP → higher score.

    impl GameTokenDataImpl of IMinigameTokenData<ContractState> {
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

    // ── IMinigameDetails ──────────────────────────────────────────────────

    #[abi(embed_v0)]
    impl DetailsImpl of IMinigameDetails<ContractState> {
        fn token_name(self: @ContractState, token_id: felt252) -> ByteArray {
            let _ = token_id;
            "Token Defense"
        }

        fn token_description(self: @ContractState, token_id: felt252) -> ByteArray {
            let mut world = self.world_default();
            let state: GameState = world.read_model(token_id);
            let diff: ByteArray = if state.difficulty == 0 {
                "Easy"
            } else if state.difficulty == 1 {
                "Normal"
            } else {
                "Hard"
            };
            if state.wave_number == 0 && !state.game_over && !state.victory {
                format!(
                    "Token Defense on StarkNet [{}]. No waves completed yet.",
                    diff,
                )
            } else if state.game_over {
                format!(
                    "Token Defense [{}]. Defeated on wave {}. The base was destroyed by adversarial attacks.",
                    diff, state.wave_number,
                )
            } else if state.victory {
                format!(
                    "Token Defense [{}]. VICTORY! All 10 waves survived. Score: {}.",
                    diff, state.wave_number * 1000 + state.base_health,
                )
            } else {
                format!(
                    "Token Defense [{}]. Wave {} completed. Base HP: {}/{}.",
                    diff, state.wave_number, state.base_health,
                    difficulty_base_hp(state.difficulty),
                )
            }
        }

        fn game_details(self: @ContractState, token_id: felt252) -> Span<GameDetail> {
            let mut world = self.world_default();
            let state: GameState = world.read_model(token_id);
            let status: felt252 = if state.victory {
                'Victory'
            } else if state.game_over {
                'Defeated'
            } else if state.wave_number > 0 {
                'In Progress'
            } else {
                'Not Started'
            };
            let diff: felt252 = if state.difficulty == 0 {
                'Easy'
            } else if state.difficulty == 1 {
                'Normal'
            } else {
                'Hard'
            };
            let wave: u128      = state.wave_number.into();
            let hp: u128        = state.base_health.into();
            let gold: u128      = state.gold.into();
            let towers: u128    = state.next_tower_id.into();
            let factories: u128 = state.next_factory_id.into();
            array![
                GameDetail { name: 'Wave',       value: u128_to_ascii_felt(wave) },
                GameDetail { name: 'Base HP',    value: u128_to_ascii_felt(hp) },
                GameDetail { name: 'Gold',       value: u128_to_ascii_felt(gold) },
                GameDetail { name: 'Towers',     value: u128_to_ascii_felt(towers) },
                GameDetail { name: 'Factories',  value: u128_to_ascii_felt(factories) },
                GameDetail { name: 'Difficulty', value: diff },
                GameDetail { name: 'Status',     value: status },
            ]
                .span()
        }

        fn token_name_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<ByteArray> {
            let mut results = array![];
            for token_id in token_ids {
                results.append(self.token_name(*token_id));
            };
            results
        }

        fn token_description_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<ByteArray> {
            let mut results = array![];
            for token_id in token_ids {
                results.append(self.token_description(*token_id));
            };
            results
        }

        fn game_details_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<Span<GameDetail>> {
            let mut results = array![];
            for token_id in token_ids {
                results.append(self.game_details(*token_id));
            };
            results
        }
    }

    // ── IMinigameSettings — Easy / Normal / Hard ──────────────────────────
    // Settings IDs: 1=Easy  2=Normal  3=Hard

    #[abi(embed_v0)]
    impl GameSettingsImpl of IMinigameSettings<ContractState> {
        fn settings_exist(self: @ContractState, settings_id: u32) -> bool {
            settings_id >= 1 && settings_id <= 3
        }

        fn settings_exist_batch(
            self: @ContractState, settings_ids: Span<u32>,
        ) -> Array<bool> {
            let mut results = array![];
            for id in settings_ids {
                results.append(self.settings_exist(*id));
            };
            results
        }
    }

    #[abi(embed_v0)]
    impl GameSettingsDetailsImpl of IMinigameSettingsDetails<ContractState> {
        fn settings_count(self: @ContractState) -> u32 {
            3
        }

        fn settings_details(self: @ContractState, settings_id: u32) -> GameSettingDetails {
            if settings_id == 1 {
                GameSettingDetails {
                    name: "Easy",
                    description: "300 starting gold, 30 base HP. Best for learning the game.",
                    settings: array![
                        GameSetting { name: 'Gold', value: '300' },
                        GameSetting { name: 'Base HP', value: '30' },
                        GameSetting { name: 'Tokens', value: 'High' },
                    ]
                        .span(),
                }
            } else if settings_id == 2 {
                GameSettingDetails {
                    name: "Normal",
                    description: "200 starting gold, 20 base HP. The intended experience.",
                    settings: array![
                        GameSetting { name: 'Gold', value: '200' },
                        GameSetting { name: 'Base HP', value: '20' },
                        GameSetting { name: 'Tokens', value: 'Standard' },
                    ]
                        .span(),
                }
            } else {
                assert!(settings_id == 3, "Settings not found");
                GameSettingDetails {
                    name: "Hard",
                    description: "120 starting gold, 10 base HP. One mistake ends the run.",
                    settings: array![
                        GameSetting { name: 'Gold', value: '120' },
                        GameSetting { name: 'Base HP', value: '10' },
                        GameSetting { name: 'Tokens', value: 'Scarce' },
                    ]
                        .span(),
                }
            }
        }

        fn settings_details_batch(
            self: @ContractState, settings_ids: Span<u32>,
        ) -> Array<GameSettingDetails> {
            let mut results = array![];
            for id in settings_ids {
                results.append(self.settings_details(*id));
            };
            results
        }
    }

    // ── IMinigameObjectives — 5 achievements ─────────────────────────────
    // 1 — First Line Cleared : survive wave 1
    // 2 — Midpoint Defender  : survive wave 5
    // 3 — Cyber Defender     : complete all 10 waves (victory)
    // 4 — Untouched          : victory with full base HP remaining
    // 5 — Iron Sentinel      : victory on Hard difficulty

    #[abi(embed_v0)]
    impl GameObjectivesImpl of IMinigameObjectives<ContractState> {
        fn objective_exists(self: @ContractState, objective_id: u32) -> bool {
            objective_id >= 1 && objective_id <= 5
        }

        fn completed_objective(
            self: @ContractState, token_id: felt252, objective_id: u32,
        ) -> bool {
            let mut world = self.world_default();
            let state: GameState = world.read_model(token_id);
            if objective_id == 1 {
                state.wave_number >= 1
            } else if objective_id == 2 {
                state.wave_number >= 5
            } else if objective_id == 3 {
                state.victory
            } else if objective_id == 4 {
                state.victory
                    && state.base_health >= difficulty_base_hp(state.difficulty)
            } else if objective_id == 5 {
                state.victory && state.difficulty == 2
            } else {
                false
            }
        }

        fn objective_exists_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<bool> {
            let mut results = array![];
            for id in objective_ids {
                results.append(self.objective_exists(*id));
            };
            results
        }
    }

    #[abi(embed_v0)]
    impl GameObjectivesDetailsImpl of IMinigameObjectivesDetails<ContractState> {
        fn objectives_count(self: @ContractState) -> u32 {
            5
        }

        fn objectives_details(
            self: @ContractState, objective_id: u32,
        ) -> GameObjectiveDetails {
            if objective_id == 1 {
                GameObjectiveDetails {
                    name: "First Line Cleared",
                    description: "Survive the first wave of TextJailbreak prompt injections.",
                    objectives: array![GameObjective { name: 'Min Wave', value: '1' }].span(),
                }
            } else if objective_id == 2 {
                GameObjectiveDetails {
                    name: "Midpoint Defender",
                    description: "Reach wave 5. ContextOverflow and Boss enemies join the assault.",
                    objectives: array![GameObjective { name: 'Min Wave', value: '5' }].span(),
                }
            } else if objective_id == 3 {
                GameObjectiveDetails {
                    name: "Cyber Defender",
                    description: "Complete all 10 waves. The AI inference cluster is safe.",
                    objectives: array![GameObjective { name: 'Victory', value: '1' }].span(),
                }
            } else if objective_id == 4 {
                GameObjectiveDetails {
                    name: "Untouched",
                    description: "Win without taking any base damage across all 10 waves.",
                    objectives: array![
                        GameObjective { name: 'Victory', value: '1' },
                        GameObjective { name: 'Full HP', value: '1' },
                    ]
                        .span(),
                }
            } else {
                assert!(objective_id == 5, "Objective not found");
                GameObjectiveDetails {
                    name: "Iron Sentinel",
                    description: "Win on Hard difficulty. 120 gold, 10 HP. No room for error.",
                    objectives: array![
                        GameObjective { name: 'Victory', value: '1' },
                        GameObjective { name: 'Difficulty', value: 'Hard' },
                    ]
                        .span(),
                }
            }
        }

        fn objectives_details_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<GameObjectiveDetails> {
            let mut results = array![];
            for id in objective_ids {
                results.append(self.objectives_details(*id));
            };
            results
        }
    }

    // ── IGameSystem ───────────────────────────────────────────────────────

    #[abi(embed_v0)]
    impl GameSystemImpl of IGameSystem<ContractState> {
        fn initialize_egs(ref self: ContractState) {
            self.register_with_denshokan();
        }

        fn new_game(ref self: ContractState, token_id: felt252, difficulty: u32) {
            self.minigame.pre_action(token_id);

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
                active_tower_count: 0,
            };
            world.write_model(@game_state);
            self.minigame.post_action(token_id);
        }

        fn activate_overclock(ref self: ContractState, token_id: felt252) {
            self.minigame.pre_action(token_id);

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
            self.minigame.post_action(token_id);
        }

        fn score(self: @ContractState, token_id: felt252) -> u64 {
            GameTokenDataImpl::score(self, token_id)
        }
        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            GameTokenDataImpl::game_over(self, token_id)
        }
        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            GameTokenDataImpl::score_batch(self, token_ids)
        }
        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            GameTokenDataImpl::game_over_batch(self, token_ids)
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"td")
        }

        fn register_with_denshokan(ref self: ContractState) {
            let denshokan_address = contract_address_const::<
                0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467
            >();
            let creator_address = contract_address_const::<
                0x0721834c557ce689176a2e66370585777ed82a916489dbe41d35acbe636cd55a
            >();
            let this = get_contract_address();

            self
                .minigame
                .initializer(
                    creator_address,
                    "Token Defense",
                    "A fully on-chain tower defense game on StarkNet. Defend your AI base from prompt injection attacks across 10 waves.",
                    "Token Defense Team",
                    "Token Defense Team",
                    "Tower Defense",
                    "https://token-defense.vercel.app/favicon.png",
                    Option::Some("#6366f1"),   // indigo — matches game UI
                    Option::Some("https://token-defense.vercel.app/"), // client_url
                    Option::None,             // renderer_address — use platform default
                    Option::None,             // settings_address
                    Option::None,             // objectives_address
                    denshokan_address,
                    Option::None,             // royalty_fraction
                    Option::None,             // skills_address
                    1_u64,                    // version
                );

            // Settings (1=Easy, 2=Normal, 3=Hard) and objectives (1-5) are served
            // statically by this contract's IMinigameSettings / IMinigameObjectives
            // implementations. Denshokan discovers them via Option::Some(this) above.
            let _ = this;
        }
    }
}
