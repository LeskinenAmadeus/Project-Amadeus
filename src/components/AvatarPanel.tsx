function AvatarPanel() {
  return (
    <aside className="avatar-panel">
      <div className="avatar-frame">
        <div className="scanline" />
        <div className="hologram-ring" />
        <div className="avatar-placeholder">
          <span>NO LIVE2D SIGNAL</span>
          <p>Kurisu model awaiting connection</p>
        </div>
      </div>
    </aside>
  );
}

export default AvatarPanel;