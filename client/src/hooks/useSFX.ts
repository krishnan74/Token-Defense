import { useCallback, useRef } from 'react';

/**
 * Web Audio API procedural sound effects.
 * No audio files required — all sounds are synthesized.
 *
 * To replace with real audio files later, swap each play* function body
 * with: `new Audio('/sfx/FILENAME').play()`.
 *
 * Recommended free SFX downloads (freesound.org or kenney.nl):
 *   tower_fire.wav   — soft laser "pew" (short, 80ms)
 *   enemy_death.wav  — pop / squish (150ms)
 *   base_hit.wav     — low impact thud (200ms)
 *   countdown.wav    — single tick beep (80ms)
 *   wave_start.wav   — rising whoosh (300ms)
 *   wave_complete.wav — bright 4-note chime
 *   victory.wav      — triumphant fanfare (1–2s)
 *   defeat.wav       — descending sad notes (1s)
 *   click.wav        — soft UI click (30ms)
 *   place.wav        — short "thunk" for building placement
 */

export function useSFX() {
  const ctxRef = useRef<AudioContext | null>(null);

  function ctx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  function osc(freq: number, type: OscillatorType, dur: number, vol = 0.25) {
    const ac = ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start(); o.stop(ac.currentTime + dur);
  }

  function sweep(f0: number, f1: number, type: OscillatorType, dur: number, vol = 0.2) {
    const ac = ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type;
    o.frequency.setValueAtTime(f0, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start(); o.stop(ac.currentTime + dur);
  }

  function noise(dur: number, vol = 0.18) {
    const ac = ctx();
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    src.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.start(); src.stop(ac.currentTime + dur);
  }

  const playClick = useCallback(() => {
    osc(700, 'square', 0.05, 0.18);
  }, []);

  const playPlace = useCallback(() => {
    osc(300, 'square', 0.08, 0.22);
    setTimeout(() => osc(450, 'square', 0.06, 0.15), 50);
  }, []);

  const playTowerFire = useCallback(() => {
    sweep(520, 180, 'sawtooth', 0.09, 0.14);
  }, []);

  const playEnemyDeath = useCallback(() => {
    noise(0.1, 0.22);
    osc(140, 'sine', 0.12, 0.18);
  }, []);

  const playBaseHit = useCallback(() => {
    osc(70, 'sine', 0.28, 0.55);
    noise(0.12, 0.28);
  }, []);

  const playCountdown = useCallback(() => {
    osc(880, 'square', 0.1, 0.28);
  }, []);

  const playWaveStart = useCallback(() => {
    sweep(280, 560, 'square', 0.18, 0.28);
    setTimeout(() => sweep(560, 840, 'square', 0.14, 0.2), 180);
  }, []);

  const playWaveComplete = useCallback(() => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => osc(f, 'square', 0.18, 0.22), i * 110));
  }, []);

  const playVictory = useCallback(() => {
    const seq = [523, 659, 784, 659, 784, 1047, 1047];
    seq.forEach((f, i) => setTimeout(() => osc(f, 'square', 0.22, 0.28), i * 130));
  }, []);

  const playDefeat = useCallback(() => {
    const seq = [440, 415, 392, 330, 294];
    seq.forEach((f, i) => setTimeout(() => osc(f, 'sawtooth', 0.26, 0.28), i * 160));
  }, []);

  return {
    playClick,
    playPlace,
    playTowerFire,
    playEnemyDeath,
    playBaseHit,
    playCountdown,
    playWaveStart,
    playWaveComplete,
    playVictory,
    playDefeat,
  };
}
