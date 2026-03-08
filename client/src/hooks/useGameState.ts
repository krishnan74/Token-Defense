import { useCallback, useEffect, useRef, useState } from 'react';
import { KeysClause, ToriiQueryBuilder } from '@dojoengine/sdk';
import { useDojoSDK } from '../dojo/DojoContext';
import type { Factory, GameState, Tower } from '../dojo/models';

/**
 * Subscribes to Torii for all game entities belonging to the given token_id.
 * After EGS rekeying, models are keyed by token_id (felt252), not player address.
 * For single-session-per-wallet mode, token_id == player address.
 */
export function useGameState(tokenId: string | null): {
  gameState: GameState | null;
  towers: Tower[];
  factories: Factory[];
  refreshGameState: () => Promise<void>;
} {
  const sdk = useDojoSDK();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const tokenIdRef = useRef(tokenId);
  tokenIdRef.current = tokenId;

  const handleEntities = useCallback((entities: unknown[]) => {
    const newTowers: Tower[] = [];
    const newFactories: Factory[] = [];

    for (const entity of entities as Array<{ models?: { td?: { GameState?: GameState; Tower?: Tower; Factory?: Factory } } }>) {
      const models = entity.models?.td;
      if (!models) continue;

      if (models.GameState) {
        console.log('[Torii] GameState update:', models.GameState);
        setGameState(models.GameState);
      }
      if (models.Tower) newTowers.push(models.Tower);
      if (models.Factory) newFactories.push(models.Factory);
    }

    if (newTowers.length) setTowers((prev) => mergeById(prev, newTowers, 'tower_id') as Tower[]);
    if (newFactories.length) setFactories((prev) => mergeById(prev, newFactories, 'factory_id') as Factory[]);
  }, []);

  useEffect(() => {
    if (!tokenId || !sdk) return;

    let subscription: { cancel: () => void } | null = null;

    async function subscribe() {
      const [initialEntities, sub] = await sdk.subscribeEntityQuery({
        query: new ToriiQueryBuilder().withClause(
          KeysClause(
            ['td-GameState', 'td-Tower', 'td-Factory'],
            [tokenId],
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
  }, [tokenId, sdk, handleEntities]);

  const refreshGameState = useCallback(async () => {
    const tid = tokenIdRef.current;
    if (!tid || !sdk) return;
    try {
      const result = await sdk.getEntities({
        query: new ToriiQueryBuilder().withClause(
          KeysClause(
            ['td-GameState', 'td-Tower', 'td-Factory'],
            [tid],
            'VariableLen',
          ).build(),
        ),
      });
      console.log('[Torii] poll result:', result);
      const items = (result as unknown as { items?: unknown[] })?.items;
      if (items?.length) handleEntities(items);
    } catch (e) {
      console.error('[Torii] poll error:', e);
    }
  }, [sdk, handleEntities]);

  return { gameState, towers, factories, refreshGameState };
}

function mergeById<T>(prev: T[], incoming: T[], idKey: keyof T): unknown[] {
  const map = new Map(prev.map((x) => [x[idKey], x]));
  for (const item of incoming) map.set(item[idKey], item);
  return Array.from(map.values());
}
