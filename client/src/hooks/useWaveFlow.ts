import { useEffect, useRef, useState } from 'react';
import { BASE_MAX_HP, WAVE_COMPOSITIONS, getDifficultyBaseHp } from '../constants';
import { decodeWaveResolvedEvent } from '../dojo/contracts';
import type { ContractAddresses } from '../dojo/models';
import type { GameState } from '../dojo/models';
import type { useActions } from './useActions';
import type { useSFX } from './useSFX';
import type { PendingReplay } from '../types';

interface WaveFlowOptions {
  gameState: GameState | null;
  actions: ReturnType<typeof useActions>;
  provider: { getTransactionReceipt: (h: string) => Promise<unknown> };
  addresses: ContractAddresses;
  clientBaseHealthRef: React.MutableRefObject<number>;
  displayGold: number;
  allTowers: unknown[];
  allFactories: unknown[];
  sfx: ReturnType<typeof useSFX>;
  refreshGameState: () => Promise<void>;
  onReplayReady: (params: PendingReplay) => void;
}

export function useWaveFlow({
  gameState, actions, provider, addresses,
  clientBaseHealthRef, displayGold,
  allTowers, allFactories, sfx, refreshGameState, onReplayReady,
}: WaveFlowOptions) {
  const [isWaitingWaveActive, setIsWaitingWaveActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const preWaveStateRef    = useRef<GameState | null>(null);
  const waveTxHashRef      = useRef<string | null>(null);
  const countdownTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preWaveBaseHealthRef = useRef<number>(0);

  // Wave confirmation: wave_number++ detected → fetch receipt → countdown → replay
  useEffect(() => {
    if (!isWaitingWaveActive || !gameState) return;
    const pre = preWaveStateRef.current;
    if (!pre) return;
    const completedWave = Number(gameState.wave_number);
    if (completedWave <= Number(pre.wave_number)) return;

    // fetchCancelled guards only the async receipt fetch — not the countdown.
    let fetchCancelled = false;

    const run = async () => {
      let enemyOutcomes  = 0;
      let baseDamageTaken = 0;
      let goldEarned = Math.max(0, (gameState.gold ?? 0) - (pre.gold ?? 0));

      const txHash = waveTxHashRef.current;
      if (txHash) {
        try {
          const receipt = await provider.getTransactionReceipt(txHash);
          const evt = decodeWaveResolvedEvent(
            (receipt as { events?: unknown[] }).events ?? [],
            addresses.wave,
          );
          if (evt) {
            enemyOutcomes               = evt.enemy_outcomes;
            baseDamageTaken             = evt.base_damage;
            goldEarned                  = Math.max(0, evt.new_gold - (pre.gold ?? 0));
            clientBaseHealthRef.current = evt.new_base_health;
          } else {
            baseDamageTaken = Math.max(0, (pre.base_health ?? BASE_MAX_HP) - (gameState.base_health ?? BASE_MAX_HP));
            clientBaseHealthRef.current = Math.max(0, clientBaseHealthRef.current - baseDamageTaken);
          }
        } catch (e) {
          console.warn('Receipt fetch failed, using chain diff:', e);
          baseDamageTaken = Math.max(0, (pre.base_health ?? BASE_MAX_HP) - (gameState.base_health ?? BASE_MAX_HP));
          clientBaseHealthRef.current = Math.max(0, clientBaseHealthRef.current - baseDamageTaken);
        }
      }

      if (fetchCancelled) return;

      // Decode per-type kill booleans from bitmask
      const composition = WAVE_COMPOSITIONS[completedWave] ?? [];
      let bit = 0;
      let killedTJ = true, killedCO = true, killedHS = true, killedBoss = true;
      let killCount = 0;
      for (const g of composition) {
        for (let i = 0; i < g.count; i++) {
          const killed = !!((enemyOutcomes >>> bit) & 1);
          if (killed) killCount++;
          else {
            if (g.type === 'TextJailbreak')   killedTJ   = false;
            if (g.type === 'ContextOverflow') killedCO   = false;
            if (g.type === 'HalluSwarm')      killedHS   = false;
            if (g.type === 'Boss')            killedBoss = false;
          }
          bit++;
        }
      }
      if (!composition.some((g) => g.type === 'TextJailbreak'))   killedTJ   = true;
      if (!composition.some((g) => g.type === 'ContextOverflow')) killedCO   = true;
      if (!composition.some((g) => g.type === 'HalluSwarm'))      killedHS   = true;
      if (!composition.some((g) => g.type === 'Boss'))            killedBoss = true;

      const baseHealthRemaining = clientBaseHealthRef.current;
      const baseMaxHp = getDifficultyBaseHp(pre.difficulty ?? 1);

      const pendingReplay: PendingReplay = {
        towers: allTowers,
        factories: allFactories,
        preState: { ...pre },
        waveNumber: completedWave,
        enemyOutcomes,
        baseDamageTaken,
        resultSummary: {
          waveNumber: completedWave, goldEarned, baseDamage: baseDamageTaken,
          baseHealthRemaining, baseMaxHp, killedTJ, killedCO, killedHS, killedBoss, killCount,
        },
      };

      waveTxHashRef.current   = null;
      preWaveStateRef.current = null;
      setIsWaitingWaveActive(false);

      // Countdown — runs uninterrupted even after re-renders triggered by the state update above
      let remaining = 3;
      setCountdown(remaining);
      sfx.playCountdown();
      const advance = () => {
        remaining--;
        if (remaining > 0) {
          setCountdown(remaining);
          sfx.playCountdown();
          countdownTimerRef.current = setTimeout(advance, 800);
        } else {
          setCountdown(null);
          sfx.playWaveStart();
          onReplayReady(pendingReplay);
        }
      };
      countdownTimerRef.current = setTimeout(advance, 800);
    };

    run();
    return () => { fetchCancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.wave_number, isWaitingWaveActive]);

  // Polling fallback while waiting for chain confirmation
  useEffect(() => {
    if (!isWaitingWaveActive) return;
    const id = setInterval(() => refreshGameState(), 2000);
    return () => clearInterval(id);
  }, [isWaitingWaveActive, refreshGameState]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, []);

  function handleStartWave(isBusy: boolean, currentDisplayGold: number) {
    if (!gameState || isBusy) return;
    preWaveStateRef.current = { ...gameState, gold: currentDisplayGold } as GameState;
    preWaveBaseHealthRef.current  = clientBaseHealthRef.current;
    setIsWaitingWaveActive(true);
    sfx.playClick();
    actions.startWave()
      .then((tx) => {
        waveTxHashRef.current = (tx as { transaction_hash?: string }).transaction_hash ?? null;
      })
      .catch((e: unknown) => {
        console.error('startWave failed:', e);
        setIsWaitingWaveActive(false);
        preWaveStateRef.current  = null;
        waveTxHashRef.current    = null;
      });
  }

  return {
    isWaitingWaveActive,
    countdown,
    preWaveBaseHealthRef, // read in App for displayBaseHealth
    handleStartWave,
  };
}
