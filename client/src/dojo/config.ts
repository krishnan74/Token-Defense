export const TORII_URL: string = import.meta.env.VITE_TORII_URL ?? 'https://api.cartridge.gg/x/token-defense/torii';
export const RPC_URL: string =
  import.meta.env.VITE_RPC_URL ?? 'https://api.cartridge.gg/x/starknet/sepolia';
export const CHAIN_ID: string =
  import.meta.env.VITE_CHAIN_ID ?? '0x534e5f5345504f4c4941'; // SN_SEPOLIA

export const DOMAIN = {
  name: 'token-defense',
  version: '1.0',
  chainId: 'SN_SEPOLIA',
  revision: '1',
} as const;

export const IS_E2E: boolean = import.meta.env.VITE_E2E_TEST === 'true';
