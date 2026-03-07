import { useEffect, useRef, useState } from 'react';
import type { AccountInterface } from 'starknet';
import BuildMenu from './components/BuildMenu';
import GameBoard from './components/GameBoard';
import ResourceBar from './components/ResourceBar';
import TowerStatus from './components/TowerStatus';
import WavePanel from './components/WavePanel';
import { BASE_MAX_HP, BASE_X, BASE_Y, ENEMIES, FACTORIES, GOLD_PER_WAVE, TOWERS, WAVE_COMPOSITIONS } from './constants';
import type { ManifestContract } from './dojo/models';
import { useActions } from './hooks/useActions';
import { useAchievements } from './hooks/useAchievements';
import { useBGM } from './hooks/useBGM';
import { useGameState } from './hooks/useGameState';
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
  killedTJ: boolean;
  killedCO: boolean;
  killedHS: boolean;
}

interface GameOver {
  victory: boolean;
  waveNumber: number;
  baseHealthRemaining: number;
}

export default function App({ account, manifest }: AppProps) {
  const { gameState, towers, factories, refreshGameState } = useGameState(account);
  const actions = useActions(account, manifest);
  const { isMuted, toggleMute } = useBGM();
  const { unlock, toasts: achievementToasts } = useAchievements();


  const [selectedBuild, setSelectedBuild] = useState<BuildSelection | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [waveResult, setWaveResult] = useState<WaveResultSummary | null>(null);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<WaveSnapshot | null>(null);
  const simRef = useRef<InstanceType<typeof WaveReplay> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const pendingResultRef = useRef<WaveResultSummary | null>(null);

  // Optimistic UI for building placement / upgrades
  const [optimisticTowers, setOptimisticTowers] = useState<unknown[]>([]);
  const [optimisticFactories, setOptimisticFactories] = useState<unknown[]>([]);
  const [optimisticGoldSpent, setOptimisticGoldSpent] = useState(0);
  const [upgradeOptimistic, setUpgradeOptimistic] = useState<UpgradeOptimistic>({ counts: {}, gold: 0 });

  // Snapshot of game state just before wave fires — used to compute result diff
  const preWaveStateRef = useRef<typeof gameState>(null);

  // Clear optimistic towers once Torii confirms matching position
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

  // Clear optimistic factories once Torii confirms
  useEffect(() => {
    if (!optimisticFactories.length) return;
    setOptimisticFactories((prev) => {
      const typed = prev as Array<{ factory_type: number; x: number; y: number }>;
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

  // Clear optimistic upgrades when Torii confirms level change
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

  // Detect wave resolution: wave_number incremented in Torii while isResolving
  useEffect(() => {
    if (!isResolving) return;
    const pre = preWaveStateRef.current;
    if (!pre || !gameState) return;
    const completedWave = Number(gameState.wave_number);
    if (completedWave <= Number(pre.wave_number)) return;

    // ── Derive outcome from on-chain state diff ──────────────────────────────
    const goldEarned     = Math.max(0, (gameState.gold ?? 0) - (pre.gold ?? 0));
    const baseDamageTaken = Math.max(0, (pre.base_health ?? BASE_MAX_HP) - (gameState.base_health ?? BASE_MAX_HP));
    const waveBonus      = GOLD_PER_WAVE(completedWave);
    const killGold       = Math.max(0, goldEarned - waveBonus);

    const composition    = WAVE_COMPOSITIONS[completedWave] ?? [];
    const countByType: Record<string, number> = {};
    for (const g of composition) countByType[g.type] = g.count;

    // Try all 8 kill/survive combinations to find which matches the on-chain killGold.
    let killedTJ = false, killedCO = false, killedHS = false;
    outer: for (let mask = 0; mask < 8; mask++) {
      const kTJ = !!(mask & 1), kCO = !!(mask & 2), kHS = !!(mask & 4);
      const gold =
        (kTJ ? (countByType['TextJailbreak']   ?? 0) * (ENEMIES['TextJailbreak']?.gold   ?? 0) : 0) +
        (kCO ? (countByType['ContextOverflow']  ?? 0) * (ENEMIES['ContextOverflow']?.gold  ?? 0) : 0) +
        (kHS ? (countByType['HalluSwarm']       ?? 0) * (ENEMIES['HalluSwarm']?.gold       ?? 0) : 0);
      if (gold === killGold) { killedTJ = kTJ; killedCO = kCO; killedHS = kHS; break outer; }
    }

    // ── Store result for display after replay completes ──────────────────────
    pendingResultRef.current = {
      waveNumber:          completedWave,
      goldEarned,
      baseDamage:          baseDamageTaken,
      baseHealthRemaining: gameState.base_health ?? BASE_MAX_HP,
      killedTJ,
      killedCO,
      killedHS,
    };

    setIsResolving(false);
    preWaveStateRef.current = null;

    // ── Start the outcome-driven replay animation ────────────────────────────
    startReplay(
      allTowers,
      allFactories,
      { ...pre },
      completedWave,
      killedTJ,
      killedCO,
      killedHS,
      baseDamageTaken,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.wave_number, isResolving]);

  // Polling fallback: if subscription doesn't deliver the update, poll every 3s
  useEffect(() => {
    if (!isResolving) return;
    const id = setInterval(() => {
      console.log('[Poll] fetching game state while resolving…');
      refreshGameState();
    }, 3000);
    return () => clearInterval(id);
  }, [isResolving, refreshGameState]);

  // Auto-dismiss result card after 6 seconds
  useEffect(() => {
    if (!waveResult) return;
    const t = setTimeout(() => setWaveResult(null), 6000);
    return () => clearTimeout(t);
  }, [waveResult]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Filter confirmed entities to current game only — Torii returns all historical
  // records; previous games share tower_id/factory_id (they restart from 0).
  // next_tower_id / next_factory_id from GameState are the exclusive upper bounds.
  const maxTowerId   = gameState?.next_tower_id   ?? Infinity;
  const maxFactoryId = gameState?.next_factory_id ?? Infinity;
  const currentTowers    = towers.filter(   (t) => Number((t as { tower_id:   number }).tower_id)   < maxTowerId);
  const currentFactories = factories.filter((f) => Number((f as { factory_id: number }).factory_id) < maxFactoryId);

  const allTowers = [...currentTowers, ...optimisticTowers];
  const allFactories = [...currentFactories, ...optimisticFactories].map((f) => {
    const typed = f as { factory_id: string | number; level: number };
    return { ...typed, level: Number(typed.level) + (upgradeOptimistic.counts[String(typed.factory_id)] ?? 0) };
  });
  const displayGold = (gameState?.gold ?? 0) - optimisticGoldSpent - upgradeOptimistic.gold;
  const displayBaseHealth = gameState?.base_health ?? BASE_MAX_HP;

  function startReplay(
    replayTowers: unknown[],
    replayFactories: unknown[],
    preState: typeof gameState,
    waveNumber: number,
    killedTJ: boolean,
    killedCO: boolean,
    killedHS: boolean,
    baseDamageTaken: number,
  ) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    simRef.current = new WaveReplay({
      towers:           replayTowers,
      factories:        replayFactories,
      gameState:        preState,
      waveNumber,
      killedTJ,
      killedCO,
      killedHS,
      baseDamageTaken,
    });
    lastTimeRef.current = performance.now();
    setIsReplaying(true);

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
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
          const result = pendingResultRef.current;
          pendingResultRef.current = null;
          if (result) {
            // ── Achievements ──────────────────────────────────────────────
            unlock('first_wave');
            if (result.waveNumber >= 5)  unlock('wave_5');
            if (result.waveNumber >= 10) unlock('wave_10');
            if (result.baseDamage === 0) unlock('untouched');
            const composition = WAVE_COMPOSITIONS[result.waveNumber] ?? [];
            const hasGroups = (type: string) => composition.some((g) => g.type === type);
            const allKilled =
              (!hasGroups('TextJailbreak')   || result.killedTJ) &&
              (!hasGroups('ContextOverflow')  || result.killedCO) &&
              (!hasGroups('HalluSwarm')       || result.killedHS);
            if (allKilled) unlock('clean_sweep');

            // ── Victory / defeat ──────────────────────────────────────────
            if (result.baseHealthRemaining <= 0) {
              setGameOver({ victory: false, waveNumber: result.waveNumber, baseHealthRemaining: 0 });
            } else if (result.waveNumber >= 10) {
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
    pendingResultRef.current = null;
  }

  // Tower/factory placement achievements — checked whenever entities change
  useEffect(() => {
    if (allTowers.length >= 3) unlock('tower_3');
    if (allFactories.length >= 2) unlock('factory_2');
    const upgraded = (allFactories as Array<{ level: number }>).some((f) => Number(f.level) >= 2);
    if (upgraded) unlock('upgraded');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTowers.length, allFactories.length]);

  function handleStartWave() {
    if (!gameState || isResolving || countdown !== null) return;
    setWaveResult(null);
    preWaveStateRef.current = { ...gameState, gold: displayGold };

    let remaining = 3;
    setCountdown(remaining);

    const advance = () => {
      remaining--;
      if (remaining > 0) {
        setCountdown(remaining);
        countdownTimerRef.current = setTimeout(advance, 800);
      } else {
        setCountdown(null);
        setIsResolving(true);
        actions.startWave().catch((e: unknown) => {
          console.error('startWave failed:', e);
          setIsResolving(false);
          stopReplay();
          preWaveStateRef.current = null;
        });
      }
    };

    countdownTimerRef.current = setTimeout(advance, 800);
  }

  function handleUpgrade(id: number | string) {
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

  async function handleCellClick(col: number, row: number) {
    if (!selectedBuild || !gameState || isResolving || countdown !== null) return;
    if (col === BASE_X && row === BASE_Y) return;

    if (selectedBuild.type === 'tower') {
      const def = TOWERS[selectedBuild.id];
      const tempId = `opt-${Date.now()}`;
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
      setOptimisticFactories((prev) => [
        ...prev,
        { factory_id: tempId, factory_type: selectedBuild.id, x: col, y: row, level: 1, is_active: true },
      ]);
      setOptimisticGoldSpent((prev) => prev + def.cost);
      actions.placeFactory(selectedBuild.id, col, row).catch((e: unknown) => {
        console.error(e);
        setOptimisticFactories((prev) =>
          (prev as Array<{ factory_id: string }>).filter((f) => f.factory_id !== tempId),
        );
        setOptimisticGoldSpent((prev) => prev - def.cost);
      });
    }
  }

  if (!account) {
    return (
      <div className="app-center">
        <h2 style={{ color: '#6af', marginBottom: 16 }}>Token Defense</h2>
        <p style={{ color: '#555', fontSize: 13 }}>Connect your controller to start.</p>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="app-center">
        <button className="app-new-game-btn" onClick={() => actions.newGame().catch(console.error)}>
          New Game
        </button>
      </div>
    );
  }

  const displayGameState = {
    ...gameState,
    gold: displayGold,
    is_wave_active: isResolving,
    base_health: displayBaseHealth,
  };

  const isCountingDown = countdown !== null;
  const isBusy = isResolving || isCountingDown || isReplaying;

  return (
    <div className="app-root">
      <ResourceBar gameState={displayGameState} />
      <WavePanel
        gameState={displayGameState}
        isWaveActive={isBusy}
        isCountingDown={isCountingDown}
        onStartWave={handleStartWave}
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
        />
        <TowerStatus
          towers={allTowers}
          factories={allFactories}
          gameState={displayGameState}
          onUpgrade={handleUpgrade}
        />
      </div>
      <BuildMenu selected={selectedBuild} onSelect={setSelectedBuild} gameState={displayGameState} />

      <button className="app-mute-btn" onClick={toggleMute} title={isMuted ? 'Unmute BGM' : 'Mute BGM'}>
        {isMuted ? 'BGM OFF' : 'BGM ON'}
      </button>

      {isCountingDown && (
        <div className="app-countdown-overlay">
          <div key={countdown} className="app-countdown-num">{countdown}</div>
        </div>
      )}

      {isResolving && !isReplaying && (
        <div className="app-resolving-overlay">
          <div className="app-resolving-card">
            <div className="app-resolving-spinner" />
            <div className="app-resolving-text">Wave resolving on-chain…</div>
          </div>
        </div>
      )}

      {waveResult && !isBusy && (
        <div className="app-result-overlay">
          <div className="app-result-card">
            <div className="app-result-title">Wave {waveResult.waveNumber} Complete!</div>
            <div className="app-result-row">
              Gold earned: <b style={{ color: '#FFD600' }}>+{waveResult.goldEarned}</b>
            </div>
            {waveResult.baseDamage > 0 && (
              <div className="app-result-row app-result-row--danger">
                Base damage: <b>-{waveResult.baseDamage} HP</b>
              </div>
            )}
            <div className="app-result-row">
              Base health:{' '}
              <b style={{ color: waveResult.baseHealthRemaining > 10 ? '#4CAF50' : '#EF5350' }}>
                {waveResult.baseHealthRemaining}/{BASE_MAX_HP}
              </b>
            </div>
            <KillBreakdown result={waveResult} />
            <button className="app-result-dismiss" onClick={() => setWaveResult(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="app-gameover-overlay">
          <div className={`app-gameover-card ${gameOver.victory ? 'app-gameover-card--victory' : 'app-gameover-card--defeat'}`}>
            <div className="app-gameover-icon">{gameOver.victory ? '🏆' : '💀'}</div>
            <div className="app-gameover-title">
              {gameOver.victory ? 'Victory!' : 'Defeated'}
            </div>
            <div className="app-gameover-sub">
              {gameOver.victory
                ? `You survived all 10 waves! Base: ${gameOver.baseHealthRemaining}/${BASE_MAX_HP} HP`
                : `Your base fell on wave ${gameOver.waveNumber}.`}
            </div>
            <button
              className="app-gameover-btn"
              onClick={() => { setGameOver(null); actions.newGame().catch(console.error); }}
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {achievementToasts.map((ach) => (
        <div key={ach.id} className="app-achievement-toast">
          <div className="app-achievement-icon">★</div>
          <div>
            <div className="app-achievement-title">{ach.title}</div>
            <div className="app-achievement-desc">{ach.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Kill breakdown sub-component ────────────────────────────────────────────

function KillBreakdown({ result }: { result: WaveResultSummary }) {
  const composition = WAVE_COMPOSITIONS[result.waveNumber] ?? [];
  const rows: { label: string; killed: boolean }[] = [];
  if (composition.some((g) => g.type === 'TextJailbreak'))
    rows.push({ label: 'TextJailbreak',   killed: result.killedTJ });
  if (composition.some((g) => g.type === 'ContextOverflow'))
    rows.push({ label: 'ContextOverflow', killed: result.killedCO });
  if (composition.some((g) => g.type === 'HalluSwarm'))
    rows.push({ label: 'HalluSwarm',      killed: result.killedHS });
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 8 }}>
      {rows.map(({ label, killed }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 3 }}>
          <span style={{ fontFamily: 'monospace' }}>{label}</span>
          <span style={{ color: killed ? '#4CAF50' : '#EF5350', fontWeight: 'bold' }}>
            {killed ? 'Eliminated' : 'Survived'}
          </span>
        </div>
      ))}
    </div>
  );
}
