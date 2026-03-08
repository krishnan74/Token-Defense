// Typed contract wrappers — pure functions with no React coupling.

import type { ContractAddresses, ManifestContract, WaveResolvedEvent } from './models';

/** Shared Denshokan MinigameToken (ERC721) on Sepolia — the EGS session registry. */
export const DENSHOKAN_ADDRESS = '0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467';

/** Resolves the three system contract addresses from the Sozo manifest. */
export function buildContractAddresses(
  contracts: ManifestContract[],
): ContractAddresses {
  const addr = (tag: string) => contracts.find((c) => c.tag === tag)?.address ?? '';
  return {
    game: addr('td-game_system'),
    building: addr('td-building_system'),
    wave: addr('td-wave_system'),
  };
}

/**
 * Parses the minted ERC721 token_id from a Denshokan mint() receipt.
 * Handles all common OZ Cairo ERC721 Transfer event encodings:
 *   - keys=[selector, from, to, id_low, id_high]  (all #[key])
 *   - keys=[selector, from, to], data=[id_low, id_high]
 *   - keys=[selector], data=[from, to, id_low, id_high]  (all data)
 */
export function parseMintedTokenId(events: unknown[]): string | null {
  const denshokan = DENSHOKAN_ADDRESS.toLowerCase();
  for (const evt of events as RawEvent[]) {
    if (evt.from_address?.toLowerCase() !== denshokan) continue;
    const keys = evt.keys ?? [];
    const data = evt.data ?? [];
    try {
      // Format A: keys=[selector, from=0, to, id_low, id_high]
      if (keys.length >= 5 && BigInt(keys[1]) === 0n) {
        return '0x' + BigInt(keys[3]).toString(16);
      }
      // Format B: keys=[selector, from=0, to], data=[id_low, id_high]
      if (keys.length >= 3 && BigInt(keys[1]) === 0n && data.length >= 1) {
        return '0x' + BigInt(data[0]).toString(16);
      }
      // Format C: keys=[selector], data=[from=0, to, id_low, id_high]
      if (keys.length >= 1 && data.length >= 4 && BigInt(data[0]) === 0n) {
        return '0x' + BigInt(data[2]).toString(16);
      }
    } catch {
      // malformed hex — skip
    }
  }
  return null;
}

interface RawEvent {
  from_address: string;
  keys: string[];
  data: string[];
}

/**
 * Finds and decodes the WaveResolved event emitted by wave_system.start_wave().
 *
 * Event layout (starknet encoding):
 *   keys: [selector, player_address]
 *   data: [wave_number, enemy_outcomes, kill_gold, base_damage,
 *          new_base_health, new_gold, input_consumed, image_consumed, code_consumed]
 */
export function decodeWaveResolvedEvent(
  events: unknown[],
  waveContractAddress: string,
): WaveResolvedEvent | null {
  const waveAddr = waveContractAddress.toLowerCase();
  const evt = (events as RawEvent[]).find(
    (e) =>
      e.from_address?.toLowerCase() === waveAddr &&
      Array.isArray(e.keys) && e.keys.length === 2 &&
      Array.isArray(e.data) && e.data.length === 9,
  );
  if (!evt) return null;
  const n = (hex: string) => Number(BigInt(hex));
  return {
    wave_number:     n(evt.data[0]),
    enemy_outcomes:  n(evt.data[1]),
    kill_gold:       n(evt.data[2]),
    base_damage:     n(evt.data[3]),
    new_base_health: n(evt.data[4]),
    new_gold:        n(evt.data[5]),
    input_consumed:  n(evt.data[6]),
    image_consumed:  n(evt.data[7]),
    code_consumed:   n(evt.data[8]),
  };
}
