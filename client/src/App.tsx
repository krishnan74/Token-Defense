import { useEffect, useRef, useState } from 'react';
import type { AccountInterface } from 'starknet';
import { useProvider } from '@starknet-react/core';
import BuildMenu from './components/BuildMenu';
import GameBoard from './components/GameBoard';
import ResourceBar from './components/ResourceBar';
import TowerStatus from './components/TowerStatus';
import WavePanel from './components/WavePanel';
import {
  BASE_MAX_HP, BASE_X, BASE_Y,
  CONVEYOR_COLORS, DIFFICULTY_SETTINGS, FACTORIES,
  OVERCLOCK_COST, TOWERS, TOWER_UPGRADE_COST, WAVE_COMPOSITIONS,
  computeConveyorTiles, getDifficultyBaseHp, isPathTile,
} from './constants';
import type { ConveyorTile } from './constants';
import type { ManifestContract } from './dojo/models';
import { buildContractAddresses, decodeWaveResolvedEvent } from './dojo/contracts';
import { useActions } from './hooks/useActions';
import { useAchievements } from './hooks/useAchievements';
import type { Achievement } from './hooks/useAchievements';
import { useGameState } from './hooks/useGameState';
import { useSFX } from './hooks/useSFX';
import type { WaveSnapshot } from './simulation/WaveSimulator';
import { WaveReplay } from './simulation/WaveReplay';

interface AppProps {
  account: AccountInterface | null;
  manifest: { contracts: ManifestContract[] } | null;
}

export interface BuildSelection {
  type: 'tower' | 'factory';
  id: number;
}

interface UpgradeOptimistic {
  counts: Record<string, number>;
  gold: number;
}

interface WaveResultSummary {
  waveNumber: number;
  goldEarned: number;
  baseDamage: number;
  baseHealthRemaining: number;
  baseMaxHp: number;
  killedTJ: boolean;
  killedCO: boolean;
  killedHS: boolean;
  killedBoss: boolean;
  killCount: number;
}

interface GameOver {
  victory: boolean;
  waveNumber: number;
  baseHealthRemaining: number;
}

interface GameStats {
  totalKills: number;
  totalGoldEarned: number;
  totalBaseDamage: number;
  wavesCompleted: number;
}

export interface Conveyor {
  id: string;
  factoryId: string | number;
  towerId:   string | number;
  fx: number; fy: number;
  tx: number; ty: number;
  tiles: ConveyorTile[];
  revealedCount: number;
  color: string;
  tokenCount: number;
}

// Replay params captured when chain confirms wave completion
interface PendingReplay {
  towers: unknown[];
  factories: unknown[];
  preState: NonNullable<ReturnType<typeof useGameState>['gameState']>;
  waveNumber: number;
  killedTJ: boolean;
  killedCO: boolean;
  killedHS: boolean;
  killedBoss: boolean;
  baseDamageTaken: number;
  resultSummary: WaveResultSummary;
}

const EMPTY_STATS: GameStats = { totalKills: 0, totalGoldEarned: 0, totalBaseDamage: 0, wavesCompleted: 0 };

export default function App({ account, manifest }: AppProps) {
  const { gameState, towers, factories, refreshGameState } = useGameState(account);
  const actions = useActions(account, manifest);
  const { provider } = useProvider();
  const sfx = useSFX();
  const { unlock, toasts: achievementToasts } = useAchievements();
  const addresses = buildContractAddresses(manifest?.contracts ?? []);

  const [selectedBuild, setSelectedBuild] = useState<BuildSelection | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // isWaitingWaveActive: startWave tx sent, waiting for wave_number to increment
  const [isWaitingWaveActive, setIsWaitingWaveActive] = useState(false);
  const [waveResult, setWaveResult] = useState<WaveResultSummary | null>(null);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const [gameStats, setGameStats] = useState<GameStats>(EMPTY_STATS);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const replaySpeedRef = useRef(1);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [conveyors, setConveyors] = useState<Conveyor[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number>(1); // 0=Easy,1=Normal,2=Hard
  const [overclockPending, setOverclockPending] = useState(false);

  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<WaveSnapshot | null>(null);
  const simRef = useRef<InstanceType<typeof WaveReplay> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Pre-wave snapshot (captured at click time, before the tx)
  const preWaveStateRef = useRef<typeof gameState>(null);
  // Pre-wave base health — held until replay ends so sidebar doesn't jump during countdown
  const preWaveBaseHealthRef = useRef<number>(BASE_MAX_HP);
  // Client-side base health — updated from on-chain event after each wave
  const clientBaseHealthRef = useRef<number>(BASE_MAX_HP);
  const [clientBaseHealthDisplay, setClientBaseHealthDisplay] = useState<number>(BASE_MAX_HP);
  const clientBaseHealthInitRef = useRef(false);
  // tx hash from startWave — used to fetch receipt and decode WaveResolved event
  const waveTxHashRef = useRef<string | null>(null);
  // Replay params + result, computed when chain confirms
  const pendingReplayRef = useRef<PendingReplay | null>(null);

  // SFX tracking during replay
  const sfxPrevRef = useRef({ particles: 0, shakes: 0 });
  const sfxFireCooldownRef = useRef(0);

  // Optimistic UI
  const [optimisticTowers, setOptimisticTowers] = useState<unknown[]>([]);
  const [optimisticFactories, setOptimisticFactories] = useState<unknown[]>([]);
  const [optimisticGoldSpent, setOptimisticGoldSpent] = useState(0);
  const [upgradeOptimistic, setUpgradeOptimistic] = useState<UpgradeOptimistic>({ counts: {}, gold: 0 });

  // ── Sync client base health from chain on first load (or new game) ────────
  useEffect(() => {
    if (gameState && !clientBaseHealthInitRef.current) {
      clientBaseHealthInitRef.current = true;
      clientBaseHealthRef.current = gameState.base_health ?? BASE_MAX_HP;
      setClientBaseHealthDisplay(clientBaseHealthRef.current);
    }
  }, [gameState]);

  // ── Sound effects during wave replay ──────────────────────────────────────
  useEffect(() => {
    if (!liveSnapshot) {
      sfxPrevRef.current = { particles: 0, shakes: 0 };
      return;
    }
    const prev = sfxPrevRef.current;
    const nowParticles = liveSnapshot.particles?.length ?? 0;
    const nowShakes    = liveSnapshot.screenShakePulse ?? 0;

    if (nowParticles > prev.particles) sfx.playEnemyDeath();
    if (nowShakes    > prev.shakes)    sfx.playBaseHit();

    if ((liveSnapshot.projectiles?.length ?? 0) > 0) {
      const now = Date.now();
      if (now - sfxFireCooldownRef.current > 280) {
        sfx.playTowerFire();
        sfxFireCooldownRef.current = now;
      }
    }
    sfxPrevRef.current = { particles: nowParticles, shakes: nowShakes };
  }, [liveSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear optimistic towers once Torii confirms ────────────────────────────
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
  }, [towers]);

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
  }, [factories]);

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
  }, [factories]);

  // ── Wave confirmation: wave_number++ detected → fetch receipt → countdown ──
  // start_wave() resolves the wave on-chain and emits WaveResolved event with
  // exact per-enemy outcomes.  We detect finality via Torii (wave_number++),
  // fetch the receipt to decode the bitmask, then countdown → replay.
  useEffect(() => {
    if (!isWaitingWaveActive || !gameState) return;
    const pre = preWaveStateRef.current;
    if (!pre) return;
    const completedWave = Number(gameState.wave_number);
    if (completedWave <= Number(pre.wave_number)) return; // not confirmed yet

    // fetchCancelled only guards the async receipt fetch (component unmount / stale effect).
    // It does NOT cancel the countdown — advance() must run uninterrupted.
    let fetchCancelled = false;

    const run = async () => {
      // Fetch receipt and decode WaveResolved for exact per-enemy outcome data.
      let enemyOutcomes = 0;
      let baseDamageTaken = 0;
      let goldEarned = Math.max(0, (gameState.gold ?? 0) - (pre.gold ?? 0));

      const txHash = waveTxHashRef.current;
      if (txHash) {
        try {
          const receipt = await (provider as { getTransactionReceipt: (h: string) => Promise<unknown> })
            .getTransactionReceipt(txHash);
          const evt = decodeWaveResolvedEvent(
            (receipt as { events?: unknown[] }).events ?? [],
            addresses.wave,
          );
          if (evt) {
            enemyOutcomes        = evt.enemy_outcomes;
            baseDamageTaken      = evt.base_damage;
            goldEarned           = Math.max(0, evt.new_gold - (pre.gold ?? 0));
            clientBaseHealthRef.current = evt.new_base_health;
          } else {
            // Fallback: chain diff (reliable since contract always updates base_health)
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
      setClientBaseHealthDisplay(clientBaseHealthRef.current);

      // Decode per-type kill booleans from bitmask for result card display.
      const composition = WAVE_COMPOSITIONS[completedWave] ?? [];
      let bit = 0;
      let killedTJ = true, killedCO = true, killedHS = true, killedBoss = true;
      let killCount = 0;
      for (const g of composition) {
        for (let i = 0; i < g.count; i++) {
          const killed = !!((enemyOutcomes >>> bit) & 1);
          if (killed) { killCount++; }
          else {
            if (g.type === 'TextJailbreak')   killedTJ = false;
            if (g.type === 'ContextOverflow') killedCO = false;
            if (g.type === 'HalluSwarm')      killedHS = false;
            if (g.type === 'Boss')            killedBoss = false;
          }
          bit++;
        }
      }
      if (!composition.some((g) => g.type === 'TextJailbreak'))   killedTJ = true;
      if (!composition.some((g) => g.type === 'ContextOverflow')) killedCO = true;
      if (!composition.some((g) => g.type === 'HalluSwarm'))      killedHS = true;
      if (!composition.some((g) => g.type === 'Boss'))            killedBoss = true;

      const baseHealthRemaining = clientBaseHealthRef.current;
      const baseMaxHp = getDifficultyBaseHp(pre.difficulty ?? 1);

      pendingReplayRef.current = {
        towers: allTowers,
        factories: allFactories,
        preState: { ...pre } as NonNullable<typeof gameState>,
        waveNumber: completedWave,
        killedTJ, killedCO, killedHS, killedBoss,
        baseDamageTaken,
        resultSummary: {
          waveNumber: completedWave, goldEarned, baseDamage: baseDamageTaken,
          baseHealthRemaining, baseMaxHp, killedTJ, killedCO, killedHS, killedBoss, killCount,
        },
      };

      waveTxHashRef.current = null;
      preWaveStateRef.current = null;
      setIsWaitingWaveActive(false);

      // Countdown — not guarded by fetchCancelled; must run to completion
      // even after setIsWaitingWaveActive(false) triggers a re-render/cleanup.
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
          const p = pendingReplayRef.current;
          if (p) {
            startReplay(p.towers, p.factories, p.preState, p.waveNumber,
                        enemyOutcomes, p.baseDamageTaken);
          }
        }
      };
      countdownTimerRef.current = setTimeout(advance, 800);
    };

    run();
    return () => { fetchCancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.wave_number, isWaitingWaveActive]);

  // Polling fallback while waiting for chain
  useEffect(() => {
    if (!isWaitingWaveActive) return;
    const id = setInterval(() => refreshGameState(), 2000);
    return () => clearInterval(id);
  }, [isWaitingWaveActive, refreshGameState]);

  // Auto-dismiss result card
  useEffect(() => {
    if (!waveResult) return;
    const t = setTimeout(() => setWaveResult(null), 7000);
    return () => clearTimeout(t);
  }, [waveResult]);

  // Clear loader once Torii delivers the new game state
  useEffect(() => {
    if (gameState && isStartingGame) setIsStartingGame(false);
  }, [gameState, isStartingGame]);

  // Sync overclockPending: once chain confirms overclock_used=true, clear pending flag
  useEffect(() => {
    if (gameState?.overclock_used && overclockPending) setOverclockPending(false);
  }, [gameState?.overclock_used, overclockPending]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Entity filtering ────────────────────────────────────────────────────────
  const maxTowerId   = gameState?.next_tower_id   ?? Infinity;
  const maxFactoryId = gameState?.next_factory_id ?? Infinity;
  const currentTowers    = towers.filter(   (t) => Number((t as { tower_id:   number }).tower_id)   < maxTowerId);
  const currentFactories = factories.filter((f) => Number((f as { factory_id: number }).factory_id) < maxFactoryId);

  const allTowers = [...currentTowers, ...optimisticTowers];
  const allFactories = [...currentFactories, ...optimisticFactories].map((f) => {
    const typed = f as { factory_id: string | number; level: number };
    return { ...typed, level: Number(typed.level) + (upgradeOptimistic.counts[String(typed.factory_id)] ?? 0) };
  });

  const displayGold = (gameState?.gold ?? 0) - optimisticGoldSpent - upgradeOptimistic.gold - (overclockPending ? OVERCLOCK_COST : 0);

  // Base health display:
  // - During waiting/countdown: show pre-wave value (chain already has new value, but replay hasn't played yet)
  // - During replay: follow the live animated value from WaveReplay
  // - Otherwise: show on-chain value
  const displayBaseHealth = isReplaying
    ? (liveSnapshot?.baseHealth ?? preWaveBaseHealthRef.current)
    : (isWaitingWaveActive || countdown !== null)
      ? preWaveBaseHealthRef.current
      : clientBaseHealthDisplay;

  // ── Achievement checks ─────────────────────────────────────────────────────
  useEffect(() => {
    if (allTowers.length >= 3)    unlock('tower_3');
    if (allFactories.length >= 2) unlock('factory_2');
    const upgraded = (allFactories as Array<{ level: number }>).some((f) => Number(f.level) >= 2);
    if (upgraded) unlock('upgraded');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTowers.length, allFactories.length]);

  // ── Replay ─────────────────────────────────────────────────────────────────
  function startReplay(
    replayTowers: unknown[], replayFactories: unknown[],
    preState: typeof gameState, waveNumber: number,
    enemyOutcomes: number, baseDamageTaken: number,
  ) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    replaySpeedRef.current = 1;
    setReplaySpeed(1);
    simRef.current = new WaveReplay({
      towers: replayTowers, factories: replayFactories,
      gameState: preState, waveNumber, enemyOutcomes, baseDamageTaken,
    });
    lastTimeRef.current = performance.now();
    setIsReplaying(true);

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05) * replaySpeedRef.current;
      lastTimeRef.current = now;
      if (simRef.current) {
        const snap = simRef.current.step(dt);
        setLiveSnapshot({ ...snap } as WaveSnapshot);
        if (!snap.done) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          setLiveSnapshot(null);
          setIsReplaying(false);
          const pending = pendingReplayRef.current;
          pendingReplayRef.current = null;
          if (pending) {
            const result = pending.resultSummary;
            // Achievements
            unlock('first_wave');
            if (result.waveNumber >= 5)  unlock('wave_5');
            if (result.waveNumber >= 10) unlock('wave_10');
            if (result.baseDamage === 0) unlock('untouched');
            const comp = WAVE_COMPOSITIONS[result.waveNumber] ?? [];
            const has = (t: string) => comp.some((g) => g.type === t);
            if (
              (!has('TextJailbreak')   || result.killedTJ) &&
              (!has('ContextOverflow') || result.killedCO) &&
              (!has('HalluSwarm')      || result.killedHS) &&
              (!has('Boss')            || result.killedBoss)
            ) unlock('clean_sweep');

            // Cumulative stats
            setGameStats((prev) => ({
              totalKills:      prev.totalKills      + result.killCount,
              totalGoldEarned: prev.totalGoldEarned + result.goldEarned,
              totalBaseDamage: prev.totalBaseDamage + result.baseDamage,
              wavesCompleted:  prev.wavesCompleted  + 1,
            }));

            sfx.playWaveComplete();

            if (result.baseHealthRemaining <= 0) {
              sfx.playDefeat();
              setGameOver({ victory: false, waveNumber: result.waveNumber, baseHealthRemaining: 0 });
            } else if (result.waveNumber >= 10) {
              sfx.playVictory();
              setGameOver({ victory: true, waveNumber: result.waveNumber, baseHealthRemaining: result.baseHealthRemaining });
            } else {
              setWaveResult(result);
            }
          }
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopReplay() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    simRef.current = null;
    setLiveSnapshot(null);
    setIsReplaying(false);
    pendingReplayRef.current = null;
  }

  function toggleReplaySpeed() {
    const next = replaySpeedRef.current === 1 ? 2 : 1;
    replaySpeedRef.current = next;
    setReplaySpeed(next);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleStartWave() {
    if (!gameState || isWaitingWaveActive || countdown !== null || isReplaying) return;
    setWaveResult(null);
    // Snapshot the CURRENT state before the tx changes anything
    preWaveStateRef.current = { ...gameState, gold: displayGold };
    preWaveBaseHealthRef.current = clientBaseHealthRef.current;
    setIsWaitingWaveActive(true);
    sfx.playClick();
    actions.startWave()
      .then((tx) => {
        waveTxHashRef.current = (tx as { transaction_hash?: string }).transaction_hash ?? null;
      })
      .catch((e: unknown) => {
        console.error('startWave failed:', e);
        setIsWaitingWaveActive(false);
        preWaveStateRef.current = null;
        waveTxHashRef.current = null;
        stopReplay();
      });
  }

  function handleUpgrade(id: number | string) {
    sfx.playClick();
    setUpgradeOptimistic((prev) => ({
      counts: { ...prev.counts, [String(id)]: (prev.counts[String(id)] ?? 0) + 1 },
      gold: prev.gold + 50,
    }));
    actions.upgradeFactory(id as number).catch((e: unknown) => {
      console.error('upgradeFactory failed:', e);
      setUpgradeOptimistic((prev) => {
        const counts = { ...prev.counts };
        const key = String(id);
        counts[key] = Math.max(0, (counts[key] ?? 1) - 1);
        if (counts[key] === 0) delete counts[key];
        return { counts, gold: Math.max(0, prev.gold - 50) };
      });
    });
  }

  function handleUpgradeTower(id: number | string) {
    sfx.playClick();
    const tower = (allTowers as Array<{ tower_id: string | number; level: number }>)
      .find((t) => String(t.tower_id) === String(id));
    const level = Number(tower?.level) || 1;
    const cost = TOWER_UPGRADE_COST[level] ?? 9999;
    setOptimisticGoldSpent((prev) => prev + cost);
    actions.upgradeTower(id as number).catch((e: unknown) => {
      console.error('upgradeTower failed:', e);
      setOptimisticGoldSpent((prev) => Math.max(0, prev - cost));
    });
  }

  function handleActivateOverclock() {
    if (overclockPending || gameState?.overclock_used) return;
    sfx.playClick();
    setOverclockPending(true);
    actions.activateOverclock().catch((e: unknown) => {
      console.error('activateOverclock failed:', e);
      setOverclockPending(false);
    });
  }

  async function handleCellClick(col: number, row: number) {
    if (!selectedBuild || !gameState || isWaitingWaveActive || countdown !== null || isReplaying) return;
    if (col === BASE_X && row === BASE_Y) return;
    if (isPathTile(col, row)) return;

    if (selectedBuild.type === 'tower') {
      const def = TOWERS[selectedBuild.id];
      const tempId = `opt-${Date.now()}`;
      sfx.playPlace();
      setOptimisticTowers((prev) => [
        ...prev,
        { tower_id: tempId, tower_type: selectedBuild.id, x: col, y: row, health: def.hp, max_health: def.hp, is_alive: true },
      ]);
      actions.placeTower(selectedBuild.id, col, row).catch((e: unknown) => {
        console.error(e);
        setOptimisticTowers((prev) =>
          (prev as Array<{ tower_id: string }>).filter((t) => t.tower_id !== tempId),
        );
      });
    } else if (selectedBuild.type === 'factory') {
      const def = FACTORIES[selectedBuild.id];
      if (displayGold < def.cost) return;
      const tempId = `opt-${Date.now()}`;
      sfx.playPlace();
      setOptimisticFactories((prev) => [
        ...prev,
        { factory_id: tempId, factory_type: selectedBuild.id, x: col, y: row, level: 1, is_active: true },
      ]);
      setOptimisticGoldSpent((prev) => prev + def.cost);

      // Create conveyor to nearest alive tower of matching token type
      // Factory type 0/1/2 maps to tower type 0/1/2 (same token index)
      const tList = allTowers as Array<{ tower_id: string | number; x: number; y: number; is_alive?: boolean; tower_type?: number }>;
      const nearestT = tList
        .filter((t) => t.is_alive !== false && Number(t.tower_type) === selectedBuild.id)
        .reduce<{ tower_id: string | number; x: number; y: number } | null>((best, t) => {
          const dx = Number(t.x) - col, dy = Number(t.y) - row;
          if (!best) return t;
          const bx = Number(best.x) - col, by = Number(best.y) - row;
          return dx * dx + dy * dy < bx * bx + by * by ? t : best;
        }, null);
      if (nearestT) {
        const tx = Number(nearestT.x), ty = Number(nearestT.y);
        const convTiles = computeConveyorTiles(col, row, tx, ty);
        const convId = `conv-${tempId}`;
        setConveyors((prev) => [...prev, {
          id: convId, factoryId: tempId, towerId: nearestT.tower_id,
          fx: col, fy: row, tx, ty, tiles: convTiles, revealedCount: 0,
          color: CONVEYOR_COLORS[selectedBuild.id] ?? '#888',
          tokenCount: FACTORIES[selectedBuild.id]?.baseOutput ?? 0,
        }]);
        convTiles.forEach((_, i) => {
          setTimeout(() => {
            setConveyors((prev) => prev.map((c) => c.id === convId ? { ...c, revealedCount: i + 1 } : c));
          }, i * 150 + 100);
        });
      }

      actions.placeFactory(selectedBuild.id, col, row).catch((e: unknown) => {
        console.error(e);
        setOptimisticFactories((prev) =>
          (prev as Array<{ factory_id: string }>).filter((f) => f.factory_id !== tempId),
        );
        setOptimisticGoldSpent((prev) => prev - def.cost);
        setConveyors((prev) => prev.filter((c) => c.factoryId !== tempId));
      });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!account) return <MenuScreen mode="connect" onAction={undefined} />;

  if (isStartingGame) return <LoadingScreen />;

  if (!gameState) {
    return (
      <MenuScreen
        mode="new-game"
        selectedDifficulty={selectedDifficulty}
        onSelectDifficulty={setSelectedDifficulty}
        onAction={() => {
          sfx.playClick();
          setIsStartingGame(true);
          setConveyors([]);
          clientBaseHealthInitRef.current = false;
          const startHp = getDifficultyBaseHp(selectedDifficulty);
          clientBaseHealthRef.current = startHp;
          setClientBaseHealthDisplay(startHp);
          actions.newGame(selectedDifficulty).catch((e) => {
            console.error(e);
            setIsStartingGame(false);
          });
        }}
      />
    );
  }

  const displayGameState = {
    ...gameState,
    gold: displayGold,
    is_wave_active: isWaitingWaveActive || countdown !== null || isReplaying,
    base_health: displayBaseHealth,
  };

  const isCountingDown = countdown !== null;
  const isBusy = isWaitingWaveActive || isCountingDown || isReplaying;

  return (
    <div className="app-root">
      <ResourceBar gameState={displayGameState} />
      <WavePanel
        gameState={displayGameState}
        isWaveActive={isBusy}
        isCountingDown={isCountingDown}
        overclockAvailable={!gameState.overclock_used && !overclockPending && !isBusy && (displayGameState?.gold ?? 0) >= OVERCLOCK_COST}
        onStartWave={handleStartWave}
        onOverclock={handleActivateOverclock}
      />
      <div className="app-layout">
        <GameBoard
          towers={allTowers}
          factories={allFactories}
          liveSnapshot={liveSnapshot}
          selectedBuild={selectedBuild}
          onCellClick={handleCellClick}
          isWaveActive={isBusy}
          baseHealth={displayBaseHealth}
          conveyors={conveyors}
        />
        <TowerStatus
          towers={allTowers}
          factories={allFactories}
          gameState={displayGameState}
          onUpgrade={handleUpgrade}
          onUpgradeTower={handleUpgradeTower}
        />
      </div>
      <BuildMenu selected={selectedBuild} onSelect={(s) => { sfx.playClick(); setSelectedBuild(s); }} gameState={displayGameState} />

      {/* Countdown */}
      {isCountingDown && (
        <div className="app-countdown-overlay">
          <div key={countdown} className="app-countdown-num">{countdown}</div>
        </div>
      )}

      {/* Waiting for startWave tx to confirm on chain */}
      {isWaitingWaveActive && (
        <div className="app-resolving-overlay">
          <div className="app-resolving-card">
            <div className="app-resolving-spinner" />
            <div className="app-resolving-text">CONFIRMING TX...</div>
          </div>
        </div>
      )}

      {/* Replay speed toggle */}
      {isReplaying && (
        <button className="app-speed-btn" onClick={toggleReplaySpeed}>
          {replaySpeed}X
        </button>
      )}

      {/* Wave result card */}
      {waveResult && !isBusy && (
        <div className="app-result-overlay">
          <div className="app-result-card">
            <div className="app-result-title">WAVE {waveResult.waveNumber} CLEAR!</div>
            <div className="app-result-row">
              Gold: <b className="app-gold-text">+{waveResult.goldEarned}</b>
            </div>
            {waveResult.killCount > 0 && (
              <div className="app-result-row">
                Kills: <b style={{ color: '#5CB85C' }}>{waveResult.killCount}</b>
              </div>
            )}
            {waveResult.baseDamage > 0 && (
              <div className="app-result-row app-result-row--danger">
                Base damage: <b>-{waveResult.baseDamage} HP</b>
              </div>
            )}
            <div className="app-result-row">
              Base HP: <b style={{ color: waveResult.baseHealthRemaining > 0 ? '#5CB85C' : '#D9534F' }}>
                {waveResult.baseHealthRemaining}/{waveResult.baseMaxHp}
              </b>
            </div>
            <KillBreakdown result={waveResult} />
            <div className="app-result-divider" />
            <div className="app-result-stats">
              <span>Run totals — Kills: {gameStats.totalKills} | Gold: {gameStats.totalGoldEarned}</span>
            </div>
            <button className="app-result-dismiss" onClick={() => setWaveResult(null)}>CONTINUE</button>
          </div>
        </div>
      )}

      {/* Game over / victory */}
      {gameOver && (
        <div className="app-gameover-overlay">
          <div className={`app-gameover-card ${gameOver.victory ? 'app-gameover-card--victory' : 'app-gameover-card--defeat'}`}>
            <div className="app-gameover-icon">{gameOver.victory ? '★' : '✗'}</div>
            <div className="app-gameover-title">
              {gameOver.victory ? 'VICTORY!' : 'DEFEATED'}
            </div>
            <div className="app-gameover-sub">
              {gameOver.victory
                ? `All 10 waves cleared! Base: ${gameOver.baseHealthRemaining}/${getDifficultyBaseHp(gameState?.difficulty ?? selectedDifficulty)} HP`
                : `Base fell on wave ${gameOver.waveNumber}.`}
            </div>
            <div className="app-gameover-stats">
              Kills: {gameStats.totalKills} | Gold: {gameStats.totalGoldEarned} | Waves: {gameStats.wavesCompleted}
            </div>
            <button
              className="app-gameover-btn"
              onClick={() => {
                sfx.playClick();
                setGameOver(null);
                setGameStats(EMPTY_STATS);
                setConveyors([]);
                setOverclockPending(false);
                clientBaseHealthInitRef.current = false;
                const diff = gameState?.difficulty ?? selectedDifficulty;
                const startHp = getDifficultyBaseHp(diff);
                clientBaseHealthRef.current = startHp;
                setClientBaseHealthDisplay(startHp);
                actions.newGame(diff).catch(console.error);
              }}
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      {/* Achievement toasts */}
      <div className="app-toasts">
        {achievementToasts.map((ach: Achievement) => (
          <div key={ach.id} className="app-achievement-toast">
            <div className="app-achievement-icon">★</div>
            <div>
              <div className="app-achievement-title">{ach.title}</div>
              <div className="app-achievement-desc">{ach.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loading screen ─────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="menu-root">
      <div className="menu-loader-card">
        <div className="menu-loader-spinner" />
        <div className="menu-loader-title">DEPLOYING GAME</div>
        <div className="menu-loader-sub">Waiting for chain confirmation...</div>
        <div className="menu-loader-dots">
          <span>▮</span><span>▮</span><span>▮</span>
        </div>
      </div>
    </div>
  );
}

// ── Menu screen ────────────────────────────────────────────────────────────

const MENU_TOWERS = [
  { label: 'GPT',    color: '#2B6CB0', dark: '#1A3D70', text: '#BEE3F8', desc: 'Input token tower', range: '3 tiles' },
  { label: 'VISION', color: '#7B3FAD', dark: '#4A1A7A', text: '#E9D8FD', desc: 'Image token tower', range: '3 tiles' },
  { label: 'CODE',   color: '#C05800', dark: '#7A3400', text: '#FEEBC8', desc: 'Code token tower',  range: '3 tiles' },
];

const MENU_ENEMIES = [
  { label: '?!',  name: 'TextJailbreak',   color: '#CC1111', dark: '#660000', text: '#FFB8B8', sz: 38, round: false, desc: 'Fast · 2g · 1 dmg'  },
  { label: '∞',   name: 'ContextOverflow', color: '#8B4513', dark: '#4A1A00', text: '#FFD4A8', sz: 48, round: false, desc: 'Tough · 4g · 3 dmg' },
  { label: '~',   name: 'HalluSwarm',      color: '#8800CC', dark: '#440066', text: '#E8B8FF', sz: 26, round: true,  desc: 'Swarm · 1g · 1 dmg' },
];

function MenuScreen({
  mode, selectedDifficulty, onSelectDifficulty, onAction,
}: {
  mode: 'connect' | 'new-game';
  selectedDifficulty?: number;
  onSelectDifficulty?: (d: number) => void;
  onAction: (() => void) | undefined;
}) {
  return (
    <div className="menu-root">
      <div className="menu-grass" />
      <div className="menu-content">
        <div className="menu-title-block">
          <div className="menu-pixel-deco">◆ ◆ ◆</div>
          <h1 className="menu-title">TOKEN DEFENSE</h1>
          <div className="menu-subtitle">Defend the AI base from prompt injection attacks</div>
          <div className="menu-pixel-deco">◆ ◆ ◆</div>
        </div>

        <div className="menu-showcase">
          <div className="menu-showcase-col">
            <div className="menu-showcase-label">TOWERS</div>
            <div className="menu-cards-row">
              {MENU_TOWERS.map((t) => (
                <div key={t.label} className="menu-tower-card" style={{ background: t.color, border: `3px solid ${t.dark}` }}>
                  <div style={{ display: 'flex', height: 10 }}>
                    {[0,1,2,3].map((i) => (
                      <div key={i} style={{ flex: 1, background: i % 2 === 0 ? t.dark : t.color }} />
                    ))}
                  </div>
                  <div className="menu-tower-window" style={{ background: t.dark }} />
                  <span className="menu-tower-label" style={{ color: t.text }}>{t.label}</span>
                  <div className="menu-card-desc" style={{ color: t.text }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="menu-showcase-divider" />

          <div className="menu-showcase-col">
            <div className="menu-showcase-label">ENEMIES</div>
            <div className="menu-cards-row">
              {MENU_ENEMIES.map((e) => (
                <div key={e.label} className="menu-enemy-card">
                  <div style={{
                    width: e.sz, height: e.sz, background: e.color,
                    border: `2px solid ${e.dark}`,
                    borderRadius: e.round ? '50%' : 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `3px 3px 0 ${e.dark}`, margin: '0 auto 6px',
                  }}>
                    <span style={{ fontFamily: "'VT323', monospace", fontSize: e.sz < 32 ? 12 : 16, color: '#fff', textShadow: `1px 1px 0 ${e.dark}` }}>
                      {e.label}
                    </span>
                  </div>
                  <div className="menu-enemy-name" style={{ color: e.color }}>{e.name}</div>
                  <div className="menu-card-desc" style={{ color: '#A08060' }}>{e.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="menu-howto">
          <span className="menu-howto-item">◆ Place towers on grass tiles</span>
          <span className="menu-howto-item">◆ Build factories to generate tokens</span>
          <span className="menu-howto-item">◆ Survive all 10 waves to win</span>
        </div>

        {mode === 'connect' ? (
          <div className="menu-cta-block">
            <div className="menu-cta-hint">Connect your Cartridge Controller to play</div>
          </div>
        ) : (
          <div className="menu-difficulty-block">
            <div className="menu-difficulty-label">SELECT DIFFICULTY</div>
            <div className="menu-difficulty-row">
              {DIFFICULTY_SETTINGS.map((d, i) => (
                <button
                  key={i}
                  className="menu-difficulty-btn"
                  style={{
                    background: selectedDifficulty === i ? d.color : '#2C1507',
                    borderColor: selectedDifficulty === i ? d.color : '#4A2510',
                    color: selectedDifficulty === i ? '#F5E6C8' : '#A08060',
                    boxShadow: selectedDifficulty === i ? `0 0 8px ${d.color}80` : 'none',
                  }}
                  onClick={() => onSelectDifficulty?.(i)}
                >
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, letterSpacing: 1 }}>{d.label}</div>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: 12, opacity: 0.8 }}>
                    {d.gold}g · {d.baseHp}HP
                  </div>
                </button>
              ))}
            </div>
            <button className="menu-play-btn" onClick={onAction} style={{ marginTop: 16 }}>
              ▶  START GAME
            </button>
          </div>
        )}
      </div>

      <div className="menu-footer">
        TOKEN DEFENSE · Built on Dojo / StarkNet · 10 Waves · Survive them all
      </div>
    </div>
  );
}

// ── Kill breakdown ─────────────────────────────────────────────────────────

function KillBreakdown({ result }: { result: WaveResultSummary }) {
  const composition = WAVE_COMPOSITIONS[result.waveNumber] ?? [];
  const rows: { label: string; killed: boolean }[] = [];
  if (composition.some((g) => g.type === 'TextJailbreak'))
    rows.push({ label: 'TextJailbreak',   killed: result.killedTJ });
  if (composition.some((g) => g.type === 'ContextOverflow'))
    rows.push({ label: 'ContextOverflow', killed: result.killedCO });
  if (composition.some((g) => g.type === 'HalluSwarm'))
    rows.push({ label: 'HalluSwarm',      killed: result.killedHS });
  if (composition.some((g) => g.type === 'Boss'))
    rows.push({ label: 'BOSS',            killed: result.killedBoss });
  if (!rows.length) return null;
  return (
    <div className="app-kill-breakdown">
      {rows.map(({ label, killed }) => (
        <div key={label} className="app-kill-row">
          <span className="app-kill-label">{label}</span>
          <span className={`app-kill-status ${killed ? 'app-kill-status--dead' : 'app-kill-status--alive'}`}>
            {killed ? 'ELIMINATED' : 'SURVIVED'}
          </span>
        </div>
      ))}
    </div>
  );
}
