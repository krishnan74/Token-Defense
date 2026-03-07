import { useEffect, useRef, useState } from 'react';
import gptAttackSrc  from '../../assets/images/gpt_tower_attack.png';
import gptIdleSrc    from '../../assets/images/gpt_tower_idle.png';
import gptCoolingSrc from '../../assets/images/gpt_tower_cooling.png';
import {
  BASE_MAX_HP, BASE_X, BASE_Y,
  getTokenTier, GRID_H, GRID_W,
  PATH_WAYPOINTS, TOKEN_NAMES, TOWERS,
} from '../constants';
import type { BuildSelection } from '../App';
import type { LiveEnemy, LiveTower, WaveSnapshot } from '../simulation/WaveSimulator';

const CELL_SIZE = 64;
const GPT_DISPLAY_W = 64;

const GPT_SPRITES = {
  idle:    { src: gptIdleSrc,    frames: 5, totalW: 669, totalH: 373, fps: 8  },
  attack:  { src: gptAttackSrc,  frames: 7, totalW: 668, totalH: 373, fps: 18 },
  cooling: { src: gptCoolingSrc, frames: 7, totalW: 669, totalH: 373, fps: 10 },
} as const;

type AnimState = keyof typeof GPT_SPRITES;

const KEYFRAMES = `
  @keyframes towerPulse {
    0%, 100% { box-shadow: 0 3px 10px rgba(0,0,0,0.25), 0 0  8px 2px var(--glow-color); }
    50%       { box-shadow: 0 3px 10px rgba(0,0,0,0.25), 0 0 18px 6px var(--glow-color); }
  }
  @keyframes enemyBob {
    0%, 100% { transform: translateY(0px);  }
    50%       { transform: translateY(-5px); }
  }
  @keyframes swarmFlicker {
    0%, 100% { opacity: 1;   transform: translateY(0px) scale(1);   }
    33%       { opacity: 0.6; transform: translateY(-3px) scale(0.9); }
    66%       { opacity: 0.9; transform: translateY(2px) scale(1.05); }
  }
  @keyframes circuitDot {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.9; }
  }
  @keyframes factoryShimmer {
    0%   { background-position: -100% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes basePulse {
    0%, 100% { box-shadow: 0 0 12px 3px rgba(76,175,80,0.35); }
    50%       { box-shadow: 0 0 22px 8px rgba(76,175,80,0.55); }
  }
  @keyframes baseShake {
    0%, 100% { transform: translate(0,0); }
    15%       { transform: translate(-5px, 2px); }
    35%       { transform: translate(5px,-3px); }
    55%       { transform: translate(-4px, 4px); }
    75%       { transform: translate(4px,-2px); }
  }
`;

function getTileColor(col: number, row: number): string {
  const h = ((col * 17 + row * 31) ^ (col * row + 7)) % 100;
  const isLane = row >= 1 && row <= 6;
  if (isLane) {
    if (h < 10) return '#BCAAA4';
    if (h < 35) return '#D7CCC8';
    return '#CFD8DC';
  }
  if (h < 6)  return '#558B2F';
  if (h < 22) return '#689F38';
  if (h < 48) return '#7CB342';
  return '#8BC34A';
}

function isCellOccupied(col: number, row: number, towers: unknown[], factories: unknown[]): boolean {
  if (col === BASE_X && row === BASE_Y) return true;
  return (
    (towers as Array<{ x: number; y: number }>).some((t) => Number(t.x) === col && Number(t.y) === row) ||
    (factories as Array<{ x: number; y: number }>).some((f) => Number(f.x) === col && Number(f.y) === row)
  );
}

function GPTTowerSprite({ isAlive, attackFlash }: { isAlive: boolean | undefined; attackFlash: boolean }) {
  const [animState, setAnimState] = useState<AnimState>('idle');
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const prevFlash = useRef(false);

  useEffect(() => {
    if (attackFlash && !prevFlash.current) {
      frameRef.current = 0;
      setFrame(0);
      setAnimState('attack');
    }
    prevFlash.current = attackFlash;
  }, [attackFlash]);

  useEffect(() => {
    const spr = GPT_SPRITES[animState];
    const id = setInterval(() => {
      const next = frameRef.current + 1;
      if (next >= spr.frames) {
        frameRef.current = 0;
        setFrame(0);
        if (animState === 'attack') setAnimState('cooling');
        else if (animState === 'cooling') setAnimState('idle');
      } else {
        frameRef.current = next;
        setFrame(next);
      }
    }, 1000 / spr.fps);
    return () => clearInterval(id);
  }, [animState]);

  const spr = GPT_SPRITES[animState];
  const displayH = Math.round(spr.totalH * GPT_DISPLAY_W / (spr.totalW / spr.frames));

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: GPT_DISPLAY_W, height: displayH,
      backgroundImage: `url(${spr.src})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${spr.frames * GPT_DISPLAY_W}px auto`,
      backgroundPosition: `-${frame * GPT_DISPLAY_W}px 0px`,
      opacity: isAlive === false ? 0.3 : 1,
      imageRendering: 'pixelated',
      pointerEvents: 'none',
    }} />
  );
}

const TOWER_CFG: Record<number, { grad: string; glow: string; accent: string; label: string; dot: string }> = {
  0: { grad: 'linear-gradient(135deg,#1565C0 0%,#00897B 100%)', glow: '#4CAF5066', accent: '#4CAF50', label: 'GPT', dot: '#69F0AE' },
  1: { grad: 'linear-gradient(135deg,#6A1B9A 0%,#AD1457 100%)', glow: '#CE93D866', accent: '#CE93D8', label: 'VIS', dot: '#EA80FC' },
  2: { grad: 'linear-gradient(135deg,#212121 0%,#37474F 100%)', glow: '#FFC10766', accent: '#FFC107', label: '</>', dot: '#FFD740' },
};

interface TowerSpriteProps {
  towerType: number | string;
  isAlive?: boolean;
  tier?: { color: string } | null;
  ghost?: boolean;
  attackFlash?: boolean;
}

function TowerSprite({ towerType, isAlive, tier, ghost, attackFlash }: TowerSpriteProps) {
  const cfg = TOWER_CFG[Number(towerType)] ?? TOWER_CFG[0];
  const borderColor = tier?.color ?? 'rgba(255,255,255,0.25)';
  const glowColor   = ghost ? 'transparent' : (tier?.color ?? cfg.glow);
  const sz = CELL_SIZE - 10;
  return (
    <div style={{
      width: sz, height: sz,
      background: cfg.grad, borderRadius: 10,
      border: `2px solid ${borderColor}`,
      opacity: ghost ? 0.55 : (isAlive === false ? 0.3 : 1),
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      animation: ghost || isAlive === false ? 'none' : 'towerPulse 2.4s ease-in-out infinite',
      '--glow-color': glowColor,
      filter: attackFlash ? 'brightness(2.5) saturate(1.5)' : 'none',
      transition: 'border-color 0.4s, filter 0.06s',
      pointerEvents: 'none',
    } as React.CSSProperties}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle, ${cfg.dot}44 1.5px, transparent 1.5px)`,
        backgroundSize: '13px 13px',
        animation: ghost ? 'none' : 'circuitDot 3s ease-in-out infinite',
      }} />
      <span style={{
        fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold',
        color: cfg.accent, position: 'relative', zIndex: 1,
        textShadow: `0 0 8px ${cfg.accent}`, letterSpacing: 0.5,
      }}>{cfg.label}</span>
    </div>
  );
}

const FACTORY_CFG: Record<number, { bg: string; stripe: string; accent: string; label: string }> = {
  0: { bg: '#0277BD', stripe: '#B3E5FC', accent: '#E1F5FE', label: 'INP' },
  1: { bg: '#2E7D32', stripe: '#C8E6C9', accent: '#E8F5E9', label: 'IMG' },
  2: { bg: '#BF360C', stripe: '#FFCCBC', accent: '#FBE9E7', label: 'COD' },
};

function FactorySprite({ factoryType, level, ghost }: { factoryType: number | string; level: number; ghost?: boolean }) {
  const cfg = FACTORY_CFG[Number(factoryType)] ?? FACTORY_CFG[0];
  const sz = CELL_SIZE - 14;
  return (
    <div style={{
      width: sz, height: sz, background: cfg.bg, borderRadius: 6,
      border: `1.5px solid ${cfg.stripe}88`,
      opacity: ghost ? 0.55 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      boxShadow: ghost ? 'none' : '0 2px 8px rgba(0,0,0,0.2)',
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `repeating-linear-gradient(100deg, transparent 0%, transparent 45%, ${cfg.stripe}33 50%, transparent 55%, transparent 100%)`,
        backgroundSize: '200% 100%',
        animation: ghost ? 'none' : 'factoryShimmer 2.5s linear infinite',
      }} />
      <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', color: cfg.accent, position: 'relative', zIndex: 1, letterSpacing: 0.4 }}>{cfg.label}</span>
      {!ghost && <span style={{ fontFamily: 'monospace', fontSize: 8, color: cfg.stripe, position: 'relative', zIndex: 1, marginTop: 1 }}>Lv{level}</span>}
    </div>
  );
}

function BaseSprite({ health, maxHp, shake }: { health: number; maxHp: number; shake: boolean }) {
  const pct = maxHp > 0 ? health / maxHp : 0;
  const hpColor = pct > 0.6 ? '#4CAF50' : pct > 0.3 ? '#FFA726' : '#EF5350';
  const sz = CELL_SIZE - 4;
  return (
    <div style={{
      width: sz, height: sz,
      background: 'linear-gradient(135deg, #455A64, #263238)',
      borderRadius: 10, border: `2.5px solid ${hpColor}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 16px ${hpColor}44, 0 2px 8px rgba(0,0,0,0.4)`,
      position: 'relative',
      animation: shake ? 'baseShake 0.3s ease-out, basePulse 2s ease-in-out infinite' : 'basePulse 2s ease-in-out infinite',
      pointerEvents: 'none',
    }}>
      <span style={{ fontFamily: 'monospace', fontSize: 8, fontWeight: 'bold', color: '#90A4AE', letterSpacing: 0.8, marginBottom: 2 }}>BASE</span>
      <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', color: hpColor }}>{health}/{maxHp}</span>
      <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: '72%', height: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: hpColor, transition: 'width 0.3s, background 0.3s', borderRadius: 2 }} />
      </div>
    </div>
  );
}

const ENEMY_CFG: Record<string, { fill: string; bg: string; sz: number; anim: string; label: string; radius: string }> = {
  TextJailbreak:   { fill: '#E53935', bg: '#EF9A9A', sz: 36, anim: 'enemyBob 1.4s ease-in-out infinite',     label: '?', radius: '60% 40% 55% 45% / 45% 55% 45% 55%' },
  ContextOverflow: { fill: '#4E342E', bg: '#A1887F', sz: 46, anim: 'enemyBob 2.2s ease-in-out infinite',     label: '∞', radius: '30% 70% 60% 40% / 50% 40% 60% 50%' },
  HalluSwarm:      { fill: '#6A1B9A', bg: '#CE93D8', sz: 20, anim: 'swarmFlicker 0.9s ease-in-out infinite', label: '~', radius: '50%' },
};

function EnemySprite({ enemy }: { enemy: LiveEnemy }) {
  const cfg = ENEMY_CFG[enemy.type] ?? ENEMY_CFG.TextJailbreak;
  const hpPct = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
  return (
    <div style={{ position: 'relative', width: cfg.sz, height: cfg.sz }}>
      <div style={{
        width: cfg.sz, height: cfg.sz,
        background: `radial-gradient(circle at 32% 30%, ${cfg.bg}, ${cfg.fill})`,
        borderRadius: cfg.radius, border: `1.5px solid ${cfg.fill}cc`,
        boxShadow: `0 2px 8px ${cfg.fill}66`,
        animation: cfg.anim,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: enemy.hitFlash > 0 ? 'brightness(3) saturate(0.3)' : 'none',
        transition: 'filter 0.06s',
      }}>
        <span style={{ fontSize: cfg.sz < 24 ? 8 : 13, color: '#fff', fontWeight: 'bold', opacity: 0.85 }}>{cfg.label}</span>
      </div>
      <div style={{ position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)', width: cfg.sz + 6, height: 4, background: 'rgba(0,0,0,0.22)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${hpPct * 100}%`, height: '100%', borderRadius: 2, background: hpPct > 0.5 ? '#66BB6A' : hpPct > 0.25 ? '#FFA726' : '#EF5350', transition: 'width 0.08s' }} />
      </div>
    </div>
  );
}

function GhostPreview({ selectedBuild, valid }: { selectedBuild: BuildSelection; valid: boolean }) {
  const borderStyle = `2px dashed ${valid ? '#4CAF50' : '#EF5350'}`;
  const tint = valid ? 'rgba(76,175,80,0.15)' : 'rgba(239,83,80,0.15)';
  return (
    <div style={{
      position: 'absolute', inset: 4,
      borderRadius: selectedBuild.type === 'tower' ? 10 : 6,
      border: borderStyle, background: tint,
      pointerEvents: 'none', zIndex: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {selectedBuild.type === 'tower'
        ? <TowerSprite towerType={selectedBuild.id} ghost />
        : <FactorySprite factoryType={selectedBuild.id} level={1} ghost />}
    </div>
  );
}

const VISIBLE_PATH = PATH_WAYPOINTS.map((wp) => ({
  x: Math.min(wp.x, GRID_W) * CELL_SIZE + CELL_SIZE / 2,
  y: wp.y * CELL_SIZE + CELL_SIZE / 2,
}));
const PATH_POINTS_STR = VISIBLE_PATH.map((p) => `${p.x},${p.y}`).join(' ');

interface GameBoardProps {
  towers: unknown[];
  factories: unknown[];
  liveSnapshot: WaveSnapshot | null;
  selectedBuild: BuildSelection | null;
  onCellClick: (col: number, row: number) => void;
  isWaveActive: boolean;
  baseHealth: number;
}

export default function GameBoard({
  towers, factories, liveSnapshot, selectedBuild, onCellClick, isWaveActive, baseHealth,
}: GameBoardProps) {
  const [hoveredCell, setHoveredCell] = useState<{ col: number; row: number } | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const zoomRef = useRef(1.0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shakeActive, setShakeActive] = useState(false);
  const lastShakePulse = useRef(0);

  const enemies    = liveSnapshot?.enemies?.filter((e) => e.alive) ?? [];
  const liveTowers = (liveSnapshot?.towers ?? towers) as LiveTower[];
  const displayBaseHealth = liveSnapshot?.baseHealth ?? baseHealth ?? BASE_MAX_HP;

  useEffect(() => {
    const pulse = liveSnapshot?.screenShakePulse ?? 0;
    if (pulse > lastShakePulse.current) {
      lastShakePulse.current = pulse;
      setShakeActive(true);
      const t = setTimeout(() => setShakeActive(false), 350);
      return () => clearTimeout(t);
    }
  }, [liveSnapshot]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.5, Math.min(2.2, zoomRef.current + (e.deltaY < 0 ? 0.09 : -0.09)));
      setZoom(zoomRef.current);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const hoveredOccupied =
    hoveredCell && isCellOccupied(hoveredCell.col, hoveredCell.row, liveTowers, factories);
  const canPlace = !!hoveredCell && !!selectedBuild && !isWaveActive && !hoveredOccupied;

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'auto', background: '#E8F5E9', position: 'relative' }}>
      <style id="td-keyframes">{KEYFRAMES}</style>

      <div style={{ width: GRID_W * CELL_SIZE * zoom, height: GRID_H * CELL_SIZE * zoom, flexShrink: 0 }}>
        <div style={{
          transform: `scale(${zoom})`, transformOrigin: '0 0',
          transition: 'transform 0.12s ease-out',
          position: 'absolute',
          width: GRID_W * CELL_SIZE, height: GRID_H * CELL_SIZE,
        }}>
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
                    position: 'absolute', left: col * CELL_SIZE, top: row * CELL_SIZE,
                    width: CELL_SIZE, height: CELL_SIZE,
                    background: getTileColor(col, row),
                    border: '0.5px solid rgba(0,0,0,0.07)', boxSizing: 'border-box',
                    cursor: selectedBuild && !isWaveActive ? 'crosshair' : 'default',
                    outline: isHov && selectedBuild && !isWaveActive
                      ? `2px solid ${canPlace ? '#4CAF50' : '#EF5350'}` : 'none',
                    outlineOffset: '-2px', zIndex: 0,
                  }}
                >
                  {isHov && selectedBuild && !isWaveActive && (
                    <GhostPreview selectedBuild={selectedBuild} valid={canPlace} />
                  )}
                </div>
              );
            })
          )}

          <svg style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 1, overflow: 'visible' }} width={GRID_W * CELL_SIZE} height={GRID_H * CELL_SIZE}>
            <polyline points={PATH_POINTS_STR} fill="none" stroke="rgba(239,83,80,0.12)" strokeWidth={CELL_SIZE * 0.72} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={PATH_POINTS_STR} fill="none" stroke="rgba(239,83,80,0.38)" strokeWidth={2} strokeDasharray="10,7" strokeLinecap="round" strokeLinejoin="round" />

            {liveSnapshot?.projectiles?.map((p) => {
              const x1 = p.fromX * CELL_SIZE, y1 = p.fromY * CELL_SIZE;
              const x2 = p.toX  * CELL_SIZE, y2 = p.toY  * CELL_SIZE;
              const cx = x1 + (x2 - x1) * p.progress;
              const cy = y1 + (y2 - y1) * p.progress;
              return (
                <g key={p.id}>
                  <line x1={x1 + (cx - x1) * 0.4} y1={y1 + (cy - y1) * 0.4} x2={cx} y2={cy} stroke={p.color} strokeWidth={2} opacity={0.35} strokeLinecap="round" />
                  <circle cx={cx} cy={cy} r={4} fill={p.color} opacity={0.92} />
                </g>
              );
            })}
          </svg>

          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={`lane-${row}`} style={{ position: 'absolute', left: 0, top: row * CELL_SIZE, width: GRID_W * CELL_SIZE, height: CELL_SIZE, borderTop: '1px dashed rgba(0,0,0,0.05)', borderBottom: '1px dashed rgba(0,0,0,0.05)', pointerEvents: 'none', zIndex: 1 }} />
          ))}

          <div style={{ position: 'absolute', left: BASE_X * CELL_SIZE + 2, top: BASE_Y * CELL_SIZE + 2, zIndex: 3, pointerEvents: 'none' }}>
            <BaseSprite health={displayBaseHealth} maxHp={BASE_MAX_HP} shake={shakeActive} />
          </div>

          {(factories as Array<{ factory_id: string | number; x: number; y: number; factory_type: number; level: number }>).map((f) => (
            <div key={`f-${f.factory_id}`} style={{ position: 'absolute', left: Number(f.x) * CELL_SIZE + 7, top: Number(f.y) * CELL_SIZE + 7, zIndex: 2, pointerEvents: 'none' }}>
              <FactorySprite factoryType={f.factory_type} level={Number(f.level)} />
            </div>
          ))}

          {liveTowers.map((t) => {
            const tier = liveSnapshot?.tokens && liveSnapshot.maxTokens
              ? (() => {
                  const def = TOWERS[Number(t.tower_type)];
                  const key = TOKEN_NAMES[def?.tokenType ?? 0] as keyof typeof liveSnapshot.tokens;
                  return getTokenTier(liveSnapshot.tokens[key] ?? 0, liveSnapshot.maxTokens[key] ?? 0);
                })()
              : null;
            const liveT = liveSnapshot?.towers?.find((lt) => lt.tower_id === t.tower_id);
            const attackFlash = liveT ? liveT.attackFlash > 0 : false;
            const isGPT = Number(t.tower_type) === 0;
            return (
              <div key={`tw-${t.tower_id}`} style={{
                position: 'absolute',
                left: Number(t.x) * CELL_SIZE + (isGPT ? 0 : 5),
                top:  Number(t.y) * CELL_SIZE + (isGPT ? 0 : 5),
                width: isGPT ? CELL_SIZE : undefined,
                height: isGPT ? CELL_SIZE : undefined,
                overflow: isGPT ? 'visible' : undefined,
                zIndex: 3, pointerEvents: 'none',
              }}>
                {isGPT
                  ? <GPTTowerSprite isAlive={t.is_alive} attackFlash={attackFlash} />
                  : <TowerSprite towerType={t.tower_type} isAlive={t.is_alive} tier={tier} attackFlash={attackFlash} />
                }
              </div>
            );
          })}

          {enemies.map((e: LiveEnemy) => {
            const cfg = ENEMY_CFG[e.type] ?? ENEMY_CFG.TextJailbreak;
            const sx = e.x * CELL_SIZE + (CELL_SIZE - cfg.sz) / 2;
            const sy = e.y * CELL_SIZE + (CELL_SIZE - cfg.sz) / 2 - 4;
            if (sx < -(CELL_SIZE * 2) || sx > GRID_W * CELL_SIZE + CELL_SIZE) return null;
            return (
              <div key={`e-${e.id}`} style={{ position: 'absolute', left: sx, top: sy, transition: 'left 0.05s linear', zIndex: 4, pointerEvents: 'none' }}>
                <EnemySprite enemy={e} />
              </div>
            );
          })}

          {liveSnapshot?.particles?.map((p) => {
            const alpha = Math.max(0, 1 - p.age / p.maxAge);
            const sz = Math.max(2, Math.round(7 * (1 - p.age / p.maxAge)));
            return (
              <div key={p.id} style={{ position: 'absolute', left: p.x * CELL_SIZE - sz / 2, top: p.y * CELL_SIZE - sz / 2, width: sz, height: sz, borderRadius: '50%', background: p.color, opacity: alpha, pointerEvents: 'none', zIndex: 6 }} />
            );
          })}

          {liveSnapshot?.floatingTexts?.map((ft) => {
            const alpha = Math.max(0, 1 - ft.age / ft.maxAge);
            return (
              <div key={ft.id} style={{ position: 'absolute', left: ft.x * CELL_SIZE, top: ft.y * CELL_SIZE, transform: 'translate(-50%, -50%)', color: ft.color, fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold', pointerEvents: 'none', zIndex: 7, opacity: alpha, textShadow: '0 1px 3px rgba(0,0,0,0.6)', userSelect: 'none', whiteSpace: 'nowrap' }}>
                {ft.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
