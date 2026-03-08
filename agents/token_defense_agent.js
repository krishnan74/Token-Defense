#!/usr/bin/env node
/**
 * Token Defense — Reference Autonomous Agent
 *
 * An AI agent that reads the game world via Torii GraphQL and defends
 * the AI inference cluster against adversarial attacks. No screen
 * scraping. No hacks. The world state is natively structured — the
 * agent reads it like a book.
 *
 * Usage:
 *   PRIVATE_KEY=0x... ACCOUNT_ADDRESS=0x... TOKEN_ID=0x... node agents/token_defense_agent.js
 *
 * TOKEN_ID: Denshokan ERC721 token — mint one at the game UI first.
 * DIFFICULTY: 0=Easy (300g, 30HP) | 1=Normal (200g, 20HP) | 2=Hard (120g, 10HP)
 */

import { Account, RpcProvider } from 'starknet';

// ── Config ────────────────────────────────────────────────────────────────────

const TORII_GQL    = 'https://api.cartridge.gg/x/token-defense/torii/graphql';
const RPC_URL      = 'https://api.cartridge.gg/x/starknet/sepolia';
const PRIVATE_KEY  = process.env.PRIVATE_KEY;
const ACCOUNT_ADDR = process.env.ACCOUNT_ADDRESS;
const TOKEN_ID     = process.env.TOKEN_ID;
const DIFFICULTY   = Number(process.env.DIFFICULTY ?? 0);

const GAME_SYSTEM     = '0x4bb6b0105b495d3583522da9e3f21cfc82d959c1f6f95fb285968d567630785';
const BUILDING_SYSTEM = '0xd4a4c2d21088e19286e1d5c0711d063c2246e42ded194ab4315d46765c6789';
const WAVE_SYSTEM     = '0x1bfe8ed70acd5c057dd8e6547a516150503963023a29acd4c6fc7872c63658f';

// ── Grid & path ───────────────────────────────────────────────────────────────

// Path: entrance(13,1) → (9,1) → (9,3) → (5,3) → (5,6) → base(0,6)
const PATH = new Set();
for (let x = 9; x <= 12; x++) PATH.add(`${x},1`); // y=1 horizontal
for (let y = 1; y <= 3;  y++) PATH.add(`9,${y}`);  // x=9 vertical
for (let x = 5; x <= 9;  x++) PATH.add(`${x},3`);  // y=3 horizontal
for (let y = 3; y <= 6;  y++) PATH.add(`5,${y}`);  // x=5 vertical
for (let x = 0; x <= 5;  x++) PATH.add(`${x},6`);  // y=6 horizontal

const isPath = (x, y) => PATH.has(`${x},${y}`);

// ── Build plan ────────────────────────────────────────────────────────────────
// Towers are FREE to place. Factories cost gold. Priority: towers first, then
// factories to sustain token production, then upgrades.

// All GPT (type 0) towers — cheapest to sustain with Input factories.
// Max 14 towers can be placed simultaneously (contract cap).
// Positions chosen to maximise path segment coverage (tower range = 3 tiles).
const TOWER_PLAN = [
  { type: 0, x: 7,  y: 0 },   // covers y=1 entrance + y=3 segment
  { type: 0, x: 10, y: 0 },   // covers y=1 far entrance
  { type: 0, x: 8,  y: 2 },   // covers x=9 junction (y=1↔y=3)
  { type: 0, x: 4,  y: 2 },   // covers y=3 mid segment
  { type: 0, x: 7,  y: 4 },   // covers y=3 end + x=5 corner
  { type: 0, x: 3,  y: 5 },   // covers y=6 mid approach
  { type: 0, x: 1,  y: 5 },   // covers y=6 near base
];

// Input factories (type 0, 100g each) — produce tokens for GPT towers.
const FACTORY_PLAN = [
  { type: 0, x: 6,  y: 0,  cost: 100 },  // feeds tower at (7,0)
  { type: 0, x: 11, y: 0,  cost: 100 },  // feeds tower at (10,0)
  { type: 0, x: 8,  y: 4,  cost: 100 },  // feeds tower at (7,4)
  { type: 0, x: 2,  y: 4,  cost: 100 },  // feeds tower at (3,5)
];

// ── Torii GraphQL ─────────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(TORII_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function getGameState() {
  const data = await gql(`
    query GetState($tokenId: String!) {
      tdGameStateModels(where: { token_idEQ: $tokenId }) {
        edges { node {
          wave_number gold base_health
          next_tower_id next_factory_id
          input_tokens image_tokens code_tokens
        }}
      }
    }
  `, { tokenId: TOKEN_ID });
  return data?.tdGameStateModels?.edges?.[0]?.node ?? null;
}

async function getTowers() {
  const data = await gql(`
    query GetTowers($tokenId: String!) {
      tdTowerModels(where: { token_idEQ: $tokenId }, limit: 50) {
        edges { node { tower_id tower_type x y hp level } }
      }
    }
  `, { tokenId: TOKEN_ID });
  return (data?.tdTowerModels?.edges ?? []).map(e => e.node);
}

async function getFactories() {
  const data = await gql(`
    query GetFactories($tokenId: String!) {
      tdFactoryModels(where: { token_idEQ: $tokenId }, limit: 20) {
        edges { node { factory_id factory_type x y level } }
      }
    }
  `, { tokenId: TOKEN_ID });
  return (data?.tdFactoryModels?.edges ?? []).map(e => e.node);
}

// Poll until wave_number changes or base_health hits 0.
async function waitForWaveComplete(prevWave, intervalMs = 2000) {
  process.stdout.write('  Waiting for chain confirmation');
  while (true) {
    await sleep(intervalMs);
    const state = await getGameState().catch(() => null);
    if (!state) { process.stdout.write('.'); continue; }
    if (Number(state.base_health) <= 0) { console.log(' base destroyed!'); return state; }
    if (Number(state.wave_number) > prevWave) { console.log(` wave ${state.wave_number} confirmed`); return state; }
    process.stdout.write('.');
  }
}

// ── Contract calls ────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function execCall(account, contractAddress, entrypoint, calldata) {
  console.log(`  → ${entrypoint}(${calldata.slice(1).join(', ')})`);
  const tx = await account.execute([{ contractAddress, entrypoint, calldata }]);
  await account.waitForTransaction(tx.transaction_hash);
  return tx;
}

async function newGame(account) {
  return execCall(account, GAME_SYSTEM, 'new_game', [TOKEN_ID, String(DIFFICULTY)]);
}

async function placeTower(account, type, x, y) {
  return execCall(account, BUILDING_SYSTEM, 'place_tower', [TOKEN_ID, String(type), String(x), String(y)]);
}

async function placeFactory(account, type, x, y) {
  return execCall(account, BUILDING_SYSTEM, 'place_factory', [TOKEN_ID, String(type), String(x), String(y)]);
}

async function upgradeFactory(account, factoryId) {
  return execCall(account, BUILDING_SYSTEM, 'upgrade_factory', [TOKEN_ID, String(factoryId)]);
}

async function startWave(account) {
  return execCall(account, WAVE_SYSTEM, 'start_wave', [TOKEN_ID]);
}

// ── Strategy ──────────────────────────────────────────────────────────────────

function decideBuild(state, towers, factories) {
  const actions = [];
  const occupied = new Set([
    ...towers.map(t => `${t.x},${t.y}`),
    ...factories.map(f => `${f.x},${f.y}`),
  ]);
  const canPlace = (x, y) => !isPath(x, y) && !occupied.has(`${x},${y}`);

  // 1. Place any unbuilt towers (free)
  for (const t of TOWER_PLAN) {
    const placed = towers.some(e => Number(e.x) === t.x && Number(e.y) === t.y);
    if (!placed && canPlace(t.x, t.y)) {
      actions.push({ kind: 'tower', ...t });
      occupied.add(`${t.x},${t.y}`);
    }
  }

  // 2. Buy factories while gold allows
  let gold = Number(state.gold);
  for (const f of FACTORY_PLAN) {
    const placed = factories.some(e => Number(e.x) === f.x && Number(e.y) === f.y);
    if (!placed && canPlace(f.x, f.y) && gold >= f.cost) {
      actions.push({ kind: 'factory', ...f });
      occupied.add(`${f.x},${f.y}`);
      gold -= f.cost;
    }
  }

  // 3. Upgrade factories if gold permits (50g each)
  for (const f of factories) {
    if (Number(f.level) < 3 && gold >= 50) {
      actions.push({ kind: 'upgrade', factoryId: f.factory_id });
      gold -= 50;
    }
  }

  return actions;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  if (!PRIVATE_KEY || !ACCOUNT_ADDR || !TOKEN_ID) {
    console.error('Missing env: PRIVATE_KEY, ACCOUNT_ADDRESS, TOKEN_ID');
    process.exit(1);
  }

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account  = new Account(provider, ACCOUNT_ADDR, PRIVATE_KEY);

  console.log('Token Defense Agent');
  console.log('===================');
  console.log(`Account  : ${ACCOUNT_ADDR}`);
  console.log(`Token ID : ${TOKEN_ID}`);
  console.log(`Difficulty: ${['Easy','Normal','Hard'][DIFFICULTY]}`);
  console.log('');

  // Start a new game
  console.log('[1/3] Starting new game...');
  await newGame(account);

  // Wait for Torii to index the new game
  await sleep(3000);

  let state = await getGameState();
  if (!state) throw new Error('Game state not found in Torii after new_game');
  console.log(`      gold=${state.gold} base_health=${state.base_health}\n`);

  // Wave loop
  while (Number(state.wave_number) < 10 && Number(state.base_health) > 0) {
    const wave = Number(state.wave_number) + 1;
    console.log(`[Wave ${wave}] Building defenses...`);

    const [towers, factories] = await Promise.all([getTowers(), getFactories()]);
    const actions = decideBuild(state, towers, factories);

    for (const a of actions) {
      if      (a.kind === 'tower')   await placeTower(account, a.type, a.x, a.y);
      else if (a.kind === 'factory') await placeFactory(account, a.type, a.x, a.y);
      else if (a.kind === 'upgrade') await upgradeFactory(account, a.factoryId);
    }

    if (actions.length === 0) console.log('  (no new buildings)');
    console.log(`[Wave ${wave}] Sending wave...`);
    const tx = await startWave(account);
    console.log(`  tx: ${tx.transaction_hash}`);

    state = await waitForWaveComplete(wave - 1);

    console.log(`  result → base_health=${state.base_health} gold=${state.gold}\n`);
    if (Number(state.base_health) <= 0) break;
  }

  // Outcome
  const finalWave = Number(state.wave_number);
  const finalHp   = Number(state.base_health);
  console.log('===================');
  if (finalHp <= 0) {
    console.log(`DEFEATED on wave ${finalWave}. Base destroyed.`);
  } else if (finalWave >= 10) {
    console.log(`VICTORY! Survived all 10 waves. Base HP: ${finalHp}`);
  } else {
    console.log(`Stopped at wave ${finalWave}. Base HP: ${finalHp}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
