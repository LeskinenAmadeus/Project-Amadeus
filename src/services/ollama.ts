import type { Message } from "../types/message";

const OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";
const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";

export const REQUIRED_MODEL_NAME = "amadeus-kurisu";
const REQUIRED_MODEL_TAG = `${REQUIRED_MODEL_NAME}:latest`;

export type OllamaStatus =
  | "checking"
  | "offline"
  | "model-missing"
  | "ready";

export type OllamaSystemStatus = {
  status: OllamaStatus;
  ollamaOnline: boolean;
  modelAvailable: boolean;
};

type OllamaMessage = {
  role: "user" | "assistant";
  content: string;
};

type OllamaModel = {
  name: string;
};

type OllamaTagsResponse = {
  models?: OllamaModel[];
};

function convertMessages(
  messages: Message[]
): OllamaMessage[] {
  return messages
    .filter(
      (message) =>
        !message.text.includes(
          "AMADEUS cognitive interface initialized."
        )
    )
    .filter(
      (message) =>
        !message.text.includes(
          "Local systems are online."
        )
    )
    .map((message) => ({
      role:
        message.sender === "user"
          ? "user"
          : "assistant",
      content: message.text,
    }));
}

export async function checkOllamaSystemStatus(): Promise<OllamaSystemStatus> {
  try {
    const response = await fetch(OLLAMA_TAGS_URL);

    if (!response.ok) {
      return {
        status: "offline",
        ollamaOnline: false,
        modelAvailable: false,
      };
    }

    const data =
      (await response.json()) as OllamaTagsResponse;

    const modelAvailable =
      data.models?.some(
        (model) =>
          model.name === REQUIRED_MODEL_NAME ||
          model.name === REQUIRED_MODEL_TAG
      ) ?? false;

    if (!modelAvailable) {
      return {
        status: "model-missing",
        ollamaOnline: true,
        modelAvailable: false,
      };
    }

    return {
      status: "ready",
      ollamaOnline: true,
      modelAvailable: true,
    };
  } catch {
    return {
      status: "offline",
      ollamaOnline: false,
      modelAvailable: false,
    };
  }
}

export async function checkOllamaStatus(): Promise<boolean> {
  const systemStatus =
    await checkOllamaSystemStatus();

  return systemStatus.status === "ready";
}

export async function streamMessage(
  messages: Message[],
  onToken: (token: string) => void,
  signal?: AbortSignal
) {
  const response = await fetch(OLLAMA_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: REQUIRED_MODEL_NAME,
      messages: convertMessages(messages),
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();

    throw new Error(
      errorText ||
        "Failed to communicate with Ollama"
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  while (true) {
    const { done, value } =
      await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const parsed = JSON.parse(line);
      const token =
        parsed.message?.content || "";

      if (token) {
        onToken(token);
      }

      if (parsed.done) {
        return;
      }
    }
  }
}