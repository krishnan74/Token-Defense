# Token Defense

A fully on-chain tower defense game built on StarkNet using the [Dojo](https://book.dojoengine.org/) engine. Defend an AI inference cluster from waves of adversarial prompt injection attacks. Every action — tower placement, wave simulation, score — lives on-chain. Humans and agents welcome.

## Play

| Link | URL |
|------|-----|
| Live game | https://token-defense.vercel.app |
| EGS / Fun Factory | https://funfactory.gg/games/17 |
| Source | https://github.com/krishnan74/Token-Defense |

## Deployments (Sepolia)

| Contract | Address |
|----------|---------|
| World (Dojo database) | `0x02090ff7a736f00df9a9934be01b25da6d127a3f994660856bbb3da44dfaefa2` |
| td-game_system | `0x6861bcd95eca8d269191997803114cc3efa298c2c277a3ed1f75ffdbfed34c1` |
| td-building_system | `0x2194878721f2ed30e4a5eebcbfa5fc1bcefd6ddb66d8eb319ef94ef5d72ea18` |
| td-wave_system | `0x719db1b998b8992871ed9019fabe798fc763c83eb9a14c231938779e52f8e50` |
| Denshokan (ERC721) | `0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467` |

| Endpoint | URL |
|----------|-----|
| Torii GraphQL | `https://api.cartridge.gg/x/token-defense/torii/graphql` |
| Torii gRPC | `https://api.cartridge.gg/x/token-defense/torii` |
| RPC | `https://api.cartridge.gg/x/starknet/sepolia` |

---

## Repo Structure

```
token-defense/
├── contracts/          Cairo smart contracts (Dojo 1.8.0)
│   ├── src/
│   │   ├── models.cairo          GameState, Tower, Factory
│   │   ├── constants.cairo       All game constants + combat helpers
│   │   └── systems/
│   │       ├── game.cairo        new_game, activate_overclock, EGS interfaces
│   │       ├── building.cairo    place/sell/upgrade towers + factories
│   │       └── wave.cairo        start_wave — full on-chain simulation
│   └── tests/
│       └── test_world.cairo      37 integration tests
├── client/             React + Vite + TypeScript frontend
│   └── src/
│       ├── App.tsx               Root orchestrator
│       ├── constants.ts          Game constants (mirrors contracts)
│       ├── hooks/                useActions, useGameState, useWaveFlow, useReplay, ...
│       ├── components/           GameBoard, ResourceBar, TowerStatus, WavePanel, ...
│       ├── simulation/           WaveReplay.js (60fps enemy animation)
│       └── dojo/                 SDK context, Torii models, contract helpers
└── agents/
    ├── token_defense_agent.js    Reference autonomous agent (Node.js)
    └── README.md                 Agent guide + Torii GraphQL reference
```

---

## Game Overview

**Grid:** 12×8 tiles. Enemy path is fixed — build around it.

**Enemy path:** `(entrance, y=1) → (9,1) → (9,3) → (5,3) → (5,6) → base (0,6)`

**Towers** — free to place, max 14 active at once:

| Type | Name | HP | Damage | Token |
|------|------|----|--------|-------|
| 0 | GPT    | 100 | 10 | input  |
| 1 | Vision | 80  | 14 | image  |
| 2 | Code   | 90  | 12 | code   |

Towers lose HP when enemies survive and pass through their range. Damaged towers deal reduced damage based on current HP:

| HP % | Damage output |
|------|--------------|
| ≥75% | 100% (full) |
| ≥50% | 90% |
| ≥25% | 75% |
| <25% | 55% |

Repair a tower to full HP for **30g** (only available between waves). Enemy damage per surviving enemy: TextJailbreak=1, ContextOverflow=1, HalluSwarm=0, Boss=3 per in-range tower.

**Factories** — cost gold, produce tokens each wave:

| Type | Name  | Cost | Output/wave | Upgrade cost |
|------|-------|------|-------------|--------------|
| 0 | Input | 100g | 30 input tokens | 50g (+50%/level) |
| 1 | Image | 200g | 10 image tokens | 50g |
| 2 | Code  | 180g | 12 code tokens  | 50g |

**Token tiers** (tokens remaining / max 150):

| Tier | Threshold | Damage mult | Cooldown |
|------|-----------|-------------|----------|
| Powered  | ≥60% | 1.0× | 1.0s |
| Good     | ≥35% | 0.8× | 1.3s |
| Low      | ≥15% | 0.55× | 2.0s |
| Critical | ≥1%  | 0.3× | 3.5s |
| Offline  | 0%   | 0.15× | 4.5s |

**Difficulty:**

| | Easy | Normal | Hard |
|-|------|--------|------|
| Starting gold | 300g | 200g | 120g |
| Base HP | 35 | 25 | 12 |

**Wave gold reward:** `60 + wave_number × 15`

**Victory:** Survive all 10 waves with `base_health > 0`.

---

## Wave Simulation (On-Chain)

`start_wave(token_id)` runs a sequential per-enemy simulation inside the contract:

```
For each enemy in spawn order (TextJailbreak → ContextOverflow → HalluSwarm → Boss):
  Pass 1 — compute damage:
    For each alive tower in range:
      tier       = cur_tokens / max_tokens  →  dmg_mult + cooldown
      shots      = path_cells_covered / (speed × cooldown)
      hp_mult    = tower_health_mult(tower.health, tower.max_health)  -- 100/90/75/55%
      damage    += shots × base_dmg × tier_mult × level_mult × hp_mult × (1 + synergy_bonus)
      tokens    -= shots × 2
  if total_damage ≥ enemy_hp → killed; else →
    base takes damage
    Pass 2 — degrade towers: each in-range tower loses HP (TJ/CO=1, HS=0, Boss=3), floor=1
```

Later enemies face weaker towers as the shared token pool depletes — making factories strategically critical. Surviving enemies also physically degrade towers, creating meaningful decisions around tower repair.

Emits `WaveResolved` event with an `enemy_outcomes` bitmask (bit i = 1 if i-th enemy killed), used by the client to animate an exact replay.

---

## EGS Integration

Token Defense implements the full [Embeddable Game Standard](https://funfactory.gg) interface suite via Denshokan ERC721 tokens. Each game session is keyed by a `token_id` minted from the Denshokan contract.

> **The EGS Token ID is your game session key.** Every on-chain action (place tower, start wave, etc.) is tied to the token ID minted at game start. To resume a session — on the same device or another — enter your token ID on the Resume Game panel, or open a shared link: `https://token-defense.vercel.app/?id=<tokenId>`. The token ID is displayed in the in-game resource bar with a one-click copy button.

### `IMinigameTokenData`

| Function | Details |
|----------|---------|
| `score(token_id)` | `wave_number × 1000 + base_health` |
| `game_over(token_id)` | `game_over \|\| victory` |
| `score_batch` / `game_over_batch` | Batch variants for leaderboard queries |

### `IMinigameDetails`

| Function | Details |
|----------|---------|
| `token_name(token_id)` | Returns `"Token Defense"` |
| `token_description(token_id)` | Dynamic: difficulty + wave progress + victory/defeat status + score |
| `game_details(token_id)` | 7 live fields: Wave, Base HP, Gold, Towers, Factories, Difficulty, Status |
| `*_batch` variants | All three functions support batch calls |

### `IMinigameSettings`

Named difficulty configurations (settings IDs 1–3):

| ID | Name | Gold | Base HP | Tokens |
|----|------|------|---------|--------|
| 1 | Easy | 300 | 30 | High |
| 2 | Normal | 200 | 20 | Standard |
| 3 | Hard | 120 | 10 | Scarce |

### `IMinigameObjectives`

5 trackable on-chain achievements:

| ID | Name | Condition |
|----|------|-----------|
| 1 | First Line Cleared | Survive wave 1 |
| 2 | Midpoint Defender | Survive wave 5 |
| 3 | Cyber Defender | Complete all 10 waves (victory) |
| 4 | Untouched | Victory with full base HP remaining |
| 5 | Iron Sentinel | Victory on Hard difficulty |

---

## Autonomous Agents

All game state is indexed in Torii and queryable via GraphQL — no screen scraping required. The `agents/` directory contains a reference Node.js agent and full documentation.

```bash
cd agents
PRIVATE_KEY=0x... ACCOUNT_ADDRESS=0x... TOKEN_ID=0x... node token_defense_agent.js
```

Torii GraphQL endpoint: `https://api.cartridge.gg/x/token-defense/torii/graphql`

See [`agents/README.md`](agents/README.md) for the full query reference and contract call table.

---

## Development

### Prerequisites

Install the toolchain via `asdf` (run from `contracts/`):

```bash
asdf install
```

Versions: Scarb 2.16.0 · Sozo 1.8.6 · Torii 1.8.7 · Katana 1.7.1

### Contracts

```bash
cd contracts

# Build
scarb --profile sepolia build

# Deploy to Sepolia (updates manifest_sepolia.json)
sozo migrate --profile sepolia

# Re-register with Denshokan after deploy
sozo execute td-game_system initialize_egs --profile sepolia

# Local dev (Katana + build + migrate + Torii — all-in-one)
./dev.sh

# Tests
sozo test
```

> Always run `scarb --profile sepolia build` before `sozo migrate` — sozo won't detect changes otherwise.

### Client

```bash
cd client
pnpm install
pnpm run dev      # HTTPS dev server on localhost (requires Chrome for Cartridge Controller)
pnpm run build    # Production build
pnpm run format   # Prettier
```
