/// IGameSystem — game lifecycle + EGS IMinigameTokenData interface.
///
/// EGS (Embeddable Game Standard) compatibility:
///   score(token_id)    → u64   — wave_number * 1000 + base_health
///   game_over(token_id) → bool  — true when game_over OR victory
///   + batch variants for efficient leaderboard queries
///   SRC5 registers IMINIGAME_ID so the contract is EGS-discoverable.
#[starknet::interface]
pub trait IGameSystem<T> {
    fn new_game(ref self: T, token_id: felt252, difficulty: u32);
    fn activate_overclock(ref self: T, token_id: felt252);
    /// Registers the game with the Denshokan EGS registry on Sepolia.
    /// Call once after deployment (dojo_init is not re-run on contract upgrades).
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
    use starknet::get_caller_address;
    use dojo::model::ModelStorage;
    use crate::models::GameState;
    use crate::constants::{
        difficulty_init_gold, difficulty_base_hp, difficulty_init_tokens, OVERCLOCK_COST,
    };
    use game_components_embeddable_game_standard::minigame::minigame_component::MinigameComponent;
    use game_components_embeddable_game_standard::minigame::interface::IMinigameTokenData;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::contract_address_const;

    component!(path: MinigameComponent, storage: minigame, event: MinigameEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl MinigameImpl = MinigameComponent::MinigameImpl<ContractState>;
    impl MinigameInternalImpl = MinigameComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        minigame: MinigameComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        MinigameEvent: MinigameComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    /// Called once on first deployment (not re-run on contract upgrades).
    fn dojo_init(ref self: ContractState) {
        self.register_with_denshokan();
    }

    /// IMinigameTokenData impl (non-embedded) — required by MinigameComponent's
    /// generic bounds so it can read score/game_over from this contract's state.
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

    #[abi(embed_v0)]
    impl GameSystemImpl of IGameSystem<ContractState> {
        /// Registers the game with the Denshokan EGS registry on Sepolia.
        /// Call this once after deployment since dojo_init is not re-run on upgrades.
        fn initialize_egs(ref self: ContractState) {
            self.register_with_denshokan();
        }

        /// Initialise a new game session keyed by token_id.
        /// In a full EGS flow, token_id is minted by Denshokan before this call.
        /// Calling again with the same token_id resets the session.
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
            };

            world.write_model(@game_state);
            self.minigame.post_action(token_id);
        }

        /// Activates the Overclock ability for the upcoming wave.
        /// Halves all tower cooldowns during wave resolution (doubles fire rate).
        /// Resets automatically after the wave resolves.
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

        // ── IMinigameTokenData (EGS) — embedded ABI ──────────────────────────
        // Score formula: wave_number * 1000 + base_health
        // Higher waves and more remaining HP yield a higher score.

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

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"td")
        }

        /// Registers this game with the Denshokan EGS registry on Sepolia.
        /// Called from both dojo_init (first deploy) and initialize_egs (upgrades).
        fn register_with_denshokan(ref self: ContractState) {
            // Sepolia shared Denshokan MinigameToken (ERC721)
            let denshokan_address = starknet::contract_address_const::<
                0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467
            >();
            // Deployer / creator wallet
            let creator_address = starknet::contract_address_const::<
                0x0721834c557ce689176a2e66370585777ed82a916489dbe41d35acbe636cd55a
            >();

            self
                .minigame
                .initializer(
                    creator_address,
                    "Token Defense",
                    "A fully on-chain tower defense game on StarkNet. Defend your AI base from prompt injection attacks across 10 waves.",
                    "Token Defense Team",
                    "Token Defense Team",
                    "Tower Defense",
                    "https://raw.githubusercontent.com/token-defense/assets/main/logo.png",
                    Option::Some("#6366f1"),   // indigo — matches game UI
                    Option::None,             // client_url — add once deployed publicly
                    Option::None,             // renderer_address — use platform default
                    Option::None,             // settings_address
                    Option::None,             // objectives_address
                    denshokan_address,
                    Option::None,             // royalty_fraction
                    Option::None,             // skills_address
                    1_u64,                    // version
                );
        }
    }
}
