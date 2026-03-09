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

`DIFFICULTY`: `0`=Easy (300g · 35HP) · `1`=Normal (200g · 25HP) · `2`=Hard (120g · 12HP)

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
      active_tower_count
      input_tokens
      image_tokens
      code_tokens
      game_over
      victory
      overclock_used
      endless_mode
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
      health
      max_health
      is_alive
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
      is_active
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
| Quit game | `game_system` | `quit_game` | `[token_id]` |
| Activate overclock | `game_system` | `activate_overclock` | `[token_id]` |
| Activate endless mode | `game_system` | `activate_endless` | `[token_id]` |
| Place tower | `building_system` | `place_tower` | `[token_id, tower_type, x, y]` |
| Sell tower | `building_system` | `sell_tower` | `[token_id, tower_id]` |
| Upgrade tower | `building_system` | `upgrade_tower` | `[token_id, tower_id]` |
| Repair tower | `building_system` | `repair_tower` | `[token_id, tower_id]` |
| Place factory | `building_system` | `place_factory` | `[token_id, factory_type, x, y]` |
| Sell factory | `building_system` | `sell_factory` | `[token_id, factory_id]` |
| Upgrade factory | `building_system` | `upgrade_factory` | `[token_id, factory_id]` |
| Start wave | `wave_system` | `start_wave` | `[token_id]` |

Contract addresses (Sepolia):

```
world           = 0x02090ff7a736f00df9a9934be01b25da6d127a3f994660856bbb3da44dfaefa2
game_system     = 0x6861bcd95eca8d269191997803114cc3efa298c2c277a3ed1f75ffdbfed34c1
building_system = 0x2194878721f2ed30e4a5eebcbfa5fc1bcefd6ddb66d8eb319ef94ef5d72ea18
wave_system     = 0x719db1b998b8992871ed9019fabe798fc763c83eb9a14c231938779e52f8e50
denshokan       = 0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467
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

**Towers** — free to place, max 14 active at once. Use `sell_tower` to free a slot (refunds 50% of upgrade gold spent):

| Type | Name | HP | Damage | Range | Token | Special |
|---|---|---|---|---|---|---|
| 0 | GPT | 100 | 10 | 3 tiles | input | — |
| 1 | Vision | 80 | 14 | 2 tiles | image | Short range — place near path bends |
| 2 | Code | 90 | 12 | 3 tiles | code | 1.5× AoE vs HalluSwarm |

Tower upgrades (max L3):

| Level | Cost | Damage mult |
|---|---|---|
| L1→L2 | 80g | 1.3× |
| L2→L3 | 120g | 1.65× |

Damaged towers deal reduced damage. Repair for 30g via `repair_tower`.

Adjacent towers of **different** types grant a **+20% synergy damage bonus** to each other.

**Factories** — cost gold, produce tokens each wave (max 150 per type). Sell refunds 50% of total invested. Max L3:

| Type | Name | Cost | Output/wave (L1) | Upgrade cost |
|---|---|---|---|---|
| 0 | Input | 100g | 30 input tokens | 50g |
| 1 | Image | 200g | 18 image tokens | 50g |
| 2 | Code | 180g | 12 code tokens | 50g |

Each upgrade adds +50% output to the base. L2 = 1.5×, L3 = 2.0×.

**Token tiers** (tokens remaining / max 150):
- ≥60% → Powered (1.0× dmg, 1.0s cooldown)
- ≥35% → Good (0.8× dmg, 1.3s cooldown)
- ≥15% → Low (0.55× dmg, 2.0s cooldown)
- ≥1%  → Critical (0.3× dmg, 3.5s cooldown)
- 0%   → Offline (0.15× dmg, 4.5s cooldown)

**Wave bonus gold:** `60 + wave_number × 15` — added by the contract on wave completion.

**Overclock:** costs 50g, halves all tower cooldowns for one wave. Resets after the wave.

**Victory:** survive all 10 waves with `base_health > 0`. Endless mode available after wave 10 via `activate_endless`.

**Enemies by wave:**

| Wave | TextJailbreak | ContextOverflow | HalluSwarm | Boss |
|---|---|---|---|---|
| 1–2 | ✓ | — | — | — |
| 3–4 | ✓ | ✓ | — | — |
| 5 | ✓ | ✓ | — | ✓ |
| 6 | ✓ | ✓ | ✓ | — |
| 7–9 | ✓ | ✓ | ✓ | — |
| 10 | ✓ | ✓ | ✓ | ✓ |

From wave 5, some enemies gain **Armored** (reduced damage taken) or **Fast** (higher speed) traits.

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
- Mix tower types to exploit Code tower's 1.5× AoE vs HalluSwarm (waves 6+)
- Place Vision towers at path bends for maximum coverage within their 2-tile range
- Time factory upgrades to hit token production thresholds before tough waves
- Use `wave_number` to look ahead and prepare for the Boss on waves 5 and 10
- Track token drain rate and upgrade factories before hitting the Critical tier
- Sell and reposition towers between waves using the refund mechanic
- Use `active_tower_count` from game state to track the 14-tower cap

The entire world state is public. There are no hidden variables. Build accordingly.
