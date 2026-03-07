import { ControllerConnector } from '@cartridge/connector';
import { sepolia } from '@starknet-react/chains';
import { cartridge, jsonRpcProvider, StarknetConfig } from '@starknet-react/core';
import type { Connector } from '@starknet-react/core';
import type { PropsWithChildren } from 'react';
import controllerOpts from './controller';
import { RPC_URL } from './dojo/config';

const connector = new ControllerConnector(controllerOpts);

const provider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: RPC_URL }),
});

type StarknetProviderProps = PropsWithChildren<{
  connectors?: Connector[];
}>;

export default function StarknetProvider({ children, connectors: externalConnectors }: StarknetProviderProps) {
  return (
    <StarknetConfig
      chains={[sepolia]}
      provider={provider}
      connectors={externalConnectors ?? [connector]}
      explorer={cartridge}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
