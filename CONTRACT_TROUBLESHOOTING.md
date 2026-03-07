# Troubleshooting: Token Defense Migration to Dojo

This document captures issues encountered while migrating the project from the
simple spawn/move game to the Tower Defense MVP, and how each was resolved.

---

## Issue 1: `InsufficientResourcesForValidate` on `scarb run dev`

### Symptom
`sozo migrate` fails immediately after Katana starts:
```
Migration failed.
Caused by:
    InsufficientResourcesForValidate
```

### Root Cause
Katana 1.7.1 with `dev = true` in `katana.toml` does **not** automatically
disable fee validation. `sozo` sends transactions with a max gas price of `1`
(near-zero fee mode), but Katana's actual gas prices are:
- L1 gas: 20,000,000,000 wei
- L1 data gas: 1,000,000 wei
- L2 gas: 20,000,000,000 wei

The full detail is visible in `/tmp/katana.log`:
```
Invalid transaction. error=Resource bounds were not satisfied:
Max L1Gas price (1) is lower than the actual gas price: 20000000000.
```

### Fix
Add `no_fee = true` to the `[dev]` section in `contracts/katana.toml`:

```toml
[dev]
dev = true
no_fee = true   # <-- added
```

This maps to the `--dev.no-fee` CLI flag and disables fee charging for all
transactions in the local dev environment.

---

## Issue 2: `Failed to deserialize param #1` — World Constructor Crash

### Symptom
After fixing the fee issue, migration still fails at "Deploy the world":
```
Migration failed.
Caused by:
    Transaction error (index: 0)
    ...
    2: Error in the contract class constructor ...
    Execution failed. Failure reason:
    0x4661696c656420746f20646573657269616c697a6520706172616d202331
    ('Failed to deserialize param #1').
```

### Root Cause
A **version mismatch** between the sozo CLI and the dojo Cairo library:

| Component | Version |
|-----------|---------|
| `sozo` CLI (`.tool-versions`) | 1.8.6 |
| `dojo` Cairo library (`Scarb.toml`) | 1.7.2 ← stale |

The `chore: bump tool versions to latest` commit updated the CLI tools in
`.tool-versions` to sozo 1.8.6, but did not update the `dojo` dependency in
`Scarb.toml`. sozo 1.8.6 bundles and deploys a **different world contract**
(new class hash) than sozo 1.7.x did. This new world's constructor expects
calldata in a format that the 1.7.2 library's serialization does not produce,
causing the deserialization failure on the first constructor parameter.

The mismatch is visible by comparing the world class hash in the old
`manifest_dev.json` (`0x691da...`) vs. what sozo 1.8.6 tried to deploy
(`0x03127...`).

### Fix
Update the Cairo library dependencies in `contracts/Scarb.toml` to match the
sozo CLI version (1.8.0 is the highest available on scarbs.xyz at time of
writing):

```toml
[dependencies]
starknet = "2.12.2"
dojo = "1.8.0"   # was 1.7.2

[dev-dependencies]
cairo_test = "2.12.2"
dojo_cairo_test = "1.8.0"  # was 1.7.2
```

After this change, `scarb build` and `sozo migrate` both succeed cleanly.

---

## Rule of Thumb

Keep `dojo` in `Scarb.toml` and `sozo` in `.tool-versions` on the **same
major.minor version**. When bumping CLI tools, always bump the Scarb dependency
at the same time. Check `scarbs.xyz` for the latest published dojo package
version if the exact CLI version is not yet published.

---

## Issue 3: Token balances never updated on-chain

### Symptom
`input_tokens`, `image_tokens`, `code_tokens` in `GameState` stay at `0` across all waves, even after placing factories and completing waves.

### Root Cause
`commit_wave_result` and `start_wave` never wrote to the token fields. They were initialized to `0` in `new_game()` and untouched thereafter. The client simulator computed tokens locally from factories, but never sent consumed amounts to the contract, and the contract never computed production from factories.

### Fix
Extended `commit_wave_result` with three additional parameters for consumed token amounts. The contract iterates all player factories, computes production using the same formula as the client (`base + base*(level-1)/2`), then writes the new balance:

```cairo
fn commit_wave_result(
    ref self: ContractState,
    tower_ids: Array<u32>,
    tower_damages: Array<u32>,
    gold_earned: u32,
    input_tokens_consumed: u32,   // <-- new
    image_tokens_consumed: u32,   // <-- new
    code_tokens_consumed: u32,    // <-- new
) {
    // ... apply tower damages, award gold ...

    // Iterate all player factories to compute token production
    let mut fid: u32 = 0;
    let mut input_prod: u32 = 0;
    // ... image_prod, code_prod ...
    loop {
        if fid >= game.next_factory_id { break; }
        let factory: Factory = world.read_model((player, fid));
        if factory.is_active {
            let base: u32 = match factory.factory_type { 0 => 30, 1 => 10, 2 => 12, _ => 0 };
            let prod = base + base * (factory.level - 1) / 2;
            match factory.factory_type {
                0 => { input_prod += prod; },
                // ...
            }
        }
        fid += 1;
    };

    // new_balance = carryover + production - consumed (saturating)
    game.input_tokens = (game.input_tokens + input_prod).saturating_sub(input_tokens_consumed);
    game.image_tokens = (game.image_tokens + image_prod).saturating_sub(image_tokens_consumed);
    game.code_tokens  = (game.code_tokens  + code_prod) .saturating_sub(code_tokens_consumed);
}
```

Client-side counterpart: `WaveSimulator.getResult()` now returns `tokensConsumed = { input_tokens: maxTokens.input - remaining.input, ... }` which `endWave()` passes to `actions.commitWaveResult(ids, dmgs, gold, inputConsumed, imageConsumed, codeConsumed)`.

### Calldata format after the change
```js
call('commit_wave_result', [
  towerIds.length, ...towerIds,
  towerDamages.length, ...towerDamages,
  goldEarned,
  inputConsumed,
  imageConsumed,
  codeConsumed,
])
```

### Note on ABI changes
Any change to a function's parameter list in `actions.cairo` is an ABI change and requires a contract redeploy:
```bash
cd contracts && sozo migrate
```
The `manifest_dev.json` is regenerated automatically; the client picks it up via its JSON import.
