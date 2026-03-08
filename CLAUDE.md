# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Token Defense** — a tower defense game on Dojo/StarkNet. Two parts:
- `contracts/` — Cairo smart contracts (Dojo), deployed on **Sepolia**
- `client/` — React + Vite + TypeScript frontend (`@starknet-react/core` for auth)

## Wave Simulation — On-Chain Execution Model

Waves are **fully simulated on-chain** in `start_wave()`. No client-side simulation is authoritative.

**When the player clicks Start Wave (one tx):**
- `start_wave(token_id)` is called — the contract runs a per-enemy sequential simulation
- For each enemy: towers fire based on token tier, tokens are drained, enemy is killed or reaches base
- Emits `WaveResolved` event with `enemy_outcomes` bitmask + all stats
- Updates `gold`, `base_health`, token balances, `wave_number` atomically

**Client replay (animation only, not authoritative):**
- Client detects wave_number increment via Torii polling
- Fetches receipt → decodes `WaveResolved` event → gets exact `enemy_outcomes` bitmask
- `WaveReplay.js` animates enemies based on the bitmask (bit i = 1 if i-th enemy killed)
- `WaveSimulator.js` is kept but not used in the main game flow

**Trust model:** Contract is fully authoritative. Client is display-only for wave outcomes.

## Toolchain

Managed via `asdf` with versions in `contracts/.tool-versions`:
- `scarb 2.16.0` — Cairo package manager / build tool
- `sozo 1.8.6` — Dojo deployment tool
- `katana 1.7.1` — Local StarkNet sequencer
- `torii 1.8.7` — Dojo indexer

Install tools: `asdf install` (run inside `contracts/`)

**Critical:** dojo Cairo library version in `Scarb.toml` must match the sozo CLI major.minor. sozo 1.8.6 → `dojo = "1.8.0"`.

## Common Commands

### Contracts (run from `contracts/`)

```bash
scarb build                      # Build Cairo contracts only
sozo migrate                     # Deploy/migrate to Sepolia → updates manifest_sepolia.json
sozo migrate --profile dev       # Deploy to local Katana
scarb run dev                    # Local dev: Katana + build + migrate + Torii
sozo test                        # Run 25 integration tests
```

### Client (run from `client/`)

```bash
pnpm install           # Install dependencies
pnpm run dev           # Start Vite dev server (HTTPS on localhost via mkcert)
pnpm run format        # Format with Prettier
```

## Architecture

### Contracts (`contracts/src/`)

- `lib.cairo` — Module root exposing `models`, `constants`, `systems`, `tests`
- `models.cairo` — `GameState` (keyed by `token_id: felt252`), `Tower` (keyed by token_id+tower_id), `Factory` (keyed by token_id+factory_id)
- `constants.cairo` — All game constants + `DENSHOKAN_ADDRESS`, wave tables, tier helpers, `compute_shots`, `count_path_cells_covered`
- `systems/game.cairo` — `IGameSystem`: `new_game(token_id, difficulty)`, `activate_overclock(token_id)`, `initialize_egs()`, EGS score/game_over; SRC5 + MinigameComponent embedded
- `systems/building.cairo` — `IBuildingSystem`: `place_tower`, `place_factory`, `upgrade_factory`, `upgrade_tower` — all take `token_id` as first arg
- `systems/wave.cairo` — `IWaveSystem`: `start_wave(token_id)` — full per-enemy on-chain simulation, emits `WaveResolved` event
- `tests/test_world.cairo` — 37 integration tests

**All player-facing functions are wrapped with EGS lifecycle hooks:**
- `game_system` uses `self.minigame.pre_action(token_id)` / `self.minigame.post_action(token_id)` (MinigameComponent methods)
- `building_system` and `wave_system` use free functions: `pre_action(denshokan_addr, token_id)` / `post_action(denshokan_addr, token_id)`
- `token_id` MUST be a real Denshokan ERC721 token ID — `pre_action` validates lifecycle

**Actions summary:**
- `new_game(token_id, difficulty)` — init GameState; difficulty 0=Easy/1=Normal/2=Hard
- `place_tower(token_id, type, x, y)` — Tower types: 0=GPT(100HP), 1=Vision(80HP), 2=Code(90HP)
- `place_factory(token_id, type, x, y)` — costs gold; Factory types: 0=Input(100g), 1=Image(200g), 2=Code(180g)
- `upgrade_factory(token_id, id)` — 50g; +50% token production per level
- `upgrade_tower(token_id, id)` — 80g (L1→2) / 120g (L2→3); +30%/+65% damage
- `start_wave(token_id)` — full on-chain simulation; emits `WaveResolved`; gold/health/tokens updated atomically

**EGS / Denshokan:**
- `initialize_egs()` — registers game with Denshokan registry; call after each deployment since `dojo_init` only runs on first deploy
- `score(token_id) → u64` — `wave_number * 1000 + base_health`
- `game_over(token_id) → bool` — `game_over || victory`
- Denshokan address (Sepolia): `0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467`

**Dojo config** (`dojo_dev.toml` / `dojo_sepolia.toml`):
- World seed: `token_defense_v2`, namespace: `td`
- Sepolia RPC: `https://api.cartridge.gg/x/starknet/sepolia`
- Writer grants: `td` namespace → `["td-game_system", "td-building_system", "td-wave_system"]`

**Katana config** (`katana.toml`): `dev=true`, `no_fee=true`, CORS open, Cartridge Controller/paymaster enabled.

**Active manifest:** `manifest_sepolia.json` — generated by `sozo migrate`, imported by `main.tsx` (for SDK world address) and `controller.ts` (for policy contract addresses). Do NOT use `manifest_dev.json` (stale, has old `td-actions`).

### Client (`client/src/`)

All source files are TypeScript (`.ts`/`.tsx`). `WaveSimulator.js` and `WaveReplay.js` are the only JS files.

**Packages:** `@starknet-react/core@5.0.3`, `@starknet-react/chains@5.0.3`, `@cartridge/connector@0.13.9`, `starknet@8.5.2`

**Entry & auth:**
- `main.tsx` — async `main()` inits Dojo SDK once, provides via `DojoContext`, wraps app in `StarknetProvider`
- `starknet.tsx` — `StarknetProvider` wrapping `StarknetConfig` with `ControllerConnector`; `autoConnect` resumes sessions
- `controller.ts` — Cartridge policy: `mint` (Denshokan) + `new_game`, `place_tower`, `place_factory`, `upgrade_factory`, `upgrade_tower`, `start_wave`
- `App.css` — all layout + overlay styles

**Dojo layer (`dojo/`):**
- `dojo/config.ts` — `TORII_URL`, `RPC_URL`, `CHAIN_ID`, `DOMAIN`, `IS_E2E`
- `dojo/DojoContext.tsx` — SDK React context; `useDojoSDK()` hook
- `dojo/models.ts` — `GameState`, `Tower`, `Factory`, `WaveResolvedEvent`, `ContractAddresses`
- `dojo/contracts.ts` — `DENSHOKAN_ADDRESS`, `buildContractAddresses()`, `decodeWaveResolvedEvent()`, `parseMintedTokenId()`

**Core:**
- `types.ts` — shared interfaces: `WaveResultSummary`, `GameOver`, `GameStats`, `Conveyor`, `PendingReplay`, `EMPTY_STATS`
- `constants.ts` — TOWERS, FACTORIES, ENEMIES, WAVE_COMPOSITIONS, TOKEN_TIERS, conveyor helpers, `isPathTile`
- `App.tsx` — root orchestrator (~451 lines): tokenId state, `mintAndStart()`, handlers, render

**Hooks:**
- `hooks/useActions.ts` — typed contract calls; `newGame(difficulty, overrideTokenId?)` supports override for fresh mint
- `hooks/useGameState.ts` — Torii subscription; **clears state on tokenId change**; `refreshGameState()`
- `hooks/useWaveFlow.ts` — wave confirmation effect, countdown timer, polling fallback, `handleStartWave`; owns `preWaveBaseHealthRef`
- `hooks/useReplay.ts` — rAF loop, WaveReplay instance, achievement triggers, `startReplay/stopReplay/toggleReplaySpeed`
- `hooks/useOptimisticEntities.ts` — optimistic towers/factories/gold/upgrades + 3 Torii confirmation sync effects

**Components (all `.tsx`):**
- `components/LoadingScreen.tsx` — mint/tx loading spinner
- `components/MenuScreen.tsx` — connect + new-game + difficulty selector
- `components/WaveResultCard.tsx` — wave clear overlay + KillBreakdown
- `components/GameOverCard.tsx` — victory/defeat overlay
- `components/GameBoard.tsx`, `ResourceBar.tsx`, `BuildMenu.tsx`, `TowerStatus.tsx`, `WavePanel.tsx` — game UI

**Simulation:**
- `simulation/WaveSimulator.js` + `.d.ts` — kept for reference; not used in main flow
- `simulation/WaveReplay.js` — animates enemies from `enemyOutcomes` bitmask

### Key Game Constants

- Grid: 14×8 tiles, tower range: 3 tiles
- Token tiers: ≥60% Powered(1.0x dmg), ≥35% Good(0.8x), ≥15% Low(0.55x), ≥1% Critical(0.3x), Offline(0.15x)
- Starting gold: Easy=300 / Normal=200 / Hard=120; gold per wave: 50 + wave×10 (on-chain)
- Max waves: 10; base HP: Easy=30 / Normal=20 / Hard=10
- Tower upgrades: L1→L2 costs 80g (+30% dmg), L2→L3 costs 120g (+65% dmg vs L1)
- Overclock: costs 50g; halves all tower cooldowns for one wave

## Dev Workflow

**Sepolia (current target):**
1. `cd contracts && scarb --profile sepolia build` — ALWAYS build first, or sozo won't detect changes
2. `cd contracts && sozo migrate --profile sepolia` — deploy, updates `manifest_sepolia.json`
3. If `game_system` was redeployed: `sozo execute td-game_system initialize_egs` — re-registers with Denshokan (idempotent)
4. Restart `cd client && pnpm run dev` — restart required after manifest changes
5. Open in Chrome, connect Cartridge Controller

**Local Katana:**
1. `cd contracts && scarb run dev` — starts Katana + migrate + Torii
2. `cd client && pnpm run dev` — start client

Use Google Chrome (required for Cartridge Controller compatibility).

## Denshokan Mint Flow

Before calling `new_game`, the client must mint a Denshokan ERC721 token. The `token_id` returned is used for all subsequent game calls.

```ts
// mint() calldata — 15 params, all Option<> as None discriminant '0'
calldata: [
  gameAddr,        // game_address: ContractAddress
  '0',             // player_name: Option<felt252> — None
  '0',             // settings_id: Option<u32>    — None
  '0',             // start: Option<u64>          — None
  '0',             // end: Option<u64>            — None
  '0',             // objective_id: Option<u32>   — None
  '0',             // context: Option<...>        — None
  '0',             // client_url: Option<ByteArr> — None
  '0',             // renderer_address: Option<ContractAddress> — None
  '0',             // skills_address: Option<ContractAddress>   — None
  account.address, // to: ContractAddress
  '0',             // soulbound: false
  '0',             // paymaster: false
  '0',             // salt: u16
  '0',             // metadata: u16
]
```

**Parsing the minted token_id from receipt:**
```ts
// Transfer event: keys=[selector, from=0x0, to=player, token_id_low, token_id_high]
const low  = BigInt(keys[3]);
const high = BigInt(keys[4]);
const tokenId = '0x' + (low + high * 2n**128n).toString(16);
```

**tokenId persistence:** Stored in `localStorage('td:tokenId:{account.address}')` so sessions survive page refresh. Cleared/replaced only when player starts a new game.

## Calldata Convention

Cairo `Option<T>` serializes as `[0]` for None or `[1, ...value]` for Some.
Cairo `ContractAddress` and `felt252` serialize as a single hex string.

## Testing Notes

- Tests use `spawn_test_world(world::TEST_CLASS_HASH, [ndef].span())` — two arguments required in dojo_cairo_test 1.8.0
- `#[should_panic]` tests through contract dispatchers must include `'ENTRYPOINT_FAILED'` in the expected tuple: `#[should_panic(expected: ('My error', 'ENTRYPOINT_FAILED',))]`
- Use `starknet::contract_address_const::<0x1>()` for test player addresses (not shortstring syntax)

## Torii Subscription Pattern

SDK is initialised once in `main.tsx` and accessed via `useDojoSDK()` — never call `init()` inside a hook or component.

```ts
const sdk = useDojoSDK(); // from DojoContext
const [initialEntities, sub] = await sdk.subscribeEntityQuery({ query, callback });
if (initialEntities?.length) handleEntities(initialEntities); // load existing state
```
Always use the initial snapshot — do not discard the first return value.
Model names include namespace: `'td-GameState'`, `'td-Tower'`, `'td-Factory'`.
