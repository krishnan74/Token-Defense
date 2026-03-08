import { DIFFICULTY_SETTINGS } from '../constants';

const MENU_TOWERS = [
  { label: 'GPT',    color: '#2B6CB0', dark: '#1A3D70', text: '#BEE3F8', desc: 'Input token tower',  range: '3 tiles' },
  { label: 'VISION', color: '#7B3FAD', dark: '#4A1A7A', text: '#E9D8FD', desc: 'Image token tower',  range: '3 tiles' },
  { label: 'CODE',   color: '#C05800', dark: '#7A3400', text: '#FEEBC8', desc: 'Code token tower',   range: '3 tiles' },
];

const MENU_ENEMIES = [
  { label: '?!', name: 'TextJailbreak',   color: '#CC1111', dark: '#660000', text: '#FFB8B8', sz: 38, round: false, desc: 'Prompt injection · fast'  },
  { label: '∞',  name: 'ContextOverflow', color: '#8B4513', dark: '#4A1A00', text: '#FFD4A8', sz: 48, round: false, desc: 'Context poisoning · armored' },
  { label: '~',  name: 'HalluSwarm',      color: '#8800CC', dark: '#440066', text: '#E8B8FF', sz: 26, round: true,  desc: 'Hallucination cascade · swarm' },
];

interface MenuScreenProps {
  mode: 'connect' | 'new-game';
  selectedDifficulty?: number;
  onSelectDifficulty?: (d: number) => void;
  onAction: (() => void) | undefined;
}

export default function MenuScreen({ mode, selectedDifficulty, onSelectDifficulty, onAction }: MenuScreenProps) {
  return (
    <div className="menu-root">
      <div className="menu-grass" />
      <div className="menu-content">
        <div className="menu-title-block">
          <div className="menu-pixel-deco">◆ ◆ ◆</div>
          <h1 className="menu-title">TOKEN DEFENSE</h1>
          <div className="menu-subtitle">An AI inference cluster under attack. You are the last line of defense.</div>
          <div className="menu-pixel-deco">◆ ◆ ◆</div>
        </div>

        <div className="menu-showcase">
          <div className="menu-showcase-col">
            <div className="menu-showcase-label">TOWERS</div>
            <div className="menu-cards-row">
              {MENU_TOWERS.map((t) => (
                <div key={t.label} className="menu-tower-card" style={{ background: t.color, border: `3px solid ${t.dark}` }}>
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
                    width: e.sz, height: e.sz, background: e.color,
                    border: `2px solid ${e.dark}`,
                    borderRadius: e.round ? '50%' : 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `3px 3px 0 ${e.dark}`, margin: '0 auto 6px',
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

        <div className="menu-howto">
          <span className="menu-howto-item">◆ Place safety towers on the grid</span>
          <span className="menu-howto-item">◆ Build factories to sustain token output</span>
          <span className="menu-howto-item">◆ Survive 10 waves of adversarial AI attacks</span>
        </div>

        {mode === 'connect' ? (
          <div className="menu-cta-block">
            <div className="menu-cta-hint">Connect to play · or run the agent script and let AI defend AI</div>
          </div>
        ) : (
          <div className="menu-difficulty-block">
            <div className="menu-difficulty-label">SELECT DIFFICULTY</div>
            <div className="menu-difficulty-row">
              {DIFFICULTY_SETTINGS.map((d, i) => (
                <button
                  key={i}
                  className="menu-difficulty-btn"
                  style={{
                    background:  selectedDifficulty === i ? d.color   : '#2C1507',
                    borderColor: selectedDifficulty === i ? d.color   : '#4A2510',
                    color:       selectedDifficulty === i ? '#F5E6C8' : '#A08060',
                    boxShadow:   selectedDifficulty === i ? `0 0 8px ${d.color}80` : 'none',
                  }}
                  onClick={() => onSelectDifficulty?.(i)}
                >
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, letterSpacing: 1 }}>{d.label}</div>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: 12, opacity: 0.8 }}>
                    {d.gold}g · {d.baseHp}HP
                  </div>
                </button>
              ))}
            </div>
            <button className="menu-play-btn" onClick={onAction} style={{ marginTop: 16 }}>
              ▶  START GAME
            </button>
          </div>
        )}
      </div>

      <div className="menu-footer">
        TOKEN DEFENSE · Built on Dojo / StarkNet · All state is onchain · Humans and agents welcome
      </div>
    </div>
  );
}
