import { useRef, useState } from 'react';
import { WAVE_COMPOSITIONS } from '../constants';
import { WaveReplay } from '../simulation/WaveReplay';
import type { WaveSnapshot } from '../simulation/WaveSimulator';
import type { GameOver, GameStats, PendingReplay, WaveResultSummary } from '../types';
import type { useAchievements } from './useAchievements';
import type { useSFX } from './useSFX';

interface ReplayOptions {
  sfx: ReturnType<typeof useSFX>;
  unlock: ReturnType<typeof useAchievements>['unlock'];
  onWaveResult: (result: WaveResultSummary) => void;
  onGameOver: (go: GameOver) => void;
  onStatsUpdate: (updater: (prev: GameStats) => GameStats) => void;
}

export function useReplay({ sfx, unlock, onWaveResult, onGameOver, onStatsUpdate }: ReplayOptions) {
  const [isReplaying,  setIsReplaying]  = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<WaveSnapshot | null>(null);
  const [replaySpeed,  setReplaySpeed]  = useState(1);

  const rafRef          = useRef<number | null>(null);
  const replaySpeedRef  = useRef(1);
  const simRef          = useRef<InstanceType<typeof WaveReplay> | null>(null);
  const lastTimeRef     = useRef(0);
  const pendingRef      = useRef<PendingReplay | null>(null);

  function startReplay(params: PendingReplay) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    replaySpeedRef.current = 1;
    setReplaySpeed(1);
    pendingRef.current = params;
    simRef.current = new WaveReplay({
      towers:          params.towers,
      factories:       params.factories,
      gameState:       params.preState,
      waveNumber:      params.waveNumber,
      enemyOutcomes:   params.enemyOutcomes,
      baseDamageTaken: params.baseDamageTaken,
    });
    lastTimeRef.current = performance.now();
    setIsReplaying(true);

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05) * replaySpeedRef.current;
      lastTimeRef.current = now;
      if (!simRef.current) return;
      const snap = simRef.current.step(dt);
      setLiveSnapshot({ ...snap } as WaveSnapshot);
      if (!snap.done) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setLiveSnapshot(null);
        setIsReplaying(false);
        const p = pendingRef.current;
        pendingRef.current = null;
        if (p) _onReplayDone(p.resultSummary, p.waveNumber);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function _onReplayDone(result: WaveResultSummary, waveNumber: number) {
    unlock('first_wave');
    if (waveNumber >= 5)  unlock('wave_5');
    if (waveNumber >= 10) unlock('wave_10');
    if (result.baseDamage === 0) unlock('untouched');
    const comp = WAVE_COMPOSITIONS[waveNumber] ?? [];
    const has  = (t: string) => comp.some((g) => g.type === t);
    if (
      (!has('TextJailbreak')   || result.killedTJ) &&
      (!has('ContextOverflow') || result.killedCO) &&
      (!has('HalluSwarm')      || result.killedHS) &&
      (!has('Boss')            || result.killedBoss)
    ) unlock('clean_sweep');

    onStatsUpdate((prev) => ({
      totalKills:      prev.totalKills      + result.killCount,
      totalGoldEarned: prev.totalGoldEarned + result.goldEarned,
      totalBaseDamage: prev.totalBaseDamage + result.baseDamage,
      wavesCompleted:  prev.wavesCompleted  + 1,
    }));

    sfx.playWaveComplete();

    if (result.baseHealthRemaining <= 0) {
      sfx.playDefeat();
      onGameOver({ victory: false, waveNumber, baseHealthRemaining: 0 });
    } else if (waveNumber >= 10) {
      sfx.playVictory();
      onGameOver({ victory: true, waveNumber, baseHealthRemaining: result.baseHealthRemaining });
    } else {
      onWaveResult(result);
    }
  }

  function stopReplay() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    simRef.current = null;
    setLiveSnapshot(null);
    setIsReplaying(false);
    pendingRef.current = null;
  }

  function toggleReplaySpeed() {
    const next = replaySpeedRef.current === 1 ? 2 : 1;
    replaySpeedRef.current = next;
    setReplaySpeed(next);
  }

  return {
    isReplaying,
    liveSnapshot,
    replaySpeed,
    pendingRef,
    startReplay,
    stopReplay,
    toggleReplaySpeed,
  };
}
