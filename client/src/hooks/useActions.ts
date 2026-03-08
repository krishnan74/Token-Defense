import { useRef } from 'react';
import type { AccountInterface } from 'starknet';
import { buildContractAddresses } from '../dojo/contracts';
import type { ManifestContract } from '../dojo/models';

export function useActions(
  account: AccountInterface | null | undefined,
  manifest: { contracts: ManifestContract[] } | null,
  tokenId: string | null,
) {
  const accountRef = useRef<AccountInterface | null | undefined>(account);
  accountRef.current = account;

  const addresses = buildContractAddresses(manifest?.contracts ?? []);

  async function call(
    contractAddress: string,
    entrypoint: string,
    calldata: (string | number | bigint)[] = [],
  ) {
    if (!accountRef.current || !contractAddress) throw new Error('Not connected');
    const tx = await accountRef.current.execute({
      contractAddress,
      entrypoint,
      calldata,
    } as Parameters<AccountInterface['execute']>[0]);
    console.log(`[${entrypoint}] tx:`, tx);
    return tx;
  }

  const tid = tokenId ?? '0x0';

  return {
    /**
     * Initialise a new game session keyed by overrideTokenId (from Denshokan mint).
     * Falls back to tid if no override supplied.
     */
    newGame: (difficulty: number, overrideTokenId?: string) =>
      call(addresses.game, 'new_game', [overrideTokenId ?? tid, difficulty]),

    activateOverclock: () =>
      call(addresses.game, 'activate_overclock', [tid]),

    placeTower: (towerType: number, x: number, y: number) =>
      call(addresses.building, 'place_tower', [tid, towerType, x, y]),

    placeFactory: (factoryType: number, x: number, y: number) =>
      call(addresses.building, 'place_factory', [tid, factoryType, x, y]),

    upgradeFactory: (factoryId: number | string) =>
      call(addresses.building, 'upgrade_factory', [tid, factoryId as number]),

    upgradeTower: (towerId: number | string) =>
      call(addresses.building, 'upgrade_tower', [tid, towerId as number]),

    startWave: () =>
      call(addresses.wave, 'start_wave', [tid]),
  };
}
