type HeaderProps = {
  loading: boolean;
  brainOnline: boolean;
  onOpenSettings: () => void;
};

function Header({
  loading,
  brainOnline,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="top-bar">
      <div>
        <span className="eyebrow">
          Cognitive Computing System
        </span>

        <h1>AMADEUS</h1>

        <p>
          Local AI Desktop Companion // Project Amadeus
        </p>
      </div>

      <div className="header-actions">
        <button
          className="settings-button"
          type="button"
          onClick={onOpenSettings}
        >
          Settings
        </button>

        <div className="system-card">
          <span
            className={
              brainOnline
                ? "status-dot"
                : "status-dot offline"
            }
          />

          <div>
            <strong>
              {loading
                ? "Processing"
                : brainOnline
                  ? "System Online"
                  : "Brain Offline"}
            </strong>

            <p>v0.6.0</p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;