import { useCallback, useEffect, useRef } from 'react';

// ── Asset imports ────────────────────────────────────────────────────────────
import sndClick        from '../../assets/audio/400 Sounds Pack/UI/sci_fi_select.wav';
import sndPlace        from '../../assets/audio/400 Sounds Pack/Weapons/weapon_equip_short.wav';
import sndTowerFire    from '../../assets/audio/400 Sounds Pack/Weapons/sword_clash_2.wav';
import sndSquelch1     from '../../assets/audio/400 Sounds Pack/Combat and Gore/squelching_1.wav';
import sndSquelch2     from '../../assets/audio/400 Sounds Pack/Combat and Gore/squelching_2.wav';
import sndSquelch3     from '../../assets/audio/400 Sounds Pack/Combat and Gore/squelching_3.wav';
import sndSquelch4     from '../../assets/audio/400 Sounds Pack/Combat and Gore/squelching_4.wav';
import sndBaseHit      from '../../assets/audio/400 Sounds Pack/Weapons/harsh_thud.wav';
import sndCountdown    from '../../assets/audio/400 Sounds Pack/Environment/clock_tick_only.wav';
import sndWaveComplete from '../../assets/audio/400 Sounds Pack/Musical Effects/vibraphone_level_complete.wav';
import sndVictory      from '../../assets/audio/400 Sounds Pack/Musical Effects/brass_positive_long.wav';
import sndDefeat       from '../../assets/audio/400 Sounds Pack/Musical Effects/brass_defeated.wav';
import sndOverclock    from '../../assets/audio/400 Sounds Pack/Retro/power_up.wav';
import sndSell         from '../../assets/audio/400 Sounds Pack/Items/coin_collect.wav';
import sndMatchSynth1  from '../../assets/audio/400 Sounds Pack/Match Three/match_synth_1.wav';
import sndMatchSynth2  from '../../assets/audio/400 Sounds Pack/Match Three/match_synth_2.wav';
import sndMatchSynth3  from '../../assets/audio/400 Sounds Pack/Match Three/match_synth_3.wav';
import sndMatchSynth4  from '../../assets/audio/400 Sounds Pack/Match Three/match_synth_4.wav';
import sndMatchSynth5  from '../../assets/audio/400 Sounds Pack/Match Three/match_synth_5.wav';
import sndMatchSynth6  from '../../assets/audio/400 Sounds Pack/Match Three/match_synth_6.wav';

// ── Volume per sound ─────────────────────────────────────────────────────────
const VOLUMES: Record<string, number> = {
  click:        0.55,
  place:        0.65,
  towerFire:    0.2,
  squelch:      0.50,
  baseHit:      0.80,
  countdown:    0.70,
  waveComplete: 0.75,
  victory:      0.80,
  defeat:       0.80,
  overclock:    0.70,
  sell:         0.60,
  achievement:  0.65,
};

function preload(src: string, volume: number): HTMLAudioElement {
  const a = new Audio(src);
  a.volume = volume;
  return a;
}

/** Play a sound; for polyphonic use, clone the node so overlapping calls work. */
function play(audio: HTMLAudioElement, polyphonic = false): void {
  const target = polyphonic ? (audio.cloneNode() as HTMLAudioElement) : audio;
  target.volume = audio.volume;
  target.currentTime = 0;
  target.play().catch(() => {});
}

export function useSFX() {
  const refs = useRef<Record<string, HTMLAudioElement>>({});

  // Preload once on mount
  useEffect(() => {
    refs.current = {
      click:        preload(sndClick,        VOLUMES.click),
      place:        preload(sndPlace,        VOLUMES.place),
      towerFire:    preload(sndTowerFire,    VOLUMES.towerFire),
      squelch1:     preload(sndSquelch1,     VOLUMES.squelch),
      squelch2:     preload(sndSquelch2,     VOLUMES.squelch),
      squelch3:     preload(sndSquelch3,     VOLUMES.squelch),
      squelch4:     preload(sndSquelch4,     VOLUMES.squelch),
      baseHit:      preload(sndBaseHit,      VOLUMES.baseHit),
      countdown:    preload(sndCountdown,    VOLUMES.countdown),
      waveComplete: preload(sndWaveComplete, VOLUMES.waveComplete),
      victory:      preload(sndVictory,      VOLUMES.victory),
      defeat:       preload(sndDefeat,       VOLUMES.defeat),
      overclock:    preload(sndOverclock,    VOLUMES.overclock),
      sell:         preload(sndSell,         VOLUMES.sell),
      matchSynth1:  preload(sndMatchSynth1,  VOLUMES.achievement),
      matchSynth2:  preload(sndMatchSynth2,  VOLUMES.achievement),
      matchSynth3:  preload(sndMatchSynth3,  VOLUMES.achievement),
      matchSynth4:  preload(sndMatchSynth4,  VOLUMES.achievement),
      matchSynth5:  preload(sndMatchSynth5,  VOLUMES.achievement),
      matchSynth6:  preload(sndMatchSynth6,  VOLUMES.achievement),
    };
  }, []);

  const playClick        = useCallback(() => play(refs.current.click),  []);
  const playPlace        = useCallback(() => play(refs.current.place),  []);
  const playTowerFire    = useCallback(() => play(refs.current.towerFire, true), []);

  // Randomized squelching for enemy deaths — polyphonic
  const playEnemyDeath = useCallback(() => {
    const n = Math.floor(Math.random() * 4) + 1;
    play(refs.current[`squelch${n}`], true);
  }, []);

  // Randomized match synth for achievement unlocks
  const playAchievement = useCallback(() => {
    const n = Math.floor(Math.random() * 6) + 1;
    play(refs.current[`matchSynth${n}`]);
  }, []);

  const playBaseHit      = useCallback(() => play(refs.current.baseHit),        []);
  const playCountdown    = useCallback(() => play(refs.current.countdown),      []);
  const playWaveStart    = useCallback(() => { /* removed per design */ },      []);
  const playWaveComplete = useCallback(() => play(refs.current.waveComplete),   []);
  const playVictory      = useCallback(() => play(refs.current.victory),        []);
  const playDefeat       = useCallback(() => play(refs.current.defeat),         []);
  const playOverclock    = useCallback(() => play(refs.current.overclock),      []);
  const playSell         = useCallback(() => play(refs.current.sell),           []);

  return {
    playClick,
    playPlace,
    playTowerFire,
    playEnemyDeath,
    playAchievement,
    playBaseHit,
    playCountdown,
    playWaveStart,
    playWaveComplete,
    playVictory,
    playDefeat,
    playOverclock,
    playSell,
  };
}
