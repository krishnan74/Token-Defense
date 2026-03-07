// Typed contract wrappers — pure functions with no React coupling.

import type { ContractAddresses, ManifestContract } from './models';

/** Resolves the three system contract addresses from the Sozo manifest. */
export function buildContractAddresses(
  contracts: ManifestContract[],
): ContractAddresses {
  const addr = (tag: string) => contracts.find((c) => c.tag === tag)?.address ?? '';
  return {
    game: addr('di-game_system'),
    building: addr('di-building_system'),
    wave: addr('di-wave_system'),
  };
}
