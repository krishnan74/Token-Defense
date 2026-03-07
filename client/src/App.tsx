import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountInterface } from 'starknet';
import BuildMenu from './components/BuildMenu';
import GameBoard from './components/GameBoard';
import ResourceBar from './components/ResourceBar';
import TowerStatus from './components/TowerStatus';
import WavePanel from './components/WavePanel';
import { BASE_MAX_HP, BASE_X, BASE_Y, FACTORIES, TOWERS } from './constants';
import type { ManifestContract } from './dojo/models';
import { useActions } from './hooks/useActions';
import { useBGM } from './hooks/useBGM';
import { useGameState } from './hooks/useGameState';
import { WaveSimulator } from './simulation/WaveSimulator';
import type { WaveResult, WaveSnapshot } from './simulation/WaveSimulator';

interface AppProps {
  account: AccountInterface | null;
  manifest: { contracts: ManifestContract[] } | null;
}

export interface BuildSelection {
  type: 'tower' | 'factory';
  id: number;
}

interface PostWaveHealths {
  [towerId: string]: { health: number; is_alive: boolean };
}

interface WaveResultSummary {
  waveNumber: number;
  goldEarned: number;
  enemiesKilled: number;
  baseDamage: number;
  baseHealthRemaining: number;
}

interface UpgradeOptimistic {
  counts: Record<string, number>;
  gold: number;
}

export default function App({ account, manifest }: AppProps) {
  const { gameState, towers, factories } = useGameState(account);
  const actions = useActions(account, manifest);
  const { isMuted, toggleMute } = useBGM();

  const [selectedBuild, setSelectedBuild] = useState<BuildSelection | null>(null);
  const [isWaveActive, setIsWaveActive] = useState(false);
  const [waveSnapshot, setWaveSnapshot] = useState<WaveSnapshot | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [waveResult, setWaveResult] = useState<WaveResultSummary | null>(null);

  const [optimisticTowers, setOptimisticTowers] = useState<unknown[]>([]);
  const [optimisticFactories, setOptimisticFactories] = useState<unknown[]>([]);
  const [optimisticGoldSpent, setOptimisticGoldSpent] = useState(0);
  const [upgradeOptimistic, setUpgradeOptimistic] = useState<UpgradeOptimistic>({ counts: {}, gold: 0 });

  const [postWaveTokens, setPostWaveTokens] = useState<Record<string, number> | null>(null);
  const [postWaveHealths, setPostWaveHealths] = useState<PostWaveHealths>({});
  const [postWaveBaseHealth, setPostWaveBaseHealth] = useState<number | null>(null);

  const simulatorRef = useRef<WaveSimulator | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const prevFactoriesRef = useRef<unknown[]>([]);

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

  useEffect(() => {
    setPostWaveTokens(null);
    setPostWaveHealths({});
    setPostWaveBaseHealth(null);
  }, [gameState?.wave_number]);

  useEffect(() => {
    if (!waveResult) return;
    const t = setTimeout(() => setWaveResult(null), 5000);
    return () => clearTimeout(t);
  }, [waveResult]);

  const allTowers = [...towers, ...optimisticTowers].map((t) => {
    const typed = t as { tower_id: string | number };
    const postHealth = postWaveHealths[String(typed.tower_id)];
    return postHealth ? { ...typed, ...postHealth } : typed;
  });
  const allFactories = [...factories, ...optimisticFactories].map((f) => {
    const typed = f as { factory_id: string | number; level: number };
    return { ...typed, level: Number(typed.level) + (upgradeOptimistic.counts[String(typed.factory_id)] ?? 0) };
  });
  const displayGold = (gameState?.gold ?? 0) - optimisticGoldSpent - upgradeOptimistic.gold;

  const displayBaseHealth =
    isWaveActive && waveSnapshot?.baseHealth !== undefined
      ? waveSnapshot.baseHealth
      : postWaveBaseHealth !== null
        ? postWaveBaseHealth
        : gameState?.base_health ?? BASE_MAX_HP;

  const runLoop = useCallback((timestamp: number) => {
    if (!simulatorRef.current) return;
    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0;
    lastTimeRef.current = timestamp;

    const snapshot = simulatorRef.current.step(Math.min(dt, 0.05));
    setWaveSnapshot(snapshot);

    if (snapshot.done) {
      endWave();
      return;
    }
    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  async function endWave() {
    const result: WaveResult | undefined = simulatorRef.current?.getResult();

    if (simulatorRef.current) {
      setPostWaveTokens({ ...simulatorRef.current.tokens });
      setPostWaveBaseHealth(simulatorRef.current.baseHealth);
      const healths: PostWaveHealths = {};
      for (const t of simulatorRef.current.towers) {
        healths[String(t.tower_id)] = { health: t.health, is_alive: t.is_alive };
      }
      setPostWaveHealths(healths);
    }

    if (result) {
      setWaveResult({
        waveNumber: simulatorRef.current?.waveNumber ?? 0,
        goldEarned: result.goldEarned,
        enemiesKilled: result.enemiesKilled ?? 0,
        baseDamage: result.baseDamage ?? 0,
        baseHealthRemaining: simulatorRef.current?.baseHealth ?? BASE_MAX_HP,
      });
    }

    simulatorRef.current = null;
    lastTimeRef.current = null;

    if (result) {
      const ids = result.towerDamages.map((d) => Number(d.tower_id));
      const dmgs = result.towerDamages.map((d) => d.damage);
      const { tokensConsumed, baseDamage } = result;
      try {
        await actions.commitWaveResult(
          ids, dmgs, result.killGold,
          tokensConsumed.input_tokens, tokensConsumed.image_tokens, tokensConsumed.code_tokens,
          baseDamage ?? 0,
        );
      } catch (e) {
        console.error('commitWaveResult failed:', e);
      }
    }
    setIsWaveActive(false);
    setWaveSnapshot(null);
  }

  function handleStartWave() {
    if (!gameState || isWaveActive || countdown !== null) return;
    setWaveResult(null);

    const waveNum = (gameState.wave_number ?? 0) + 1;
    const snapTowers = [...allTowers];
    const snapFactories = [...allFactories];
    const snapGameState = { ...gameState, base_health: displayBaseHealth };

    let remaining = 3;
    setCountdown(remaining);

    const advance = () => {
      remaining--;
      if (remaining > 0) {
        setCountdown(remaining);
        countdownTimerRef.current = setTimeout(advance, 800);
      } else {
        setCountdown(null);
        simulatorRef.current = new WaveSimulator({
          towers: snapTowers,
          factories: snapFactories,
          gameState: snapGameState,
          waveNumber: waveNum,
        });
        setIsWaveActive(true);
        lastTimeRef.current = null;
        rafRef.current = requestAnimationFrame(runLoop);

        actions.startWave().catch((e: unknown) => {
          console.error('startWave failed:', e);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          simulatorRef.current = null;
          setIsWaveActive(false);
          setWaveSnapshot(null);
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

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, []);

  async function handleCellClick(col: number, row: number) {
    if (!selectedBuild || !gameState || isWaveActive) return;
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

  const displayTokens =
    isWaveActive && waveSnapshot?.tokens ? waveSnapshot.tokens : postWaveTokens ?? {};

  const displayGameState = {
    ...gameState,
    gold: displayGold,
    is_wave_active: isWaveActive || gameState.is_wave_active,
    base_health: displayBaseHealth,
    ...displayTokens,
  };

  const isCountingDown = countdown !== null;

  return (
    <div className="app-root">
      <ResourceBar gameState={displayGameState} waveSnapshot={waveSnapshot} />
      <WavePanel
        gameState={displayGameState}
        isWaveActive={isWaveActive}
        isCountingDown={isCountingDown}
        onStartWave={handleStartWave}
      />
      <div className="app-layout">
        <GameBoard
          towers={allTowers}
          factories={allFactories}
          liveSnapshot={waveSnapshot}
          selectedBuild={selectedBuild}
          onCellClick={handleCellClick}
          isWaveActive={isWaveActive}
          baseHealth={displayBaseHealth}
        />
        <TowerStatus
          towers={allTowers}
          factories={allFactories}
          liveSnapshot={waveSnapshot}
          gameState={displayGameState}
          onUpgrade={handleUpgrade}
        />
      </div>
      <BuildMenu selected={selectedBuild} onSelect={setSelectedBuild} gameState={displayGameState} />

      <button className="app-mute-btn" onClick={toggleMute} title={isMuted ? 'Unmute BGM' : 'Mute BGM'}>
        {isMuted ? 'BGM OFF' : 'BGM ON'}
      </button>

      {countdown !== null && (
        <div className="app-countdown-overlay">
          <div key={countdown} className="app-countdown-num">{countdown}</div>
        </div>
      )}

      {waveResult && !isWaveActive && !isCountingDown && (
        <div className="app-result-overlay">
          <div className="app-result-card">
            <div className="app-result-title">Wave {waveResult.waveNumber} Complete!</div>
            <div className="app-result-row">
              Gold earned: <b style={{ color: '#FFD600' }}>+{waveResult.goldEarned}</b>
            </div>
            <div className="app-result-row">
              Enemies defeated: <b style={{ color: '#4CAF50' }}>{waveResult.enemiesKilled}</b>
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
            <button className="app-result-dismiss" onClick={() => setWaveResult(null)}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
