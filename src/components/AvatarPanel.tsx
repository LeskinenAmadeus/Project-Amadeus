import Live2DViewer from "./Live2DViewer";

function AvatarPanel() {
  return (
    <aside className="avatar-panel">
      <div className="avatar-frame">
        <div className="scanline" />
        <Live2DViewer />
      </div>
    </aside>
  );
}

export default AvatarPanel;