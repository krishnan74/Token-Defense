# Token Defense — Agent Guide

All game state lives in Torii. Any agent with a wallet can read the world and play — no screen scraping, no reverse engineering. This is by design.

## Quick start

```bash
# Prerequisites: Node 18+, starknet package
cd agents
npm install starknet   # or: copy from the client's node_modules

# 1. Mint a Denshokan token at the game UI (or via the Denshokan SDK)
# 2. Run the agent:
PRIVATE_KEY=0x...     \
ACCOUNT_ADDRESS=0x... \
TOKEN_ID=0x...        \
DIFFICULTY=0          \
node token_defense_agent.js
```

`DIFFICULTY`: `0`=Easy (300g · 30HP) · `1`=Normal (200g · 20HP) · `2`=Hard (120g · 10HP)

---

## Reading world state via Torii GraphQL

Endpoint: `https://api.cartridge.gg/x/token-defense/torii/graphql`

Introspect the full schema at `{endpoint}?sdl`.

### Get game state

```graphql
query {
  tdGameStateModels(where: { token_idEQ: "0x<your_token_id>" }) {
    edges { node {
      token_id
      wave_number
      gold
      base_health
      difficulty
      next_tower_id
      next_factory_id
      input_tokens
      image_tokens
      code_tokens
    }}
  }
}
```

### Get placed towers

```graphql
query {
  tdTowerModels(where: { token_idEQ: "0x<your_token_id>" }, limit: 50) {
    edges { node {
      tower_id
      tower_type    # 0=GPT  1=Vision  2=Code
      x y
      hp
      level
    }}
  }
}
```

### Get factories

```graphql
query {
  tdFactoryModels(where: { token_idEQ: "0x<your_token_id>" }, limit: 20) {
    edges { node {
      factory_id
      factory_type  # 0=Input  1=Image  2=Code
      x y
      level
    }}
  }
}
```

### Leaderboard (all games, all players)

```graphql
query {
  tdGameStateModels(limit: 50, order: { field: WAVE_NUMBER, direction: DESC }) {
    edges { node {
      token_id
      wave_number
      base_health
      difficulty
    }}
  }
}
```

---

## Contract calls

All calls take `token_id` as the first argument. Use `starknet.js` or `starknet.py`.

| Action | Contract | Entrypoint | Calldata |
|---|---|---|---|
| Start a game | `game_system` | `new_game` | `[token_id, difficulty]` |
| Place tower | `building_system` | `place_tower` | `[token_id, tower_type, x, y]` |
| Place factory | `building_system` | `place_factory` | `[token_id, factory_type, x, y]` |
| Upgrade factory | `building_system` | `upgrade_factory` | `[token_id, factory_id]` |
| Start wave | `wave_system` | `start_wave` | `[token_id]` |

Contract addresses (Sepolia):

```
game_system     = 0x4bb6b0105b495d3583522da9e3f21cfc82d959c1f6f95fb285968d567630785
building_system = 0xd4a4c2d21088e19286e1d5c0711d063c2246e42ded194ab4315d46765c6789
wave_system     = 0x1bfe8ed70acd5c057dd8e6547a516150503963023a29acd4c6fc7872c63658f
```

---

## Game rules an agent needs to know

**Grid:** 12×8 tiles. Enemy path cannot be built on.

**Enemy path:** `(entrance, y=1) → (9,1) → (9,3) → (5,3) → (5,6) → base (0,6)`

**Path tiles** (blocked for placement):
```
y=1: x ∈ [9,12]    (entrance)
x=9: y ∈ [1,3]     (vertical turn)
y=3: x ∈ [5,9]     (horizontal)
x=5: y ∈ [3,6]     (vertical turn)
y=6: x ∈ [0,5]     (approach to base)
```

**Towers** — free to place, limited by grid:

| Type | Name | HP | Damage | Token |
|---|---|---|---|---|
| 0 | GPT | 100 | 10 | input |
| 1 | Vision | 80 | 14 | image |
| 2 | Code | 90 | 12 | code |

**Factories** — cost gold, produce tokens each wave:

| Type | Name | Cost | Output/wave |
|---|---|---|---|
| 0 | Input | 100g | 30 input tokens |
| 1 | Image | 200g | 10 image tokens |
| 2 | Code | 180g | 12 code tokens |

**Token tiers** (tokens remaining / max):
- ≥60% → Powered (1.0× dmg)
- ≥35% → Good (0.8× dmg)
- ≥15% → Low (0.55× dmg)
- ≥1%  → Critical (0.3× dmg)
- 0%   → Offline (0.15× dmg)

**Wave bonus gold:** `50 + wave_number × 10` — added by the contract on completion.

**Victory:** survive all 10 waves with base_health > 0.

---

## Wave outcomes via events

After `start_wave()` confirms, read the `WaveResolved` event from the transaction receipt.

Event selector: `WaveResolved` on the `wave_system` contract.

Event data (in order):
```
wave_number      u32
enemy_outcomes   u32   bitmask — bit i = 1 if i-th spawned enemy was killed
kill_gold        u32
base_damage      u32
new_base_health  u32
new_gold         u32
input_consumed   u32
image_consumed   u32
code_consumed    u32
```

`enemy_outcomes` bitmask order: TextJailbreak enemies first, then ContextOverflow, then HalluSwarm, then Boss.

---

## Building your own agent

The reference agent (`token_defense_agent.js`) uses a fixed build plan. Smarter strategies might:

- Prioritise path segments with the most enemies still alive (from `enemy_outcomes`)
- Mix tower types to handle different wave compositions
- Time factory upgrades to hit token production thresholds before tough waves
- Use `wave_number` to look ahead and prepare for the Boss on waves 5 and 10
- Track token drain rate and upgrade factories before hitting the Critical tier

The entire world state is public. There are no hidden variables. Build accordingly.
