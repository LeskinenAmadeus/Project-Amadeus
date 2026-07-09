import "./App.css";

type Message = {
  sender: "user" | "amadeus";
  text: string;
};

const messages: Message[] = [
  {
    sender: "amadeus",
    text: "AMADEUS cognitive interface initialized.",
  },
  {
    sender: "amadeus",
    text: "Local systems are online. Awaiting operator input.",
  },
];

function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <span className="eyebrow">Cognitive Computing System</span>
          <h1>AMADEUS</h1>
          <p>Local AI Desktop Companion // Project Amadeus</p>
        </div>

        <div className="system-card">
          <span className="status-dot" />
          <div>
            <strong>System Online</strong>
            <p>v0.2.1 Interface Build</p>
          </div>
        </div>
      </header>

      <section className="status-strip">
        <span>Brain: Standby</span>
        <span>Memory: Offline</span>
        <span>Voice: Offline</span>
        <span>Live2D: Placeholder</span>
        <span>Model: amadeus-kurisu</span>
      </section>

      <section className="main-grid">
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

        <section className="chat-panel">
          <div className="chat-header">
            <div>
              <h2>Conversation Log</h2>
              <p>Session channel: local</p>
            </div>
            <span className="small-pill">Operator Linked</span>
          </div>

          <div className="message-list">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.sender}`}>
                <strong>{message.sender === "user" ? "Operator" : "Amadeus"}</strong>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <form className="input-row">
            <input placeholder="Send message to Amadeus..." />
            <button type="submit">Transmit</button>
          </form>
        </section>
      </section>
    </main>
  );
}

export default App;