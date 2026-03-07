import { useCallback, useEffect, useRef, useState } from 'react';
import { KeysClause, ToriiQueryBuilder } from '@dojoengine/sdk';
import type { AccountInterface } from 'starknet';
import { useDojoSDK } from '../dojo/DojoContext';
import type { Factory, GameState, Tower } from '../dojo/models';

export function useGameState(account: AccountInterface | null | undefined): {
  gameState: GameState | null;
  towers: Tower[];
  factories: Factory[];
  refreshGameState: () => Promise<void>;
} {
  const sdk = useDojoSDK();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const accountRef = useRef(account);
  accountRef.current = account;

  const handleEntities = useCallback((entities: unknown[]) => {
    const newTowers: Tower[] = [];
    const newFactories: Factory[] = [];

    for (const entity of entities as Array<{ models?: { di?: { GameState?: GameState; Tower?: Tower; Factory?: Factory } } }>) {
      const models = entity.models?.di;
      if (!models) continue;

      if (models.GameState) {
        console.log('[Torii] GameState update:', models.GameState);
        setGameState(models.GameState);
      }
      if (models.Tower) newTowers.push(models.Tower);
      if (models.Factory) newFactories.push(models.Factory);
    }

    if (newTowers.length) setTowers((prev) => mergeById(prev, newTowers, 'tower_id'));
    if (newFactories.length) setFactories((prev) => mergeById(prev, newFactories, 'factory_id'));
  }, []);

  useEffect(() => {
    if (!account || !sdk) return;

    let subscription: { cancel: () => void } | null = null;

    async function subscribe() {
      const [initialEntities, sub] = await sdk.subscribeEntityQuery({
        query: new ToriiQueryBuilder().withClause(
          KeysClause(
            ['di-GameState', 'di-Tower', 'di-Factory'],
            [account.address],
            'VariableLen',
          ).build(),
        ),
        callback: ({ data, error }: { data?: unknown[]; error?: unknown }) => {
          console.log('[Torii] subscription callback — data:', data, 'error:', error);
          if (data) handleEntities(data);
          if (error) console.error('[Torii] subscription error:', error);
        },
      });

      if (initialEntities?.length) handleEntities(initialEntities as unknown[]);
      subscription = sub as { cancel: () => void };
    }

    subscribe().catch(console.error);

    return () => {
      subscription?.cancel();
    };
  }, [account, sdk, handleEntities]);

  const refreshGameState = useCallback(async () => {
    const acct = accountRef.current;
    if (!acct || !sdk) return;
    try {
      const result = await sdk.getEntities({
        query: new ToriiQueryBuilder().withClause(
          KeysClause(
            ['di-GameState', 'di-Tower', 'di-Factory'],
            [acct.address],
            'VariableLen',
          ).build(),
        ),
      });
      console.log('[Torii] poll result:', result);
      if (result?.items?.length) handleEntities(result.items as unknown[]);
    } catch (e) {
      console.error('[Torii] poll error:', e);
    }
  }, [sdk, handleEntities]);

  return { gameState, towers, factories, refreshGameState };
}

function mergeById<T extends Record<string, unknown>>(
  prev: T[],
  incoming: T[],
  idKey: keyof T,
): T[] {
  const map = new Map(prev.map((x) => [x[idKey], x]));
  for (const item of incoming) map.set(item[idKey], item);
  return Array.from(map.values());
}
