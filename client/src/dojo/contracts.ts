// Typed contract wrappers — pure functions with no React coupling.
// useActions.js uses these internally so calldata construction is typed.

import type { CommitWaveArgs, ContractAddresses, ManifestContract } from './models';

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

/** Serialises commit_wave_result calldata (Cairo Array<u32> convention). */
export function buildCommitCalldata(args: CommitWaveArgs): (string | number)[] {
  return [
    args.towerIds.length,
    ...args.towerIds,
    args.towerDamages.length,
    ...args.towerDamages,
    args.goldFromKills,
    args.inputConsumed,
    args.imageConsumed,
    args.codeConsumed,
    args.baseDamage,
  ];
}
