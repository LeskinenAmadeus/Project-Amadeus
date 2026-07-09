type HeaderProps = {
  loading: boolean;
  brainOnline: boolean;
};

function Header({ loading, brainOnline }: HeaderProps) {
  return (
    <header className="top-bar">
      <div>
        <span className="eyebrow">Cognitive Computing System</span>
        <h1>AMADEUS</h1>
        <p>Local AI Desktop Companion // Project Amadeus</p>
      </div>

      <div className="system-card">
        <span className="status-dot" />
        <div>
          <strong>
            {loading ? "Processing" : brainOnline ? "System Online" : "Brain Offline"}
          </strong>
          <p>v0.3.5 Cognitive Link</p>
        </div>
      </div>
    </header>
  );
}

export default Header;