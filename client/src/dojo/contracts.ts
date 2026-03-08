// Typed contract wrappers — pure functions with no React coupling.

import type { ContractAddresses, ManifestContract, WaveResolvedEvent } from './models';

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
