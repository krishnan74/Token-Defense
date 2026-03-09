import { useEffect, useRef, useState } from 'react';
import type { AccountInterface } from 'starknet';
import { CairoOption, CairoOptionVariant } from 'starknet';
import { useContract, useProvider } from '@starknet-react/core';
import denshokanAbi from './abi/denshokan.json';
import BuildMenu from './components/BuildMenu';
import GameBoard from './components/GameBoard';
import GuidedTour, { shouldShowTour } from './components/GuidedTour';
import GameOverCard from './components/GameOverCard';
import LoadingScreen from './components/LoadingScreen';
import MenuScreen from './components/MenuScreen';
import ResourceBar from './components/ResourceBar';
import TowerStatus from './components/TowerStatus';
import WavePanel from './components/WavePanel';
import WaveResultCard from './components/WaveResultCard';
import {
  BASE_MAX_HP, BASE_X, BASE_Y,
  CONVEYOR_COLORS, FACTORIES, OVERCLOCK_COST, TOWERS, TOWER_UPGRADE_COST,
  computeConveyorTiles, getDifficultyBaseHp, isPathTile,
} from './constants';
import type { ConveyorTile } from './constants';
import type { ManifestContract } from './dojo/models';
import { DENSHOKAN_ADDRESS, buildContractAddresses, parseMintedTokenId } from './dojo/contracts';
import { useActions } from './hooks/useActions';
import { useAchievements } from './hooks/useAchievements';
import type { Achievement } from './hooks/useAchievements';
import { useBGM } from './hooks/useBGM';
import { useGameState } from './hooks/useGameState';
import { useOptimisticEntities } from './hooks/useOptimisticEntities';
import { useReplay } from './hooks/useReplay';
import { useSFX } from './hooks/useSFX';
import { useWaveFlow } from './hooks/useWaveFlow';
import type { WaveSnapshot } from './simulation/WaveSimulator';
import type { Conveyor, GameOver, GameStats, PendingReplay, WaveResultSummary } from './types';
import { EMPTY_STATS } from './types';

export interface BuildSelection {
  type: 'tower' | 'factory';
  id: number;
}

interface AppProps {
  account: AccountInterface | null;
  manifest: { contracts: ManifestContract[] } | null;
}

export default function App({ account, manifest }: AppProps) {
  const [tokenId,           setTokenId]           = useState<string | null>(null);
  const [selectedBuild,     setSelectedBuild]     = useState<BuildSelection | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number>(1);
  const [isStartingGame,    setIsStartingGame]    = useState(false);
  const [waveResult,        setWaveResult]        = useState<WaveResultSummary | null>(null);
  const [gameOver,          setGameOver]          = useState<GameOver | null>(null);
  const [gameStats,         setGameStats]         = useState<GameStats>(EMPTY_STATS);
  const [overclockPending,  setOverclockPending]  = useState(false);
  const [conveyors,         setConveyors]         = useState<Conveyor[]>([]);
  const [showTour,          setShowTour]          = useState(false);
  const [clientBaseHealthDisplay, setClientBaseHealthDisplay] = useState<number>(BASE_MAX_HP);

  const clientBaseHealthRef     = useRef<number>(BASE_MAX_HP);
  const clientBaseHealthInitRef = useRef(false);
  const sfxPrevRef              = useRef({ particles: 0, shakes: 0 });
  const sfxFireCooldownRef      = useRef(0);

  const { gameState, towers, factories, refreshGameState } = useGameState(tokenId);
  const actions  = useActions(account, manifest, tokenId);
  const sfx      = useSFX();
  const { unlock, toasts: achievementToasts } = useAchievements({ onUnlock: sfx.playAchievement });
  const { provider } = useProvider();
  const { contract: denshokanContract } = useContract({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abi: denshokanAbi as any,
    address: DENSHOKAN_ADDRESS as `0x${string}`,
  });
  const addresses = buildContractAddresses(manifest?.contracts ?? []);

  const { allTowers, allFactories, optimisticGoldSpent, upgradeOptimistic,
    setOptimisticTowers, setOptimisticFactories, setOptimisticGoldSpent, setUpgradeOptimistic,
  } = useOptimisticEntities(towers as never, factories as never, gameState);

  const displayGold = (gameState?.gold ?? 0)
    - optimisticGoldSpent
    - upgradeOptimistic.gold
    - (overclockPending ? OVERCLOCK_COST : 0);

  const replay = useReplay({
    sfx, unlock,
    onWaveResult: setWaveResult,
    onGameOver:   setGameOver,
    onStatsUpdate: setGameStats,
  });

  const wave = useWaveFlow({
    gameState, actions, provider: provider as never, addresses,
    clientBaseHealthRef, displayGold, allTowers, allFactories, sfx, refreshGameState,
    onReplayReady: (p: PendingReplay) => {
      setClientBaseHealthDisplay(clientBaseHealthRef.current);
      replay.startReplay(p);
    },
  });

  const isBusy = wave.isWaitingWaveActive || wave.countdown !== null || replay.isReplaying;

  const bgmPhase = replay.isReplaying ? 'battle' : 'build';
  const { isMuted, toggleMute } = useBGM(bgmPhase);

  // ── Load tokenId from localStorage when account connects ──────────────────
  useEffect(() => {
    if (!account?.address) { setTokenId(null); return; }
    const saved = localStorage.getItem(`td:tokenId:${account.address}`);
    if (saved) setTokenId(saved);
  }, [account?.address]);

  // ── Mint a Denshokan ERC721 token then call new_game ─────────────────────
  async function mintAndStart(difficulty: number): Promise<void> {
    if (!account || !denshokanContract) throw new Error('Not connected');
    setIsStartingGame(true);
    try {
      const none = () => new CairoOption(CairoOptionVariant.None);
      const mintCall = denshokanContract.populate('mint', [
        addresses.game,   // game_address
        none(),           // player_name
        none(),           // settings_id
        none(),           // start
        none(),           // end
        none(),           // objective_id
        none(),           // context
        none(),           // client_url
        none(),           // renderer_address
        none(),           // skills_address
        account.address,  // to
        false,            // soulbound
        false,            // paymaster
        0,                // salt
        0,                // metadata
      ]);
      const mintTx = await account.execute([mintCall] as never);
      console.log('[mint] tx:', mintTx);

      const receipt = await (provider as { waitForTransaction: (h: string) => Promise<unknown> })
        .waitForTransaction(mintTx.transaction_hash);
      const newTokenId = parseMintedTokenId((receipt as { events?: unknown[] }).events ?? []);
      if (!newTokenId || newTokenId === '0x0') throw new Error('Failed to parse token_id from mint receipt');
      console.log('[mint] token_id:', newTokenId);

      localStorage.setItem(`td:tokenId:${account.address}`, newTokenId);
      setTokenId(newTokenId);
      await actions.newGame(difficulty, newTokenId);
    } catch (e) {
      console.error('[mintAndStart] error:', e);
      setIsStartingGame(false);
      throw e;
    }
  }

  // ── Sync client base health from chain on first load / new game ───────────
  useEffect(() => {
    if (gameState && !clientBaseHealthInitRef.current) {
      clientBaseHealthInitRef.current = true;
      clientBaseHealthRef.current = gameState.base_health ?? BASE_MAX_HP;
      setClientBaseHealthDisplay(clientBaseHealthRef.current);
    }
  }, [gameState]);

  // ── Clear loader once Torii delivers the new game state ───────────────────
  useEffect(() => {
    if (gameState && isStartingGame) {
      setIsStartingGame(false);
      if (shouldShowTour()) setShowTour(true);
    }
  }, [gameState, isStartingGame]);

  // ── Sound effects during wave replay ──────────────────────────────────────
  useEffect(() => {
    const snapshot = replay.liveSnapshot as WaveSnapshot | null;
    if (!snapshot) { sfxPrevRef.current = { particles: 0, shakes: 0 }; return; }
    const prev = sfxPrevRef.current;
    const nowParticles = snapshot.particles?.length ?? 0;
    const nowShakes    = snapshot.screenShakePulse ?? 0;
    if (nowParticles > prev.particles) sfx.playEnemyDeath();
    if (nowShakes    > prev.shakes)    sfx.playBaseHit();
    if ((snapshot.projectiles?.length ?? 0) > 0) {
      const now = Date.now();
      if (now - sfxFireCooldownRef.current > 280) {
        sfx.playTowerFire();
        sfxFireCooldownRef.current = now;
      }
    }
    sfxPrevRef.current = { particles: nowParticles, shakes: nowShakes };
  }, [replay.liveSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-dismiss wave result card after 7s ────────────────────────────────
  useEffect(() => {
    if (!waveResult) return;
    const t = setTimeout(() => setWaveResult(null), 7000);
    return () => clearTimeout(t);
  }, [waveResult]);

  // ── Sync overclock pending flag ────────────────────────────────────────────
  useEffect(() => {
    if (gameState?.overclock_used && overclockPending) setOverclockPending(false);
  }, [gameState?.overclock_used, overclockPending]);

  // ── Cleanup rAF on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => { replay.stopReplay(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Achievement checks ─────────────────────────────────────────────────────
  useEffect(() => {
    if (allTowers.length >= 3)    unlock('tower_3');
    if (allFactories.length >= 2) unlock('factory_2');
    const upgraded = (allFactories as Array<{ level: number }>).some((f) => Number(f.level) >= 2);
    if (upgraded) unlock('upgraded');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTowers.length, allFactories.length]);

  // ── Handlers ───────────────────────────────────────────────────────────────
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
    const cost = TOWER_UPGRADE_COST[Number(tower?.level) || 1] ?? 9999;
    setOptimisticGoldSpent((prev) => prev + cost);
    actions.upgradeTower(id as number).catch((e: unknown) => {
      console.error('upgradeTower failed:', e);
      setOptimisticGoldSpent((prev) => Math.max(0, prev - cost));
    });
  }

  function handleSellTower(id: number | string) {
    sfx.playSell();
    // Optimistically remove tower from list
    setOptimisticTowers((prev) =>
      (prev as Array<{ tower_id: string | number; is_alive?: boolean }>).map((t) =>
        String(t.tower_id) === String(id) ? { ...t, is_alive: false } : t,
      ),
    );
    actions.sellTower(id as number).catch((e: unknown) => {
      console.error('sellTower failed:', e);
      setOptimisticTowers((prev) =>
        (prev as Array<{ tower_id: string | number; is_alive?: boolean }>).map((t) =>
          String(t.tower_id) === String(id) ? { ...t, is_alive: true } : t,
        ),
      );
    });
  }

  function handleSellFactory(id: number | string) {
    sfx.playSell();
    setOptimisticFactories((prev) =>
      (prev as Array<{ factory_id: string | number; is_active?: boolean }>).map((f) =>
        String(f.factory_id) === String(id) ? { ...f, is_active: false } : f,
      ),
    );
    actions.sellFactory(id as number).catch((e: unknown) => {
      console.error('sellFactory failed:', e);
      setOptimisticFactories((prev) =>
        (prev as Array<{ factory_id: string | number; is_active?: boolean }>).map((f) =>
          String(f.factory_id) === String(id) ? { ...f, is_active: true } : f,
        ),
      );
    });
  }

  function handleActivateOverclock() {
    if (overclockPending || gameState?.overclock_used) return;
    sfx.playOverclock();
    setOverclockPending(true);
    actions.activateOverclock().catch((e: unknown) => {
      console.error('activateOverclock failed:', e);
      setOverclockPending(false);
    });
  }

  async function handleCellClick(col: number, row: number) {
    if (!selectedBuild || !gameState || isBusy) return;
    if (col === BASE_X && row === BASE_Y) return;
    if (isPathTile(col, row)) return;

    if (selectedBuild.type === 'tower') {
      const def   = TOWERS[selectedBuild.id];
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
      return;
    }

    if (selectedBuild.type === 'factory') {
      const def = FACTORIES[selectedBuild.id];
      if (displayGold < def.cost) return;
      const tempId = `opt-${Date.now()}`;
      sfx.playPlace();
      setOptimisticFactories((prev) => [
        ...prev,
        { factory_id: tempId, factory_type: selectedBuild.id, x: col, y: row, level: 1, is_active: true },
      ]);
      setOptimisticGoldSpent((prev) => prev + def.cost);

      // Conveyor to nearest alive tower of same token type
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
          fx: col, fy: row, tx, ty,
          tiles: convTiles as ConveyorTile[],
          revealedCount: 0,
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

  function handleNewGame(difficulty: number) {
    sfx.playClick();
    setConveyors([]);
    clientBaseHealthInitRef.current = false;
    const startHp = getDifficultyBaseHp(difficulty);
    clientBaseHealthRef.current = startHp;
    setClientBaseHealthDisplay(startHp);
    mintAndStart(difficulty).catch(console.error);
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const displayBaseHealth = replay.isReplaying
    ? ((replay.liveSnapshot as WaveSnapshot | null)?.baseHealth ?? wave.preWaveBaseHealthRef?.current ?? BASE_MAX_HP)
    : (wave.isWaitingWaveActive || wave.countdown !== null)
      ? (wave.preWaveBaseHealthRef?.current ?? clientBaseHealthDisplay)
      : clientBaseHealthDisplay;

  // ── Early returns ──────────────────────────────────────────────────────────
  if (!account) return <MenuScreen mode="connect" onAction={undefined} />;
  if (isStartingGame) return <LoadingScreen />;
  if (!gameState) {
    return (
      <MenuScreen
        mode="new-game"
        selectedDifficulty={selectedDifficulty}
        onSelectDifficulty={setSelectedDifficulty}
        onAction={() => handleNewGame(selectedDifficulty)}
      />
    );
  }

  const displayGameState = {
    ...gameState,
    gold: displayGold,
    is_wave_active: isBusy,
    base_health: displayBaseHealth,
  };

  return (
    <div className="app-root">
      <ResourceBar gameState={displayGameState} />
      <WavePanel
        gameState={displayGameState}
        isWaveActive={isBusy}
        isCountingDown={wave.countdown !== null}
        overclockAvailable={!gameState.overclock_used && !overclockPending && !isBusy && displayGold >= OVERCLOCK_COST}
        onStartWave={() => wave.handleStartWave(isBusy, displayGold)}
        onOverclock={handleActivateOverclock}
      />
      <div className="app-layout">
        <GameBoard
          towers={allTowers}
          factories={allFactories}
          liveSnapshot={replay.liveSnapshot}
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
          onSellTower={handleSellTower}
          onSellFactory={handleSellFactory}
        />
      </div>
      <BuildMenu
        selected={selectedBuild}
        onSelect={(s) => { sfx.playClick(); setSelectedBuild(s); }}
        gameState={displayGameState}
      />

      {wave.countdown !== null && (
        <div className="app-countdown-overlay">
          <div key={wave.countdown} className="app-countdown-num">{wave.countdown}</div>
        </div>
      )}

      {wave.isWaitingWaveActive && (
        <div className="app-resolving-overlay">
          <div className="app-resolving-card">
            <div className="app-resolving-spinner" />
            <div className="app-resolving-text">CONFIRMING TX...</div>
          </div>
        </div>
      )}

      {replay.isReplaying && (
        <button className="app-speed-btn" onClick={replay.toggleReplaySpeed}>
          {replay.replaySpeed}X
        </button>
      )}

      <button className="app-mute-btn" onClick={toggleMute} title={isMuted ? 'Unmute music' : 'Mute music'}>
        {isMuted ? '🔇' : '🔊'}
      </button>

      {waveResult && !isBusy && (
        <WaveResultCard
          result={waveResult}
          gameStats={gameStats}
          onDismiss={() => setWaveResult(null)}
        />
      )}

      {gameOver && (
        <GameOverCard
          gameOver={gameOver}
          gameStats={gameStats}
          difficulty={gameState?.difficulty ?? selectedDifficulty}
          onPlayAgain={() => {
            setGameOver(null);
            setGameStats(EMPTY_STATS);
            setOverclockPending(false);
            clientBaseHealthInitRef.current = false;
            handleNewGame(gameState?.difficulty ?? selectedDifficulty);
          }}
        />
      )}

      {showTour && <GuidedTour onComplete={() => setShowTour(false)} />}

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
