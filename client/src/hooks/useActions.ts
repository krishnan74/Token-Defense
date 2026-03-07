import { useRef } from 'react';
import type { AccountInterface } from 'starknet';
import { buildContractAddresses } from '../dojo/contracts';
import type { ManifestContract } from '../dojo/models';

export function useActions(
  account: AccountInterface | null | undefined,
  manifest: { contracts: ManifestContract[] } | null,
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

  return {
    newGame: () => call(addresses.game, 'new_game'),

    placeTower: (towerType: number, x: number, y: number) =>
      call(addresses.building, 'place_tower', [towerType, x, y]),

    placeFactory: (factoryType: number, x: number, y: number) =>
      call(addresses.building, 'place_factory', [factoryType, x, y]),

    upgradeFactory: (factoryId: number | string) =>
      call(addresses.building, 'upgrade_factory', [factoryId as number]),

    startWave: () => call(addresses.wave, 'start_wave'),
  };
}
