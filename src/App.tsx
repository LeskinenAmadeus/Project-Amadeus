import { useEffect, useRef, useState } from "react";
import AvatarPanel from "./components/AvatarPanel";
import ChatPanel from "./components/ChatPanel";
import Header from "./components/Header";
import InputBar from "./components/InputBar";
import StatusStrip from "./components/StatusStrip";
import {
  DEFAULT_MESSAGES,
  getActiveConversation,
  loadConversationStore,
  saveConversationStore,
  updateActiveConversationMessages,
} from "./services/conversationStorage";
import { checkOllamaStatus, streamMessage } from "./services/ollama";
import type {
  ConversationStore,
  Message,
} from "./types/message";
import "./App.css";

export type ExpressionCommand = {
  name: string;
  id: number;
};

function detectExpression(
  responseText: string,
  userText: string
): string | null {
  const response = responseText.toLowerCase();
  const user = userText.toLowerCase();

  const complimentKeywords = [
    "cute",
    "beautiful",
    "pretty",
    "adorable",
    "love you",
    "i like you",
    "smart",
    "amazing",
    "attractive",
  ];

  if (complimentKeywords.some((keyword) => user.includes(keyword))) {
    return "Blush 1";
  }

  const hostileKeywords = [
    "stupid",
    "idiot",
    "useless",
    "shut up",
    "hate you",
    "annoying",
  ];

  if (hostileKeywords.some((keyword) => user.includes(keyword))) {
    return "Stanby Angry";
  }

  const emotionRules = [
    {
      expression: "Stanby Sad",
      keywords: [
        "sorry",
        "sad",
        "unfortunate",
        "lonely",
        "grief",
        "tragic",
        "heartbreaking",
      ],
    },
    {
      expression: "Stanby Surprised",
      keywords: [
        "unexpected",
        "surprising",
        "suddenly",
        "shocked",
        "wow",
      ],
    },
    {
      expression: "Blush 1",
      keywords: [
        "embarrassing",
        "embarrassed",
        "flattered",
        "blushing",
      ],
    },
    {
      expression: "Stanby Smile",
      keywords: [
        "happy",
        "great",
        "excellent",
        "wonderful",
        "glad",
        "delighted",
        "hopeful",
        "better",
        "enjoy",
      ],
    },
  ];

  let latestMatch: {
    expression: string;
    index: number;
  } | null = null;

  for (const rule of emotionRules) {
    for (const keyword of rule.keywords) {
      const index = response.lastIndexOf(keyword);

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
  const [messages, setMessages] =
    useState<Message[]>(DEFAULT_MESSAGES);

  const [conversationStore, setConversationStore] =
    useState<ConversationStore | null>(null);

  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [brainOnline, setBrainOnline] = useState(false);

  const [activeExpression, setActiveExpression] =
    useState<ExpressionCommand | null>(null);

  const [activeMotion, setActiveMotion] =
    useState<string | null>("Idle Loop");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const expressionTimeoutRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // Prevent the same detected expression from restarting on every token.
  const lastTriggeredExpressionRef = useRef<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    checkOllamaStatus().then(setBrainOnline);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreConversationHistory = async () => {
      try {
        const loadedStore = await loadConversationStore();

        if (cancelled) {
          return;
        }

        const activeConversation =
          getActiveConversation(loadedStore);

        setConversationStore(loadedStore);
        setMessages(activeConversation.messages);
      } catch (error) {
        console.error(
          "Unable to restore conversation history:",
          error
        );
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      }
    };

    restoreConversationHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyLoaded || !conversationStore) {
      return;
    }

    const updatedStore = updateActiveConversationMessages(
      conversationStore,
      messages
    );

    setConversationStore(updatedStore);

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      saveConversationStore(updatedStore).catch((error: unknown) => {
        console.error(
          "Unable to save conversation history:",
          error
        );
      });

      saveTimeoutRef.current = null;
    }, 500);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [messages, historyLoaded]);

  useEffect(() => {
    return () => {
      if (expressionTimeoutRef.current !== null) {
        window.clearTimeout(expressionTimeoutRef.current);
      }

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const clearExpression = () => {
    if (expressionTimeoutRef.current !== null) {
      window.clearTimeout(expressionTimeoutRef.current);
      expressionTimeoutRef.current = null;
    }

    setActiveExpression(null);
  };

  const triggerExpression = (
    expression: string,
    durationMs = 2500
  ) => {
    if (expressionTimeoutRef.current !== null) {
      window.clearTimeout(expressionTimeoutRef.current);
    }

    lastTriggeredExpressionRef.current = expression;

    setActiveExpression({
      name: expression,
      id: Date.now(),
    });

    expressionTimeoutRef.current = window.setTimeout(() => {
      setActiveExpression(null);
      expressionTimeoutRef.current = null;
    }, durationMs);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    clearExpression();
    lastTriggeredExpressionRef.current = null;

    setLoading(false);
    setActiveMotion("Idle Loop");
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !brainOnline) return;

    const userMessage: Message = {
      sender: "user",
      text: input.trim(),
    };

    const userText = userMessage.text;

    const placeholderReply: Message = {
      sender: "amadeus",
      text: "",
    };

    setMessages((prev) => [
      ...prev,
      userMessage,
      placeholderReply,
    ]);

    setInput("");
    setLoading(true);

    clearExpression();
    lastTriggeredExpressionRef.current = null;

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
          const detectedExpression = detectExpression(
            recentText,
            userText
          );

          if (
            detectedExpression &&
            detectedExpression !==
              lastTriggeredExpressionRef.current
          ) {
            triggerExpression(detectedExpression);
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

      triggerExpression("Stanby Scared", 4000);
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
      <Header
        loading={loading}
        brainOnline={brainOnline}
      />

      <StatusStrip
        loading={loading}
        brainOnline={brainOnline}
      />

      <section className="main-grid">
        <AvatarPanel
          activeExpression={activeExpression}
          activeMotion={activeMotion}
        />

        <section className="chat-panel">
          <ChatPanel
            messages={messages}
            messagesEndRef={messagesEndRef}
          />

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