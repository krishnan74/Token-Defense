import { init } from '@dojoengine/sdk';
import { createContext, useContext } from 'react';

type DojoSDK = Awaited<ReturnType<typeof init>>;

export const DojoContext = createContext<DojoSDK | null>(null);

/** Returns the shared Dojo SDK. Must be called inside a DojoContext.Provider. */
export function useDojoSDK(): DojoSDK {
  const sdk = useContext(DojoContext);
  if (!sdk) throw new Error('useDojoSDK must be called inside a DojoContext.Provider');
  return sdk;
}
