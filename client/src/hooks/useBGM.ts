import { useEffect, useRef, useState } from 'react';
import bgmSrc from '../../assets/audio/Token_Defense.mp3';

export function useBGM(volume = 0.4): { isMuted: boolean; toggleMute: () => void } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = new Audio(bgmSrc);
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;

    audio.play().catch(() => {
      const unlock = () => { audio.play().catch(() => {}); };
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  function toggleMute(): void {
    if (!audioRef.current) return;
    audioRef.current.muted = !audioRef.current.muted;
    setIsMuted((m) => !m);
  }

  return { isMuted, toggleMute };
}
