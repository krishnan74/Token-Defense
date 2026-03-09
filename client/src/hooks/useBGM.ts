import { useEffect, useRef, useState } from 'react';
import buildSrc from '../../assets/audio/Minifantasy_Dungeon_Music/Music/Goblins_Den_(Regular).wav';
import battleSrc from '../../assets/audio/Minifantasy_Dungeon_Music/Music/Goblins_Dance_(Battle).wav';

const FADE_DURATION = 1.2; // seconds for crossfade
const BUILD_VOLUME  = 0.45;
const BATTLE_VOLUME = 0.55;

export type BGMPhase = 'build' | 'battle';

export function useBGM(phase: BGMPhase): { isMuted: boolean; toggleMute: () => void } {
  const buildRef  = useRef<HTMLAudioElement | null>(null);
  const battleRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const phaseRef = useRef<BGMPhase>(phase);

  // ── One-time setup: create both audio elements ─────────────────────────────
  useEffect(() => {
    const build  = new Audio(buildSrc);
    const battle = new Audio(battleSrc);
    build.loop   = true;
    battle.loop  = true;
    build.volume  = BUILD_VOLUME;
    battle.volume = 0; // starts silent; fades in when phase switches

    buildRef.current  = build;
    battleRef.current = battle;

    // Start both, play in background; volume controls which is heard
    const tryPlay = () => {
      build.play().catch(() => {});
      battle.play().catch(() => {});
    };
    tryPlay();
    window.addEventListener('click',   tryPlay, { once: true });
    window.addEventListener('keydown', tryPlay, { once: true });

    return () => {
      build.pause();  build.src  = '';
      battle.pause(); battle.src = '';
    };
  }, []);

  // ── Crossfade when phase changes ───────────────────────────────────────────
  useEffect(() => {
    phaseRef.current = phase;
    const build  = buildRef.current;
    const battle = battleRef.current;
    if (!build || !battle) return;

    const muted = isMutedRef.current;
    const targetBuild  = phase === 'build'  ? BUILD_VOLUME  : 0;
    const targetBattle = phase === 'battle' ? BATTLE_VOLUME : 0;

    const steps  = 30;
    const stepMs = (FADE_DURATION * 1000) / steps;
    let step = 0;

    const startBuild  = build.volume;
    const startBattle = battle.volume;

    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      if (!muted) {
        build.volume  = Math.max(0, Math.min(1, startBuild  + (targetBuild  - startBuild)  * t));
        battle.volume = Math.max(0, Math.min(1, startBattle + (targetBattle - startBattle) * t));
      }
      if (step >= steps) clearInterval(timer);
    }, stepMs);

    return () => clearInterval(timer);
  }, [phase]);

  // ── Mute toggle ────────────────────────────────────────────────────────────
  function toggleMute() {
    const build  = buildRef.current;
    const battle = battleRef.current;
    if (!build || !battle) return;

    const nowMuted = !isMutedRef.current;
    isMutedRef.current = nowMuted;
    build.muted  = nowMuted;
    battle.muted = nowMuted;
    setIsMuted(nowMuted);
  }

  return { isMuted, toggleMute };
}
