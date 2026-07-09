import { useEffect, useRef, useState } from "react";
import AvatarPanel from "./components/AvatarPanel";
import ChatPanel from "./components/ChatPanel";
import Header from "./components/Header";
import InputBar from "./components/InputBar";
import StatusStrip from "./components/StatusStrip";
import { checkOllamaStatus, streamMessage } from "./services/ollama";
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
  const [brainOnline, setBrainOnline] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    checkOllamaStatus().then(setBrainOnline);
  }, []);

  const handleStop = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !brainOnline) return;

    const userMessage: Message = {
      sender: "user",
      text: input.trim(),
    };

    const placeholderReply: Message = {
      sender: "amadeus",
      text: "",
    };

    setMessages((prev) => [...prev, userMessage, placeholderReply]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamMessage(
        [...messages, userMessage],
        (token) => {
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;

            next[lastIndex] = {
              ...next[lastIndex],
              text: next[lastIndex].text + token,
            };

            return next;
          });
        },
        controller.signal
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }

      console.error("Ollama streaming error:", error);

      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;

        next[lastIndex] = {
          sender: "amadeus",
          text: "Connection to the local cognitive system failed.",
        };

        return next;
      });
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      checkOllamaStatus().then(setBrainOnline);
    }
  };

  return (
    <main className="app-shell">
      <Header loading={loading} brainOnline={brainOnline} />

      <StatusStrip loading={loading} brainOnline={brainOnline} />

      <section className="main-grid">
        <AvatarPanel />

        <section className="chat-panel">
          <ChatPanel messages={messages} messagesEndRef={messagesEndRef} />

          <InputBar
            input={input}
            loading={loading}
            brainOnline={brainOnline}
            onInputChange={setInput}
            onSend={handleSend}
            onStop={handleStop}
          />
        </section>
      </section>
    </main>
  );
}

export default App;