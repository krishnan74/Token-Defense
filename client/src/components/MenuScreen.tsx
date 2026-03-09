import React, { useState, useRef } from 'react';
import { DIFFICULTY_SETTINGS } from '../constants';
import LoreModal from './LoreModal';

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

const panel: React.CSSProperties = {
  background: '#1A0D05',
  border: '2px solid #4A2510',
  padding: '20px 24px',
  boxShadow: '4px 4px 0 #0A0500',
  flex: '0 0 auto',
};

const panelTitle: React.CSSProperties = {
  fontFamily: "'VT323', monospace",
  color: '#FFD700',
  fontSize: 24,
  letterSpacing: 3,
  marginBottom: 14,
  textShadow: '1px 1px 0 #4A2510',
};

interface MenuScreenProps {
  mode: 'connect' | 'new-game';
  selectedDifficulty?: number;
  onSelectDifficulty?: (d: number) => void;
  onAction: (() => void) | undefined;
  urlTokenId?: string | null;
  onResume?: (tokenId: string) => void;
  resumeError?: string | null;
}

export default function MenuScreen({ mode, selectedDifficulty, onSelectDifficulty, onAction, urlTokenId, onResume, resumeError }: MenuScreenProps) {
  const [showLore, setShowLore] = useState(false);
  const [resumeInput, setResumeInput] = useState(urlTokenId ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
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
          <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', flexWrap: 'wrap' as const, justifyContent: 'center', marginTop: 8 }}>

            {/* ── New Game ── */}
            <div style={panel}>
              <div style={panelTitle}>NEW GAME</div>
              <div className="menu-difficulty-label" style={{ marginBottom: 8 }}>SELECT DIFFICULTY</div>
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
              <button className="menu-play-btn" onClick={onAction} style={{ marginTop: 16, width: '100%' }}>
                ▶  START GAME
              </button>
            </div>

            {/* ── Divider ── */}
            <div style={{ width: 2, alignSelf: 'stretch', background: '#4A2510', flexShrink: 0 }} />

            {/* ── Resume Game ── */}
            <div style={{ ...panel, flex: '1 1 300px', minWidth: 280 }}>
              <div style={panelTitle}>RESUME GAME</div>
              <p style={{ marginBottom: 8 }}>Enter your Game Token ID:</p>
              <input
                ref={inputRef}
                value={resumeInput}
                onChange={(e) => setResumeInput(e.target.value)}
                placeholder="0x..."
                style={{
                  width: '100%', padding: '8px 12px', boxSizing: 'border-box' as const,
                  background: '#1A0D05', color: '#F5E6C8',
                  border: '2px solid #4A2510', borderRadius: 0,
                  fontFamily: "'VT323', monospace", fontSize: 18,
                  outline: 'none', marginBottom: 10,
                }}
              />
              <button
                style={{
                  width: '100%', padding: '10px 0',
                  background: resumeInput.trim() ? '#2A4A10' : '#1A2A08',
                  color: resumeInput.trim() ? '#A8D8A8' : '#4A6A30',
                  border: `2px solid ${resumeInput.trim() ? '#3A6A18' : '#2A3A10'}`,
                  borderRadius: 0,
                  cursor: resumeInput.trim() ? 'pointer' : 'default',
                  fontFamily: "'VT323', monospace", fontSize: 22, letterSpacing: 1,
                  boxShadow: resumeInput.trim() ? '3px 3px 0 #0A1A00' : 'none',
                }}
                disabled={!resumeInput.trim()}
                onClick={() => resumeInput.trim() && onResume?.(resumeInput.trim())}
              >
                ▶  LOAD SESSION
              </button>
              {resumeError && (
                <div style={{ fontFamily: "'VT323', monospace", color: '#D9534F', fontSize: 17, marginTop: 10, lineHeight: 1.4 }}>
                  ⚠ {resumeError}
                </div>
              )}
              <div style={{ fontFamily: "'VT323', monospace", color: '#4A2510', fontSize: 15, marginTop: 10, lineHeight: 1.5, borderTop: '1px solid #3A1A08', paddingTop: 8 }}>
                Share your game: {window.location.origin}/?id=&lt;tokenId&gt;
              </div>
            </div>

          </div>
        )}
      </div>

      <div className="menu-footer">
        <button className="menu-lore-btn" onClick={() => setShowLore(true)}>
          ◆ LORE
        </button>
        &nbsp;·&nbsp;
        TOKEN DEFENSE · Built on Dojo / StarkNet · All state is onchain · Humans and agents welcome
      </div>

      {showLore && <LoreModal onClose={() => setShowLore(false)} />}
    </div>
  );
}
