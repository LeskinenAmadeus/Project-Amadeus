import {
  useEffect,
  useRef,
  useState,
} from "react";
import AvatarPanel from "./components/AvatarPanel";
import ChatPanel from "./components/ChatPanel";
import Header from "./components/Header";
import InputBar from "./components/InputBar";
import SettingsPanel from "./components/SettingsPanel";
import StatusStrip from "./components/StatusStrip";
import {
  DEFAULT_MESSAGES,
  getActiveConversation,
  loadConversationStore,
  saveConversationStore,
  updateActiveConversationMessages,
} from "./services/conversationStorage";
import {
  getResponseDelay,
  loadAppSettings,
  saveAppSettings,
} from "./services/settings";
import {
  checkOllamaStatus,
  streamMessage,
} from "./services/ollama";
import type {
  ConversationStore,
  Message,
} from "./types/message";
import type { AppSettings } from "./types/settings";
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

  if (
    complimentKeywords.some((keyword) =>
      user.includes(keyword)
    )
  ) {
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

  if (
    hostileKeywords.some((keyword) =>
      user.includes(keyword)
    )
  ) {
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

      if (
        index !== -1 &&
        (!latestMatch || index > latestMatch.index)
      ) {
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

  const [settings, setSettings] =
    useState<AppSettings>(() => loadAppSettings());

  const [settingsOpen, setSettingsOpen] =
    useState(false);

  const [historyLoaded, setHistoryLoaded] =
    useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [brainOnline, setBrainOnline] =
    useState(false);

  const [
    activeExpression,
    setActiveExpression,
  ] = useState<ExpressionCommand | null>(null);

  const [activeMotion, setActiveMotion] =
    useState<string | null>("Idle Loop");

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const expressionTimeoutRef =
    useRef<number | null>(null);

  const saveTimeoutRef =
    useRef<number | null>(null);

  const tokenIntervalRef =
    useRef<number | null>(null);

  const tokenQueueRef =
    useRef<string[]>([]);

  // Prevent the same detected expression from
  // restarting on every streamed token.
  const lastTriggeredExpressionRef =
    useRef<string | null>(null);

  const clearTokenQueue = () => {
    tokenQueueRef.current = [];

    if (tokenIntervalRef.current !== null) {
      window.clearInterval(
        tokenIntervalRef.current
      );

      tokenIntervalRef.current = null;
    }
  };

  const appendResponseToken = (token: string) => {
    setMessages((previousMessages) => {
      const nextMessages = [...previousMessages];
      const lastIndex = nextMessages.length - 1;

      if (lastIndex < 0) {
        return previousMessages;
      }

      nextMessages[lastIndex] = {
        ...nextMessages[lastIndex],
        text:
          nextMessages[lastIndex].text +
          token,
      };

      return nextMessages;
    });
  };

  const startTokenDisplayQueue = (
    delayMs: number
  ) => {
    if (
      delayMs <= 0 ||
      tokenIntervalRef.current !== null
    ) {
      return;
    }

    tokenIntervalRef.current =
      window.setInterval(() => {
        const nextToken =
          tokenQueueRef.current.shift();

        if (nextToken !== undefined) {
          appendResponseToken(nextToken);
        }

        if (
          tokenQueueRef.current.length === 0 &&
          tokenIntervalRef.current !== null
        ) {
          window.clearInterval(
            tokenIntervalRef.current
          );

          tokenIntervalRef.current = null;
        }
      }, delayMs);
  };

  const queueResponseToken = (
    token: string,
    delayMs: number
  ) => {
    if (delayMs <= 0) {
      appendResponseToken(token);
      return;
    }

    tokenQueueRef.current.push(token);
    startTokenDisplayQueue(delayMs);
  };

  const waitForTokenQueue = async (
    signal: AbortSignal
  ) => {
    while (
      !signal.aborted &&
      (tokenQueueRef.current.length > 0 ||
        tokenIntervalRef.current !== null)
    ) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 20);
      });
    }
  };

  useEffect(() => {
    if (!settings.autoScroll) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [
    messages,
    loading,
    settings.autoScroll,
  ]);

  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  useEffect(() => {
    checkOllamaStatus().then(setBrainOnline);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreConversationHistory =
      async () => {
        try {
          const loadedStore =
            await loadConversationStore();

          if (cancelled) {
            return;
          }

          const activeConversation =
            getActiveConversation(loadedStore);

          setConversationStore(loadedStore);
          setMessages(
            activeConversation.messages
          );
        } catch (error: unknown) {
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
    if (
      !historyLoaded ||
      !conversationStore ||
      !settings.saveConversationHistory
    ) {
      return;
    }

    const updatedStore =
      updateActiveConversationMessages(
        conversationStore,
        messages
      );

    setConversationStore(updatedStore);

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(
        saveTimeoutRef.current
      );
    }

    saveTimeoutRef.current =
      window.setTimeout(() => {
        saveConversationStore(
          updatedStore
        ).catch((error: unknown) => {
          console.error(
            "Unable to save conversation history:",
            error
          );
        });

        saveTimeoutRef.current = null;
      }, 500);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(
          saveTimeoutRef.current
        );

        saveTimeoutRef.current = null;
      }
    };
  }, [
    messages,
    historyLoaded,
    settings.saveConversationHistory,
  ]);

  useEffect(() => {
    return () => {
      if (
        expressionTimeoutRef.current !== null
      ) {
        window.clearTimeout(
          expressionTimeoutRef.current
        );
      }

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(
          saveTimeoutRef.current
        );
      }

      clearTokenQueue();
    };
  }, []);

  const clearExpression = () => {
    if (
      expressionTimeoutRef.current !== null
    ) {
      window.clearTimeout(
        expressionTimeoutRef.current
      );

      expressionTimeoutRef.current = null;
    }

    setActiveExpression(null);
  };

  const triggerExpression = (
    expression: string,
    durationMs = 2500
  ) => {
    if (
      expressionTimeoutRef.current !== null
    ) {
      window.clearTimeout(
        expressionTimeoutRef.current
      );
    }

    lastTriggeredExpressionRef.current =
      expression;

    setActiveExpression({
      name: expression,
      id: Date.now(),
    });

    expressionTimeoutRef.current =
      window.setTimeout(() => {
        setActiveExpression(null);
        expressionTimeoutRef.current = null;
      }, durationMs);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    clearTokenQueue();
    clearExpression();

    lastTriggeredExpressionRef.current =
      null;

    setLoading(false);
    setActiveMotion("Idle Loop");
  };

  const handleSend = async () => {
    if (
      !input.trim() ||
      loading ||
      !brainOnline
    ) {
      return;
    }

    clearTokenQueue();

    const userMessage: Message = {
      sender: "user",
      text: input.trim(),
    };

    const userText = userMessage.text;

    const placeholderReply: Message = {
      sender: "amadeus",
      text: "",
    };

    setMessages((previousMessages) => [
      ...previousMessages,
      userMessage,
      placeholderReply,
    ]);

    setInput("");
    setLoading(true);

    clearExpression();

    lastTriggeredExpressionRef.current =
      null;

    setActiveMotion("Focused Stare");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const responseDelay = getResponseDelay(
      settings.responseSpeed
    );

    let replyText = "";

    try {
      await streamMessage(
        [...messages, userMessage],
        (token) => {
          replyText += token;

          const recentText =
            replyText.slice(-200);

          const detectedExpression =
            detectExpression(
              recentText,
              userText
            );

          if (
            detectedExpression &&
            detectedExpression !==
              lastTriggeredExpressionRef.current
          ) {
            triggerExpression(
              detectedExpression
            );
          }

          queueResponseToken(
            token,
            responseDelay
          );
        },
        controller.signal
      );

      await waitForTokenQueue(
        controller.signal
      );
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        return;
      }

      console.error(
        "Ollama streaming error:",
        error
      );

      clearTokenQueue();

      triggerExpression(
        "Stanby Scared",
        4000
      );

      setActiveMotion("Sleepy");

      setMessages((previousMessages) => {
        const nextMessages = [
          ...previousMessages,
        ];

        const lastIndex =
          nextMessages.length - 1;

        if (lastIndex < 0) {
          return previousMessages;
        }

        nextMessages[lastIndex] = {
          sender: "amadeus",
          text:
            "Connection to the local cognitive system failed.",
        };

        return nextMessages;
      });
    } finally {
      abortControllerRef.current = null;
      setLoading(false);

      if (!controller.signal.aborted) {
        setActiveMotion("Idle Loop");
      }

      checkOllamaStatus().then(
        setBrainOnline
      );
    }
  };

  return (
    <main className="app-shell">
      <Header
        loading={loading}
        brainOnline={brainOnline}
        onOpenSettings={() =>
          setSettingsOpen(true)
        }
      />

      <StatusStrip
        loading={loading}
        brainOnline={brainOnline}
      />

      <section className="main-grid">
        <AvatarPanel
          activeExpression={
            activeExpression
          }
          activeMotion={activeMotion}
        />

        <section className="chat-panel">
          <ChatPanel
            messages={messages}
            messagesEndRef={
              messagesEndRef
            }
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

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() =>
            setSettingsOpen(false)
          }
        />
      )}
    </main>
  );
}

export default App;