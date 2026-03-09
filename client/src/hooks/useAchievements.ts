import { useCallback, useRef, useState } from 'react';

export interface Achievement {
  id: string;
  title: string;
  desc: string;
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_wave',  title: 'First Wave',    desc: 'Complete your first wave'          },
  { id: 'clean_sweep', title: 'Clean Sweep',   desc: 'Kill all enemy groups in one wave'  },
  { id: 'untouched',   title: 'Untouched',     desc: 'Complete a wave with no base damage'},
  { id: 'wave_5',      title: 'Veteran',       desc: 'Survive 5 waves'                    },
  { id: 'wave_10',     title: 'Champion',      desc: 'Defeat all 10 waves'                },
  { id: 'tower_3',     title: 'Tower Network', desc: 'Have 3 or more towers placed'       },
  { id: 'factory_2',   title: 'Factory Owner', desc: 'Have 2 or more factories placed'    },
  { id: 'upgraded',    title: 'Upgraded',      desc: 'Upgrade a factory to level 2+'      },
];

const STORAGE_KEY = 'td_achievements_v1';

function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveUnlocked(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

interface AchievementsOptions {
  onUnlock?: () => void;
}

export function useAchievements({ onUnlock }: AchievementsOptions = {}) {
  const unlockedRef = useRef<Set<string>>(loadUnlocked());
  const [toasts, setToasts] = useState<Achievement[]>([]);
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const unlock = useCallback((id: string) => {
    if (unlockedRef.current.has(id)) return;
    const ach = ALL_ACHIEVEMENTS.find((a) => a.id === id);
    if (!ach) return;
    unlockedRef.current = new Set([...unlockedRef.current, id]);
    saveUnlocked(unlockedRef.current);
    onUnlockRef.current?.();
    setToasts((prev) => [...prev, ach]);
    // Auto-dismiss after 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return { unlock, toasts };
}
