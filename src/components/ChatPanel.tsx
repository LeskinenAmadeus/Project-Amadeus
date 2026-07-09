import type { RefObject } from "react";
import type { Message } from "../types/message";

type ChatPanelProps = {
  messages: Message[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
};

function ChatPanel({ messages, messagesEndRef }: ChatPanelProps) {
  return (
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

        <div ref={messagesEndRef} />
      </div>
    </section>
  );
}

export default ChatPanel;