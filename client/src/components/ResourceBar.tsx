import { useState } from 'react';
import { getTokenTier, MAX_TOKEN_BALANCE } from '../constants';

interface GameStateDisplay {
  gold: number;
  input_tokens?: number;
  image_tokens?: number;
  code_tokens?: number;
  wave_number: number;
  base_health?: number;
}

function TokenDisplay({
  icon, label, value, color,
}: { icon: string; label: string; value: number; color: string }) {
  const pct     = value / MAX_TOKEN_BALANCE;
  const atCap   = value >= MAX_TOKEN_BALANCE;
  const nearCap = pct >= 0.85;
  const tier    = getTokenTier(value, MAX_TOKEN_BALANCE);
  const displayColor = nearCap ? '#FFD700' : color;
  return (
    <div style={styles.resource}>
      <span style={styles.icon}>{icon}</span>
      <span style={styles.label}>{label}</span>
      <span style={{ ...styles.value, color: displayColor }}>{value}</span>
      <span style={{ ...styles.cap, color: nearCap ? '#FFD700' : '#7A5A3A' }}>/{MAX_TOKEN_BALANCE}</span>
      {atCap
        ? <span style={styles.capWarning}>CAPPED</span>
        : <span style={{ ...styles.tierBadge, background: tier.color + '30', color: tier.color, border: `1px solid ${tier.color}60` }}>
            {tier.label}
          </span>
      }
    </div>
  );
}

function shorten(id: string) {
  if (id.length <= 12) return id;
  return id.slice(0, 6) + '…' + id.slice(-4);
}

export default function ResourceBar({ gameState, tokenId }: { gameState: GameStateDisplay | null; tokenId?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!gameState) return null;
  const { gold, input_tokens, image_tokens, code_tokens } = gameState;

  function handleCopy() {
    if (!tokenId) return;
    navigator.clipboard.writeText(tokenId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={styles.bar}>
      {/* Gold */}
      <div style={styles.resource}>
        <span style={styles.icon}>◆</span>
        <span style={styles.label}>GOLD</span>
        <span style={{ ...styles.value, color: '#FFD700' }}>{gold}</span>
      </div>

      <div style={styles.divider} />

      {/* Tokens with cap indicator */}
      <TokenDisplay icon="▲" label="INPUT" value={input_tokens ?? 0} color="#63B3ED" />
      <TokenDisplay icon="■" label="IMAGE" value={image_tokens ?? 0} color="#68D391" />
      <TokenDisplay icon="●" label="CODE"  value={code_tokens  ?? 0} color="#FC8181" />

      {/* Token ID */}
      {tokenId && (
        <>
          <div style={{ ...styles.divider, marginLeft: 'auto' }} />
          <div style={styles.tokenIdBlock}>
            <span style={styles.tokenIdLabel}>ID</span>
            <span style={styles.tokenIdValue}>{shorten(tokenId)}</span>
            <button style={styles.copyBtn} onClick={handleCopy} title="Copy Token ID">
              {copied ? '✓' : '⧉'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 0,
    padding: '5px 14px',
    background: '#2C1507',
    borderBottom: '3px solid #4A2510',
    flexShrink: 0, flexWrap: 'wrap' as const,
  },
  resource: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '0 14px',
  },
  icon: {
    fontFamily: "'VT323', monospace", fontSize: 14, color: '#6B3A1E',
  },
  label: {
    fontFamily: "'VT323', monospace", fontSize: 17, color: '#A08060', letterSpacing: 1,
  },
  value: {
    fontFamily: "'VT323', monospace", fontSize: 23, fontWeight: 'normal',
    textShadow: '1px 1px 0 rgba(0,0,0,0.5)',
  },
  cap: {
    fontFamily: "'VT323', monospace", fontSize: 16,
  },
  divider: { width: 2, height: 24, background: '#4A2510', margin: '0 6px' },
  capWarning: {
    fontFamily: "'VT323', monospace", fontSize: 10,
    color: '#FF4444', background: '#4A0000',
    padding: '1px 4px', letterSpacing: 0.5,
    border: '1px solid #6A0000', marginLeft: 2,
  },
  tierBadge: {
    fontFamily: "'VT323', monospace", fontSize: 11,
    padding: '0 4px', letterSpacing: 0.5, marginLeft: 2,
  },
  tokenIdBlock: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '0 10px',
  },
  tokenIdLabel: {
    fontFamily: "'VT323', monospace", fontSize: 14, color: '#6B3A1E', letterSpacing: 1,
  },
  tokenIdValue: {
    fontFamily: "'VT323', monospace", fontSize: 15, color: '#7A5A3A', letterSpacing: 0.5,
  },
  copyBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#6B3A1E', fontSize: 14, padding: '0 2px', lineHeight: 1,
  },
};
