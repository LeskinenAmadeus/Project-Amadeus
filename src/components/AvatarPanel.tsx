import Live2DViewer from "./Live2DViewer";

type AvatarPanelProps = {
  activeExpression: string | null;
  activeMotion: string | null;
};

function AvatarPanel({ activeExpression, activeMotion }: AvatarPanelProps) {
  return (
    <aside className="avatar-panel">
      <div className="avatar-frame">
        <div className="scanline" />
        <Live2DViewer
          activeExpression={activeExpression}
          activeMotion={activeMotion}
        />
      </div>
    </aside>
  );
}

export default AvatarPanel;