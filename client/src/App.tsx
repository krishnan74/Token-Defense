import { useEffect, useRef, useState } from 'react';
import type { AccountInterface } from 'starknet';
import BuildMenu from './components/BuildMenu';
import GameBoard from './components/GameBoard';
import ResourceBar from './components/ResourceBar';
import TowerStatus from './components/TowerStatus';
import WavePanel from './components/WavePanel';
import {
  BASE_MAX_HP, BASE_X, BASE_Y,
  ENEMIES, FACTORIES, GOLD_PER_WAVE, TOWERS, WAVE_COMPOSITIONS,
} from './constants';
import type { ManifestContract } from './dojo/models';
import { useActions } from './hooks/useActions';
import { useAchievements } from './hooks/useAchievements';
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
  killedTJ: boolean;
  killedCO: boolean;
  killedHS: boolean;
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

const EMPTY_STATS: GameStats = { totalKills: 0, totalGoldEarned: 0, totalBaseDamage: 0, wavesCompleted: 0 };

export default function App({ account, manifest }: AppProps) {
  const { gameState, towers, factories, refreshGameState } = useGameState(account);
  const actions = useActions(account, manifest);
  const sfx = useSFX();
  const { unlock, toasts: achievementToasts } = useAchievements();

  const [selectedBuild, setSelectedBuild] = useState<BuildSelection | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [waveResult, setWaveResult] = useState<WaveResultSummary | null>(null);
  const [gameOver, setGameOver] = useState<GameOver | null>(null);
  const [gameStats, setGameStats] = useState<GameStats>(EMPTY_STATS);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const replaySpeedRef = useRef(1);
  const [isStartingGame, setIsStartingGame] = useState(false);

  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<WaveSnapshot | null>(null);
  const simRef = useRef<InstanceType<typeof WaveReplay> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const pendingResultRef = useRef<WaveResultSummary | null>(null);

  // SFX tracking during replay
  const sfxPrevRef = useRef({ particles: 0, shakes: 0 });
  const sfxFireCooldownRef = useRef(0);

  // Optimistic UI
  const [optimisticTowers, setOptimisticTowers] = useState<unknown[]>([]);
  const [optimisticFactories, setOptimisticFactories] = useState<unknown[]>([]);
  const [optimisticGoldSpent, setOptimisticGoldSpent] = useState(0);
  const [upgradeOptimistic, setUpgradeOptimistic] = useState<UpgradeOptimistic>({ counts: {}, gold: 0 });

  const preWaveStateRef = useRef<typeof gameState>(null);

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
      const typed    = prev as Array<{ factory_type: number; x: number; y: number }>;
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

  // ── Wave resolution detection ──────────────────────────────────────────────
  useEffect(() => {
    if (!isResolving) return;
    const pre = preWaveStateRef.current;
    if (!pre || !gameState) return;
    const completedWave = Number(gameState.wave_number);
    if (completedWave <= Number(pre.wave_number)) return;

    const goldEarned      = Math.max(0, (gameState.gold ?? 0) - (pre.gold ?? 0));
    const baseDamageTaken = Math.max(0, (pre.base_health ?? BASE_MAX_HP) - (gameState.base_health ?? BASE_MAX_HP));
    const waveBonus       = GOLD_PER_WAVE(completedWave);
    const killGold        = Math.max(0, goldEarned - waveBonus);

    const composition = WAVE_COMPOSITIONS[completedWave] ?? [];
    const countByType: Record<string, number> = {};
    for (const g of composition) countByType[g.type] = g.count;

    let killedTJ = false, killedCO = false, killedHS = false;
    outer: for (let mask = 0; mask < 8; mask++) {
      const kTJ = !!(mask & 1), kCO = !!(mask & 2), kHS = !!(mask & 4);
      const gold =
        (kTJ ? (countByType['TextJailbreak']  ?? 0) * (ENEMIES['TextJailbreak']?.gold  ?? 0) : 0) +
        (kCO ? (countByType['ContextOverflow'] ?? 0) * (ENEMIES['ContextOverflow']?.gold ?? 0) : 0) +
        (kHS ? (countByType['HalluSwarm']      ?? 0) * (ENEMIES['HalluSwarm']?.gold      ?? 0) : 0);
      if (gold === killGold) { killedTJ = kTJ; killedCO = kCO; killedHS = kHS; break outer; }
    }

    const killCount =
      (killedTJ ? (countByType['TextJailbreak']  ?? 0) : 0) +
      (killedCO ? (countByType['ContextOverflow'] ?? 0) : 0) +
      (killedHS ? (countByType['HalluSwarm']      ?? 0) : 0);

    pendingResultRef.current = {
      waveNumber: completedWave, goldEarned, baseDamage: baseDamageTaken,
      baseHealthRemaining: gameState.base_health ?? BASE_MAX_HP,
      killedTJ, killedCO, killedHS, killCount,
    };

    setIsResolving(false);
    preWaveStateRef.current = null;

    startReplay(allTowers, allFactories, { ...pre }, completedWave, killedTJ, killedCO, killedHS, baseDamageTaken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.wave_number, isResolving]);

  // Polling fallback while resolving
  useEffect(() => {
    if (!isResolving) return;
    const id = setInterval(() => refreshGameState(), 3000);
    return () => clearInterval(id);
  }, [isResolving, refreshGameState]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Entity filtering (exclude historical Torii records from past games) ─────
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

  // During replay, follow the animated base health so sidebar tracks the animation.
  // Once replay ends liveSnapshot is null and we fall back to the on-chain value.
  const displayBaseHealth = isReplaying
    ? (liveSnapshot?.baseHealth ?? (gameState?.base_health ?? BASE_MAX_HP))
    : (gameState?.base_health ?? BASE_MAX_HP);

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
    killedTJ: boolean, killedCO: boolean, killedHS: boolean, baseDamageTaken: number,
  ) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    replaySpeedRef.current = 1;
    setReplaySpeed(1);
    simRef.current = new WaveReplay({
      towers: replayTowers, factories: replayFactories,
      gameState: preState, waveNumber, killedTJ, killedCO, killedHS, baseDamageTaken,
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
          const result = pendingResultRef.current;
          pendingResultRef.current = null;
          if (result) {
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
              (!has('HalluSwarm')      || result.killedHS)
            ) unlock('clean_sweep');

            // Cumulative stats
            setGameStats((prev) => ({
              totalKills:     prev.totalKills    + result.killCount,
              totalGoldEarned: prev.totalGoldEarned + result.goldEarned,
              totalBaseDamage: prev.totalBaseDamage  + result.baseDamage,
              wavesCompleted: prev.wavesCompleted + 1,
            }));

            sfx.playWaveComplete();

            // Victory / defeat / result
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
    pendingResultRef.current = null;
  }

  function toggleReplaySpeed() {
    const next = replaySpeedRef.current === 1 ? 2 : 1;
    replaySpeedRef.current = next;
    setReplaySpeed(next);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleStartWave() {
    if (!gameState || isResolving || countdown !== null) return;
    setWaveResult(null);
    preWaveStateRef.current = { ...gameState, gold: displayGold };

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

  async function handleCellClick(col: number, row: number) {
    if (!selectedBuild || !gameState || isResolving || countdown !== null) return;
    if (col === BASE_X && row === BASE_Y) return;

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
      actions.placeFactory(selectedBuild.id, col, row).catch((e: unknown) => {
        console.error(e);
        setOptimisticFactories((prev) =>
          (prev as Array<{ factory_id: string }>).filter((f) => f.factory_id !== tempId),
        );
        setOptimisticGoldSpent((prev) => prev - def.cost);
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
        onAction={() => {
          sfx.playClick();
          setIsStartingGame(true);
          actions.newGame().catch((e) => {
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
      <BuildMenu selected={selectedBuild} onSelect={(s) => { sfx.playClick(); setSelectedBuild(s); }} gameState={displayGameState} />

      {/* Countdown */}
      {isCountingDown && (
        <div className="app-countdown-overlay">
          <div key={countdown} className="app-countdown-num">{countdown}</div>
        </div>
      )}

      {/* Wave resolving spinner */}
      {isResolving && !isReplaying && (
        <div className="app-resolving-overlay">
          <div className="app-resolving-card">
            <div className="app-resolving-spinner" />
            <div className="app-resolving-text">RESOLVING ON-CHAIN...</div>
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
              Base HP: <b style={{ color: waveResult.baseHealthRemaining > 10 ? '#5CB85C' : '#D9534F' }}>
                {waveResult.baseHealthRemaining}/{BASE_MAX_HP}
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
                ? `All 10 waves cleared! Base: ${gameOver.baseHealthRemaining}/${BASE_MAX_HP} HP`
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
                actions.newGame().catch(console.error);
              }}
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      {/* Achievement toasts */}
      <div className="app-toasts">
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

function MenuScreen({ mode, onAction }: { mode: 'connect' | 'new-game'; onAction: (() => void) | undefined }) {
  return (
    <div className="menu-root">
      {/* Decorative grass strip */}
      <div className="menu-grass" />

      <div className="menu-content">
        {/* Title */}
        <div className="menu-title-block">
          <div className="menu-pixel-deco">◆ ◆ ◆</div>
          <h1 className="menu-title">TOKEN DEFENSE</h1>
          <div className="menu-subtitle">Defend the AI base from prompt injection attacks</div>
          <div className="menu-pixel-deco">◆ ◆ ◆</div>
        </div>

        {/* Tower + Enemy showcase */}
        <div className="menu-showcase">
          <div className="menu-showcase-col">
            <div className="menu-showcase-label">TOWERS</div>
            <div className="menu-cards-row">
              {MENU_TOWERS.map((t) => (
                <div key={t.label} className="menu-tower-card" style={{ background: t.color, border: `3px solid ${t.dark}` }}>
                  {/* Battlements */}
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
                    width: e.sz, height: e.sz,
                    background: e.color,
                    border: `2px solid ${e.dark}`,
                    borderRadius: e.round ? '50%' : 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `3px 3px 0 ${e.dark}`,
                    margin: '0 auto 6px',
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

        {/* How to play */}
        <div className="menu-howto">
          <span className="menu-howto-item">◆ Place towers on grass tiles</span>
          <span className="menu-howto-item">◆ Build factories to generate tokens</span>
          <span className="menu-howto-item">◆ Survive all 10 waves to win</span>
        </div>

        {/* CTA */}
        {mode === 'connect' ? (
          <div className="menu-cta-block">
            <div className="menu-cta-hint">Connect your Cartridge Controller to play</div>
          </div>
        ) : (
          <button className="menu-play-btn" onClick={onAction}>
            ▶  START GAME
          </button>
        )}
      </div>

      {/* Footer */}
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
