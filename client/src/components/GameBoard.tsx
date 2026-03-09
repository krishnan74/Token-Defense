import { useEffect, useRef, useState } from 'react';
import {
  BASE_MAX_HP, BASE_X, BASE_Y, CONVEYOR_COLORS, FACTORIES,
  getTokenTier, GRID_H, GRID_W,
  PATH_WAYPOINTS, TOKEN_NAMES, TOWER_RANGE, VISION_RANGE_SQ, TOWERS,
} from '../constants';
import type { BuildSelection, Conveyor } from '../App';
import type { LiveEnemy, LiveTower, WaveSnapshot } from '../simulation/WaveSimulator';

const CELL = 64;

// ── Pixel art keyframes ────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes enemyBob {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-5px); }
  }
  @keyframes swarmFlicker {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.55; transform: scale(0.85); }
  }
  @keyframes towerGlow {
    0%, 100% { box-shadow: 3px 3px 0 var(--tw-dark); }
    50%       { box-shadow: 3px 3px 0 var(--tw-dark), 0 0 10px 3px var(--tw-color); }
  }
  @keyframes basePulse {
    0%, 100% { box-shadow: 4px 4px 0 #0A0500; }
    50%       { box-shadow: 4px 4px 0 #0A0500, 0 0 14px 4px rgba(255,215,0,0.35); }
  }
  @keyframes baseShake {
    0%, 100% { transform: translate(0, 0); }
    20%       { transform: translate(-4px, 2px); }
    40%       { transform: translate(4px, -3px); }
    60%       { transform: translate(-3px, 3px); }
    80%       { transform: translate(3px, -1px); }
  }
  @keyframes marchingAnts {
    to { stroke-dashoffset: -24; }
  }
  @keyframes conveyorPop {
    0%   { transform: scale(0.3); opacity: 0; }
    60%  { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(1);   opacity: 1; }
  }
  @keyframes highlightPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }
`;

// ── Path detection ─────────────────────────────────────────────────────────
function isPathTile(col: number, row: number): boolean {
  if (row === 1 && col >= 9 && col <= GRID_W - 1) return true;
  if (col === 9 && row >= 1 && row <= 3) return true;
  if (row === 3 && col >= 5 && col <= 9) return true;
  if (col === 5 && row >= 3 && row <= 6) return true;
  if (row === 6 && col >= 0 && col <= 5) return true;
  return false;
}

function getTileColor(col: number, row: number): string {
  if (col === BASE_X && row === BASE_Y) return '#3A1A0A';
  if (isPathTile(col, row)) {
    return (col + row) % 2 === 0 ? '#C49A5A' : '#B88A48';
  }
  return (col + row) % 2 === 0 ? '#5A9E2F' : '#4D8A26';
}

// ── Conveyor helpers ────────────────────────────────────────────────────────
function findNearestTower(
  col: number, row: number, towerList: unknown[], matchType?: number,
): { tower_id: string | number; x: number; y: number } | null {
  let best: { tower_id: string | number; x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const t of towerList as Array<{ tower_id: string | number; x: number; y: number; is_alive?: boolean; tower_type?: number }>) {
    if (t.is_alive === false) continue;
    if (matchType !== undefined && Number(t.tower_type) !== matchType) continue;
    const dx = Number(t.x) - col, dy = Number(t.y) - row;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}

function conveyorToSvgPath(conv: Conveyor, cell: number): string {
  const pts = [
    `${conv.fx * cell + cell / 2},${conv.fy * cell + cell / 2}`,
    ...conv.tiles.map((t) => `${t.x * cell + cell / 2},${t.y * cell + cell / 2}`),
    `${conv.tx * cell + cell / 2},${conv.ty * cell + cell / 2}`,
  ];
  return `M${pts[0]} ${pts.slice(1).map((p) => `L${p}`).join(' ')}`;
}

type TowerLike = { x: number; y: number; tower_type: number; is_alive?: boolean };

function hasSynergyNeighbor(tx: number, ty: number, ttype: number, allTowers: TowerLike[]): boolean {
  return allTowers.some((other) => {
    if (other.is_alive === false) return false;
    if (Number(other.tower_type) === ttype) return false;
    const dx = Math.abs(Number(other.x) - tx);
    const dy = Math.abs(Number(other.y) - ty);
    return dx + dy === 1;
  });
}

function isCellOccupied(col: number, row: number, towers: unknown[], factories: unknown[]): boolean {
  if (col === BASE_X && row === BASE_Y) return true;
  return (
    (towers    as Array<{ x: number; y: number; is_alive?: boolean }>).some((t) => t.is_alive !== false && Number(t.x) === col && Number(t.y) === row) ||
    (factories as Array<{ x: number; y: number; is_active?: boolean }>).some((f) => f.is_active !== false && Number(f.x) === col && Number(f.y) === row)
  );
}

// ── Tower ──────────────────────────────────────────────────────────────────
const TOWER_CFG: Record<number, { color: string; dark: string; text: string; label: string }> = {
  0: { color: '#2B6CB0', dark: '#1A3D70', text: '#BEE3F8', label: 'GPT' },
  1: { color: '#7B3FAD', dark: '#4A1A7A', text: '#E9D8FD', label: 'VIS' },
  2: { color: '#C05800', dark: '#7A3400', text: '#FEEBC8', label: 'COD' },
};

function TowerSprite({
  towerType, isAlive, ghost, attackFlash, level,
}: {
  towerType: number | string;
  isAlive?: boolean;
  ghost?: boolean;
  attackFlash?: boolean;
  level?: number;
}) {
  const cfg = TOWER_CFG[Number(towerType)] ?? TOWER_CFG[0];
  const sz  = CELL - 10;
  const lv  = level ?? 1;

  // Level 3: gold border accent; Level 2: brighter border
  const borderColor = lv === 3 ? '#FFD700' : lv === 2 ? cfg.color : cfg.dark;
  const borderWidth = lv === 3 ? 3 : lv === 2 ? 3 : 3;

  return (
    <div style={{
      width: sz, height: sz,
      background: cfg.color,
      border: `${borderWidth}px solid ${borderColor}`,
      borderRadius: 0,
      opacity: ghost ? 0.6 : isAlive === false ? 0.25 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
      position: 'relative', overflow: 'hidden',
      boxShadow: attackFlash
        ? `0 0 0 3px #fff, 0 0 0 5px ${cfg.color}, 3px 3px 0 ${cfg.dark}`
        : lv === 3
          ? `3px 3px 0 ${cfg.dark}, 0 0 6px 2px rgba(255,215,0,0.4)`
          : `3px 3px 0 ${cfg.dark}`,
      animation: ghost || isAlive === false ? 'none' : `towerGlow 2s steps(4) infinite`,
      '--tw-color': cfg.color,
      '--tw-dark': cfg.dark,
      imageRendering: 'pixelated',
      pointerEvents: 'none',
    } as React.CSSProperties}>
      {/* Battlements — more blocks per level */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', height: lv >= 2 ? 12 : 10 }}>
        {Array.from({ length: lv === 3 ? 6 : lv === 2 ? 5 : 4 }, (_, i) => (
          <div key={i} style={{
            flex: 1,
            background: i % 2 === 0
              ? (lv === 3 ? '#B8860B' : cfg.dark)
              : (lv === 3 ? '#FFD700' : cfg.color),
          }} />
        ))}
      </div>
      {/* Window(s) — level 2 adds second window, level 3 adds diamond */}
      {lv === 1 && (
        <div style={{
          position: 'absolute', top: 15, left: '50%', transform: 'translateX(-50%)',
          width: 12, height: 14, background: cfg.dark, opacity: 0.7,
        }} />
      )}
      {lv === 2 && (
        <div style={{ position: 'absolute', top: 15, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
          <div style={{ width: 9, height: 11, background: cfg.dark, opacity: 0.8 }} />
          <div style={{ width: 9, height: 11, background: cfg.dark, opacity: 0.8 }} />
        </div>
      )}
      {lv === 3 && (
        <>
          <div style={{ position: 'absolute', top: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 10, background: '#7EC8E3', opacity: 0.9 }} />
            <div style={{ width: 8, height: 10, background: '#7EC8E3', opacity: 0.9 }} />
          </div>
          {/* Gold diamond emblem */}
          <div style={{
            position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
            width: 7, height: 7, background: '#FFD700', opacity: 0.95,
          }} />
        </>
      )}
      <span style={{
        fontFamily: "'VT323', monospace", fontSize: 14, color: lv === 3 ? '#FFD700' : cfg.text,
        marginBottom: 4, position: 'relative', zIndex: 1,
        textShadow: lv === 3 ? '0 0 4px #FFD700, 1px 1px 0 #4A2510' : `1px 1px 0 ${cfg.dark}`,
      }}>{cfg.label}</span>
    </div>
  );
}

// ── Factory ────────────────────────────────────────────────────────────────
const FACTORY_CFG: Record<number, { color: string; dark: string; accent: string; label: string }> = {
  0: { color: '#1A6FAF', dark: '#0D3A6A', accent: '#BEE3F8', label: 'INP' },
  1: { color: '#2A7A2A', dark: '#144014', accent: '#C6F6C6', label: 'IMG' },
  2: { color: '#AF3A1A', dark: '#6A1D0A', accent: '#FED7AA', label: 'COD' },
};

function FactorySprite({
  factoryType, level, ghost, isActive,
}: {
  factoryType: number | string;
  level: number;
  ghost?: boolean;
  isActive?: boolean;
}) {
  const cfg = FACTORY_CFG[Number(factoryType)] ?? FACTORY_CFG[0];
  const sz  = CELL - 16;
  const lv  = level ?? 1;
  const soldOpacity = isActive === false ? 0.25 : 1;

  // Level 3: gold border
  const borderColor = lv === 3 ? '#FFD700' : cfg.dark;

  return (
    <div style={{ position: 'relative', width: sz, height: sz, opacity: soldOpacity }}>
      {/* Chimney right (all levels) */}
      <div style={{
        position: 'absolute', right: 7, top: lv >= 2 ? -14 : -10,
        width: 9, height: lv >= 2 ? 18 : 14,
        background: cfg.dark,
        border: `2px solid ${cfg.dark}`,
      }} />
      {/* Chimney left (level 2+) */}
      {lv >= 2 && (
        <div style={{
          position: 'absolute', left: 7, top: -11,
          width: 9, height: 15,
          background: cfg.dark,
          border: `2px solid ${cfg.dark}`,
        }} />
      )}
      {/* Smoke puffs on level 3 chimneys */}
      {lv === 3 && (
        <>
          <div style={{
            position: 'absolute', right: 6, top: -20,
            width: 10, height: 10,
            borderRadius: '50%',
            background: 'rgba(200,200,200,0.55)',
          }} />
          <div style={{
            position: 'absolute', left: 6, top: -19,
            width: 10, height: 10,
            borderRadius: '50%',
            background: 'rgba(200,200,200,0.45)',
          }} />
        </>
      )}
      {/* Body */}
      <div style={{
        position: 'absolute', inset: 0,
        background: cfg.color,
        border: `3px solid ${borderColor}`,
        borderRadius: 0,
        opacity: ghost ? 0.6 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        boxShadow: lv === 3
          ? `3px 3px 0 ${cfg.dark}, 0 0 5px 1px rgba(255,215,0,0.3)`
          : `3px 3px 0 ${cfg.dark}`,
        pointerEvents: 'none',
      }}>
        {/* Windows — more per level */}
        <div style={{ display: 'flex', gap: lv >= 3 ? 3 : 4, marginBottom: 3 }}>
          {Array.from({ length: lv === 3 ? 3 : 2 }, (_, i) => (
            <div key={i} style={{
              width: lv === 3 ? 6 : 8, height: lv === 3 ? 6 : 8,
              background: lv === 3 ? '#7EC8E3' : cfg.dark,
              opacity: lv === 3 ? 0.9 : 0.6,
            }} />
          ))}
        </div>
        <span style={{ fontFamily: "'VT323', monospace", fontSize: 13, color: lv === 3 ? '#FFD700' : cfg.accent, lineHeight: 1 }}>{cfg.label}</span>
        {!ghost && (
          <span style={{
            fontFamily: "'VT323', monospace", fontSize: 11,
            color: lv === 3 ? '#FFD700' : cfg.accent,
            opacity: lv === 3 ? 1 : 0.75,
          }}>L{lv}</span>
        )}
      </div>
    </div>
  );
}

// ── Base ───────────────────────────────────────────────────────────────────
function BaseSprite({ health, maxHp, shake }: { health: number; maxHp: number; shake: boolean }) {
  const pct      = maxHp > 0 ? health / maxHp : 0;
  const hpColor  = pct > 0.6 ? '#5CB85C' : pct > 0.3 ? '#F0AD4E' : '#D9534F';
  const sz = CELL - 4;
  return (
    <div style={{
      width: sz, height: sz,
      background: '#6B3A2A',
      border: `4px solid #3A1A0A`,
      borderRadius: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      animation: shake ? 'baseShake 0.35s steps(4) ease-out, basePulse 2s steps(4) infinite' : 'basePulse 2s steps(4) infinite',
      pointerEvents: 'none',
    }}>
      {/* Battlements */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', height: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, background: i % 2 === 0 ? '#3A1A0A' : '#6B3A2A' }} />
        ))}
      </div>
      {/* Door */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 14, height: 18, background: '#1A0800',
        borderTop: '2px solid #4A1A00',
      }} />
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 11, color: '#A08060', marginTop: 8, letterSpacing: 1 }}>FORT</span>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 13, color: hpColor, textShadow: `1px 1px 0 #000` }}>
        {health}/{maxHp}
      </span>
      {/* HP bar */}
      <div style={{ position: 'absolute', bottom: 19, left: 4, right: 4, height: 4, background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: hpColor, transition: 'width 0.2s' }} />
      </div>
    </div>
  );
}

// ── Enemies ────────────────────────────────────────────────────────────────
const ENEMY_CFG: Record<string, {
  fill: string; border: string; sz: number; anim: string; label: string; round: boolean;
}> = {
  TextJailbreak:   { fill: '#CC1111', border: '#660000', sz: 32, anim: 'enemyBob 0.8s steps(3) infinite',    label: '?!', round: false },
  ContextOverflow: { fill: '#8B4513', border: '#4A1A00', sz: 42, anim: 'enemyBob 1.5s steps(2) infinite',    label: '∞',  round: false },
  HalluSwarm:      { fill: '#8800CC', border: '#440066', sz: 20, anim: 'swarmFlicker 0.5s steps(2) infinite', label: '~',  round: true  },
  Boss:            { fill: '#111111', border: '#FF2200', sz: 58, anim: 'enemyBob 2.0s steps(2) infinite',    label: '☠',  round: false },
};

function EnemySprite({ enemy }: { enemy: LiveEnemy }) {
  const cfg  = ENEMY_CFG[enemy.type] ?? ENEMY_CFG.TextJailbreak;
  const hpPct = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
  return (
    <div style={{ position: 'relative', width: cfg.sz, height: cfg.sz }}>
      <div style={{
        width: cfg.sz, height: cfg.sz,
        background: cfg.fill,
        border: `2px solid ${cfg.border}`,
        borderRadius: cfg.round ? '50%' : 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: cfg.anim,
        filter: enemy.hitFlash > 0 ? 'brightness(3) saturate(0)' : 'none',
        boxShadow: `2px 2px 0 ${cfg.border}`,
        imageRendering: 'pixelated',
      }}>
        <span style={{
          fontFamily: "'VT323', monospace",
          fontSize: cfg.sz < 26 ? 10 : 14,
          color: '#fff',
          textShadow: `1px 1px 0 ${cfg.border}`,
        }}>{cfg.label}</span>
      </div>
      {/* HP bar */}
      <div style={{ position: 'absolute', bottom: -6, left: 0, width: cfg.sz, height: 3, background: 'rgba(0,0,0,0.5)' }}>
        <div style={{
          width: `${hpPct * 100}%`, height: '100%',
          background: hpPct > 0.5 ? '#5CB85C' : hpPct > 0.25 ? '#F0AD4E' : '#D9534F',
        }} />
      </div>
    </div>
  );
}

// ── Ghost preview ──────────────────────────────────────────────────────────
function GhostPreview({ selectedBuild, valid, hasSynergy }: { selectedBuild: BuildSelection; valid: boolean; hasSynergy?: boolean }) {
  const borderColor = hasSynergy && valid ? '#FFD700' : valid ? '#5A9E2F' : '#CC1111';
  const bgColor     = hasSynergy && valid ? 'rgba(255,215,0,0.14)' : valid ? 'rgba(90,158,47,0.18)' : 'rgba(204,17,17,0.18)';
  return (
    <div style={{
      position: 'absolute', inset: 2,
      border: `3px dashed ${borderColor}`,
      background: bgColor,
      pointerEvents: 'none', zIndex: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {selectedBuild.type === 'tower'
        ? <TowerSprite towerType={selectedBuild.id} ghost />
        : <FactorySprite factoryType={selectedBuild.id} level={1} ghost />}
      {hasSynergy && valid && (
        <div style={{
          position: 'absolute', top: 1, right: 3,
          fontFamily: "'VT323', monospace", fontSize: 13, color: '#FFD700',
          textShadow: '0 0 4px #FFD700',
          pointerEvents: 'none',
        }}>⚡</div>
      )}
    </div>
  );
}

// ── Path polyline ──────────────────────────────────────────────────────────
const VISIBLE_PATH = PATH_WAYPOINTS.map((wp) => ({
  x: Math.min(wp.x, GRID_W) * CELL + CELL / 2,
  y: wp.y * CELL + CELL / 2,
}));
const PATH_STR = VISIBLE_PATH.map((p) => `${p.x},${p.y}`).join(' ');

// ── GameBoard ──────────────────────────────────────────────────────────────
interface GameBoardProps {
  towers: unknown[];
  factories: unknown[];
  liveSnapshot: WaveSnapshot | null;
  selectedBuild: BuildSelection | null;
  onCellClick: (col: number, row: number) => void;
  isWaveActive: boolean;
  baseHealth: number;
  conveyors: Conveyor[];
  gold?: number;
  highlightedEntityId?: string | null;
}

export default function GameBoard({
  towers, factories, liveSnapshot, selectedBuild, onCellClick, isWaveActive, baseHealth, conveyors, gold, highlightedEntityId,
}: GameBoardProps) {
  const [hoveredCell, setHoveredCell] = useState<{ col: number; row: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const containerRef   = useRef<HTMLDivElement | null>(null);
  const [shakeActive, setShakeActive] = useState(false);
  const lastShakePulse = useRef(0);

  // Track container size so the board auto-fits
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const pulse = liveSnapshot?.screenShakePulse ?? 0;
    if (pulse > lastShakePulse.current) {
      lastShakePulse.current = pulse;
      setShakeActive(true);
      const t = setTimeout(() => setShakeActive(false), 380);
      return () => clearTimeout(t);
    }
  }, [liveSnapshot]);

  const enemies    = liveSnapshot?.enemies?.filter((e) => e.alive) ?? [];
  const liveTowers = (liveSnapshot?.towers ?? towers) as LiveTower[];
  const displayBaseHealth = liveSnapshot?.baseHealth ?? baseHealth ?? BASE_MAX_HP;

  // ── Synergy computation ─────────────────────────────────────────────────
  const towersTyped: TowerLike[] = liveTowers.map((t) => ({
    x: Number(t.x), y: Number(t.y),
    tower_type: Number(t.tower_type),
    is_alive: t.is_alive,
  }));
  const synergyIds = new Set(
    liveTowers
      .filter((t) => t.is_alive !== false && hasSynergyNeighbor(Number(t.x), Number(t.y), Number(t.tower_type), towersTyped))
      .map((t) => String(t.tower_id)),
  );
  const hoverSynergy = hoveredCell && selectedBuild?.type === 'tower'
    ? hasSynergyNeighbor(hoveredCell.col, hoveredCell.row, selectedBuild.id, towersTyped)
    : false;

  const hoveredOccupied = hoveredCell
    && isCellOccupied(hoveredCell.col, hoveredCell.row, liveTowers, factories);
  const canAfford = !selectedBuild || selectedBuild.type === 'tower'
    ? true
    : (gold ?? 0) >= (FACTORIES[selectedBuild.id]?.cost ?? 0);
  const canPlace = !!hoveredCell && !!selectedBuild && !isWaveActive && !hoveredOccupied
    && !isPathTile(hoveredCell.col, hoveredCell.row) && canAfford;

  // Auto-fit: scale the board to fill the container exactly — no manual zoom
  const BOARD_W = GRID_W * CELL;
  const BOARD_H = GRID_H * CELL;
  const totalScale = containerSize.w && containerSize.h
    ? Math.min(containerSize.w / BOARD_W, containerSize.h / BOARD_H)
    : 1;

  // Center the scaled board inside the container
  const scaledW = BOARD_W * totalScale;
  const scaledH = BOARD_H * totalScale;
  const offsetX = Math.max(0, (containerSize.w - scaledW) / 2);
  const offsetY = Math.max(0, (containerSize.h - scaledH) / 2);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', background: '#1A0D05', position: 'relative' }}
    >
      
      <style id="td-keyframes">{KEYFRAMES}</style>

      <div style={{
        position: 'absolute',
        left: offsetX, top: offsetY,
        width: scaledW, height: scaledH,
        overflow: 'hidden',
      }}>
        <div style={{
          transform: `scale(${totalScale})`, transformOrigin: '0 0',
          position: 'absolute',
          width: BOARD_W, height: BOARD_H,
        }}>

          {/* ── Grid tiles ── */}
          {Array.from({ length: GRID_H }, (_, row) =>
            Array.from({ length: GRID_W }, (_, col) => {
              const isHov = hoveredCell?.col === col && hoveredCell?.row === row;
              return (
                <div
                  key={`t-${col}-${row}`}
                  onMouseEnter={() => setHoveredCell({ col, row })}
                  onMouseLeave={() => setHoveredCell(null)}
                  onClick={() => onCellClick(col, row)}
                  style={{
                    position: 'absolute', left: col * CELL, top: row * CELL,
                    width: CELL, height: CELL,
                    background: getTileColor(col, row),
                    border: '1px solid rgba(0,0,0,0.2)',
                    boxSizing: 'border-box',
                    cursor: selectedBuild && !isWaveActive ? 'crosshair' : 'default',
                    outline: isHov && selectedBuild && !isWaveActive
                      ? `3px solid ${canPlace ? '#FFD700' : '#CC1111'}` : 'none',
                    outlineOffset: '-3px', zIndex: 0,
                    imageRendering: 'pixelated',
                  }}
                >
                  {isHov && selectedBuild && !isWaveActive && (
                    <GhostPreview selectedBuild={selectedBuild} valid={canPlace} hasSynergy={canPlace && hoverSynergy} />
                  )}
                </div>
              );
            })
          )}

          {/* ── SVG layer: path line, projectiles, tower range hint ── */}
          <svg
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
            width={GRID_W * CELL} height={GRID_H * CELL}
          >
            {/* Path indicator dashes */}
            <polyline
              points={PATH_STR} fill="none"
              stroke="rgba(180,100,30,0.5)" strokeWidth={3}
              strokeDasharray="8,6" strokeLinecap="round" strokeLinejoin="round"
            />

            {/* Tower range circle on hover — Vision towers have smaller range (2 vs 3) */}
            {hoveredCell && selectedBuild?.type === 'tower' && !isWaveActive && (() => {
              const isVision = selectedBuild.id === 1;
              const rangeRadius = isVision ? Math.sqrt(VISION_RANGE_SQ) * CELL : TOWER_RANGE * CELL;
              return (
                <circle
                  cx={(hoveredCell.col + 0.5) * CELL}
                  cy={(hoveredCell.row + 0.5) * CELL}
                  r={rangeRadius}
                  fill={hoverSynergy ? 'rgba(255,215,0,0.13)' : 'rgba(255,215,0,0.07)'}
                  stroke={hoverSynergy ? 'rgba(255,215,0,0.9)' : 'rgba(255,215,0,0.55)'}
                  strokeWidth={hoverSynergy ? 3 : 2}
                  strokeDasharray="8,5"
                />
              );
            })()}

            {/* Range ring on hover over a placed tower (no build selected) */}
            {hoveredCell && !selectedBuild && !isWaveActive && (() => {
              const ht = liveTowers.find((t) =>
                t.is_alive !== false && Number(t.x) === hoveredCell.col && Number(t.y) === hoveredCell.row,
              );
              if (!ht) return null;
              const isVision = Number(ht.tower_type) === 1;
              const rangeRadius = isVision ? Math.sqrt(VISION_RANGE_SQ) * CELL : TOWER_RANGE * CELL;
              return (
                <circle
                  cx={(hoveredCell.col + 0.5) * CELL}
                  cy={(hoveredCell.row + 0.5) * CELL}
                  r={rangeRadius}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={2}
                  strokeDasharray="8,5"
                />
              );
            })()}

            {/* Projectiles */}
            {liveSnapshot?.projectiles?.map((p) => {
              const x1 = p.fromX * CELL, y1 = p.fromY * CELL;
              const x2 = p.toX  * CELL, y2 = p.toY  * CELL;
              const cx = x1 + (x2 - x1) * p.progress;
              const cy = y1 + (y2 - y1) * p.progress;
              return (
                <g key={p.id}>
                  <circle cx={cx} cy={cy} r={5} fill={p.color} opacity={0.95} />
                  <circle cx={cx} cy={cy} r={8} fill={p.color} opacity={0.25} />
                </g>
              );
            })}

            {/* Marching-ants link to nearest tower when hovering factory placement */}
            {hoveredCell && selectedBuild?.type === 'factory' && !isWaveActive && (() => {
              // Only link to towers of matching token type (factory type index === tower type index)
              const nearest = findNearestTower(hoveredCell.col, hoveredCell.row, towers, selectedBuild.id);
              if (!nearest) return null;
              const convColor = CONVEYOR_COLORS[selectedBuild.id] ?? '#888';
              const sx = (hoveredCell.col + 0.5) * CELL, sy = (hoveredCell.row + 0.5) * CELL;
              const ex = (Number(nearest.x) + 0.5) * CELL, ey = (Number(nearest.y) + 0.5) * CELL;
              const tokenProd = FACTORIES[selectedBuild.id]?.baseOutput ?? 0;
              return (
                <g key="hover-link">
                  <line
                    x1={sx} y1={sy} x2={ex} y2={ey}
                    stroke={convColor} strokeWidth={3} strokeDasharray="8,6" opacity={0.85}
                    style={{ animation: 'marchingAnts 0.5s linear infinite' }}
                  />
                  <rect
                    x={ex - 36} y={ey - CELL * 0.85}
                    width={72} height={20}
                    fill="rgba(0,0,0,0.7)" rx={0}
                  />
                  <text
                    x={ex} y={ey - CELL * 0.85 + 14}
                    textAnchor="middle"
                    fill={convColor}
                    fontFamily="'VT323', monospace" fontSize={15}
                  >+{tokenProd}/wave</text>
                </g>
              );
            })()}

            {/* Token particles traveling along conveyors during wave */}
            {isWaveActive && conveyors
              .filter((c) => c.revealedCount >= c.tiles.length)
              .map((conv) => {
                const pathD = conveyorToSvgPath(conv, CELL);
                return (
                  <g key={`tkp-${conv.id}`}>
                    {([0, 0.38, 0.72] as number[]).map((off, i) => (
                      <circle key={i} r={4} fill={conv.color} opacity={0.9}>
                        <animateMotion
                          dur="2.2s"
                          begin={`${-off * 2.2}s`}
                          repeatCount="indefinite"
                          path={pathD}
                        />
                      </circle>
                    ))}
                  </g>
                );
              })}
          </svg>

          {/* ── Conveyor tiles ── */}
          {conveyors.flatMap((conv) => {
            const xs = Math.sign(conv.tx - conv.fx);
            const ys = Math.sign(conv.ty - conv.fy);
            // Arrow chars based on factory→tower direction
            const hArrow = xs > 0 ? '→' : '←';
            const vArrow = ys > 0 ? '↓' : '↑';

            return conv.tiles.slice(0, conv.revealedCount).map((tile, idx) => {
              const isNew = idx === conv.revealedCount - 1;
              const isV   = tile.dir === 'V';
              const isC   = tile.dir === 'C';

              // Dimensions: H = wide strip, V = tall strip, C = corner square
              const w = isC ? CELL * 0.38 : isV ? CELL * 0.30 : CELL * 0.88;
              const h = isC ? CELL * 0.38 : isV ? CELL * 0.88 : CELL * 0.30;
              const left = tile.x * CELL + (CELL - w) / 2;
              const top  = tile.y * CELL + (CELL - h) / 2;

              // Rail groove gradient: dark edge → color → dark edge
              const grad = isV
                ? `linear-gradient(to right, rgba(0,0,0,0.45) 0%, ${conv.color} 25%, ${conv.color} 75%, rgba(0,0,0,0.45) 100%)`
                : `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, ${conv.color} 25%, ${conv.color} 75%, rgba(0,0,0,0.45) 100%)`;

              const arrowLabel = isC ? '' : isV ? vArrow : hArrow;

              return (
                <div
                  key={`ct-${conv.id}-${idx}`}
                  style={{
                    position: 'absolute', left, top, width: w, height: h,
                    background: grad,
                    border: `1px solid rgba(0,0,0,0.5)`,
                    boxShadow: `1px 1px 0 rgba(0,0,0,0.4)`,
                    zIndex: 1, pointerEvents: 'none',
                    transformOrigin: 'center',
                    animation: isNew ? 'conveyorPop 0.35s steps(4) forwards' : 'none',
                    imageRendering: 'pixelated',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {arrowLabel && (
                    <span style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: Math.min(w, h) * 0.85,
                      color: 'rgba(255,255,255,0.55)',
                      lineHeight: 1,
                      userSelect: 'none',
                      textShadow: '0 0 3px rgba(0,0,0,0.7)',
                      pointerEvents: 'none',
                    }}>
                      {arrowLabel}
                    </span>
                  )}
                </div>
              );
            });
          })}

          {/* ── Base ── */}
          <div style={{ position: 'absolute', left: BASE_X * CELL + 2, top: BASE_Y * CELL + 2, zIndex: 3, pointerEvents: 'none' }}>
            <BaseSprite health={displayBaseHealth} maxHp={BASE_MAX_HP} shake={shakeActive} />
          </div>

          {/* ── Factories ── */}
          {(factories as Array<{ factory_id: string | number; x: number; y: number; factory_type: number; level: number; is_active?: boolean }>)
          .filter((f) => !isWaveActive || f.is_active !== false)
          .map((f) => {
            const fIsHighlighted = highlightedEntityId === `factory-${String(f.factory_id)}`;
            return (
              <div key={`f-${f.factory_id}`} style={{ position: 'absolute', left: Number(f.x) * CELL + 8, top: Number(f.y) * CELL + 10, zIndex: 2, pointerEvents: 'none' }}>
                <FactorySprite factoryType={f.factory_type} level={Number(f.level)} isActive={f.is_active} />
                {fIsHighlighted && (
                  <div style={{
                    position: 'absolute', inset: -4,
                    border: '2px solid #00E5FF',
                    boxShadow: '0 0 10px 2px #00E5FF, 0 0 4px 1px #00E5FF',
                    animation: 'highlightPulse 0.8s steps(2) infinite',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            );
          })}

          {/* ── Towers ── */}
          {liveTowers.map((t) => {
            const liveT      = liveSnapshot?.towers?.find((lt) => lt.tower_id === t.tower_id);
            const attackFlash = liveT ? liveT.attackFlash > 0 : false;

            // Tier badge for token level (shown as border color during replay)
            const tier = liveSnapshot?.tokens && liveSnapshot.maxTokens
              ? (() => {
                  const def = TOWERS[Number(t.tower_type)];
                  const key = TOKEN_NAMES[def?.tokenType ?? 0] as keyof typeof liveSnapshot.tokens;
                  return getTokenTier(liveSnapshot.tokens[key] ?? 0, liveSnapshot.maxTokens[key] ?? 0);
                })()
              : null;

            const hasSync = synergyIds.has(String(t.tower_id));
            const tIsHighlighted = highlightedEntityId === `tower-${String(t.tower_id)}`;
            return (
              <div
                key={`tw-${t.tower_id}`}
                style={{
                  position: 'absolute',
                  left: Number(t.x) * CELL + 5,
                  top:  Number(t.y) * CELL + 5,
                  zIndex: 3, pointerEvents: 'none',
                  outline: tIsHighlighted ? '2px solid #00E5FF' : hasSync ? '2px solid #FFD700' : tier ? `2px solid ${tier.color}` : 'none',
                  outlineOffset: 2,
                  boxShadow: tIsHighlighted ? '0 0 12px 3px #00E5FF, 0 0 4px 1px #00E5FF' : hasSync ? '0 0 8px 2px rgba(255,215,0,0.35)' : 'none',
                }}
              >
                <TowerSprite towerType={t.tower_type} isAlive={t.is_alive} attackFlash={attackFlash} level={Number(t.level) || 1} />
                {tIsHighlighted && (
                  <div style={{
                    position: 'absolute', inset: -4,
                    animation: 'highlightPulse 0.8s steps(2) infinite',
                    pointerEvents: 'none',
                  }} />
                )}
                {hasSync && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    fontFamily: "'VT323', monospace", fontSize: 13, color: '#FFD700',
                    textShadow: '0 0 5px #FFD700',
                    lineHeight: 1, padding: '0 1px',
                    pointerEvents: 'none',
                  }}>⚡</div>
                )}
              </div>
            );
          })}

          {/* ── Enemies ── */}
          {enemies.map((e: LiveEnemy) => {
            const cfg = ENEMY_CFG[e.type] ?? ENEMY_CFG.TextJailbreak;
            const sx  = e.x * CELL + (CELL - cfg.sz) / 2;
            const sy  = e.y * CELL + (CELL - cfg.sz) / 2 - 4;
            if (sx < -(CELL * 2) || sx > GRID_W * CELL + CELL) return null;
            return (
              <div key={`e-${e.id}`} style={{ position: 'absolute', left: sx, top: sy, zIndex: 4, pointerEvents: 'none' }}>
                <EnemySprite enemy={e} />
              </div>
            );
          })}

          {/* ── Particles ── */}
          {liveSnapshot?.particles?.map((p) => {
            const alpha = Math.max(0, 1 - p.age / p.maxAge);
            const sz    = Math.max(3, Math.round(8 * (1 - p.age / p.maxAge)));
            return (
              <div key={p.id} style={{
                position: 'absolute',
                left: p.x * CELL - sz / 2, top: p.y * CELL - sz / 2,
                width: sz, height: sz,
                background: p.color, opacity: alpha,
                pointerEvents: 'none', zIndex: 6,
              }} />
            );
          })}

          {/* ── Floating texts ── */}
          {liveSnapshot?.floatingTexts?.map((ft) => {
            const alpha = Math.max(0, 1 - ft.age / ft.maxAge);
            return (
              <div key={ft.id} style={{
                position: 'absolute',
                left: ft.x * CELL, top: ft.y * CELL,
                transform: 'translate(-50%, -50%)',
                color: ft.color,
                fontFamily: "'VT323', monospace", fontSize: 16, fontWeight: 'normal',
                pointerEvents: 'none', zIndex: 7, opacity: alpha,
                textShadow: '1px 1px 0 rgba(0,0,0,0.8)', userSelect: 'none', whiteSpace: 'nowrap',
              }}>
                {ft.text}
              </div>
            );
          })}

        </div>  {/* end transform div */}
      </div>    {/* end positioned/clipped div */}
    </div>   
  );
}
