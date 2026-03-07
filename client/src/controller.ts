import manifest from '../../contracts/manifest_sepolia.json' with { type: 'json' };

const contracts = manifest.contracts;
const addr = (tag: string): string | undefined =>
  contracts.find((c: { tag: string }) => c.tag === tag)?.address;

const gameContract     = addr('di-game_system');
const buildingContract = addr('di-building_system');
const waveContract     = addr('di-wave_system');

const controllerOpts = {
  chains: [{ rpcUrl: 'https://api.cartridge.gg/x/starknet/sepolia' }],
  defaultChainId: '0x534e5f5345504f4c4941',
  policies: {
    contracts: {
      ...(gameContract && {
        [gameContract]: {
          name: 'Token Defense — Game',
          description: 'Game initialisation',
          methods: [
            { name: 'New Game', entrypoint: 'new_game', description: 'Initialize a new game' },
          ],
        },
      }),
      ...(buildingContract && {
        [buildingContract]: {
          name: 'Token Defense — Building',
          description: 'Tower and factory placement',
          methods: [
            { name: 'Place Tower',     entrypoint: 'place_tower',     description: 'Place a tower on the grid' },
            { name: 'Place Factory',   entrypoint: 'place_factory',   description: 'Place a factory on the grid' },
            { name: 'Upgrade Factory', entrypoint: 'upgrade_factory', description: 'Upgrade a factory level' },
          ],
        },
      }),
      ...(waveContract && {
        [waveContract]: {
          name: 'Token Defense — Wave',
          description: 'Wave lifecycle',
          methods: [
            { name: 'Start Wave', entrypoint: 'start_wave', description: 'Begin the next enemy wave' },
          ],
        },
      }),
    },
  },
} as const;

export default controllerOpts;
