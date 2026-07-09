import { useState } from "react";
import { sendMessage } from "./services/ollama";
import type { Message } from "./types/message";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "amadeus",
      text: "AMADEUS cognitive interface initialized.",
    },
    {
      sender: "amadeus",
      text: "Local systems are online. Awaiting operator input.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

const handleSend = async () => {
  if (!input.trim() || loading) return;

  const userMessage: Message = {
    sender: "user",
    text: input.trim(),
  };

  const updatedMessages = [...messages, userMessage];

  setMessages(updatedMessages);
  setInput("");
  setLoading(true);

  try {
    const response = await sendMessage(updatedMessages);

    const reply: Message = {
      sender: "amadeus",
      text: response.message.content,
    };

    setMessages((prev) => [...prev, reply]);
  } catch (error) {
    console.error("Ollama communication error:", error);

    setMessages((prev) => [
      ...prev,
      {
        sender: "amadeus",
        text: "Connection to the local cognitive system failed.",
      },
    ]);
  } finally {
    setLoading(false);
  }
};

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
            <strong>{loading ? "Processing" : "System Online"}</strong>
            <p>v0.3.0 Cognitive Link</p>
          </div>
        </div>
      </header>

      <section className="status-strip">
        <span>Brain: {loading ? "Thinking" : "Standby"}</span>
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
                <strong>
                  {message.sender === "user" ? "Operator" : "Amadeus"}
                </strong>
                <p>{message.text}</p>
              </div>
            ))}

            {loading && (
              <div className="message amadeus">
                <strong>Amadeus</strong>
                <p>Analyzing input...</p>
              </div>
            )}
          </div>

          <form
            className="input-row"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send message to Amadeus..."
              disabled={loading}
            />

            <button type="submit" disabled={loading || !input.trim()}>
              {loading ? "Thinking..." : "Transmit"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

export default App;