import { init } from '@dojoengine/sdk';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import type { ControllerConnector } from '@cartridge/connector';
import App from './App';
import './App.css';
import { DOMAIN, IS_E2E, TORII_URL } from './dojo/config';
import { DojoContext } from './dojo/DojoContext';
import StarknetProvider from './starknet';

import manifest from '../../contracts/manifest_sepolia.json' with { type: 'json' };

function Root() {
  const { account, address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !connectors[0]) return;
    (connectors[0] as unknown as ControllerConnector).username?.()?.then((u: string | undefined) => {
      if (u) setUsername(u);
    });
  }, [address, connectors]);

  useEffect(() => {
    if (!address) setUsername(null);
  }, [address]);

  const displayName =
    username ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null);

  return (
    <div style={{ fontFamily: 'monospace' }}>
      <div className="connect-bar">
        <span className="connect-title">TOKEN DEFENSE</span>
        {account ? (
          <div className="connect-user">
            <span className="connect-username">{displayName}</span>
            <button className="disconnect-btn" onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        ) : (
          <button
            className="connect-btn"
            onClick={() => connect({ connector: connectors[0] })}
          >
            Connect Controller
          </button>
        )}
      </div>
      <App account={account ?? null} manifest={manifest} />
    </div>
  );
}

async function main() {
  if (IS_E2E) {
    console.info('[E2E] VITE_E2E_TEST=true — predeployed account mode');
  }

  const sdk = await init({
    client: {
      worldAddress: manifest.world.address,
      toriiUrl: TORII_URL,
    },
    domain: DOMAIN,
  });

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <StarknetProvider>
        <DojoContext.Provider value={sdk}>
          <Root />
        </DojoContext.Provider>
      </StarknetProvider>
    </React.StrictMode>,
  );
}

main();
