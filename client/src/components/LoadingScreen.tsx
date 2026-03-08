export default function LoadingScreen() {
  return (
    <div className="menu-root">
      <div className="menu-loader-card">
        <div className="menu-loader-spinner" />
        <div className="menu-loader-title">DEPLOYING GAME</div>
        <div className="menu-loader-sub">Waiting for chain confirmation...</div>
        <div className="menu-loader-dots">
          <span>▮</span><span>▮</span><span>▮</span>
        </div>
      </div>
    </div>
  );
}
