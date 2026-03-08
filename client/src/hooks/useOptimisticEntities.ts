import { useEffect, useRef, useState } from 'react';
import { FACTORIES } from '../constants';
import type { GameState, Tower, Factory } from '../dojo/models';

interface UpgradeOptimistic {
  counts: Record<string, number>;
  gold: number;
}

export function useOptimisticEntities(
  towers: Tower[],
  factories: Factory[],
  gameState: GameState | null,
) {
  const [optimisticTowers,    setOptimisticTowers]    = useState<unknown[]>([]);
  const [optimisticFactories, setOptimisticFactories] = useState<unknown[]>([]);
  const [optimisticGoldSpent, setOptimisticGoldSpent] = useState(0);
  const [upgradeOptimistic,   setUpgradeOptimistic]   = useState<UpgradeOptimistic>({ counts: {}, gold: 0 });

  // Clear optimistic towers once Torii confirms them
  useEffect(() => {
    if (!optimisticTowers.length) return;
    setOptimisticTowers((prev) =>
      (prev as Array<{ tower_type: number; x: number; y: number }>).filter(
        (opt) =>
          !(towers as Array<{ tower_type: number; x: number; y: number }>).some(
            (t) =>
              Number(t.tower_type) === Number(opt.tower_type) &&
              Number(t.x) === Number(opt.x) &&
              Number(t.y) === Number(opt.y),
          ),
      ),
    );
  }, [towers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear optimistic factories once Torii confirms them
  useEffect(() => {
    if (!optimisticFactories.length) return;
    setOptimisticFactories((prev) => {
      const typed     = prev as Array<{ factory_type: number; x: number; y: number }>;
      const typedFact = factories as Array<{ factory_type: number; x: number; y: number }>;
      const unconfirmed = typed.filter(
        (opt) =>
          !typedFact.some(
            (f) =>
              Number(f.factory_type) === Number(opt.factory_type) &&
              Number(f.x) === Number(opt.x) &&
              Number(f.y) === Number(opt.y),
          ),
      );
      setOptimisticGoldSpent(
        unconfirmed.reduce((sum, opt) => sum + FACTORIES[opt.factory_type].cost, 0),
      );
      return unconfirmed;
    });
  }, [factories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drain upgrade optimistic as Torii confirms level-ups
  const prevFactoriesRef = useRef<unknown[]>([]);
  useEffect(() => {
    const prev = prevFactoriesRef.current as Array<{ factory_id: string | number; level: number }>;
    prevFactoriesRef.current = factories;
    const confirmedLevels: Record<string, number> = {};
    for (const f of factories as Array<{ factory_id: string | number; level: number }>) {
      const key = String(f.factory_id);
      const prevF = prev.find((p) => String(p.factory_id) === key);
      if (!prevF) continue;
      const gain = Number(f.level) - Number(prevF.level);
      if (gain > 0) confirmedLevels[key] = gain;
    }
    if (!Object.keys(confirmedLevels).length) return;
    setUpgradeOptimistic((prev) => {
      const counts = { ...prev.counts };
      let goldReduction = 0;
      for (const [key, gain] of Object.entries(confirmedLevels)) {
        const pending = counts[key] ?? 0;
        if (!pending) continue;
        const cleared = Math.min(gain, pending);
        goldReduction += cleared * 50;
        counts[key] = pending - cleared;
        if (counts[key] <= 0) delete counts[key];
      }
      return { counts, gold: Math.max(0, prev.gold - goldReduction) };
    });
  }, [factories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed: merge Torii entities with optimistic overlays
  const maxTowerId   = gameState?.next_tower_id   ?? Infinity;
  const maxFactoryId = gameState?.next_factory_id ?? Infinity;
  const currentTowers    = towers.filter(   (t) => Number((t as { tower_id:   number }).tower_id)   < maxTowerId);
  const currentFactories = factories.filter((f) => Number((f as { factory_id: number }).factory_id) < maxFactoryId);

  const allTowers = [...currentTowers, ...optimisticTowers];
  const allFactories = [...currentFactories, ...optimisticFactories].map((f) => {
    const typed = f as { factory_id: string | number; level: number };
    return { ...typed, level: Number(typed.level) + (upgradeOptimistic.counts[String(typed.factory_id)] ?? 0) };
  });

  return {
    allTowers,
    allFactories,
    optimisticGoldSpent,
    upgradeOptimistic,
    setOptimisticTowers,
    setOptimisticFactories,
    setOptimisticGoldSpent,
    setUpgradeOptimistic,
  };
}
