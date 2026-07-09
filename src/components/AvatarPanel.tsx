import Live2DViewer from "./Live2DViewer";

type AvatarPanelProps = {
  activeExpression: string | null;
};

function AvatarPanel({ activeExpression }: AvatarPanelProps) {
  return (
    <aside className="avatar-panel">
      <div className="avatar-frame">
        <div className="scanline" />
        <Live2DViewer activeExpression={activeExpression} />
      </div>
    </aside>
  );
}

export default AvatarPanel;