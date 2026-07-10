import { useEffect, useRef, useState } from "react";
import AvatarPanel from "./components/AvatarPanel";
import ChatPanel from "./components/ChatPanel";
import Header from "./components/Header";
import InputBar from "./components/InputBar";
import StatusStrip from "./components/StatusStrip";
import { checkOllamaStatus, streamMessage } from "./services/ollama";
import type { Message } from "./types/message";
import "./App.css";

function detectExpression(text: string): string | null {
  const lower = text.toLowerCase();

  const emotionRules = [
    {
      expression: "Stanby Sad",
      keywords: ["sorry", "sad", "unfortunate", "lonely", "grief"],
    },
    {
      expression: "Stanby Scared",
      keywords: ["error", "danger", "problem", "afraid", "scared"],
    },
    {
      expression: "Stanby Angry",
      keywords: ["wrong", "ridiculous", "annoying", "angry", "unacceptable"],
    },
    {
      expression: "Stanby Surprised",
      keywords: ["wait", "unexpected", "really", "surprising", "suddenly"],
    },
    {
      expression: "Blush 1",
      keywords: ["cute", "embarrassing", "compliment", "flattered"],
    },
    {
      expression: "Stanby Smile",
      keywords: ["happy", "good", "great", "excellent", "nice", "hopeful", "better"],
    },
  ];

  let latestMatch: {
    expression: string;
    index: number;
  } | null = null;

  for (const rule of emotionRules) {
    for (const keyword of rule.keywords) {
      const index = lower.lastIndexOf(keyword);

      if (index !== -1 && (!latestMatch || index > latestMatch.index)) {
        latestMatch = {
          expression: rule.expression,
          index,
        };
      }
    }
  }

  return latestMatch?.expression ?? null;
}

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
  const [activeExpression, setActiveExpression] = useState<string | null>(null);
  const [activeMotion, setActiveMotion] = useState<string | null>("Idle Loop");

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
    setActiveMotion("Idle Loop");
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
    setActiveExpression(null);
    setActiveMotion("Focused Stare");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let replyText = "";

    try {
      await streamMessage(
        [...messages, userMessage],
        (token) => {
          replyText += token;

          const recentText = replyText.slice(-200);
          const detectedExpression = detectExpression(recentText);
          if (detectedExpression) {
            setActiveExpression(detectedExpression);
          }

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

      setActiveExpression("Stanby Scared");
      setActiveMotion("Sleepy");

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

      if (!controller.signal.aborted) {
        setActiveMotion("Idle Loop");
      }

      checkOllamaStatus().then(setBrainOnline);
    }
  };

  return (
    <main className="app-shell">
      <Header loading={loading} brainOnline={brainOnline} />

      <StatusStrip loading={loading} brainOnline={brainOnline} />

      <section className="main-grid">
        <AvatarPanel
          activeExpression={activeExpression}
          activeMotion={activeMotion}
        />

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